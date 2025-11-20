// scripts/report-chatworthy-import-coverage.ts
//
// Usage (from packages/chatalog/backend):
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//   npx ts-node scripts/report-chatworthy-import-coverage.ts
//
// This script:
//   - Scans all notes that have Chatworthy provenance
//   - Groups them by chat (preferring chatworthyChatId, falling back to chatworthyFileName)
//   - Computes per-chat coverage:
//       * importedTurnIndexes
//       * missingTurnIndexes
//       * importedTurnCount
//       * totalTurns (from chatworthyTotalTurns, with fallback)
//       * status: 'complete' | 'partial' | 'unknown'
//   - Prints a summary table to stdout
//   - Writes JSON to ./data/chatworthy-import-coverage.json
//

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { NoteModel } from '../src/models/Note';

type ChatImportStatus = 'complete' | 'partial' | 'unknown';

type ChatImportSummary = {
  chatworthyChatId: string; // may be the real chatId or, if missing, the file name
  chatworthyChatTitle?: string | null;
  chatworthyFileNames: string[];
  importedTurnIndexes: number[];
  missingTurnIndexes: number[];
  importedTurnCount: number;
  totalTurns: number | null;
  status: ChatImportStatus;
};

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI environment variable is required');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  // Fetch all notes that have *any* Chatworthy provenance.
  // We accept either chatworthyChatId or chatworthyFileName to be present,
  // since your current data may not populate chatworthyChatId.
  const notes = await NoteModel.find({
    $or: [
      { chatworthyChatId: { $ne: null } },
      { chatworthyFileName: { $ne: null } },
    ],
  })
    .select(
      'chatworthyChatId chatworthyChatTitle chatworthyFileName chatworthyTurnIndex chatworthyTotalTurns'
    )
    .lean();

  console.log(
    `Found ${notes.length} notes with Chatworthy provenance (chatworthyChatId or chatworthyFileName present).`
  );

  const byChat = new Map<string, typeof notes>();

  for (const note of notes) {
    const n = note as any;

    // Prefer grouping by chatworthyChatId when available.
    // If it's missing, fall back to grouping by chatworthyFileName.
    const chatId: string | undefined =
      (n.chatworthyChatId as string | undefined) ||
      (n.chatworthyFileName as string | undefined);

    if (!chatId) {
      // Extremely defensive: if we somehow got here, skip this note.
      continue;
    }

    const existing = byChat.get(chatId);
    if (existing) {
      existing.push(note);
    } else {
      byChat.set(chatId, [note]);
    }
  }

  const summaries: ChatImportSummary[] = [];

  for (const [chatId, chatNotes] of byChat.entries()) {
    const chatNotesAny = chatNotes as any[];

    // Collect imported turn indexes
    const importedTurnIndexes = Array.from(
      new Set(
        chatNotesAny
          .map((n) => n.chatworthyTurnIndex)
          .filter((idx: any) => typeof idx === 'number') as number[]
      )
    ).sort((a, b) => a - b);

    // Collect totalTurns candidates
    const totalTurnsCandidates = Array.from(
      new Set(
        chatNotesAny
          .map((n) => n.chatworthyTotalTurns)
          .filter((t: any) => typeof t === 'number') as number[]
      )
    ).sort((a, b) => a - b);

    let totalTurns: number | null = null;

    if (totalTurnsCandidates.length === 1) {
      totalTurns = totalTurnsCandidates[0];
    } else if (totalTurnsCandidates.length > 1) {
      // Defensive: take the max if there is disagreement
      totalTurns = totalTurnsCandidates[totalTurnsCandidates.length - 1];
    } else {
      // Fallback: infer from highest turn index (+1) if we have any
      if (importedTurnIndexes.length > 0) {
        const maxIdx = importedTurnIndexes[importedTurnIndexes.length - 1];
        totalTurns = maxIdx + 1;
      } else {
        totalTurns = null;
      }
    }

    const importedTurnCount = importedTurnIndexes.length;

    let missingTurnIndexes: number[] = [];
    let status: ChatImportStatus = 'unknown';

    if (typeof totalTurns === 'number' && totalTurns >= 0) {
      // Heuristic: if smallest imported index is 1, assume 1-based.
      const minImported = importedTurnIndexes[0] ?? 0;
      const indexBase = minImported === 1 ? 1 : 0;

      const normalizedImported = new Set(
        importedTurnIndexes.map((idx) => idx - indexBase)
      );

      const allNormalized = Array.from({ length: totalTurns }, (_, i) => i);
      missingTurnIndexes = allNormalized.filter((i) => !normalizedImported.has(i));

      if (missingTurnIndexes.length === 0) {
        status = 'complete';
      } else if (missingTurnIndexes.length === totalTurns) {
        status = 'unknown';
      } else {
        status = 'partial';
      }
    }

    const titleCandidates = Array.from(
      new Set(
        chatNotesAny
          .map((n) => n.chatworthyChatTitle)
          .filter((t: any) => typeof t === 'string') as string[]
      )
    );

    const fileNameCandidates = Array.from(
      new Set(
        chatNotesAny
          .map((n) => n.chatworthyFileName)
          .filter((f: any) => typeof f === 'string') as string[]
      )
    );

    summaries.push({
      // This may be the “real” chatworthyChatId, or
      // a filename key if that was all we had.
      chatworthyChatId: chatId,
      chatworthyChatTitle: titleCandidates[0] ?? null,
      chatworthyFileNames: fileNameCandidates,
      importedTurnIndexes,
      missingTurnIndexes,
      importedTurnCount,
      totalTurns,
      status,
    });
  }

  // Ensure ./data exists
  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = path.join(dataDir, 'chatworthy-import-coverage.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        chatCount: summaries.length,
        chats: summaries,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log('Wrote coverage report to:', outputPath);
  console.log();
  console.log('Summary (one row per chat/file):');
  console.table(
    summaries.map((s) => ({
      chatId: s.chatworthyChatId,
      title: s.chatworthyChatTitle ?? '',
      fileNames: s.chatworthyFileNames.join(', '),
      importedTurns: s.importedTurnCount,
      totalTurns: s.totalTurns ?? 'unknown',
      status: s.status,
      missing: s.missingTurnIndexes.join(','),
    }))
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Unhandled error in report-chatworthy-import-coverage:', err);
  process.exit(1);
});
