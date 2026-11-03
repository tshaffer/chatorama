// controllers/askNotesController.ts
//
// Ask Claude: answer natural-language questions about a fixed set of notes
// (summaries, suggestions, comparisons…). Unlike Consolidate, the result is a
// conversation; an answer can be saved as a new note.
import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { isValidObjectId } from 'mongoose';
import {
  slugifyStandard,
  type AskNotesRequest,
  type AskNotesSaveRequest,
  type AskNotesSaveResult,
} from '@chatorama/chatalog-shared';
import { NoteModel } from '../models/Note';
import { getClaudeClient } from '../ai/claudeClient';
import { computeAndPersistEmbeddings } from '../search/embeddingUpdates';
import {
  CONSOLIDATE_MODEL,
  MAX_INPUT_CHARS,
  buildNotesBlock,
  dedupeSlug,
  loadSourceNotes,
  streamClaudeText,
  type SourceNote,
} from './consolidateController';

export const SYSTEM_PROMPT = `You answer questions about a set of notes in Chatalog, the user's personal knowledge base app. Notes are organized into subjects and topics.

The notes are numbered. Many are saved AI-chat turns (a prompt followed by a response), so they can repeat each other, and later notes often revise earlier ones.

- Answer the user's question directly, using the notes as your source. Be concise: lead with the answer, then supporting detail.
- When you state something that comes from the notes, cite the note number in square brackets, like [2] or [1][3]. Only cite numbers that appear in the notes. If there is only one note, don't add citation numbers.
- If the notes don't cover something, say so plainly. You may add general knowledge when it helps (for example, when asked for suggestions), but make clear which parts come from the notes and which don't.
- Don't rewrite or reproduce the notes unless the user asks you to.
- When you recommend changes to the notes (creating, editing, merging, renaming, or removing notes), describe them clearly. You can't change notes while answering, but the user can click "Plan these changes…" below your answer and you'll be asked to turn your recommendation into concrete changes for them to review and apply. So don't give manual step-by-step instructions for applying changes unless the user asks for them, and don't claim you can't make changes.
- Format the answer in Markdown. Output only the answer: no preamble and no offers of further help.`;

export function buildMessages(notes: SourceNote[], thread: AskNotesRequest['messages']): Anthropic.Beta.BetaMessageParam[] {
  const notesText = `Here are ${notes.length} notes:\n\n${buildNotesBlock(notes)}`;
  return thread.map((m, i) =>
    i === 0
      ? {
          role: 'user',
          // Cache the notes so follow-up questions don't pay full price to resend them.
          content: [
            { type: 'text', text: notesText, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: m.content },
          ],
        }
      : { role: m.role, content: m.content },
  );
}

export function isValidThread(messages: unknown): messages is AskNotesRequest['messages'] {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length % 2 === 0) return false;
  return messages.every(
    (m: any, i) =>
      m &&
      m.role === (i % 2 === 0 ? 'user' : 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0,
  );
}

// POST /api/v1/topics/:topicId/ask-notes
// Streams the answer as text/plain. Pre-stream problems are JSON errors.
export async function streamAskNotes(req: Request, res: Response) {
  const { topicId } = req.params;
  const body = (req.body ?? {}) as AskNotesRequest;

  if (!Array.isArray(body.noteIds) || body.noteIds.length === 0) {
    return res.status(400).json({ message: 'noteIds[] is required' });
  }
  if (!isValidThread(body.messages)) {
    return res.status(400).json({
      message: 'messages[] must alternate user/assistant, starting and ending with a user question',
    });
  }

  const { included, excluded } = await loadSourceNotes(topicId, body.noteIds, { readOnly: true });
  if (included.length === 0) {
    return res.status(400).json({ message: 'None of the selected notes have any text to ask about.', excluded });
  }

  const inputChars = included.reduce((sum, n) => sum + n.text.length, 0);
  if (inputChars > MAX_INPUT_CHARS) {
    return res.status(413).json({
      message: `These notes are too large to ask about at once (${inputChars.toLocaleString()} characters). Select fewer notes.`,
    });
  }

  let client: Anthropic;
  try {
    client = getClaudeClient();
  } catch {
    return res.status(503).json({ message: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  // The client maps citation numbers [n] back to notes using this list.
  res.setHeader(
    'X-Ask-Notes',
    encodeURIComponent(JSON.stringify(included.map((n) => ({ id: n.id, title: n.title })))),
  );
  res.setHeader('X-Consolidate-Excluded', encodeURIComponent(JSON.stringify(excluded)));
  res.setHeader('X-Consolidate-Input-Chars', String(inputChars));

  await streamClaudeText(res, client, {
    logTag: 'ask-notes',
    params: {
      model: CONSOLIDATE_MODEL,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: buildMessages(included, body.messages),
    },
    maxTokensNote: 'the answer was cut off because it reached the maximum length.',
    refusalNote: 'Claude declined to answer this question.',
  });
}

// POST /api/v1/topics/:topicId/ask-notes/save
export async function saveAskNotesAnswer(req: Request, res: Response) {
  const { topicId } = req.params;
  const body = (req.body ?? {}) as AskNotesSaveRequest;

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
    .select({ subjectId: 1 })
    .lean();
  if (sources.length === 0) {
    return res.status(404).json({ message: 'No source notes found in this topic' });
  }
  const sourceIds = body.noteIds.filter((id) => sources.some((s: any) => String(s._id) === id));

  const title = (body.title ?? '').trim() || 'Answer from Claude';
  const min = await NoteModel.findOne({ topicId }).sort({ order: 1 }).select({ order: 1 }).lean();

  const created = await NoteModel.create({
    subjectId: (sources[0] as any).subjectId,
    topicId,
    title,
    slug: await dedupeSlug(topicId, slugifyStandard(title)),
    markdown: body.markdown,
    tags: [],
    docKind: 'note',
    importedAt: new Date(),
    order: (min?.order ?? 0) - 1,
    consolidation: {
      kind: 'answer',
      sourceNoteIds: sourceIds,
      question: body.question?.trim() || undefined,
      model: CONSOLIDATE_MODEL,
      createdAt: new Date(),
    },
  });
  const noteId = String(created._id);

  const payload: AskNotesSaveResult = { noteId };
  res.status(201).json(payload);

  computeAndPersistEmbeddings(noteId).catch((err) => {
    console.error('[embeddings] ask-notes save failed', noteId, err);
  });
}
