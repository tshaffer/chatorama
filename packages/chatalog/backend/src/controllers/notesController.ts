import { Request, Response } from 'express';
import { NoteModel } from '../models/Note';

// keep your shared slugify if you have one
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Ensure slug is unique within a topic; optionally exclude current note id
async function dedupeNoteSlug(topicId: string | undefined, base: string, excludeId?: string): Promise<string> {
  let slug = base || 'untitled';
  let i = 2;
  // scope uniqueness to topicId (null/empty still becomes part of the query)
  const scope: any = { slug, ...(topicId ? { topicId } : { topicId: '' }) };
  if (excludeId) scope._id = { $ne: excludeId };

  // If it exists, bump suffix: slug-2, slug-3, ...
  while (await NoteModel.exists(scope)) {
    slug = `${base}-${i++}`;
    scope.slug = slug;
  }
  return slug;
}

export async function listNotes(req: Request, res: Response) {
  const { subjectId, topicId } = req.query as { subjectId?: string; topicId?: string };
  const filter: any = {};
  if (subjectId) filter.subjectId = subjectId;
  if (topicId) filter.topicId = topicId;

  const docs = await NoteModel.find(
    filter,
    { title: 1, summary: 1, tags: 1, updatedAt: 1 }
  )
    .sort({ updatedAt: -1 })
    .exec();

  res.json(docs.map(d => d.toJSON()));
}

export async function getNote(req: Request, res: Response) {
  const { id } = req.params;
  const doc = await NoteModel.findById(id).exec();
  if (!doc) return res.status(404).json({ message: 'Note not found' });
  res.json(doc.toJSON());
}

export async function createNote(req: Request, res: Response) {
  const { subjectId, topicId, title = 'Untitled', markdown = '', summary, tags = [] } = req.body ?? {};
  const slug = (title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const doc = await NoteModel.create({ subjectId, topicId, title, slug, markdown, summary, tags });
  res.status(201).json(doc.toJSON());
}

export async function patchNote(req: Request, res: Response) {
  const { id } = req.params;
  const patch = { ...(req.body ?? {}) } as any;
  delete patch._id;
  delete patch.createdAt;
  delete patch.backlinks; // still server-managed

  // We need topicId to scope slug uniqueness. If not in patch, load it once.
  const current = await NoteModel.findById(id).select('topicId').lean();
  if (!current) return res.status(404).json({ message: 'Note not found' });

  // If client didn’t provide a slug but did change title, derive + dedupe
  if (typeof patch.title === 'string' && !patch.slug) {
    const base = slugify(patch.title);
    patch.slug = await dedupeNoteSlug(patch.topicId ?? current.topicId, base, id);
  }
  // If client provided a slug explicitly, normalize and dedupe as well
  if (typeof patch.slug === 'string') {
    const base = slugify(patch.slug);
    patch.slug = await dedupeNoteSlug(patch.topicId ?? current.topicId, base, id);
  }

  try {
    const doc = await NoteModel.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true, runValidators: true }
    ).exec();

    if (!doc) return res.status(404).json({ message: 'Note not found' });
    res.json(doc.toJSON()); // exposes id, strips _id/__v
  } catch (err: any) {
    // Nice-to-have: handle duplicate key from races with unique index
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'Slug already exists for this topic.' });
    }
    throw err;
  }
}

export async function deleteNote(req: Request, res: Response) {
  const { id } = req.params;
  const doc = await NoteModel.findByIdAndDelete(id).exec();
  if (!doc) return res.status(404).json({ message: 'Note not found' });
  res.status(204).send();
}
