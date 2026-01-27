// routes/notes.ts
import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import {
  listNotes,
  getNote,
  createNote,
  patchNote,
  deleteNote,
  listNotesByTopicWithRelations, // make sure this is imported
} from '../controllers/notesController';
import { NoteModel } from '../models/Note';
import { NoteAssetModel } from '../models/NoteAsset';
import { AssetModel } from '../models/Asset';

const notesRouter = Router();

// These resolve to /api/v1/notes/... because you'll mount at api.use('/notes', ...)

// IMPORTANT: specific routes BEFORE the param route
notesRouter.get('/by-topic-with-relations',
  listNotesByTopicWithRelations);                   // GET    /api/v1/notes/by-topic-with-relations
notesRouter.get('/', listNotes);                    // GET    /api/v1/notes
notesRouter.get('/:id', getNote);                   // GET    /api/v1/notes/:id
notesRouter.post('/', createNote);                  // POST   /api/v1/notes

// POST /api/v1/notes/:noteId/assets
// GET /api/v1/notes/:noteId/assets
notesRouter.get('/:noteId/assets', async (req, res, next) => {
  try {
    const { noteId } = req.params;
    if (!isValidObjectId(noteId)) {
      return res.status(400).json({ error: 'Invalid noteId' });
    }

    const assets = await NoteAssetModel.find({ noteId })
      .sort({ order: 1, _id: 1 })
      .populate('assetId')
      .exec();

    const payload = assets.map((doc) => {
      const json = doc.toJSON() as any;
      const asset = (doc.assetId as any)?.toJSON?.() ?? doc.assetId;
      return {
        ...json,
        noteId: json.noteId?.toString?.() ?? json.noteId,
        assetId: asset?.id ?? json.assetId?.toString?.() ?? json.assetId,
        asset,
      };
    });

    return res.json(payload);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notes/:noteId/assets
notesRouter.post('/:noteId/assets', async (req, res, next) => {
  try {
    const { noteId } = req.params;
    const { assetId, caption, role, sourceType, mimeType, filename, storageKey, sizeBytes } =
      req.body ?? {};
    if (!assetId || typeof assetId !== 'string') {
      return res.status(400).json({ error: 'assetId is required' });
    }

    const note = await NoteModel.findById(noteId).lean();
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const asset = await AssetModel.findById(assetId).exec();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const roleValue =
      role === 'viewer' || role === 'source' || role === 'other' ? role : undefined;

    try {
      const created = await NoteAssetModel.create({
        noteId,
        assetId,
        caption,
        role: roleValue,
        sourceType: typeof sourceType === 'string' ? sourceType : undefined,
        mimeType: typeof mimeType === 'string' ? mimeType : asset.mimeType,
        filename: typeof filename === 'string' ? filename : undefined,
        storageKey: typeof storageKey === 'string' ? storageKey : asset.storage?.path,
        sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : asset.byteSize,
      });
      const populated = await created.populate('assetId');
      const assetJson =
        (populated.assetId as any)?.toJSON?.() ?? populated.assetId;
      const payload: any = {
        ...populated.toJSON(),
        assetId: asset.id,
        asset: assetJson,
      };
      return res.status(201).json(payload);
    } catch (err: any) {
      if (err?.code === 11000) {
        const existing = await NoteAssetModel.findOne({ noteId, assetId })
          .populate('assetId')
          .exec();
        if (existing) {
          const assetJson =
            (existing.assetId as any)?.toJSON?.() ?? existing.assetId;
          const payload: any = {
            ...existing.toJSON(),
            assetId: asset.id,
            asset: assetJson,
          };
          return res.json(payload);
        }
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

notesRouter.patch('/:id', patchNote);               // PATCH  /api/v1/notes/:id
notesRouter.delete('/:id', deleteNote);             // DELETE /api/v1/notes/:id

export default notesRouter;
