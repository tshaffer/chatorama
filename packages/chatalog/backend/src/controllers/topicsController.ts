import { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { TopicModel } from '../models/Topic';
import { NoteModel } from '../models/Note';
import mongoose from 'mongoose';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function listTopics(req: Request, res: Response) {
  void req;
  const docs = await TopicModel.find().sort({ order: 1, name: 1 }).exec();
  res.json(docs.map((d) => d.toJSON()));
}

export async function getTopicNoteCount(req: Request, res: Response) {
  try {
    const { topicId } = req.params;
    const noteCount = await NoteModel.countDocuments({ topicId });
    return res.json({ topicId, noteCount });
  } catch (err) {
    console.error('getTopicNoteCount error', err);
    return res.status(500).json({ error: 'Failed to get topic note count' });
  }
}

export async function listTopicsForSubjectId(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { subjectId } = req.params;

    // If subjectId is an ObjectId in your schema, this avoids Mongoose CastError surfacing as 500s.
    if (TopicModel.schema.path('subjectId') instanceof mongoose.Schema.Types.ObjectId) {
      if (!mongoose.isValidObjectId(subjectId)) {
        return res.status(400).json({ error: 'Invalid subjectId' });
      }
    }

    const docs = await TopicModel.find(
      { subjectId },
      null,
      { sort: { order: 1, name: 1 } },
    ).exec();

    // Use toJSON so your schema transform sets `id` and drops _id/__v
    res.json(docs.map((d) => d.toJSON()));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/subjects/:subjectId/topics/:topicId/notes
export async function listNotesForSubjectTopicIds(req: Request, res: Response) {
  const { subjectId, topicId } = req.params;

  // Optional: verify topic belongs to subject
  const topic = await TopicModel.findOne({
    _id: topicId,
    subjectId,
  })
    .select({ _id: 1 })
    .lean();
  if (!topic) return res.status(404).json({ message: 'Topic not found for subject' });

  const notes = await NoteModel.find(
    { topicId },
    { title: 1, summary: 1, tags: 1, updatedAt: 1, order: 1 },
  )
    .sort({ order: 1, _id: 1 })
    .exec();

  res.json(notes.map((n) => n.toJSON()));
}

// PATCH /api/v1/subjects/:subjectId/topics/:topicId/notes/reorder
export async function reorderNotesForTopic(req: Request, res: Response) {
  const { subjectId, topicId } = req.params;
  const { noteIdsInOrder } = req.body as { noteIdsInOrder: string[] };

  if (!Array.isArray(noteIdsInOrder) || noteIdsInOrder.length === 0) {
    return res
      .status(400)
      .json({ error: 'noteIdsInOrder must be a non-empty array' });
  }

  // Validate + convert to ObjectIds
  const objectIds: Types.ObjectId[] = [];
  for (const id of noteIdsInOrder) {
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: `Invalid subject id: ${id}` });
    }
    objectIds.push(new Types.ObjectId(id));
  }

  // Optional: reject duplicates (recommended)
  const unique = new Set(noteIdsInOrder);
  if (unique.size !== noteIdsInOrder.length) {
    return res.status(400).json({ error: 'noteIdsInOrder must not contain duplicates' });
  }






  // verify topic exists and belongs to subject
  const topic = await TopicModel.findOne({
    _id: topicId,
    subjectId,
  })
    .select({ _id: 1 })
    .lean();
  if (!topic) {
    return res
      .status(404)
      .json({ error: 'Topic not found for subject' });
  }

  // verify all notes belong to this topic
  const count = await NoteModel.countDocuments({
    _id: { $in: objectIds },
    topicId,
  });
  if (count !== objectIds.length) {
    return res
      .status(400)
      .json({ error: 'All noteIds must belong to the specified topic' });
  }

  // compact rewrite 0..N
  const ops = objectIds.map((id, idx) => ({
    updateOne: {
      filter: { _id: id, topicId },
      update: { $set: { order: idx } },
    },
  }));
  if (ops.length) await NoteModel.bulkWrite(ops);

  // return freshly sorted list
  const notes = await NoteModel.find({ topicId })
    .sort({ order: 1, _id: 1 })
    .exec();

  res.json(notes.map((n) => n.toJSON()));
}

/**
 * PATCH /api/v1/subjects/:subjectId/topics/:topicId
 * Body: { name: string }
 * Query: preserveSlug=1 to keep existing slug (default: regenerate to match name)
 */
export async function renameTopic(req: Request, res: Response) {
  try {
    const { subjectId, topicId } = req.params;
    const { name } = req.body as { name?: string };
    const preserveSlug = req.query.preserveSlug === '1';

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    const topic = await TopicModel.findOne({ _id: topicId, subjectId }).orFail();
    topic.name = name.trim();

    if (!preserveSlug) {
      topic.slug = slugify(topic.name);
    }

    await topic.save(); // respects (subjectId,name) and (subjectId,slug) uniqueness
    return res.json(topic.toJSON());
  } catch (err: any) {
    if (err?.name === 'DocumentNotFoundError') {
      return res.status(404).json({ message: 'Topic not found.' });
    }
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({
          message:
            'A topic with that name/slug already exists for this subject.',
        });
    }
    console.error('renameTopic error', err);
    return res.status(500).json({ message: 'Internal error.' });
  }
}

/**
 * PATCH /api/v1/subjects/:subjectId/topics/reorder
 * Body: { orderedTopicIds: string[] }
 *
 * Sets Topic.order = index for the given ids, scoped to subjectId.
 */
export async function reorderTopicsForSubject(req: Request, res: Response) {
  const { subjectId } = req.params;
  const { orderedTopicIds } = req.body as { orderedTopicIds?: string[] };

  if (!Array.isArray(orderedTopicIds) || orderedTopicIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'orderedTopicIds must be a non-empty array' });
  }

  // Validate + convert to ObjectIds
  const objectIds: Types.ObjectId[] = [];
  for (const id of orderedTopicIds) {
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: `Invalid subject id: ${id}` });
    }
    objectIds.push(new Types.ObjectId(id));
  }


  // verify all topics exist and belong to this subject
  const count = await TopicModel.countDocuments({
    _id: { $in: objectIds },
    subjectId,
  }).exec();

  if (count !== objectIds.length) {
    return res
      .status(400)
      .json({
        error:
          'All objectIds must refer to topics belonging to the specified subject',
      });
  }

  const ops = objectIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id, subjectId },
      update: { $set: { order: index } },
    },
  }));

  if (ops.length) {
    await TopicModel.bulkWrite(ops);
  }

  return res.status(204).end();
}
