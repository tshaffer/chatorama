// chatalog/backend/src/routes/quicknotes.ts
import { Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { QuickNoteModel } from '../models/QuickNote';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import { NoteModel } from '../models/Note';

const router = Router();

// ------- helpers -------
function toObjectId(id?: string) {
  if (!id) return undefined;
  if (!isValidObjectId(id)) throw new Error('Invalid ObjectId');
  return new Types.ObjectId(id);
}

async function ensureSubjectTopicExist(subjectId?: string, topicId?: string) {
  if (subjectId) {
    const sub = await SubjectModel.findById(subjectId).select('_id').lean();
    if (!sub) throw new Error('subjectId not found');
  }
  if (topicId) {
    const top = await TopicModel.findById(topicId).select('_id').lean();
    if (!top) throw new Error('topicId not found');
  }
}

// Basic slugify
function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')     // strip accents
    .replace(/[^a-z0-9]+/g, '-')         // non-alnum -> dashes
    .replace(/(^-|-$)/g, '')             // trim dashes
    .slice(0, 80) || 'note';
}

// topicId is a string (or undefined), matching NoteModel/QuickNoteModel
async function dedupeSlug(baseSlug: string, topicId?: string): Promise<string> {
  let slug = baseSlug || 'note';
  let i = 2;

  for (; ;) {
    const filter: any = { slug };
    if (topicId) {
      filter.topicId = topicId;
    } else {
      // No topic: ensure we only clash with notes that also have no topic
      filter.topicId = { $exists: false };
    }

    const exists = await NoteModel.findOne(filter).select('_id').lean();
    if (!exists) return slug;

    slug = `${baseSlug}-${i++}`;
  }
}

// Find or create a Subject from a free-form label (like ImportResultsDialog)
async function findOrCreateSubjectByLabel(
  label?: string,
  fallbackId?: Types.ObjectId | string | null
): Promise<Types.ObjectId | string | undefined> {
  if (label && label.trim()) {
    const name = label.trim();

    // try existing subject by name (lean result)
    const existing = await SubjectModel.findOne({ name }).lean();
    if (existing) {
      return existing._id as Types.ObjectId | string;
    }

    // create a new subject (Document)
    const created = await SubjectModel.create({
      name,
      slug: slugify(name),
      description: '',
    });

    return created._id as Types.ObjectId | string;
  }

  // no label provided: fall back to existing id (if any)
  return (fallbackId ?? undefined) as Types.ObjectId | string | undefined;
}

// Find or create a Topic within a Subject from a free-form label
async function findOrCreateTopicByLabel(
  label?: string,
  subjectId?: Types.ObjectId | string | null,
  fallbackId?: Types.ObjectId | string | null
): Promise<Types.ObjectId | string | undefined> {
  if (!label || !label.trim()) {
    return (fallbackId ?? undefined) as Types.ObjectId | string | undefined;
  }
  if (!subjectId) {
    // no subject context → we can't safely create a topic
    return (fallbackId ?? undefined) as Types.ObjectId | string | undefined;
  }

  const name = label.trim();

  const existing = await TopicModel.findOne({ name, subjectId }).lean();
  if (existing) {
    return existing._id as Types.ObjectId | string;
  }

  const created = await TopicModel.create({
    name,
    slug: slugify(name),
    subjectId,
    description: '',
  });

  return created._id as Types.ObjectId | string;
}

// ------- GET /api/v1/quicknotes -------
/**
 * Optional query params:
 *  - q: string (text search in title/markdown)
 *  - subjectId, topicId: filter
 *  - limit: number (default 100, max 500)
 */
router.get('/', async (req, res) => {
  try {
    const { q, subjectId, topicId } = req.query as {
      q?: string;
      subjectId?: string;
      topicId?: string;
    };
    const limit = Math.min(
      Math.max(parseInt((req.query.limit as string) || '100', 10), 1),
      500
    );

    const filter: any = {};
    if (subjectId && isValidObjectId(subjectId)) filter.subjectId = subjectId;
    if (topicId && isValidObjectId(topicId)) filter.topicId = topicId;
    if (q?.trim()) {
      filter.$text = { $search: q.trim() };
    }

    const notes = await QuickNoteModel.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(
      notes.map(n => ({
        ...n,
        id: n._id?.toString(),
        _id: undefined,
        __v: undefined,
      }))
    );
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Failed to fetch quick notes' });
  }
});

