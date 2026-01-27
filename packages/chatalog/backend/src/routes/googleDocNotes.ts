import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  upsertGoogleDocFromArtifacts,
  type UpsertGoogleDocArtifactsInput,
} from '../services/googleDocNotes';
import { exportDrivePdf, exportDriveTextPlain, fetchDriveFileMeta } from '../services/googleDrive';
import { NoteModel } from '../models/Note';

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

// GET /api/v1/googleDocNotes/:noteId/driveStatus
googleDocNotesRouter.get('/:noteId/driveStatus', async (req, res, next) => {
  try {
    const { noteId } = req.params;
    if (!isValidObjectId(noteId)) {
      return res.status(400).json({ error: 'Invalid noteId' });
    }

    const note = await NoteModel.findById(noteId).lean().exec();
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const googleSource = Array.isArray(note.sources)
      ? note.sources.find((s: any) => s?.type === 'googleDoc')
      : undefined;
    if (!googleSource || note.sourceType !== 'googleDoc') {
      return res.status(400).json({ error: 'Note is not a Google Doc source' });
    }

    const driveFileId = googleSource.driveFileId;
    if (!driveFileId) {
      return res.status(400).json({ error: 'driveFileId is missing on note source' });
    }

    const meta = await fetchDriveFileMeta(driveFileId);
    const driveModifiedTimeAtImport = googleSource.driveModifiedTimeAtImport
      ? new Date(googleSource.driveModifiedTimeAtImport).toISOString()
      : undefined;
    const importedAt = googleSource.importedAt
      ? new Date(googleSource.importedAt).toISOString()
      : note.importedAt
        ? new Date(note.importedAt).toISOString()
        : undefined;

    const isStale = Boolean(
      driveModifiedTimeAtImport &&
        new Date(meta.modifiedTime).getTime() > new Date(driveModifiedTimeAtImport).getTime(),
    );

    return res.json({
      driveFileId,
      driveName: meta.name,
      driveModifiedTimeCurrent: meta.modifiedTime,
      driveModifiedTimeAtImport,
      importedAt,
      isStale,
    });
  } catch (err) {
    next(err);
  }
});

export default googleDocNotesRouter;
