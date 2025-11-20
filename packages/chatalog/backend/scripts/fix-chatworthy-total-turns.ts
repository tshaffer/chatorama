// scripts/fix-chatworthy-total-turns.ts
//
// Usage (from packages/chatalog/backend):
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//   npx ts-node scripts/fix-chatworthy-total-turns.ts
//
// This script:
//   - Finds all notes with Chatworthy provenance
//   - Groups them by (chatworthyChatId || chatworthyFileName)
//   - For each group, computes the max chatworthyTurnIndex
//   - Sets chatworthyTotalTurns = that max for all notes in the group
//

import mongoose from 'mongoose';
import { NoteModel } from '../src/models/Note';

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI environment variable is required');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const notes = await NoteModel.find({
    $or: [
      { chatworthyChatId: { $ne: null } },
      { chatworthyFileName: { $ne: null } },
    ],
  })
    .select(
      '_id chatworthyChatId chatworthyFileName chatworthyTurnIndex chatworthyTotalTurns'
    )
    .lean();

  console.log(`Found ${notes.length} Chatworthy notes.`);

  type GroupKey = string;
  type GroupInfo = {
    ids: string[];
    maxTurnIndex: number;
  };

  const groups = new Map<GroupKey, GroupInfo>();

  for (const n of notes as any[]) {
    const key: GroupKey =
      n.chatworthyChatId ||
      n.chatworthyFileName ||
      ''; // should not be empty given the query

    if (!key) continue;

    const turnIndex: number =
      typeof n.chatworthyTurnIndex === 'number' ? n.chatworthyTurnIndex : 0;

    let g = groups.get(key);
    if (!g) {
      g = { ids: [], maxTurnIndex: 0 };
      groups.set(key, g);
    }

    g.ids.push(String(n._id));

    if (turnIndex > g.maxTurnIndex) {
      g.maxTurnIndex = turnIndex;
    }
  }

  console.log(`Grouped into ${groups.size} chats/files.`);

  let totalUpdated = 0;

  for (const [key, g] of groups.entries()) {
    const newTotal = g.maxTurnIndex || g.ids.length;
    if (!newTotal) continue;

    const result = await NoteModel.updateMany(
      { _id: { $in: g.ids } },
      { $set: { chatworthyTotalTurns: newTotal } }
    );

    console.log(
      `Updated chat/file "${key}": set chatworthyTotalTurns=${newTotal} on ${result.modifiedCount} notes.`
    );
    totalUpdated += result.modifiedCount;
  }

  console.log(`Done. Updated chatworthyTotalTurns on ${totalUpdated} notes.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Unhandled error in fix-chatworthy-total-turns:', err);
  process.exit(1);
});
