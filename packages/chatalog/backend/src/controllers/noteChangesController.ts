// controllers/noteChangesController.ts
//
// "Make these changes": after an Ask Claude conversation, Claude turns what was
// agreed into a change plan (create / edit / archive notes). The user reviews
// it, applies the operations they keep, and can undo the whole change set later.
import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { Types, isValidObjectId } from 'mongoose';
import {
  slugifyStandard,
  type ApplyNoteChangesRequest,
  type ApplyNoteChangesResult,
  type NoteChangeOp,
  type NoteChangePlan,
  type NoteChangePlanRequest,
  type NoteChangePlanResponse,
  type NoteChangeSetSummary,
  type UndoNoteChangesResult,
} from '@chatorama/chatalog-shared';
import { NoteModel } from '../models/Note';
import { NoteChangeSetModel, type NoteChangeSnapshot } from '../models/NoteChangeSet';
import { getClaudeClient } from '../ai/claudeClient';
import { computeAndPersistEmbeddings } from '../search/embeddingUpdates';
import { CONSOLIDATE_MODEL, MAX_INPUT_CHARS, loadSourceNotes } from './consolidateController';
import { SYSTEM_PROMPT as ASK_SYSTEM_PROMPT, buildMessages } from './askNotesController';
import { dedupeNoteSlug } from './notesController';

const PLAN_TOOL_NAME = 'propose_note_changes';

const PLAN_INSTRUCTIONS = `

You are now turning the conversation into concrete changes to the notes. Respond by calling the ${PLAN_TOOL_NAME} tool exactly once, with no other text, with the operations needed to carry out what was agreed in the conversation. When the conversation contains several versions of a recommendation, use the latest one the user accepted or asked for.

Rules for the operations:
- You can only edit or archive the numbered notes above. New notes are created in the same topic.
- Never delete a note. Archive notes that are superseded or whose content was merged elsewhere, and set merged_into to where the content now lives.
- For edit, markdown is the complete new body of the note. Keep everything the conversation didn't ask to change exactly as it is, including links and image Markdown. Only include markdown if the body changes, and only include title if the note is renamed.
- Don't start a note body with an H1 that repeats its title; the title is stored separately.
- To link to an existing note, use [Title](note:<number>). To link to a note this plan creates, use [Title](new:<ref>).
- Keep each reason to one short sentence. In summary and reasons, refer to notes by title, not by number.
- If the conversation didn't settle on any changes, return no operations and say why in summary.`;

const PLAN_TOOL = {
  name: PLAN_TOOL_NAME,
  description: 'Propose changes to the notes for the user to review and apply.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description: 'One or two sentences describing the overall change.',
      },
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['create', 'edit', 'archive'] },
            note: {
              type: 'integer',
              description: 'edit and archive: the number of an existing note.',
            },
            ref: {
              type: 'string',
              description:
                'create: a short unique id for the new note, such as "roadmap". Links and merged_into refer to it as new:<ref>.',
            },
            title: {
              type: 'string',
              description: 'create: the title. edit: the new title, only when renaming.',
            },
            markdown: {
              type: 'string',
              description: 'create: the note body. edit: the complete new body, only when it changes.',
            },
            merged_into: {
              type: 'string',
              description: 'archive, optional: where its content now lives, as note:<number> or new:<ref>.',
            },
            reason: { type: 'string', description: 'One short sentence explaining this operation.' },
          },
          required: ['type', 'reason'],
        },
      },
    },
    required: ['summary', 'operations'],
  },
};

type RawOp = {
  type?: unknown;
  note?: unknown;
  ref?: unknown;
  title?: unknown;
  markdown?: unknown;
  merged_into?: unknown;
  reason?: unknown;
};

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

