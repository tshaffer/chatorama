import { NoteModel } from '../models/Note';

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const GOOGLE_SLIDES_MIME = 'application/vnd.google-apps.presentation';

function deriveDocsUrl(driveFileId: string, mimeType?: string): string | undefined {
  if (!mimeType || mimeType === GOOGLE_DOC_MIME) {
    return `https://docs.google.com/document/d/${driveFileId}/edit`;
  }
  if (mimeType === GOOGLE_SHEET_MIME) {
    return `https://docs.google.com/spreadsheets/d/${driveFileId}/edit`;
  }
  if (mimeType === GOOGLE_SLIDES_MIME) {
    return `https://docs.google.com/presentation/d/${driveFileId}/edit`;
  }
  return undefined;
}

async function run() {
  const cursor = NoteModel.find({
    sources: {
      $elemMatch: {
        type: 'googleDoc',
        driveFileId: { $exists: true, $ne: '' },
        $or: [{ docsUrl: { $exists: false } }, { docsUrl: null }, { docsUrl: '' }],
      },
    },
  })
    .select({ sources: 1 })
    .lean()
    .cursor();

  let updated = 0;
  for await (const doc of cursor as any) {
    const source = (doc.sources ?? []).find((s: any) => s?.type === 'googleDoc');
    const driveFileId = source?.driveFileId;
    if (!driveFileId) continue;
    const docsUrl = deriveDocsUrl(driveFileId, source?.driveMimeType);
    if (!docsUrl) continue;

    await NoteModel.updateOne(
      { _id: doc._id },
      { $set: { 'sources.$[src].docsUrl': docsUrl } },
      {
        arrayFilters: [
          {
            'src.type': 'googleDoc',
            $or: [
              { 'src.docsUrl': { $exists: false } },
              { 'src.docsUrl': null },
              { 'src.docsUrl': '' },
            ],
          },
        ],
      }
    ).exec();
    updated += 1;
  }

  console.log(`[backfillGoogleDocDocsUrl] updated ${updated} notes`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfillGoogleDocDocsUrl] failed', err);
    process.exit(1);
  });
