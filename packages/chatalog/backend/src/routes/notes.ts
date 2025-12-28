// routes/notes.ts
import { Router } from 'express';
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
notesRouter.post('/:noteId/assets', async (req, res, next) => {
  try {
    const { noteId } = req.params;
    const { assetId, caption } = req.body ?? {};
    if (!assetId || typeof assetId !== 'string') {
      return res.status(400).json({ error: 'assetId is required' });
    }

    const note = await NoteModel.findById(noteId).lean();
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const asset = await AssetModel.findById(assetId).exec();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    try {
      const created = await NoteAssetModel.create({ noteId, assetId, caption });
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
