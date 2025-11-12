import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { NoteModel } from '../models/Note';
import { TopicModel } from '../models/Topic';
import { SubjectModel } from '../models/Subject';

const router = Router();

/**
 * POST /api/v1/notes:move
 * Body: { noteIds: string[], dest: { subjectId: string, topicId: string } }
 */
router.post('/notes:move', async (req, res, next) => {
  try {
    const { noteIds, dest } = req.body as {
      noteIds?: string[];
      dest?: { subjectId?: string; topicId?: string };
    };

    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ error: 'noteIds[] required' });
    }
    if (!dest?.subjectId || !dest?.topicId) {
      return res.status(400).json({ error: 'dest.subjectId and dest.topicId required' });
    }
    if (!isValidObjectId(dest.subjectId) || !isValidObjectId(dest.topicId)) {
      return res.status(400).json({ error: 'Invalid dest ids' });
    }
    for (const id of noteIds) {
      if (!isValidObjectId(id)) return res.status(400).json({ error: `Invalid noteId: ${id}` });
    }

    // Validate destination exists and is consistent
    const [subject, topic] = await Promise.all([
      SubjectModel.findById(dest.subjectId).lean(),
      TopicModel.findById(dest.topicId).lean(),
    ]);
    if (!subject) return res.status(404).json({ error: 'Destination subject not found' });
    if (!topic) return res.status(404).json({ error: 'Destination topic not found' });
    if (String(topic.subjectId) !== String(dest.subjectId)) {
      return res.status(400).json({ error: 'topic does not belong to subject' });
    }

    // Read notes (also captures original source for convenience)
    const notes = await NoteModel.find({ _id: { $in: noteIds } })
      .select({ _id: 1, subjectId: 1, topicId: 1 })
      .lean();

    if (notes.length === 0) {
      return res.json({ movedCount: 0, dest: { subjectId: dest.subjectId, topicId: dest.topicId } });
    }

    const distinctSourcePairs = Array.from(
      new Set(notes.map(n => `${n.subjectId}:${n.topicId}`))
    ).map(k => ({ subjectId: k.split(':')[0], topicId: k.split(':')[1] }));

    // Compute next order(s) in destination
    // If you maintain per-topic `order` (you backfilled this recently),
    // append notes to the end, preserving the user’s selected order.
    const maxOrderDoc = await NoteModel.findOne({ topicId: dest.topicId })
      .sort({ order: -1 })
      .select({ order: 1 })
      .lean();
    let nextOrder = (maxOrderDoc?.order ?? -1) + 1;

    // bulkWrite to set subjectId/topicId and assign new contiguous order
    const assignedOrders: Record<string, number> = {};
    const ops = noteIds.map(id => {
      const ord = nextOrder++;
      assignedOrders[id] = ord;
      return {
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              subjectId: dest.subjectId,
              topicId: dest.topicId,
              order: ord,
              updatedAt: new Date(),
            },
          },
        },
      };
    });

    const result = await NoteModel.bulkWrite(ops, { ordered: false });

    res.json({
      movedCount: result.modifiedCount,
      source: distinctSourcePairs.length === 1 ? distinctSourcePairs[0] : undefined,
      dest: { subjectId: dest.subjectId, topicId: dest.topicId, assignedOrders },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