function isValidThread(messages: unknown): messages is NoteChangePlanRequest['messages'] {
  if (!Array.isArray(messages) || messages.length < 2 || messages.length % 2 !== 0) return false;
  return messages.every(
    (m: any, i) =>
      m &&
      m.role === (i % 2 === 0 ? 'user' : 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0,
  );
}

/**
 * Turn Claude's tool input into a validated plan: note numbers become note ids,
 * note:<n> links become note links, and invalid operations are dropped with a warning.
 */
function toPlan(
  input: any,
  noteIdsByNumber: string[],
  notEditableIds: Set<string>,
): { plan: NoteChangePlan; warnings: string[] } {
  const warnings: string[] = [];
  const rawOps: RawOp[] = Array.isArray(input?.operations) ? input.operations : [];

  const noteIdFor = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) ? noteIdsByNumber[n - 1] : undefined;
  const linkNotes = (md: string) =>
    md.replace(/\[([^\]]*)\]\(note:(\d+)\)/g, (_m, text, num) => {
      const id = noteIdsByNumber[Number(num) - 1];
      return id ? `[${text}](/n/${id})` : text;
    });

  const refs = new Set<string>();
  for (const op of rawOps) {
    const ref = str(op?.ref)?.trim();
    if (op?.type === 'create' && ref) refs.add(ref);
  }

  const ops: NoteChangeOp[] = [];
  const seenRefs = new Set<string>();
  const editedIds = new Set<string>();
  const archivedIds = new Set<string>();

  rawOps.forEach((op, i) => {
    const label = `Operation ${i + 1}`;
    const reason = str(op?.reason)?.trim() || undefined;
    const title = str(op?.title)?.trim() || undefined;
    const markdown = str(op?.markdown);

    if (op?.type === 'create') {
      const ref = str(op.ref)?.trim();
      if (!ref || seenRefs.has(ref)) return warnings.push(`${label} (create) has a missing or duplicate ref.`);
      if (!title || !markdown?.trim()) return warnings.push(`${label} (create) is missing a title or body.`);
      seenRefs.add(ref);
      ops.push({ type: 'create', ref, title, markdown: linkNotes(markdown), reason });
    } else if (op?.type === 'edit') {
      const noteId = noteIdFor(op.note);
      if (!noteId) return warnings.push(`${label} (edit) refers to a note that isn't in the conversation.`);
      if (editedIds.has(noteId)) return warnings.push(`${label} edits note ${op.note} a second time.`);
      const editMarkdown = markdown?.trim() ? linkNotes(markdown) : undefined;
      if (editMarkdown && notEditableIds.has(noteId)) {
        return warnings.push(`${label} rewrites note ${op.note}, which is a recipe or PDF note and can't be rewritten.`);
      }
      if (!title && !editMarkdown) return warnings.push(`${label} (edit) changes nothing.`);
      editedIds.add(noteId);
      ops.push({ type: 'edit', noteId, title, markdown: editMarkdown, reason });
    } else if (op?.type === 'archive') {
      const noteId = noteIdFor(op.note);
      if (!noteId) return warnings.push(`${label} (archive) refers to a note that isn't in the conversation.`);
      if (archivedIds.has(noteId)) return;
      archivedIds.add(noteId);
      let mergedInto: string | undefined;
      const target = str(op.merged_into)?.trim();
      const noteMatch = target?.match(/^note:(\d+)$/);
      const newMatch = target?.match(/^new:(.+)$/);
      if (noteMatch) mergedInto = noteIdsByNumber[Number(noteMatch[1]) - 1];
      else if (newMatch && refs.has(newMatch[1])) mergedInto = `new:${newMatch[1]}`;
      if (mergedInto === noteId) mergedInto = undefined;
      ops.push({ type: 'archive', noteId, mergedInto, reason });
    } else {
      warnings.push(`${label} has an unknown type.`);
    }
  });

  const summary = str(input?.summary)?.trim() || (ops.length ? 'Proposed changes' : 'No changes proposed.');
  return { plan: { summary, ops }, warnings };
}

