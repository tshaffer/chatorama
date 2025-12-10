// Usage:
//   cd backend
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//     npx ts-node scripts/rebuildTurnFingerprints.ts

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
  console.log('Connected to MongoDB');

  const deleteRes = await TurnFingerprintModel.deleteMany({}).exec();
  console.log(`Cleared ${deleteRes.deletedCount ?? 0} existing turn fingerprints`);

  const cursor = NoteModel.find(
    { $or: [{ sourceType: 'chatworthy' }, { 'sources.type': 'chatworthy' }] }
  )
    .lean()
    .cursor();

  let processedNotes = 0;
  let totalTurns = 0;
  let inserted = 0;
  const batch: any[] = [];
  const BATCH_SIZE = 500;

  for await (const note of cursor as any) {
    processedNotes += 1;
    const turns = extractPromptResponseTurns(note.markdown || '');
    if (!turns.length) continue;

    turns.forEach((turn: any) => {
      const pairHash = hashPromptResponsePair(turn.prompt, turn.response);
      batch.push({
        sourceType: note.sourceType || 'chatworthy',
        pairHash,
        noteId: note._id,
        chatId: note.sourceChatId || note.chatworthyChatId,
        turnIndex: turn.turnIndex,
        createdAt: note.createdAt || new Date(),
      });
    });

    totalTurns += turns.length;

    if (batch.length >= BATCH_SIZE) {
      await TurnFingerprintModel.insertMany(batch, { ordered: false });
      inserted += batch.length;
      console.log(`Inserted ${inserted} fingerprints so far...`);
      batch.length = 0;
    }
  }

  if (batch.length) {
    await TurnFingerprintModel.insertMany(batch, { ordered: false });
    inserted += batch.length;
    console.log(`Inserted final batch of ${batch.length} fingerprints`);
  }

  console.log(`Done. Processed ${processedNotes} notes, created ${totalTurns} fingerprints.`);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

main().catch((err) => {
  console.error('Error rebuilding turn fingerprints:', err);
  mongoose.disconnect();
  process.exit(1);
});
