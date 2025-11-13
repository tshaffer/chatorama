import { Request, Response } from 'express';
import { NoteModel } from '../models/Note';
import type { TopicNotesWithRelations, NotePreview, NoteRelation } from '@chatorama/chatalog-shared';


// keep your shared slugify if you have one
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Helper to map Note docs → NotePreview
function toPreview(doc: any): NotePreview {
  return {
    id: String(doc._id ?? doc.id),
    title: doc.title ?? 'Untitled',
    summary: doc.summary,
    tags: doc.tags ?? [],
    updatedAt: (doc.updatedAt instanceof Date
      ? doc.updatedAt.toISOString()
      : doc.updatedAt ?? new Date().toISOString()),
  };
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

  // include relations so NotePreview can use them
  const projection = { title: 1, summary: 1, tags: 1, updatedAt: 1, relations: 1 };

  let query = NoteModel.find(filter, projection);

  if (topicId) {
    // Persistent order within topic (stable with _id)
    query = query.sort({ order: 1, _id: 1 });
  } else {
    // Default list: most recently updated first
    query = query.sort({ updatedAt: -1 });
  }

  const docs = await query.exec();
  res.json(docs.map(d => d.toJSON()));
}

// GET /api/v1/notes/by-topic-with-relations?subjectId=...&topicId=...
export async function listNotesByTopicWithRelations(req: Request, res: Response) {
  const { subjectId, topicId } = req.query as { subjectId?: string; topicId?: string };

  if (!subjectId || !topicId) {
    return res.status(400).json({ message: 'subjectId and topicId are required' });
  }

  // 1) Notes in this subject/topic
  const baseFilter: any = { subjectId, topicId };
  const projection = { title: 1, summary: 1, tags: 1, updatedAt: 1, relations: 1, subjectId: 1, topicId: 1 };

  const topicNotes = await NoteModel.find(baseFilter, projection)
    .sort({ order: 1, _id: 1 })
    .lean();

  // 2) Collect relation targets
  const topicTargets = new Set<string>();
  const subjectTargets = new Set<string>();
  const noteTargets = new Set<string>();

  for (const n of topicNotes) {
    const rels: NoteRelation[] = (n as any).relations ?? [];
    for (const r of rels) {
      if (!r || !r.targetId) continue;
      if (r.targetType === 'topic') topicTargets.add(r.targetId);
      else if (r.targetType === 'subject') subjectTargets.add(r.targetId);
      else if (r.targetType === 'note') noteTargets.add(r.targetId);
    }
  }

  // 3) Fetch related notes for each bucket

  // Topic relations → notes in those topics
  let relatedTopicNotes: NotePreview[] = [];
  if (topicTargets.size > 0) {
    const docs = await NoteModel.find(
      { topicId: { $in: Array.from(topicTargets) } },
      projection,
    ).lean();

    relatedTopicNotes = docs
      // avoid duplicating notes already in this topic
      .filter(d => String(d.topicId) !== topicId)
      .map(toPreview);
  }

  // Subject relations → notes in those subjects
  let relatedSubjectNotes: NotePreview[] = [];
  if (subjectTargets.size > 0) {
    const docs = await NoteModel.find(
      { subjectId: { $in: Array.from(subjectTargets) } },
      projection,
    ).lean();

    relatedSubjectNotes = docs
      // you may or may not want to exclude current topic; I'll exclude to avoid dup
      .filter(d => String(d.topicId) !== topicId)
      .map(toPreview);
  }

  // Direct note relations → specific noteIds
  let relatedDirectNotes: NotePreview[] = [];
  if (noteTargets.size > 0) {
    const docs = await NoteModel.find(
      { _id: { $in: Array.from(noteTargets) } },
      projection,
    ).lean();

    relatedDirectNotes = docs.map(toPreview);
  }

  // 4) Deduplicate within each bucket by id
  const dedupe = (arr: NotePreview[]) => {
    const seen = new Set<string>();
    const out: NotePreview[] = [];
    for (const n of arr) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
    }
    return out;
  };

  const payload: TopicNotesWithRelations = {
    notes: topicNotes.map(toPreview),
    relatedTopicNotes: dedupe(relatedTopicNotes),
    relatedSubjectNotes: dedupe(relatedSubjectNotes),
    relatedDirectNotes: dedupe(relatedDirectNotes),
  };

  res.json(payload);
}

export async function getNote(req: Request, res: Response) {
  const { id } = req.params;
  const doc = await NoteModel.findById(id).exec();
  if (!doc) return res.status(404).json({ message: 'Note not found' });
  res.json(doc.toJSON());
}

export async function createNote(req: Request, res: Response) {
  const {
    subjectId,
    topicId,
    title = 'Untitled',
    markdown = '',
    summary,
    tags = [],
    relations = [],
  } = req.body ?? {};

  const slug = (title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const min = await NoteModel
    .findOne({ topicId })
    .sort({ order: 1 }) // lowest first
    .select({ order: 1 })
    .lean();

  const topOrder = (min?.order ?? 0) - 1;

  const doc = await NoteModel.create({
    subjectId,
    topicId,
    title,
    slug,
    markdown,
    summary,
    tags,
    relations,
    order: topOrder,
  });

  res.status(201).json(doc.toJSON());
}

// controllers/notesController.ts
export async function patchNote(req: Request, res: Response) {
  const { id } = req.params;
  const patch = { ...(req.body ?? {}) } as any;
  delete patch._id;
  delete patch.createdAt;
  delete patch.backlinks; // still server-managed

  // 🔹 NEW: drop incomplete relations (no targetId)
  if (Array.isArray(patch.relations)) {
    const rels = patch.relations as NoteRelation[];

    patch.relations = rels.filter((r: NoteRelation) =>
      typeof r.targetId === 'string' && r.targetId.trim().length > 0
    );
  }

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
    res.json(doc.toJSON());
  } catch (err: any) {
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
