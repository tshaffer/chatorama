// Usage (dry run):
// MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//   npx ts-node scripts/deleteOrphanTurnFingerprints.ts --dry-run
//
// Usage (delete):
// MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//   npx ts-node scripts/deleteOrphanTurnFingerprints.ts
//
// Options:
//   --dry-run     Do not delete, only report how many would be deleted
//   --batch=5000  Batch size for deletions (default 5000)
//
// Output:
//   scripts/deleteOrphanTurnFingerprints.result.json

import mongoose from 'mongoose';
import * as fs from 'fs';
import path from 'path';

import { NoteModel } from '../src/models/Note';
import { TurnFingerprintModel } from '../src/models/TurnFingerprintModel';

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const batchArg = argv.find((a) => a.startsWith('--batch='));
  const batchSize = batchArg ? Number(batchArg.split('=')[1]) : 5000;
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid --batch value: ${batchArg}`);
  }
  return { dryRun, batchSize };
}

type Result = {
  generatedAt: string;
  mongoUriDbName?: string;
  collections: { notes: string; turnFingerprints: string };
  dryRun: boolean;
  batchSize: number;
  orphanFingerprintIdsFound: number;
  deletedCount: number;
};

async function main() {
  const { dryRun, batchSize } = parseArgs(process.argv.slice(2));

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to Mongo');

  const notesColl = NoteModel.collection.name;
  const fpColl = TurnFingerprintModel.collection.name;

  console.log(`Notes collection: ${notesColl}`);
  console.log(`TurnFingerprints collection: ${fpColl}`);
  console.log(`dryRun: ${dryRun}`);
  console.log(`batchSize: ${batchSize}`);

  // Find orphan fingerprint _ids
  const orphanIdDocs = await TurnFingerprintModel.aggregate<{ _id: any }>([
    {
      $lookup: {
        from: notesColl,
        localField: 'noteId',
        foreignField: '_id',
        as: '__note',
      },
    },
    { $match: { __note: { $size: 0 } } },
    { $project: { _id: 1 } },
  ]).exec();

  const orphanIds = orphanIdDocs.map((d) => d._id);
  console.log(`Orphan fingerprints found: ${orphanIds.length}`);

  let deletedCount = 0;

  if (!dryRun && orphanIds.length) {
    for (let i = 0; i < orphanIds.length; i += batchSize) {
      const batch = orphanIds.slice(i, i + batchSize);
      const res = await TurnFingerprintModel.deleteMany({ _id: { $in: batch } }).exec();
      deletedCount += res.deletedCount ?? 0;
      console.log(
        `Deleted batch ${Math.floor(i / batchSize) + 1} (${batch.length} ids) -> deleted ${res.deletedCount ?? 0
        } (total ${deletedCount})`,
      );
    }
  }

  const result: Result = {
    generatedAt: new Date().toISOString(),
    mongoUriDbName: mongoose.connection.name,
    collections: { notes: notesColl, turnFingerprints: fpColl },
    dryRun,
    batchSize,
    orphanFingerprintIdsFound: orphanIds.length,
    deletedCount,
  };

  const outPath = path.join(__dirname, 'deleteOrphanTurnFingerprints.result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Wrote result: ${outPath}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect();
  process.exit(1);
});
