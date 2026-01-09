// backfillRecipeEmbeddings.ts
//
// Usage:
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" npx ts-node src/scripts/backfillRecipeEmbeddings.ts --limit 200 --dryRun
//
// Notes:
//   - Embeds title + description + ingredient names only.
//   - Idempotent: skips docs with matching recipeEmbeddingTextHash.

import { NoteModel } from '../models/Note';
import { embedText } from '../ai/embed';
import { hashEmbeddingText } from '../ai/embeddingText';
import { buildRecipeSemanticText } from '../search/buildRecipeSemanticText';

type Options = {
  limit?: number;
  dryRun: boolean;
};

function ensureMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required to run backfillRecipeEmbeddings.');
    process.exit(1);
  }
  return uri;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { dryRun: false };
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
  }
  return opts;
}

async function main() {
  ensureMongoUri();

  const opts = parseArgs(process.argv.slice(2));
  const limit = opts.limit ?? 200;

  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  console.log('[backfillRecipeEmbeddings] NoteModel module:', require.resolve('../models/Note'));
  console.log('[backfillRecipeEmbeddings] db name:', NoteModel.db.name);
  console.log('[backfillRecipeEmbeddings] collection:', NoteModel.collection.name);

  const stats = {
    scanned: 0,
    updated: 0,
    skippedNoText: 0,
    alreadyEmbedded: 0,
    errors: 0,
  };

  try {
    const docs = await NoteModel.find({ recipe: { $exists: true } })
      .select({
        title: 1,
        recipe: 1,
        recipeEmbedding: 1,
        recipeEmbeddingTextHash: 1,
      })
      .sort({ updatedAt: -1, _id: 1 })
      .limit(limit)
      .lean()
      .exec();

    console.log('[backfillRecipeEmbeddings] docs to process:', docs.length);

    for (const doc of docs) {

      stats.scanned += 1;
      const text = buildRecipeSemanticText(doc);
      if (!text) {
        stats.skippedNoText += 1;
        continue;
      }

      const hash = hashEmbeddingText(text);
      const hasEmbedding = Array.isArray(doc.recipeEmbedding) && doc.recipeEmbedding.length > 0;
      const hashMatches = doc.recipeEmbeddingTextHash === hash;

      if (hasEmbedding && hashMatches) {
        stats.alreadyEmbedded += 1;
        continue;
      }

      if (opts.dryRun) {
        stats.updated += 1;
        continue;
      }

      try {
        const { vector, model } = await embedText(text, { model: 'text-embedding-3-small' });
        const res = await NoteModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              recipeEmbedding: vector,
              recipeEmbeddingModel: model,
              recipeEmbeddingTextHash: hash,
              recipeEmbeddingUpdatedAt: new Date(),
            },
          },
        ).exec();
        stats.updated += 1;
      } catch (err) {
        stats.errors += 1;
        console.error('[backfillRecipeEmbeddings] failed for note', doc._id, err);
      }
    }
  } finally {
    // console.log(
    //   JSON.stringify(
    //     {
    //       ...stats,
    //       limit,
    //       dryRun: opts.dryRun,
    //     },
    //     null,
    //     2,
    //   ),
    // );
    await db.disconnectFromDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