// POST /api/v1/topics/:topicId/ask-notes/plan
export async function proposeNoteChanges(req: Request, res: Response) {
  const { topicId } = req.params;
  const body = (req.body ?? {}) as NoteChangePlanRequest;

  if (!Array.isArray(body.noteIds) || body.noteIds.length === 0) {
    return res.status(400).json({ message: 'noteIds[] is required' });
  }
  if (!isValidThread(body.messages)) {
    return res.status(400).json({
      message: 'messages[] must alternate user/assistant, starting with a question and ending with an answer',
    });
  }

  const { included } = await loadSourceNotes(topicId, body.noteIds, { readOnly: true });
  if (included.length === 0) {
    return res.status(400).json({ message: 'None of these notes have any text.' });
  }
  const inputChars = included.reduce((sum, n) => sum + n.text.length, 0);
  if (inputChars > MAX_INPUT_CHARS) {
    return res.status(413).json({ message: 'These notes are too large to change at once. Select fewer notes.' });
  }

  let client: Anthropic;
  try {
    client = getClaudeClient();
  } catch {
    return res.status(503).json({ message: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  const request =
    body.currentPlan && body.revision?.trim()
      ? `Here is the change plan you proposed:\n\n${JSON.stringify(body.currentPlan, null, 2)}\n\n` +
        `In that plan, ids refer to these notes: ${included.map((n, i) => `${n.id} = note ${i + 1}`).join(', ')}.\n\n` +
        `Revise the plan: ${body.revision.trim()}\n\nCall ${PLAN_TOOL_NAME} with the complete revised plan.`
      : 'Make the changes we discussed.';

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  let input: any;
  try {
    // Streamed (and collected with finalMessage) because plans that rewrite
    // several notes can produce long output.
    const stream = client.beta.messages.stream(
      {
        model: CONSOLIDATE_MODEL,
        max_tokens: 64000,
        output_config: { effort: 'medium' },
        system: ASK_SYSTEM_PROMPT + PLAN_INSTRUCTIONS,
        tools: [PLAN_TOOL],
        // Opus 5.5 doesn't accept a forced tool_choice; the prompt asks for the
        // tool call, and a text-only reply is handled below.
        tool_choice: { type: 'auto' },
        messages: buildMessages(included, [...body.messages, { role: 'user', content: request }]),
      },
      { signal: abort.signal },
    );
    const final = await stream.finalMessage();
    if (final.stop_reason === 'max_tokens') {
      return res.status(502).json({ message: 'The change plan was too long to finish. Try asking for fewer changes at once.' });
    }
    if (final.stop_reason === 'refusal') {
      return res.status(502).json({ message: 'Claude declined to propose these changes.' });
    }
    const toolUse: any = final.content.find((b: any) => b.type === 'tool_use' && b.name === PLAN_TOOL_NAME);
    input = toolUse?.input;
    if (!input || typeof input !== 'object') {
      // No plan: Claude answered in text instead (usually explaining why there's nothing to change).
      const text = final.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
        .trim();
      if (!text) return res.status(502).json({ message: 'Claude didn’t return a change plan. Try again.' });
      input = { summary: text, operations: [] };
    }
  } catch (err: any) {
    if (abort.signal.aborted) return;
    console.error('[note-changes] plan failed', err);
    const msg =
      err instanceof Anthropic.APIError ? `${err.status ?? ''} ${err.message}`.trim() : String(err?.message ?? err);
    return res.status(502).json({ message: msg });
  }

  const noteIdsByNumber = included.map((n) => n.id);
  const flags = await NoteModel.find({ _id: { $in: noteIdsByNumber } })
    .select({ recipe: 1, pdfAssetId: 1, sourceType: 1, title: 1, markdown: 1 })
    .lean();
  const notEditableIds = new Set(
    flags
      .filter((d: any) => d.recipe || d.pdfAssetId || d.sourceType === 'pdf')
      .map((d: any) => String(d._id)),
  );

  const { plan, warnings } = toPlan(input, noteIdsByNumber, notEditableIds);
  const editedIds = new Set(plan.ops.filter((o) => o.type === 'edit').map((o) => (o as any).noteId));
  const currentNotes = flags
    .filter((d: any) => editedIds.has(String(d._id)))
    .map((d: any) => ({ id: String(d._id), title: d.title ?? '', markdown: d.markdown ?? '' }));

  const payload: NoteChangePlanResponse = { plan, currentNotes, warnings };
  res.json(payload);
}

// POST /api/v1/topics/:topicId/note-changes/apply
export async function applyNoteChanges(req: Request, res: Response) {
  const { topicId } = req.params;
  const body = (req.body ?? {}) as ApplyNoteChangesRequest;

  if (!Array.isArray(body.noteIds) || body.noteIds.length === 0 || !Array.isArray(body.ops) || body.ops.length === 0) {
    return res.status(400).json({ message: 'noteIds[] and ops[] are required' });
  }

  const sourceIds = Array.from(new Set(body.noteIds)).filter((id) => isValidObjectId(id));
  const sourceDocs = await NoteModel.find({ _id: { $in: sourceIds }, topicId });
  const docsById = new Map(sourceDocs.map((d) => [String(d._id), d]));
  if (docsById.size === 0) return res.status(404).json({ message: 'No source notes found in this topic' });

  // Validate everything before changing anything.
  const creates = body.ops.filter((o): o is Extract<NoteChangeOp, { type: 'create' }> => o.type === 'create');
  const edits = body.ops.filter((o): o is Extract<NoteChangeOp, { type: 'edit' }> => o.type === 'edit');
  const archives = body.ops.filter((o): o is Extract<NoteChangeOp, { type: 'archive' }> => o.type === 'archive');
  for (const op of creates) {
    if (!op.ref || !op.title?.trim() || !op.markdown?.trim()) {
      return res.status(400).json({ message: 'Each new note needs a ref, title and body' });
    }
  }
  for (const op of [...edits, ...archives]) {
    if (!docsById.has(op.noteId)) {
      return res.status(400).json({ message: 'Changes can only target notes from the conversation' });
    }
  }

  // Ids for new notes up front, so links between notes resolve on the first write.
  const idForRef = new Map(creates.map((op) => [op.ref, new Types.ObjectId()]));
  const resolveNewLinks = (md: string) =>
    md.replace(/\[([^\]]*)\]\(new:([^)\s]+)\)/g, (_m, text, ref) => {
      const id = idForRef.get(ref);
      // A link to a new note that wasn't kept becomes plain text.
      return id ? `[${text}](/n/${id})` : text;
    });
  const resolveTarget = (target?: string) => {
    if (!target) return undefined;
    if (target.startsWith('new:')) return idForRef.get(target.slice(4))?.toString();
    return docsById.has(target) ? target : undefined;
  };

  const before: NoteChangeSnapshot[] = [];
  const snapshot = (d: any) => {
    if (before.some((s) => s.noteId === String(d._id))) return;
    before.push({
      noteId: String(d._id),
      title: d.title ?? '',
      slug: d.slug ?? '',
      markdown: d.markdown ?? '',
      archived: Boolean(d.archived),
      archivedAt: d.archivedAt,
      consolidatedIntoNoteId: d.consolidatedIntoNoteId,
      afterTitle: '',
      afterMarkdown: '',
      afterArchived: false,
    });
  };
  for (const op of [...edits, ...archives]) snapshot(docsById.get(op.noteId));

  const first: any = sourceDocs[0];
  const min = await NoteModel.findOne({ topicId }).sort({ order: 1 }).select({ order: 1 }).lean();
  const baseOrder = (min?.order ?? 0) - creates.length;
  const now = new Date();

  const createdNoteIds: string[] = [];
  for (const [i, op] of creates.entries()) {
    const _id = idForRef.get(op.ref)!;
    const title = op.title.trim();
    await NoteModel.create({
      _id,
      subjectId: first.subjectId,
      topicId,
      title,
      slug: await dedupeNoteSlug(topicId, slugifyStandard(title)),
      markdown: resolveNewLinks(op.markdown),
      tags: [],
      docKind: 'note',
      importedAt: now,
      order: baseOrder + i,
      consolidation: {
        kind: 'change',
        sourceNoteIds: sourceIds,
        instructions: body.summary?.trim() || undefined,
        model: CONSOLIDATE_MODEL,
        createdAt: now,
      },
    });
    createdNoteIds.push(String(_id));
  }

  const editedNoteIds: string[] = [];
  for (const op of edits) {
    const doc: any = docsById.get(op.noteId);
    if (op.title?.trim()) {
      doc.title = op.title.trim();
      doc.slug = await dedupeNoteSlug(topicId, slugifyStandard(doc.title), op.noteId);
    }
    if (typeof op.markdown === 'string' && op.markdown.trim()) doc.markdown = resolveNewLinks(op.markdown);
    editedNoteIds.push(op.noteId);
  }

  const archivedNoteIds: string[] = [];
  for (const op of archives) {
    const doc: any = docsById.get(op.noteId);
    doc.archived = true;
    doc.archivedAt = now;
    const target = resolveTarget(op.mergedInto);
    if (target) doc.consolidatedIntoNoteId = target;
    archivedNoteIds.push(op.noteId);
  }

  for (const s of before) {
    const doc: any = docsById.get(s.noteId);
    await doc.save();
    s.afterTitle = doc.title ?? '';
    s.afterMarkdown = doc.markdown ?? '';
    s.afterArchived = Boolean(doc.archived);
  }

  const changeSet = await NoteChangeSetModel.create({
    topicId,
    summary: body.summary?.trim() ?? '',
    sourceNoteIds: sourceIds,
    createdNoteIds,
    before,
  });

  const payload: ApplyNoteChangesResult = {
    changeSetId: String(changeSet._id),
    createdNoteIds,
    editedNoteIds,
    archivedNoteIds,
  };
  res.status(201).json(payload);

  for (const id of [...createdNoteIds, ...editedNoteIds]) {
    computeAndPersistEmbeddings(id).catch((err) => {
      console.error('[embeddings] note-changes apply failed', id, err);
    });
  }
}

// GET /api/v1/topics/:topicId/note-changes
// Change sets in this topic that can still be undone, newest first.
export async function listNoteChangeSets(req: Request, res: Response) {
  const { topicId } = req.params;
  const sets = await NoteChangeSetModel.find({ topicId, undoneAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  const payload: NoteChangeSetSummary[] = sets.map((s: any) => {
    const createdIds = new Set<string>(s.createdNoteIds ?? []);
    const before: NoteChangeSnapshot[] = s.before ?? [];
    return {
      id: String(s._id),
      summary: s.summary ?? '',
      createdAt: new Date(s.createdAt).toISOString(),
      createdCount: createdIds.size,
      editedCount: before.filter((b) => b.afterTitle !== b.title || b.afterMarkdown !== b.markdown).length,
      archivedCount: before.filter((b) => !b.archived && b.afterArchived).length,
    };
  });
  res.json(payload);
}

// POST /api/v1/topics/:topicId/note-changes/:changeSetId/undo
export async function undoNoteChangeSet(req: Request, res: Response) {
  const { topicId, changeSetId } = req.params;
  if (!isValidObjectId(changeSetId)) return res.status(400).json({ message: 'Invalid change set id' });

  const changeSet = await NoteChangeSetModel.findOne({ _id: changeSetId, topicId });
  if (!changeSet) return res.status(404).json({ message: 'Change set not found' });
  if (changeSet.undoneAt) return res.status(409).json({ message: 'These changes were already undone.' });

  const docs = await NoteModel.find({ _id: { $in: changeSet.before.map((s) => s.noteId) } });
  const docsById = new Map(docs.map((d) => [String(d._id), d]));

  // Refuse rather than overwrite edits made after the change set was applied.
  const editedSince = changeSet.before.filter((s) => {
    const d: any = docsById.get(s.noteId);
    return d && ((d.title ?? '') !== s.afterTitle || (d.markdown ?? '') !== s.afterMarkdown);
  });
  if (editedSince.length) {
    const titles = editedSince.map((s) => `“${(docsById.get(s.noteId) as any)?.title ?? s.afterTitle}”`).join(', ');
    return res.status(409).json({
      message: `Can’t undo: ${titles} ${editedSince.length === 1 ? 'was' : 'were'} edited after these changes were applied, and undoing would overwrite those edits.`,
    });
  }

  const restoredNoteIds: string[] = [];
  for (const s of changeSet.before) {
    const doc: any = docsById.get(s.noteId);
    if (!doc) continue;
    doc.title = s.title;
    doc.slug = s.slug;
    doc.markdown = s.markdown;
    doc.archived = s.archived;
    doc.archivedAt = s.archivedAt ?? undefined;
    doc.consolidatedIntoNoteId = s.consolidatedIntoNoteId ?? undefined;
    await doc.save();
    restoredNoteIds.push(s.noteId);
  }

  // Notes the change set created are archived, not deleted.
  const now = new Date();
  await NoteModel.updateMany(
    { _id: { $in: changeSet.createdNoteIds } },
    { $set: { archived: true, archivedAt: now } },
  );

  changeSet.undoneAt = now;
  await changeSet.save();

  const payload: UndoNoteChangesResult = { restoredNoteIds, archivedNoteIds: changeSet.createdNoteIds };
  res.json(payload);

  for (const id of restoredNoteIds) {
    computeAndPersistEmbeddings(id).catch((err) => {
      console.error('[embeddings] note-changes undo failed', id, err);
    });
  }
}
