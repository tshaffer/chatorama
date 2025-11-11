import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { QuickNoteModel } from '../models/QuickNote';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import { NoteModel } from '../models/Note';

const router = Router();

// ---------------- helpers ----------------
function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')     // strip accents
    .replace(/[^a-z0-9]+/g, '-')         // non-alnum -> dashes
    .replace(/(^-|-$)/g, '')             // trim dashes
    .slice(0, 80) || 'note';
}

/** Ensure uniqueness of (topicId, slug). If conflict, append -2, -3, ... */
async function dedupeSlug(baseSlug: string, topicId?: string): Promise<string> {
  let slug = baseSlug || 'note';
  let i = 2;
  for (;;) {
    const exists = await NoteModel.findOne({ slug, topicId: topicId ?? { $exists: false } })
      .select('_id')
      .lean();
    if (!exists) return slug;
    slug = `${baseSlug}-${i++}`;
  }
}

async function ensureSubjectTopicExist(subjectId?: string, topicId?: string) {
  if (subjectId) {
    // findById accepts string ObjectId
    const sub = await SubjectModel.findById(subjectId).select('_id').lean();
    if (!sub) throw new Error('subjectId not found');
  }
  if (topicId) {
    const top = await TopicModel.findById(topicId).select('_id').lean();
    if (!top) throw new Error('topicId not found');
  }
}

// ---------------- GET /api/v1/quicknotes ----------------
// Optional query params: q, subjectId, topicId, limit
router.get('/', async (req, res) => {
  try {
    const { q, subjectId, topicId } = req.query as {
      q?: string; subjectId?: string; topicId?: string;
    };
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '100', 10), 1), 500);

    const filter: any = {};
    if (subjectId) filter.subjectId = subjectId;
    if (topicId) filter.topicId = topicId;
    if (q?.trim()) filter.$text = { $search: q.trim() };

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
    res.status(400).json({ message: err.message ?? 'Failed to fetch quick notes' });
  }
});

// ---------------- POST /api/v1/quicknotes ----------------
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

    if (subjectId || topicId) {
      await ensureSubjectTopicExist(subjectId, topicId);
    }

    const finalTitle = (title?.trim() || '').slice(0, 200) || 'Untitled quick note';

    const created = await QuickNoteModel.create({
      title: finalTitle,
      markdown,
      subjectId: subjectId || undefined,
      topicId: topicId || undefined,
    });

    res.status(201).json(created.toJSON());
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed to create quick note' });
  }
});

// ---------------- PATCH /api/v1/quicknotes/:id ----------------
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });

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
    if (typeof title === 'string') updates.title = title.trim().slice(0, 200) || 'Untitled quick note';
    if (typeof markdown === 'string') updates.markdown = markdown;
    if (subjectId !== undefined) updates.subjectId = subjectId || undefined;
    if (topicId !== undefined) updates.topicId = topicId || undefined;

    const updated = await QuickNoteModel.findByIdAndUpdate(id, updates, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: 'Quick note not found' });

    res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed to update quick note' });
  }
});

// ---------------- DELETE /api/v1/quicknotes/:id ----------------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });

    const deleted = await QuickNoteModel.findByIdAndDelete(id).lean();
    if (!deleted) return res.status(404).json({ message: 'Quick note not found' });

    res.json({ id, deleted: true });
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed to delete quick note' });
  }
});

// ---------------- POST /api/v1/quicknotes/:id/convert ----------------
// Creates a Note (with required slug) from a QuickNote, then deletes the QuickNote.
// Returns { noteId }.
router.post('/:id/convert', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });

    const quick = await QuickNoteModel.findById(id);
    if (!quick) return res.status(404).json({ message: 'Quick note not found' });

    // Optional: verify references still exist
    if (quick.subjectId || quick.topicId) {
      await ensureSubjectTopicExist(quick.subjectId, quick.topicId);
    }

    // Build a unique slug within the (topicId, slug) scope
    const baseSlug = slugify(quick.title || 'note');
    const uniqueSlug = await dedupeSlug(baseSlug, quick.topicId);

    const createdNote = await NoteModel.create({
      subjectId: quick.subjectId,
      topicId: quick.topicId,
      title: quick.title || 'Untitled',
      slug: uniqueSlug,                 // REQUIRED by NoteModel
      markdown: quick.markdown,         // REQUIRED by NoteModel
      summary: undefined,               // optional fields
      tags: [],
      links: [],
      backlinks: [],
      sources: [{ type: 'manual' as const }], // provenance
    });

    await quick.deleteOne();
    res.status(201).json({ noteId: createdNote._id.toString() });
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Failed to convert quick note' });
  }
});

export default router;
