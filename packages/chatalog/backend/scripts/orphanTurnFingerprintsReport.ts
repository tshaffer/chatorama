// Usage:
// MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//   npx ts-node scripts/orphanTurnFingerprintsReport.ts
//
// Output:
//   scripts/orphanTurnFingerprintsReport.json

import mongoose from 'mongoose';
import * as fs from 'fs';
import path from 'path';

import { NoteModel } from '../src/models/Note';
import { TurnFingerprintModel } from '../src/models/TurnFingerprintModel';

type OrphanFingerprint = {
  _id: any;
  noteId: any;
  sourceType?: string;
  chatId?: string;
  turnIndex?: number;
  pairHash?: string;
  createdAt?: Date;
};

type ChatSummary = {
  chatId: string | null;
  orphanCount: number;
  uniqueNoteIds: number;
};

type Report = {
  generatedAt: string;
  mongoUriDbName?: string;
  collections: {
    notes: string;
    turnFingerprints: string;
  };
  totals: {
    totalFingerprints: number;
    orphanFingerprints: number;
    orphanUniqueNoteIds: number;
  };
  byChatIdTop: ChatSummary[];
  sampleOrphans: OrphanFingerprint[];
};

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to Mongo');

  // Use the actual collection name from the model (handles custom names safely)
  const notesColl = NoteModel.collection.name;
  const fpColl = TurnFingerprintModel.collection.name;

  console.log(`Notes collection: ${notesColl}`);
  console.log(`TurnFingerprints collection: ${fpColl}`);

  const totalFingerprints = await TurnFingerprintModel.countDocuments({}).exec();

  // Build an aggregate pipeline that finds fingerprints whose noteId has no matching note.
  // We also compute totals and top chatId groups.
  const orphanDocs = await TurnFingerprintModel.aggregate<any>([
    {
      $lookup: {
        from: notesColl,
        localField: 'noteId',
        foreignField: '_id',
        as: '__note',
      },
    },
    { $match: { __note: { $size: 0 } } },
    {
      $project: {
        _id: 1,
        noteId: 1,
        sourceType: 1,
        chatId: 1,
        turnIndex: 1,
        pairHash: 1,
        createdAt: 1,
      },
    },
  ]).exec();

  const orphanFingerprints = orphanDocs.length;

  // Unique orphan noteIds
  const uniqueNoteIdSet = new Set<string>();
  for (const d of orphanDocs) {
    if (d.noteId) uniqueNoteIdSet.add(String(d.noteId));
  }

  // Top chatIds by orphan count
  const byChatIdTop = await TurnFingerprintModel.aggregate<any>([
    {
      $lookup: {
        from: notesColl,
        localField: 'noteId',
        foreignField: '_id',
        as: '__note',
      },
    },
    { $match: { __note: { $size: 0 } } },
    {
      $group: {
        _id: '$chatId',
        orphanCount: { $sum: 1 },
        noteIds: { $addToSet: '$noteId' },
      },
    },
    {
      $project: {
        _id: 0,
        chatId: '$_id',
        orphanCount: 1,
        uniqueNoteIds: { $size: '$noteIds' },
      },
    },
    { $sort: { orphanCount: -1 } },
    { $limit: 50 },
  ]).exec();

  const report: Report = {
    generatedAt: new Date().toISOString(),
    mongoUriDbName: mongoose.connection.name,
    collections: {
      notes: notesColl,
      turnFingerprints: fpColl,
    },
    totals: {
      totalFingerprints,
      orphanFingerprints,
      orphanUniqueNoteIds: uniqueNoteIdSet.size,
    },
    byChatIdTop: byChatIdTop as ChatSummary[],
    sampleOrphans: orphanDocs.slice(0, 200) as OrphanFingerprint[], // cap sample size
  };

  const outPath = path.join(__dirname, 'orphanTurnFingerprintsReport.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Total fingerprints: ${totalFingerprints}`);
  console.log(`Orphan fingerprints: ${orphanFingerprints}`);
  console.log(`Unique orphan noteIds: ${uniqueNoteIdSet.size}`);
  console.log(`Wrote report: ${outPath}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect();
  process.exit(1);
});
