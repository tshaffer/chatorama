import { Router } from 'express';
import { Types, isValidObjectId } from 'mongoose';
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
      return res
        .status(400)
        .json({ error: 'dest.subjectId and dest.topicId required' });
    }
    if (!isValidObjectId(dest.subjectId) || !isValidObjectId(dest.topicId)) {
      return res.status(400).json({ error: 'Invalid dest ids' });
    }
    for (const id of noteIds) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({ error: `Invalid noteId: ${id}` });
      }
    }

    const unique = new Set(noteIds);
    if (unique.size !== noteIds.length) {
      return res.status(400).json({ error: 'noteIds must not contain duplicates' });
    }

    // Convert ONLY note ids to ObjectId for querying/filtering
    const noteObjectIds = noteIds.map((id) => new Types.ObjectId(id));

    // Validate destination exists and is consistent
    // If your Subject/Topic schemas use ObjectId for _id, keep findById with strings (fine),
    // or convert to ObjectId. Here we keep it simple and use strings.
    const [subject, topic] = await Promise.all([
      SubjectModel.findById(dest.subjectId).lean(),
      TopicModel.findById(dest.topicId).lean(),
    ]);
    if (!subject) return res.status(404).json({ error: 'Destination subject not found' });
    if (!topic) return res.status(404).json({ error: 'Destination topic not found' });
    if (String(topic.subjectId) !== String(dest.subjectId)) {
      return res.status(400).json({ error: 'topic does not belong to subject' });
    }

    // Read notes (original sources)
    const notes = await NoteModel.find({ _id: { $in: noteObjectIds } })
      .select({ _id: 1, subjectId: 1, topicId: 1 })
      .lean();

    if (notes.length === 0) {
      return res.json({
        movedCount: 0,
        dest: { subjectId: dest.subjectId, topicId: dest.topicId },
      });
    }

    const distinctSourcePairs = Array.from(
      new Set(notes.map((n) => `${n.subjectId}:${n.topicId}`)),
    ).map((k) => {
      const [subjectId, topicId] = k.split(':');
      return { subjectId, topicId };
    });

    // Compute next order in destination topic.
    // IMPORTANT: if Note.topicId is a string in your schema, query using the string dest.topicId
    const maxOrderDoc = await NoteModel.findOne({ topicId: dest.topicId })
      .sort({ order: -1 })
      .select({ order: 1 })
      .lean();
    let nextOrder = (maxOrderDoc?.order ?? -1) + 1;

    const now = new Date();

    // Build ops with correct types:
    // - filter _id: ObjectId
    // - set subjectId/topicId: string (because NoteDoc says string)
    const assignedOrders: Record<string, number> = {};
    const ops = noteObjectIds.map((oid, i) => {
      const ord = nextOrder++;
      assignedOrders[noteIds[i]] = ord;

      return {
        updateOne: {
          filter: { _id: oid },
          update: {
            $set: {
              subjectId: dest.subjectId!, // string
              topicId: dest.topicId!,     // string
              order: ord,
              updatedAt: now,
            },
          },
        },
      };
    });

    const result = await NoteModel.bulkWrite(ops, { ordered: false });

    return res.json({
      movedCount: result.modifiedCount,
      source: distinctSourcePairs.length === 1 ? distinctSourcePairs[0] : undefined,
      dest: { subjectId: dest.subjectId, topicId: dest.topicId, assignedOrders },
    });
  } catch (err) {
    next(err);
  }
});
export default router;
