// controllers/consolidateController.ts
//
// Consolidate: Claude rewrites a set of notes in a topic into one organized,
// non-redundant note. The draft endpoint streams Markdown; the save endpoint
// creates the new note and (optionally) archives the source notes.
import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { isValidObjectId } from 'mongoose';
import {
  slugifyStandard,
  type ConsolidateDraftRequest,
  type ConsolidateSaveRequest,
  type ConsolidateSaveResult,
  type SetNotesArchivedRequest,
  type SetNotesArchivedResult,
} from '@chatorama/chatalog-shared';
import { NoteModel } from '../models/Note';
import { getClaudeClient } from '../ai/claudeClient';
import { computeAndPersistEmbeddings } from '../search/embeddingUpdates';
import { toPreview } from '../utilities';

export const CONSOLIDATE_MODEL = 'claude-opus-5-5';

// ~150k tokens of source text; above this, refuse rather than truncate.
export const MAX_INPUT_CHARS = 600_000;

// Written into an already-started text stream when generation fails mid-way.
export const STREAM_ERROR_MARKER = '[[CONSOLIDATE_ERROR]]';

const SYSTEM_PROMPT = `You consolidate a set of notes from a personal knowledge base into a single, well-organized Markdown document.

The notes are often saved AI-chat turns (a prompt followed by a response), so they repeat each other, contain conversational filler, and later notes often revise or override earlier ones.

By default:
- Keep every distinct fact, command, setting, decision, and caveat. Drop greetings, filler, offers ("Want me to…?"), and narration of what the assistant was about to do.
- Merge overlapping content so each fact appears once.
- When notes conflict, keep the final state (later notes win) and drop superseded values, unless the change itself is worth recording.
- Organize by topic, not by chronology: start with a one- or two-sentence summary, then use headings, short paragraphs, bullet lists, and tables where they make the content easier to scan. Put commands in fenced code blocks.
- Preserve links and image Markdown (e.g. ![alt](/api/assets/...)) exactly.
- Do not add facts that are not in the notes.

Begin the document with a single H1 heading that is a short, descriptive title. Output only the Markdown document: no preamble, no closing remarks, and no code fence around the whole document.

If the user gives instructions, they take precedence over these defaults.`;

export type SourceNote = {
  id: string;
  title: string;
  text: string;
  createdAt?: Date;
  subjectId?: string;
  topicId?: string;
  // "Subject / Topic", for notes from more than one topic
  location?: string;
};

function noteText(n: any): string {
  const md = (n.markdown ?? '').toString();
  if (md.trim()) return md;
  return (n.derived?.googleDoc?.textPlain ?? '').toString();
}

const placeOf = (d: any) => ({
  subjectId: d.subjectId ? String(d.subjectId) : undefined,
  topicId: d.topicId ? String(d.topicId) : undefined,
});

/**
 * Load the requested notes in the given order. By default recipes and PDF
 * notes are excluded (their content lives in structured fields Claude can't
 * rewrite into a plain note). With readOnly, they are included using whatever
 * text they have (recipe markdown, the PDF summary or extracted text), since
 * Claude only reads them.
 */
export async function loadSourceNotes(
  // null: notes from any topic (Ask across all notes)
  topicId: string | null,
  noteIds: string[],
  opts: { readOnly?: boolean } = {},
) {
  const uniqueIds = Array.from(new Set(noteIds)).filter((id) => isValidObjectId(id));
  const docs = await NoteModel.find({ _id: { $in: uniqueIds }, ...(topicId ? { topicId } : {}) })
    .select({
      title: 1,
      subjectId: 1,
      topicId: 1,
      markdown: 1,
      recipe: 1,
      pdfAssetId: 1,
      sourceType: 1,
      createdAt: 1,
      'derived.googleDoc.textPlain': 1,
      ...(opts.readOnly ? { pdfSummaryMarkdown: 1, 'derived.pdf.extractedText': 1 } : {}),
    })
    .lean();

  const byId = new Map(docs.map((d: any) => [String(d._id), d]));
  const included: SourceNote[] = [];
  const excluded: { id: string; title: string; reason: string }[] = [];

  for (const id of uniqueIds) {
    const d: any = byId.get(id);
    if (!d) continue;
    const title = d.title || 'Untitled';
    if (opts.readOnly) {
      const isPdf = d.pdfAssetId || d.sourceType === 'pdf';
      const text = isPdf
        ? (d.pdfSummaryMarkdown || d.derived?.pdf?.extractedText || '').toString()
        : noteText(d);
      if (text.trim()) included.push({ id, title, text, createdAt: d.createdAt, ...placeOf(d) });
      else excluded.push({ id, title, reason: 'no text' });
    } else if (d.recipe) {
      excluded.push({ id, title, reason: 'recipe' });
    } else if (d.pdfAssetId || d.sourceType === 'pdf') {
      excluded.push({ id, title, reason: 'PDF note' });
    } else {
      included.push({ id, title, text: noteText(d), createdAt: d.createdAt, ...placeOf(d) });
    }
  }

  return { included, excluded, missingCount: uniqueIds.length - docs.length };
}

