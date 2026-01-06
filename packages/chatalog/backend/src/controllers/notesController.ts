import { Request, Response } from 'express';
import { NoteModel } from '../models/Note';
import { ImportBatchModel } from '../models/ImportBatch';
import { TurnFingerprintModel } from '../models/TurnFingerprintModel';
import { computeAndPersistEmbeddings } from '../search/embeddingUpdates';
import {
  type TopicNotesWithRelations,
  type NotePreview,
  type NoteRelation,
  type MergeNotesRequest,
  type MergeNotesResult,
  slugifyStandard,
} from '@chatorama/chatalog-shared';
import { toPreview } from '../utilities';


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

  // include relations so NotePreview can use them + provenance fields used in UI
  const projection = {
    title: 1,
    summary: 1,
    status: 1,
    tags: 1,
    updatedAt: 1,
    createdAt: 1,
    importedAt: 1,
    relations: 1,
    sources: 1,
    subjectId: 1,
    topicId: 1,
    chatworthyNoteId: 1,
    chatworthyChatId: 1,
    chatworthyChatTitle: 1,
    chatworthyFileName: 1,
    chatworthyTurnIndex: 1,
    chatworthyTotalTurns: 1,
    sourceType: 1,
    sourceChatId: 1,
    importBatchId: 1,
    markdown: 1,
    links: 1,
    backlinks: 1,
    slug: 1,
  };

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
  const projection = {
    title: 1,
    summary: 1,
    status: 1,
    tags: 1,
    updatedAt: 1,
    createdAt: 1,
    importedAt: 1,
    relations: 1,
    subjectId: 1,
    topicId: 1,
    sources: 1,
    chatworthyNoteId: 1,
    chatworthyChatId: 1,
    chatworthyChatTitle: 1,
    chatworthyFileName: 1,
    chatworthyTurnIndex: 1,
    chatworthyTotalTurns: 1,
    sourceType: 1,
    sourceChatId: 1,
    importBatchId: 1,
    markdown: 1,
    links: 1,
    backlinks: 1,
    slug: 1,
  };

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
    status,
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
    status,   // 🔹 NEW
    tags,
    relations,
    docKind: 'note',
    importedAt: new Date(),
    order: topOrder,
  });

  res.status(201).json(doc.toJSON());

  // Best-effort embedding update; consider background queue later.
  computeAndPersistEmbeddings(String(doc._id)).catch((err) => {
    console.error('[embeddings] createNote failed', doc._id, err);
  });
}

export async function mergeNotesInTopic(req: Request, res: Response) {
  const { topicId } = req.params;
  const { primaryNoteId, noteIdsInOrder, title } =
    (req.body ?? {}) as MergeNotesRequest;

  if (!topicId) {
    return res.status(400).json({ message: 'topicId is required' });
  }
  if (!Array.isArray(noteIdsInOrder) || noteIdsInOrder.length < 2) {
    return res.status(400).json({ message: 'noteIdsInOrder[] with 2+ ids is required' });
  }
  if (!primaryNoteId || !noteIdsInOrder.includes(primaryNoteId)) {
    return res.status(400).json({ message: 'primaryNoteId must be included in noteIdsInOrder' });
  }

  const uniqueIds = Array.from(new Set(noteIdsInOrder));
  const notes = await NoteModel.find({ _id: { $in: uniqueIds }, topicId }).lean();
  if (notes.length < uniqueIds.length) {
    return res.status(404).json({ message: 'One or more notes not found in this topic' });
  }

  const byId = new Map<string, any>();
  for (const n of notes) {
    if (String(n.topicId) !== String(topicId)) {
      return res.status(400).json({ message: 'All notes must belong to the target topic' });
    }
    byId.set(String(n._id), n);
  }

  const ordered = uniqueIds.filter((id) => byId.has(id));
  const primary = byId.get(primaryNoteId);
  if (!primary) {
    return res.status(404).json({ message: 'Primary note not found in this topic' });
  }

  const tagsSet = new Set<string>();
  ordered.forEach((id) => {
    const note = byId.get(id);
    (note?.tags ?? []).forEach((t: string) => tagsSet.add(t));
  });

  const mergedMarkdown = ordered
    .map((id) => {
      const note = byId.get(id);
      return (note?.markdown ?? '').toString();
    })
    .join('\n\n---\n\n');

  const finalTitle = (title ?? '').trim() || primary.title || 'Untitled';
  const finalSlug = await dedupeNoteSlug(
    topicId,
    slugifyStandard(finalTitle || 'untitled'),
    primaryNoteId,
  );

  await NoteModel.findByIdAndUpdate(primaryNoteId, {
    $set: {
      title: finalTitle,
      slug: finalSlug,
      markdown: mergedMarkdown,
      tags: Array.from(tagsSet),
      updatedAt: new Date(),
    },
  });

  const deletedNoteIds = ordered.filter((id) => id !== primaryNoteId);
  if (deletedNoteIds.length) {
    await NoteModel.deleteMany({ _id: { $in: deletedNoteIds } });
  }

  const payload: MergeNotesResult = {
    mergedNoteId: primaryNoteId,
    deletedNoteIds,
  };

  res.json(payload);
}

// controllers/notesController.ts
export async function patchNote(req: Request, res: Response) {
  const { id } = req.params;
  const patch = { ...(req.body ?? {}) } as any;
  delete patch._id;
  delete patch.createdAt;
  delete patch.importedAt;
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
    const base = slugifyStandard(patch.title);
    patch.slug = await dedupeNoteSlug(patch.topicId ?? current.topicId, base, id);
  }
  // If client provided a slug explicitly, normalize and dedupe as well
  if (typeof patch.slug === 'string') {
    const base = slugifyStandard(patch.slug);
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

    const touchesTitleOrMarkdown =
      Object.prototype.hasOwnProperty.call(patch, 'title') ||
      Object.prototype.hasOwnProperty.call(patch, 'markdown');
    const touchesRecipe =
      Object.prototype.hasOwnProperty.call(patch, 'recipe') ||
      Object.keys(patch).some((k) => k.startsWith('recipe.'));

    if (touchesTitleOrMarkdown || touchesRecipe) {
      // Best-effort embedding update; consider background queue later.
      computeAndPersistEmbeddings(String(doc._id)).catch((err) => {
        console.error('[embeddings] patchNote failed', doc._id, err);
      });
    }
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

  if (doc.importBatchId) {
    await ImportBatchModel.updateOne(
      { _id: doc.importBatchId, remainingCount: { $gt: 0 } },
      { $inc: { remainingCount: -1 } },
    ).exec();
  }

  await TurnFingerprintModel.deleteMany({ noteId: doc._id }).exec();

  res.status(204).send();
}
