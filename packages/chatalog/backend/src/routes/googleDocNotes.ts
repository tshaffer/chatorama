import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  upsertGoogleDocFromArtifacts,
  type UpsertGoogleDocArtifactsInput,
} from '../services/googleDocNotes';
import { exportDrivePdf, exportDriveTextPlain, fetchDriveFileMeta } from '../services/googleDrive';
import { NoteModel } from '../models/Note';
import { NoteAssetModel } from '../models/NoteAsset';

const googleDocNotesRouter = Router();
const ADMIN_TOKEN = process.env.CHATALOG_ADMIN_TOKEN;

function requireAdminToken(req: any, res: any): boolean {
  if (!ADMIN_TOKEN) {
    res.status(500).json({ error: 'CHATALOG_ADMIN_TOKEN is not configured' });
    return false;
  }
  const provided = req.header('x-chatalog-admin');
  if (!provided || provided !== ADMIN_TOKEN) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// POST /api/v1/googleDocNotes/upsertFromArtifacts
// Manual import can call upsertFromArtifacts directly (no OAuth required).
googleDocNotesRouter.post('/upsertFromArtifacts', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Partial<UpsertGoogleDocArtifactsInput>;
    if (!body.noteId && (!body.subjectId || !body.topicId)) {
      return res.status(400).json({ error: 'subjectId and topicId are required for googleDoc import' });
    }
    if (body.subjectId && !isValidObjectId(body.subjectId)) {
      return res.status(400).json({ error: 'subjectId must be a valid ObjectId' });
    }
    if (body.topicId && !isValidObjectId(body.topicId)) {
      return res.status(400).json({ error: 'topicId must be a valid ObjectId' });
    }
    const payload: UpsertGoogleDocArtifactsInput = {
      noteId: body.noteId,
      subjectId: body.subjectId,
      topicId: body.topicId,
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
    const { driveFileId, noteId, subjectId, topicId } = req.body ?? {};
    if (!driveFileId || typeof driveFileId !== 'string') {
      return res.status(400).json({ error: 'driveFileId is required' });
    }
    if (!subjectId || !topicId) {
      return res.status(400).json({ error: 'subjectId and topicId are required for googleDoc import' });
    }
    if (!isValidObjectId(subjectId) || !isValidObjectId(topicId)) {
      return res.status(400).json({ error: 'subjectId and topicId must be valid ObjectIds' });
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
      subjectId,
      topicId,
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

// POST /api/v1/googleDocNotes/admin/metadata
googleDocNotesRouter.post('/admin/metadata', async (req, res, next) => {
  try {
    if (!requireAdminToken(req, res)) return;
    const { driveFileId } = req.body ?? {};
    if (!driveFileId || typeof driveFileId !== 'string') {
      return res.status(400).json({ error: 'driveFileId is required' });
    }
    const meta = await fetchDriveFileMeta(driveFileId);
    return res.json(meta);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/googleDocNotes/admin/export
googleDocNotesRouter.post('/admin/export', async (req, res, next) => {
  try {
    if (!requireAdminToken(req, res)) return;
    const { driveFileId } = req.body ?? {};
    if (!driveFileId || typeof driveFileId !== 'string') {
      return res.status(400).json({ error: 'driveFileId is required' });
    }
    const [textPlain, pdfBuffer] = await Promise.all([
      exportDriveTextPlain(driveFileId),
      exportDrivePdf(driveFileId),
    ]);
    return res.json({
      driveFileId,
      textChars: textPlain.length,
      pdfBytes: pdfBuffer.length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/googleDocNotes/admin/smoke
googleDocNotesRouter.post('/admin/smoke', async (req, res, next) => {
  try {
    if (!requireAdminToken(req, res)) return;
    const { driveFileId, noteId, subjectId, topicId } = req.body ?? {};
    if (!driveFileId || typeof driveFileId !== 'string') {
      return res.status(400).json({ error: 'driveFileId is required' });
    }
    if (!noteId && (!subjectId || !topicId)) {
      return res.status(400).json({ error: 'subjectId and topicId are required for googleDoc import' });
    }

    const meta = await fetchDriveFileMeta(driveFileId);
    const [textPlain, pdfBuffer] = await Promise.all([
      exportDriveTextPlain(driveFileId),
      exportDrivePdf(driveFileId),
    ]);
    const viewerPdfBase64 = pdfBuffer.length ? pdfBuffer.toString('base64') : undefined;

    const result = await upsertGoogleDocFromArtifacts({
      noteId: typeof noteId === 'string' ? noteId : undefined,
      subjectId: typeof subjectId === 'string' ? subjectId : undefined,
      topicId: typeof topicId === 'string' ? topicId : undefined,
      source: {
        driveFileId,
        driveUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
        driveModifiedTime: meta.modifiedTime,
        driveName: meta.name,
      },
      textPlain,
      viewerPdfBase64,
      viewerPdfFilename: `${meta.name || driveFileId}.pdf`,
    });

    const doc = await NoteModel.findById(result.noteId).lean().exec();
    const viewerAsset = await NoteAssetModel.findOne({
      noteId: result.noteId,
      role: 'viewer',
    })
      .lean()
      .exec();

    const googleSource = Array.isArray(doc?.sources)
      ? doc.sources.find((s: any) => s?.type === 'googleDoc')
      : undefined;
    const driveModifiedTimeAtImport = googleSource?.driveModifiedTimeAtImport
      ? new Date(googleSource.driveModifiedTimeAtImport).toISOString()
      : undefined;
    const isStale = Boolean(
      driveModifiedTimeAtImport &&
        new Date(meta.modifiedTime).getTime() > new Date(driveModifiedTimeAtImport).getTime()
    );

    return res.json({
      noteId: result.noteId,
      status: result.status,
      viewerStored: Boolean(viewerAsset),
      derivedTextChars: doc?.derived?.googleDoc?.textPlain?.length ?? 0,
      embeddingExists: Array.isArray(doc?.embedding) && doc?.embedding.length > 0,
      driveModifiedTimeAtImport,
      driveModifiedTimeCurrent: meta.modifiedTime,
      isStale,
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
