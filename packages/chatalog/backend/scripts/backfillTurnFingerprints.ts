// Usage:
// MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//   npx ts-node scripts/backfillTurnFingerprints.ts

import mongoose from 'mongoose';
import { NoteModel } from '../src/models/Note';
import { TurnFingerprintModel } from '../src/models/TurnFingerprintModel';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../src/utils/textHash';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to Mongo');

  const cursor = NoteModel.find({
    markdown: { $exists: true, $ne: '' },
  })
    .lean()
    .cursor();

  let processed = 0;
  for await (const note of cursor as any) {
    processed += 1;
    if (processed % 100 === 0) console.log(`Processed ${processed} notes...`);

    const turns = extractPromptResponseTurns(note.markdown || '');
    if (!turns.length) continue;

    for (const turn of turns) {
      const pairHash = hashPromptResponsePair(turn.prompt, turn.response);
      await TurnFingerprintModel.updateOne(
        { sourceType: 'chatworthy', pairHash, noteId: note._id },
        {
          $setOnInsert: {
            chatId: note.chatworthyChatId || note.sourceChatId,
            turnIndex: turn.turnIndex,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      ).exec();
    }
  }

  console.log(`Done. Processed ${processed} notes (all notes with non-empty markdown).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect();
  process.exit(1);
});
