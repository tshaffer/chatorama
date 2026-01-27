import { Router } from 'express';
import {
  upsertGoogleDocFromArtifacts,
  type UpsertGoogleDocArtifactsInput,
} from '../services/googleDocNotes';
import { exportDrivePdf, exportDriveTextPlain, fetchDriveFileMeta } from '../services/googleDrive';

const googleDocNotesRouter = Router();

// POST /api/v1/googleDocNotes/upsertFromArtifacts
googleDocNotesRouter.post('/upsertFromArtifacts', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Partial<UpsertGoogleDocArtifactsInput>;
    const payload: UpsertGoogleDocArtifactsInput = {
      noteId: body.noteId,
      source: body.source as UpsertGoogleDocArtifactsInput['source'],
      textPlain: String(body.textPlain ?? ''),
      viewerPdfBase64: body.viewerPdfBase64,
      viewerPdfFilename: body.viewerPdfFilename,
    };

    const result = await upsertGoogleDocFromArtifacts(payload);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/googleDocNotes/importFromDrive
googleDocNotesRouter.post('/importFromDrive', async (req, res, next) => {
  try {
    const { driveFileId, noteId } = req.body ?? {};
    if (!driveFileId || typeof driveFileId !== 'string') {
      return res.status(400).json({ error: 'driveFileId is required' });
    }

    const meta = await fetchDriveFileMeta(driveFileId);
    const [textPlain, pdfBuffer] = await Promise.all([
      exportDriveTextPlain(driveFileId),
      exportDrivePdf(driveFileId),
    ]);

    const now = new Date();
    const viewerPdfBase64 = pdfBuffer.length ? pdfBuffer.toString('base64') : undefined;
    const viewerPdfFilename = `${meta.name || driveFileId}.pdf`;

    const result = await upsertGoogleDocFromArtifacts({
      noteId: typeof noteId === 'string' ? noteId : undefined,
      source: {
        driveFileId,
        driveUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
        driveModifiedTime: meta.modifiedTime,
        driveName: meta.name,
      },
      textPlain,
      viewerPdfBase64,
      viewerPdfFilename,
    });

    return res.json({
      noteId: result.noteId,
      importedAt: now.toISOString(),
      driveModifiedTimeAtImport: meta.modifiedTime,
      stale: false,
    });
  } catch (err) {
    next(err);
  }
});

export default googleDocNotesRouter;
