// backfillNoteEmbeddings.ts
//
// Usage:
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" tsx src/scripts/backfillNoteEmbeddings.ts --limit 200 --dryRun
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" tsx src/scripts/backfillNoteEmbeddings.ts --limit 200 --concurrency 3
//
// Notes:
//   - Embeds title + summary + tags + markdown.
//   - Idempotent: skips docs with matching embeddingTextHash.
//   - Filters to docKind="note" and missing/empty embedding.

import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '../../.env');
console.log(`[backfillNoteEmbeddings] Loading env from ${envPath}`);

// Force-load backend/.env no matter where the script is launched from
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { NoteModel } from '../models/Note';
import { embedText } from '../ai/embed';
import { computeEmbeddingTextAndHash } from '../ai/embeddingText';

type Options = {
  limit?: number;
  dryRun: boolean;
  concurrency?: number;
};

function ensureMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required to run backfillNoteEmbeddings.');
    process.exit(1);
  }
  return uri;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { dryRun: false, concurrency: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dryRun') {
      opts.dryRun = true;
      continue;
    }
    if (arg === '--limit') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        const n = Number(next);
        if (Number.isFinite(n) && n > 0) opts.limit = Math.floor(n);
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const raw = arg.split('=')[1];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) opts.limit = Math.floor(n);
    }
    if (arg === '--concurrency') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        const n = Number(next);
        if (Number.isFinite(n) && n > 0) opts.concurrency = Math.floor(n);
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      const raw = arg.split('=')[1];
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) opts.concurrency = Math.floor(n);
    }
  }
  return opts;
}

async function main() {
  ensureMongoUri();
  const opts = parseArgs(process.argv.slice(2));
  const limit = opts.limit ?? 200;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 5));

  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  console.log('[backfillNoteEmbeddings] NoteModel module:', require.resolve('../models/Note'));
  console.log('[backfillNoteEmbeddings] db name:', NoteModel.db.name);
  console.log('[backfillNoteEmbeddings] collection:', NoteModel.collection.name);

  const stats = {
    scanned: 0,
    updated: 0,
    skippedNoText: 0,
    alreadyEmbedded: 0,
    errors: 0,
  };

  try {
    const docs = await NoteModel.find({
      docKind: 'note',
      $or: [
        { embedding: { $exists: false } },
        { embedding: null },
        { embedding: { $size: 0 } },
      ],
    })
      .select({
        title: 1,
        summary: 1,
        markdown: 1,
        tags: 1,
        embedding: 1,
        embeddingTextHash: 1,
      })
      .sort({ updatedAt: -1, _id: 1 })
      .limit(limit)
      .lean()
      .exec();

    console.log('[backfillNoteEmbeddings] docs to process:', docs.length);

    const processOne = async (doc: any) => {
      stats.scanned += 1;
      const { text, hash } = computeEmbeddingTextAndHash(doc, {
        includeMarkdown: true,
        includeSummary: true,
        includeTags: true,
        includeRecipe: false,
      });
      if (!text || text.length < 10) {
        stats.skippedNoText += 1;
        return;
      }

      const hasEmbedding = Array.isArray(doc.embedding) && doc.embedding.length > 0;
      const hashMatches = doc.embeddingTextHash === hash;
      if (hasEmbedding && hashMatches) {
        stats.alreadyEmbedded += 1;
        return;
      }

      if (opts.dryRun) {
        stats.updated += 1;
        return;
      }

      try {
        const { vector, model } = await embedText(text, { model: 'text-embedding-3-small' });
        await NoteModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              embedding: vector,
              embeddingModel: model,
              embeddingTextHash: hash,
              embeddingUpdatedAt: new Date(),
            },
          },
        ).exec();
        stats.updated += 1;
      } catch (err) {
        stats.errors += 1;
        console.error('[backfillNoteEmbeddings] failed for note', doc._id, err);
      }
    };

    for (let i = 0; i < docs.length; i += concurrency) {
      const batch = docs.slice(i, i + concurrency);
      await Promise.all(batch.map(processOne));
    }
  } finally {
    await db.disconnectFromDatabase();
  }

  // eslint-disable-next-line no-console
  console.log('[backfillNoteEmbeddings] stats:', stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
