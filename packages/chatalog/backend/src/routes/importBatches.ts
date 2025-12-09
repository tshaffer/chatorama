import { Router } from 'express';
import mongoose from 'mongoose';
import { ImportBatchModel } from '../models/ImportBatch';
import { NoteModel } from '../models/Note';
import type { NotePreview } from '@chatorama/chatalog-shared';

const router = Router();

function toPreview(doc: any): NotePreview {
  return {
    id: String(doc._id ?? doc.id),
    title: doc.title ?? 'Untitled',
    summary: doc.summary,
    status: doc.status,
    tags: doc.tags ?? [],
    updatedAt: (doc.updatedAt instanceof Date
      ? doc.updatedAt.toISOString()
      : doc.updatedAt ?? new Date().toISOString()),
    relations: doc.relations,
    importBatchId: doc.importBatchId,
  };
}

// GET /api/v1/import-batches
router.get('/', async (_req, res, next) => {
  try {
    const batches = await ImportBatchModel.find({})
      .sort({ createdAt: -1 })
      .lean();
    res.json(
      batches.map((b) => ({
        id: String(b._id),
        createdAt: b.createdAt,
        importedCount: b.importedCount,
        remainingCount: b.remainingCount,
        sourceType: b.sourceType,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/import-batches/:batchId/notes
router.get('/:batchId/notes', async (req, res, next) => {
  try {
    const { batchId } = req.params;
    if (!mongoose.isValidObjectId(batchId)) {
      return res.status(400).json({ message: 'Invalid batchId' });
    }

    const batch = await ImportBatchModel.findById(batchId).lean();
    if (!batch) return res.status(404).json({ message: 'Import batch not found' });

    const docs = await NoteModel.find({ importBatchId: batchId })
      .sort({ order: 1, _id: 1 })
      .lean();

    res.json(docs.map(toPreview));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/import-batches/:batchId
router.delete('/:batchId', async (req, res, next) => {
  try {
    const { batchId } = req.params;

    const doc = await ImportBatchModel.findByIdAndDelete(batchId).exec();
    if (!doc) {
      return res.status(404).json({ message: 'Import batch not found' });
    }

    // Notes created by this batch remain; we only remove the history entry.
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
