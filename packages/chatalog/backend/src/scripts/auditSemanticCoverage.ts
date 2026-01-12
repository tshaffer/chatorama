// auditSemanticCoverage.ts
//
// Usage:
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" tsx src/scripts/auditSemanticCoverage.ts
//
// Notes:
//   - Reports embedding coverage for notes + recipes.
//   - Flags unexpected embedding fields on the wrong docKind.
//   - Prints a small sample of missing IDs for quick spot checks.

import { NoteModel } from '../models/Note';

function ensureMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required to run auditSemanticCoverage.');
    process.exit(1);
  }
  return uri;
}

async function main() {
  ensureMongoUri();
  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  const notesTotal = await NoteModel.countDocuments({ docKind: 'note' }).exec();
  const notesWithEmbedding = await NoteModel.countDocuments({
    docKind: 'note',
    embedding: { $exists: true, $ne: [] },
  }).exec();
  const recipesTotal = await NoteModel.countDocuments({ docKind: 'recipe' }).exec();
  const recipesWithEmbedding = await NoteModel.countDocuments({
    docKind: 'recipe',
    recipeEmbedding: { $exists: true, $ne: [] },
  }).exec();

  const notesMissing = await NoteModel.find({
    docKind: 'note',
    $or: [{ embedding: { $exists: false } }, { embedding: null }, { embedding: { $size: 0 } }],
  })
    .select({ _id: 1 })
    .limit(10)
    .lean()
    .exec();

  const recipesMissing = await NoteModel.find({
    docKind: 'recipe',
    $or: [
      { recipeEmbedding: { $exists: false } },
      { recipeEmbedding: null },
      { recipeEmbedding: { $size: 0 } },
    ],
  })
    .select({ _id: 1 })
    .limit(10)
    .lean()
    .exec();

  const recipesWithNoteEmbedding = await NoteModel.countDocuments({
    docKind: 'recipe',
    embedding: { $exists: true, $ne: [] },
  }).exec();

  const notesWithRecipeEmbedding = await NoteModel.countDocuments({
    docKind: 'note',
    recipeEmbedding: { $exists: true, $ne: [] },
  }).exec();

  console.log('[auditSemanticCoverage] notes total:', notesTotal);
  console.log('[auditSemanticCoverage] notes with embedding:', notesWithEmbedding);
  console.log('[auditSemanticCoverage] recipes total:', recipesTotal);
  console.log('[auditSemanticCoverage] recipes with recipeEmbedding:', recipesWithEmbedding);
  console.log(
    '[auditSemanticCoverage] notes missing embedding sample:',
    notesMissing.map((d) => String(d._id)),
  );
  console.log(
    '[auditSemanticCoverage] recipes missing recipeEmbedding sample:',
    recipesMissing.map((d) => String(d._id)),
  );
  console.log('[auditSemanticCoverage] unexpected recipes with embedding:', recipesWithNoteEmbedding);
  console.log('[auditSemanticCoverage] unexpected notes with recipeEmbedding:', notesWithRecipeEmbedding);

  await db.disconnectFromDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
