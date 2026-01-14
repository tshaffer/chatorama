import { connectToDatabase, disconnectFromDatabase } from '../db/mongoose';
import { NoteModel } from '../models/Note';
import { buildIngredientTokensFromIngredients } from '../utils/ingredientTokens';

type Options = {
  dryRun: boolean;
  limit?: number;
};

function parseArgs(argv: string[]): Options {
  const opts: Options = { dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--limit=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) opts.limit = Math.floor(n);
    }
  }
  return opts;
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  await connectToDatabase();

  const filter = {
    docKind: 'recipe',
    $or: [
      { 'recipe.ingredientTokens': { $exists: false } },
      { 'recipe.ingredientTokens': { $size: 0 } },
    ],
  };

  const cursor = NoteModel.find(filter)
    .select({ _id: 1, recipe: 1 })
    .lean()
    .cursor();

  let processed = 0;
  let updated = 0;

  for await (const doc of cursor) {
    if (opts.limit && processed >= opts.limit) break;
    processed += 1;

    const recipe: any = (doc as any).recipe;
    const tokens = buildIngredientTokensFromIngredients(
      recipe?.ingredients ?? [],
      recipe?.ingredientsRaw ?? [],
    );

    if (!tokens.length) continue;

    if (opts.dryRun) {
      if (processed % 100 === 0) {
        console.log(`[dry-run] processed=${processed} updated=${updated}`);
      }
      updated += 1;
      continue;
    }

    const res = await NoteModel.updateOne(
      { _id: doc._id },
      { $set: { 'recipe.ingredientTokens': tokens } },
    ).exec();

    if (res.modifiedCount) updated += 1;
    if (processed % 100 === 0) {
      console.log(`processed=${processed} updated=${updated}`);
    }
  }

  console.log(`done: processed=${processed} updated=${updated} dryRun=${opts.dryRun}`);
  await disconnectFromDatabase();
}

run().catch((err) => {
  console.error('[backfillIngredientTokens] failed', err);
  process.exitCode = 1;
});
