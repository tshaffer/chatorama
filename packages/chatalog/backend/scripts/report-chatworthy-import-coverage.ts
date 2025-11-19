// scripts/report-chatworthy-import-coverage.ts
//
// Usage (from packages/chatalog/backend):
//   MONGO_URI="mongodb://localhost:27017/chatalog" \
//   npx ts-node scripts/report-chatworthy-import-coverage.ts
//
// This script:
//   - Scans all notes that have a chatworthyChatId
//   - Groups them by chatworthyChatId
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
  chatworthyChatId: string;
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

  // Fetch all notes that have Chatworthy chat provenance
  const notes = await NoteModel.find({
    chatworthyChatId: { $ne: null },
  })
    .select(
      'chatworthyChatId chatworthyChatTitle chatworthyFileName chatworthyTurnIndex chatworthyTotalTurns'
    )
    .lean();

  const byChat = new Map<string, typeof notes>();

  for (const note of notes) {
    const chatId = (note as any).chatworthyChatId as string | undefined;
    if (!chatId) continue;

    const existing = byChat.get(chatId);
    if (existing) {
      existing.push(note);
    } else {
      byChat.set(chatId, [note]);
    }
  }

  const summaries: ChatImportSummary[] = [];

  for (const [chatId, chatNotes] of byChat.entries()) {
    // Collect imported turn indexes
    const importedTurnIndexes = Array.from(
      new Set(
        chatNotes
          .map((n) => (n as any).chatworthyTurnIndex)
          .filter((idx) => typeof idx === 'number') as number[]
      )
    ).sort((a, b) => a - b);

    // Collect totalTurns candidates
    const totalTurnsCandidates = Array.from(
      new Set(
        chatNotes
          .map((n) => (n as any).chatworthyTotalTurns)
          .filter((t) => typeof t === 'number') as number[]
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
        // We can't know absolute truth, but this is a reasonable best-guess
        totalTurns = maxIdx + 1;
      } else {
        totalTurns = null;
      }
    }

    const importedTurnCount = importedTurnIndexes.length;

    let missingTurnIndexes: number[] = [];
    let status: ChatImportStatus = 'unknown';

    if (typeof totalTurns === 'number' && totalTurns >= 0) {
      const allIndexes = Array.from({ length: totalTurns }, (_, i) => i);
      const importedSet = new Set(importedTurnIndexes);
      missingTurnIndexes = allIndexes.filter((i) => !importedSet.has(i));

      if (missingTurnIndexes.length === 0) {
        status = 'complete';
      } else if (missingTurnIndexes.length === totalTurns) {
        // If every index is "missing" despite having notes,
        // something is inconsistent; mark as unknown.
        status = 'unknown';
      } else {
        status = 'partial';
      }
    }

    const titleCandidates = Array.from(
      new Set(
        chatNotes
          .map((n) => (n as any).chatworthyChatTitle)
          .filter((t) => typeof t === 'string') as string[]
      )
    );

    const fileNameCandidates = Array.from(
      new Set(
        chatNotes
          .map((n) => (n as any).chatworthyFileName)
          .filter((f) => typeof f === 'string') as string[]
      )
    );

    summaries.push({
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
  console.log('Summary (one row per chat):');
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
