import mongoose from 'mongoose';
import { NoteModel } from '../models/Note';
import { connectToDatabase } from '../db/mongoose';

async function main() {
  await connectToDatabase();

  const recipesResult = await NoteModel.updateMany(
    { docKind: { $exists: false }, recipe: { $exists: true, $ne: null } },
    { $set: { docKind: 'recipe' } }
  ).exec();

  const notesResult = await NoteModel.updateMany(
    {
      docKind: { $exists: false },
      $or: [{ recipe: { $exists: false } }, { recipe: null }],
    },
    { $set: { docKind: 'note' } }
  ).exec();

  // eslint-disable-next-line no-console
  console.log('[backfillDocKind] recipes modified:', recipesResult.modifiedCount);
  // eslint-disable-next-line no-console
  console.log('[backfillDocKind] notes modified:', notesResult.modifiedCount);

  const remaining = await NoteModel.countDocuments({ docKind: { $exists: false } }).exec();
  // eslint-disable-next-line no-console
  console.log('[backfillDocKind] remaining missing docKind:', remaining);
}

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[backfillDocKind] failed', err);
    await mongoose.disconnect();
    process.exit(1);
  });