// ------- POST /api/v1/quicknotes -------
router.post('/', async (req, res) => {
  try {
    const { title, markdown, subjectId, topicId } = req.body as {
      title?: string;
      markdown?: string;
      subjectId?: string;
      topicId?: string;
    };

    if (!markdown || typeof markdown !== 'string' || !markdown.trim()) {
      return res.status(400).json({ message: 'markdown is required' });
    }

    const finalTitle =
      (title?.trim() || '').slice(0, 200) || 'Untitled quick note';

    if (subjectId || topicId) {
      await ensureSubjectTopicExist(subjectId, topicId);
    }

    const created = await QuickNoteModel.create({
      title: finalTitle,
      markdown,
      subjectId: subjectId ? toObjectId(subjectId) : undefined,
      topicId: topicId ? toObjectId(topicId) : undefined,
    });

    res.status(201).json(created.toJSON());
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Failed to create quick note' });
  }
});

// ------- PATCH /api/v1/quicknotes/:id -------
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const { title, markdown, subjectId, topicId } = req.body as {
      title?: string;
      markdown?: string;
      subjectId?: string;
      topicId?: string;
    };

    if (subjectId || topicId) {
      await ensureSubjectTopicExist(subjectId, topicId);
    }

    const updates: any = {};
    if (typeof title === 'string') {
      updates.title =
        title.trim().slice(0, 200) || 'Untitled quick note';
    }
    if (typeof markdown === 'string') updates.markdown = markdown;
    if (subjectId !== undefined) {
      updates.subjectId = subjectId ? toObjectId(subjectId) : undefined;
    }
    if (topicId !== undefined) {
      updates.topicId = topicId ? toObjectId(topicId) : undefined;
    }

    const updated = await QuickNoteModel.findByIdAndUpdate(id, updates, {
      new: true,
    }).lean();
    if (!updated) {
      return res.status(404).json({ message: 'Quick note not found' });
    }

    res.json({
      ...updated,
      id: updated._id?.toString(),
      _id: undefined,
      __v: undefined,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Failed to update quick note' });
  }
});

// ------- DELETE /api/v1/quicknotes/:id -------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const deleted = await QuickNoteModel.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ message: 'Quick note not found' });
    }

    res.json({ id, deleted: true });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Failed to delete quick note' });
  }
});

// ------- POST /api/v1/quicknotes/:id/convert -------
/**
 * Moves a quick note into Notes collection:
 *  - optionally maps free-form subject/topic labels to IDs
 *  - creates a Note with required slug
 *  - then deletes the original QuickNote
 * Returns { noteId }.
 */
router.post('/:id/convert', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const quick = await QuickNoteModel.findById(id);
    if (!quick) {
      return res.status(404).json({ message: 'Quick note not found' });
    }

    const { subjectLabel, topicLabel } = req.body as {
      subjectLabel?: string;
      topicLabel?: string;
    };

    // Start from whatever is on the quick note (ObjectId or string)
    let subjectId = (quick.subjectId as any) as Types.ObjectId | string | undefined;
    let topicId = (quick.topicId as any) as Types.ObjectId | string | undefined;

    // Map free-form labels to actual Subject/Topic, creating as needed
    subjectId = await findOrCreateSubjectByLabel(subjectLabel, subjectId);
    topicId = await findOrCreateTopicByLabel(topicLabel, subjectId, topicId);

    const baseSlug = slugify(quick.title || 'note');
    const uniqueSlug = await dedupeSlug(
      baseSlug,
      topicId ? topicId.toString() : undefined
    );

    const createdNote = await NoteModel.create({
      title: quick.title || 'Untitled',
      markdown: quick.markdown,
      subjectId,
      topicId,
      slug: uniqueSlug,
      summary: undefined,
      tags: [],
      links: [],
      backlinks: [],
      sources: [{ type: 'manual' as const }],
    });

    await quick.deleteOne();

    res.status(201).json({ noteId: createdNote._id.toString() });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Failed to convert quick note' });
  }
});

export default router;
