// backfill-turnfingerprints-v2.ts
//
// Purpose:
//   Add v2 TurnFingerprint docs alongside existing v1 fingerprints.
//   Does NOT modify existing v1 or existing v2 docs.
//
// Usage:
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" npx ts-node src/scripts/backfill-turnfingerprints-v2.ts
//   (or run with your repo’s preferred runner, e.g. pnpm tsx)
//
// Notes:
//   - Upserts are keyed by (sourceType, noteId, turnIndex, hashVersion=2)
//   - Only uses $setOnInsert to avoid MongoDB update path conflicts and to avoid changing v2 docs after creation.

import { NoteModel } from '../models/Note';
import { TurnFingerprintModel } from '../models/TurnFingerprintModel';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../utils/textHash';

const BATCH_SIZE = 200;

function ensureMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required to run backfill-turnfingerprints-v2.');
    process.exit(1);
  }
  return uri;
}

type Stats = {
  processedNotes: number;
  processedTurns: number;
  ops: number;
};

async function processNotes(notes: any[], stats: Stats): Promise<void> {
  const ops: any[] = [];

  for (const note of notes) {
    const markdown = (note as any).markdown ?? '';
    const turns = extractPromptResponseTurns(markdown);
    stats.processedNotes += 1;

    if (!turns.length) continue;

    const chatId = (note as any).chatworthyChatId ?? (note as any).sourceChatId ?? null;
    const createdAt = (note as any).createdAt ?? new Date();

    for (const turn of turns as any[]) {
      // Safety: ensure we have a stable turnIndex
      const turnIndex =
        typeof turn.turnIndex === 'number'
          ? turn.turnIndex
          : typeof turn.fileTurnIndex === 'number'
            ? turn.fileTurnIndex
            : null;

      if (turnIndex === null) continue;

      const pairHashV2 = hashPromptResponsePair(turn.prompt, turn.response, 2);

      ops.push({
        updateOne: {
          filter: {
            sourceType: 'chatworthy',
            noteId: note._id,
            turnIndex,
            hashVersion: 2,
          },
          // IMPORTANT: only set on insert. Do not $set pairHash and also $setOnInsert pairHash.
          update: {
            $setOnInsert: {
              sourceType: 'chatworthy',
              noteId: note._id,
              chatId,
              turnIndex,
              pairHash: pairHashV2,
              hashVersion: 2,
              createdAt,
            },
          },
          upsert: true,
        },
      });
    }

    stats.processedTurns += turns.length;
  }

  if (ops.length) {
    await TurnFingerprintModel.bulkWrite(ops, { ordered: false });
    stats.ops += ops.length;
  }
}

async function main() {
  ensureMongoUri();

  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  try {
    const criteria = {
      markdown: { $exists: true, $ne: '' },
      $or: [
        { sourceType: 'chatworthy' },
        { 'sources.type': 'chatworthy' },
        { chatworthyNoteId: { $exists: true } },
      ],
    };

    const cursor = NoteModel.find(
      criteria,
      {
        markdown: 1,
        chatworthyChatId: 1,
        sourceChatId: 1,
        createdAt: 1,
      },
    )
      .lean()
      .cursor();

    const stats: Stats = { processedNotes: 0, processedTurns: 0, ops: 0 };
    const batch: any[] = [];

    for await (const note of cursor as any) {
      batch.push(note);
      if (batch.length >= BATCH_SIZE) {
        await processNotes(batch, stats);
        batch.length = 0;
        console.log(
          `Processed ${stats.processedNotes} notes (${stats.processedTurns} turns), bulk ops so far: ${stats.ops}`,
        );
      }
    }

    if (batch.length) {
      await processNotes(batch, stats);
    }

    console.log(
      `Done. Processed ${stats.processedNotes} notes, ${stats.processedTurns} turns, executed ${stats.ops} bulk ops.`,
    );
  } finally {
    await db.disconnectFromDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