export function buildNotesBlock(notes: SourceNote[]): string {
  return notes
    .map((n, i) => {
      const created = n.createdAt ? ` created="${new Date(n.createdAt).toISOString()}"` : '';
      const location = n.location ? ` location="${n.location.replace(/"/g, "'")}"` : '';
      return `<note index="${i + 1}" title="${n.title.replace(/"/g, "'")}"${location}${created}>\n${n.text}\n</note>`;
    })
    .join('\n\n');
}

function buildMessages(
  notes: SourceNote[],
  body: ConsolidateDraftRequest,
): Anthropic.MessageParam[] {
  const instructions = body.instructions?.trim();
  const first =
    `Here are ${notes.length} notes, in reading order:\n\n${buildNotesBlock(notes)}\n\n` +
    (instructions
      ? `Instructions:\n${instructions}\n\nConsolidate these notes into one document, following the instructions.`
      : 'Consolidate these notes into one document.');

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: first }];

  const currentDraft = body.currentDraft?.trim();
  const refinement = body.refinement?.trim();
  if (currentDraft && refinement) {
    const prior = (body.priorRefinements ?? []).map((r) => r.trim()).filter(Boolean);
    const priorBlock = prior.length
      ? `Earlier requests, already reflected in the draft (keep honoring them unless this one conflicts):\n${prior
          .map((r) => `- ${r}`)
          .join('\n')}\n\n`
      : '';
    messages.push({ role: 'assistant', content: currentDraft });
    messages.push({
      role: 'user',
      content:
        `${priorBlock}Revise the document above: ${refinement}\n\n` +
        'Use the original notes as the source of truth. Return the complete revised document.',
    });
  }

  return messages;
}

