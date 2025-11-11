import { NextFunction, Request, Response } from 'express';
import { TopicModel } from '../models/Topic';
import { NoteModel } from '../models/Note';
import mongoose from 'mongoose';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function listTopicsForSubjectId(req: Request, res: Response, next: NextFunction) {
  try {
    const { subjectId } = req.params;

    // If subjectId is an ObjectId in your schema, this avoids Mongoose CastError surfacing as 500s.
    if (TopicModel.schema.path('subjectId') instanceof mongoose.Schema.Types.ObjectId) {
      if (!mongoose.isValidObjectId(subjectId)) {
        return res.status(400).json({ error: 'Invalid subjectId' });
      }
    }

    const docs = await TopicModel.find({ subjectId }, null, { sort: { name: 1 } }).exec();

    // Use toJSON so your schema transform sets `id` and drops _id/__v
    res.json(docs.map(d => d.toJSON()));
  } catch (err) {
    next(err);
  }
}

// notes list for a topic (previews), ID-based
export async function listNotesForSubjectTopicIds(req: Request, res: Response) {
  const { subjectId, topicId } = req.params;
  // (optional) verify the topic belongs to subjectId

  const docs = await NoteModel.find(
    { topicId },
    { title: 1, summary: 1, tags: 1, updatedAt: 1 }
  )
    .sort({ updatedAt: -1 })
    .exec();

  res.json(docs.map(d => d.toJSON()));
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
      return res.status(409).json({ message: 'A topic with that name/slug already exists for this subject.' });
    }
    console.error('renameTopic error', err);
    return res.status(500).json({ message: 'Internal error.' });
  }
}