// POST /api/v1/topics/:topicId/consolidate/draft
// Streams the Markdown draft as text/plain. Pre-stream problems are JSON errors.
export async function streamConsolidateDraft(req: Request, res: Response) {
  const { topicId } = req.params;
  const body = (req.body ?? {}) as ConsolidateDraftRequest;

  if (!Array.isArray(body.noteIds) || body.noteIds.length === 0) {
    return res.status(400).json({ message: 'noteIds[] is required' });
  }

  const { included, excluded } = await loadSourceNotes(topicId, body.noteIds);
  if (included.length === 0) {
    return res.status(400).json({
      message: 'None of the selected notes can be consolidated (recipes and PDF notes are excluded).',
      excluded,
    });
  }

  const inputChars = included.reduce((sum, n) => sum + n.text.length, 0);
  if (inputChars > MAX_INPUT_CHARS) {
    return res.status(413).json({
      message: `The selected notes are too large to consolidate at once (${inputChars.toLocaleString()} characters). Select fewer notes.`,
    });
  }

  let client: Anthropic;
  try {
    client = getClaudeClient();
  } catch {
    return res.status(503).json({ message: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  res.setHeader('X-Consolidate-Excluded', encodeURIComponent(JSON.stringify(excluded)));
  res.setHeader('X-Consolidate-Input-Chars', String(inputChars));

  await streamClaudeText(res, client, {
    logTag: 'consolidate',
    params: {
      model: CONSOLIDATE_MODEL,
      max_tokens: 64000,
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: buildMessages(included, body),
    },
    maxTokensNote: 'the draft was cut off because it reached the maximum length.',
    refusalNote: 'Claude declined to complete this draft.',
  });
}

/**
 * Stream Claude's text output to an Express response as text/plain. Callers
 * set any extra headers first. Stops generating (and billing) if the client
 * disconnects; errors after the stream starts are written as STREAM_ERROR_MARKER.
 */
export async function streamClaudeText(
  res: Response,
  client: Anthropic,
  args: {
    logTag: string;
    params: Omit<Anthropic.Beta.Messages.MessageCreateParamsStreaming, 'stream' | 'betas' | 'fallbacks'>;
    maxTokensNote: string;
    refusalNote: string;
  },
) {
  res.status(200);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  try {
    // fallbacks: 'default' re-runs a safety-declined request on Anthropic's
    // recommended fallback model instead of returning a refusal.
    const stream = client.beta.messages.stream(
      {
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        ...args.params,
      },
      { signal: abort.signal },
    );

    stream.on('text', (delta) => {
      res.write(delta);
    });

    const final = await stream.finalMessage();
    if (final.stop_reason === 'max_tokens') {
      res.write(`\n\n> **Note:** ${args.maxTokensNote}`);
    } else if (final.stop_reason === 'refusal') {
      res.write(`\n\n> **Note:** ${args.refusalNote}`);
    }
    res.end();
  } catch (err: any) {
    if (abort.signal.aborted) return;
    console.error(`[${args.logTag}] stream failed`, err);
    const msg =
      err instanceof Anthropic.APIError ? `${err.status ?? ''} ${err.message}`.trim() : String(err?.message ?? err);
    // Headers are already sent; append a marker the client recognizes.
    res.write(`\n\n${STREAM_ERROR_MARKER} ${msg}`);
    res.end();
  }
}

export async function dedupeSlug(topicId: string, base: string): Promise<string> {
  let slug = base || 'untitled';
  let i = 2;
  while (await NoteModel.exists({ topicId, slug })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

// POST /api/v1/topics/:topicId/consolidate/save
export async function saveConsolidatedNote(req: Request, res: Response) {
  const { topicId } = req.params;
  const body = (req.body ?? {}) as ConsolidateSaveRequest;

  if (!Array.isArray(body.noteIds) || body.noteIds.length === 0) {
    return res.status(400).json({ message: 'noteIds[] is required' });
  }
  if (typeof body.markdown !== 'string' || !body.markdown.trim()) {
    return res.status(400).json({ message: 'markdown is required' });
  }

  const sources = await NoteModel.find({
    _id: { $in: Array.from(new Set(body.noteIds)).filter((id) => isValidObjectId(id)) },
    topicId,
  })
    .select({ subjectId: 1, tags: 1, recipe: 1, pdfAssetId: 1, sourceType: 1 })
    .lean();
  if (sources.length === 0) {
    return res.status(404).json({ message: 'No source notes found in this topic' });
  }

  const sourceIds = body.noteIds.filter((id) => sources.some((s: any) => String(s._id) === id));
  // Recipes and PDF notes were not part of the draft, so they are never archived.
  const archivableIds = sources
    .filter((s: any) => !s.recipe && !s.pdfAssetId && s.sourceType !== 'pdf')
    .map((s: any) => String(s._id));

  const tags = Array.from(new Set(sources.flatMap((s: any) => s.tags ?? [])));
  const title = (body.title ?? '').trim() || 'Consolidated note';

  const min = await NoteModel.findOne({ topicId }).sort({ order: 1 }).select({ order: 1 }).lean();

  const created = await NoteModel.create({
    subjectId: (sources[0] as any).subjectId,
    topicId,
    title,
    slug: await dedupeSlug(topicId, slugifyStandard(title)),
    markdown: body.markdown,
    tags,
    docKind: 'note',
    importedAt: new Date(),
    order: (min?.order ?? 0) - 1,
    consolidation: {
      sourceNoteIds: sourceIds,
      instructions: body.instructions?.trim() || undefined,
      model: CONSOLIDATE_MODEL,
      createdAt: new Date(),
    },
  });
  const noteId = String(created._id);

  let archivedNoteIds: string[] = [];
  if (body.archiveSources && archivableIds.length) {
    await NoteModel.updateMany(
      { _id: { $in: archivableIds } },
      { $set: { archived: true, archivedAt: new Date(), consolidatedIntoNoteId: noteId } },
    );
    archivedNoteIds = archivableIds;
  }

  const payload: ConsolidateSaveResult = { noteId, archivedNoteIds };
  res.status(201).json(payload);

  computeAndPersistEmbeddings(noteId).catch((err) => {
    console.error('[embeddings] consolidate save failed', noteId, err);
  });
}

// POST /api/v1/notes/archive  { noteIds, archived }
export async function setNotesArchived(req: Request, res: Response) {
  const body = (req.body ?? {}) as SetNotesArchivedRequest;
  if (!Array.isArray(body.noteIds) || body.noteIds.length === 0 || typeof body.archived !== 'boolean') {
    return res.status(400).json({ message: 'noteIds[] and archived (boolean) are required' });
  }
  const ids = body.noteIds.filter((id) => isValidObjectId(id));

  // Keep consolidatedIntoNoteId on unarchive: it records provenance either way.
  await NoteModel.updateMany(
    { _id: { $in: ids } },
    body.archived
      ? { $set: { archived: true, archivedAt: new Date() } }
      : { $set: { archived: false }, $unset: { archivedAt: 1 } },
  );

  const payload: SetNotesArchivedResult = { updatedNoteIds: ids };
  res.json(payload);
}

// GET /api/v1/notes/:id/consolidation-sources
export async function listConsolidationSources(req: Request, res: Response) {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid note id' });

  const note = await NoteModel.findById(id).select({ consolidation: 1 }).lean();
  if (!note) return res.status(404).json({ message: 'Note not found' });

  const sourceIds: string[] = (note as any).consolidation?.sourceNoteIds ?? [];
  if (!sourceIds.length) return res.json([]);

  const docs = await NoteModel.find({ _id: { $in: sourceIds } })
    .select({
      title: 1,
      summary: 1,
      status: 1,
      tags: 1,
      subjectId: 1,
      topicId: 1,
      createdAt: 1,
      updatedAt: 1,
      archived: 1,
      archivedAt: 1,
      consolidatedIntoNoteId: 1,
    })
    .lean();
  const byId = new Map(docs.map((d: any) => [String(d._id), d]));
  res.json(sourceIds.map((sid) => byId.get(sid)).filter(Boolean).map(toPreview));
}
