// controllers/askAllController.ts
//
// Ask Claude across all notes: Claude searches the notes itself (by keyword and
// by meaning), reads the ones that matter, and answers with citations. Notes
// it reads are numbered for the rest of the conversation, so follow-ups can
// refer to them and "Plan these changes" can change notes in any topic.
import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { isValidObjectId } from 'mongoose';
import {
  slugifyStandard,
  type AskAllEvent,
  type AskAllRequest,
  type AskAllSaveRequest,
  type AskNotesSaveResult,
  type AskSource,
} from '@chatorama/chatalog-shared';
import { NoteModel } from '../models/Note';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import { getClaudeClient } from '../ai/claudeClient';
import { computeAndPersistEmbeddings } from '../search/embeddingUpdates';
import { buildNoteResultsByMode } from '../routes/search';
import { CONSOLIDATE_MODEL, MAX_INPUT_CHARS, dedupeSlug, loadSourceNotes, type SourceNote } from './consolidateController';
import { isValidThread } from './askNotesController';

// Search/read rounds before Claude is asked to answer with what it has
const MAX_ROUNDS = 12;
const MAX_SOURCES = 200;
const SEARCH_LIMIT = 15;
const MAX_SEARCH_LIMIT = 30;
const MAX_READ_PER_CALL = 10;
// One very long note shouldn't use up the reading budget
const MAX_NOTE_CHARS = 60_000;

export const ASK_ALL_SYSTEM_PROMPT = `You answer questions about the user's notes in Chatalog, their personal knowledge base app. Notes are organized into subjects and topics. Many are saved AI-chat turns (a prompt followed by a response), so they can repeat each other, and later notes often revise earlier ones.

There are too many notes to read them all, so use the tools to find the ones that matter:
- search_notes finds notes by keywords and by meaning. When the user asks for all notes about something, try several searches with different wordings, related terms, and specific names you come across in the notes (tools, commands, products), because the same thing is often described in different words. Stop when new searches stop turning up relevant notes.
- read_notes reads notes in full. Read a note before relying on it or citing it; search snippets aren't enough to go on.
- Don't write anything before or between tool calls. Write only the final answer, after you're done searching.

Notes you have read are numbered, and the numbers stay the same for the rest of the conversation. Notes read earlier in the conversation are included at the start.

- Answer the user's question directly, using the notes as your source. Be concise: lead with the answer, then supporting detail.
- When you state something that comes from the notes, cite the note number in square brackets, like [2] or [1][3]. Only cite numbers of notes you have read.
- When listing the notes you found, give each one's title and its subject and topic, and group them by subject or topic when that helps.
- If you can't find anything relevant, say so plainly. You may add general knowledge when it helps, but make clear which parts come from the notes and which don't.
- When you recommend changes to the notes (creating, editing, merging, renaming, or removing notes, in any subject or topic), describe them clearly. You can't change notes while answering, but the user can click "Plan these changes…" below your answer and you'll be asked to turn your recommendation into concrete changes for them to review and apply. So don't give manual step-by-step instructions for applying changes unless the user asks for them, and don't claim you can't make changes.
- Format the answer in Markdown. Output only the answer: no preamble and no offers of further help.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'search_notes',
    description:
      "Search all of the user's notes by keywords and by meaning. Returns each match's id, title, subject / topic and a snippet, best matches first. Matches you've already read show their note number.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, in words likely to appear in the notes' },
        limit: { type: 'integer', description: `How many results to return (default ${SEARCH_LIMIT}, at most ${MAX_SEARCH_LIMIT})` },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_notes',
    description: `Read notes in full, by id from search_notes results, up to ${MAX_READ_PER_CALL} at a time. Each note read gets a number for citing it.`,
    input_schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Note ids from search_notes results' },
      },
      required: ['ids'],
    },
  },
];

/** "Subject / Topic" for each note's subjectId/topicId. */
export async function withLocations<T extends { subjectId?: string; topicId?: string }>(
  notes: T[],
): Promise<(T & { location?: string })[]> {
  const subjectIds = Array.from(new Set(notes.map((n) => n.subjectId).filter((id): id is string => Boolean(id))));
  const topicIds = Array.from(new Set(notes.map((n) => n.topicId).filter((id): id is string => Boolean(id))));
  const [subjects, topics] = await Promise.all([
    SubjectModel.find({ _id: { $in: subjectIds.filter((id) => isValidObjectId(id)) } }).select({ name: 1 }).lean(),
    TopicModel.find({ _id: { $in: topicIds.filter((id) => isValidObjectId(id)) } }).select({ name: 1 }).lean(),
  ]);
  const subjectName = new Map(subjects.map((s: any) => [String(s._id), s.name as string]));
  const topicName = new Map(topics.map((t: any) => [String(t._id), t.name as string]));
  return notes.map((n) => {
    const parts = [n.subjectId && subjectName.get(n.subjectId), n.topicId && topicName.get(n.topicId)].filter(Boolean);
    return { ...n, location: parts.length ? parts.join(' / ') : undefined };
  });
}

function snippet(markdown: string, maxLen = 300): string {
  const cleaned = (markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[>#]+\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

const attr = (s: string) => s.replace(/"/g, "'");

function noteXml(number: number, note: { title: string; location?: string }, text: string): string {
  const location = note.location ? ` location="${attr(note.location)}"` : '';
  return `<note number="${number}" title="${attr(note.title)}"${location}>\n${text}\n</note>`;
}

function cleanSources(raw: unknown): AskSource[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return raw
    .filter((s: any) => s && typeof s.id === 'string')
    .slice(0, MAX_SOURCES)
    .map((s: any) => ({
      id: s.id,
      title: typeof s.title === 'string' ? s.title : '',
      subjectId: str(s.subjectId),
      topicId: str(s.topicId),
      location: str(s.location),
    }));
}

// POST /api/v1/ask/stream
// Streams newline-delimited JSON AskAllEvents. Pre-stream problems are JSON errors.
export async function streamAskAll(req: Request, res: Response) {
  const body = (req.body ?? {}) as AskAllRequest;
  if (!isValidThread(body.messages)) {
    return res.status(400).json({
      message: 'messages[] must alternate user/assistant, starting and ending with a user question',
    });
  }

  let client: Anthropic;
  try {
    client = getClaudeClient();
  } catch {
    return res.status(503).json({ message: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  // Notes found earlier keep their numbers: [n] is sources[n - 1].
  const sources = cleanSources(body.sources);
  const numberById = new Map(sources.map((s, i) => [s.id, i + 1]));
  let charsUsed = 0;

  const { included } = await loadSourceNotes(
    null,
    sources.map((s) => s.id),
    { readOnly: true },
  );
  const knownById = new Map(included.map((n) => [n.id, n]));
  const knownBlocks = sources.map((s, i) => {
    const note = knownById.get(s.id);
    if (!note) return noteXml(i + 1, s, '(This note no longer exists or has no text.)');
    const text = note.text.slice(0, MAX_NOTE_CHARS);
    if (charsUsed + text.length > MAX_INPUT_CHARS) {
      return noteXml(i + 1, s, '(Not included: too much text. It can’t be read again in this conversation.)');
    }
    charsUsed += text.length;
    return noteXml(i + 1, s, text);
  });

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event: AskAllEvent) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  const messages: Anthropic.Beta.BetaMessageParam[] = body.messages.map((m, i) =>
    i === 0 && knownBlocks.length
      ? {
          role: 'user',
          // Cache the notes found so far so follow-ups don't pay full price to resend them.
          content: [
            {
              type: 'text',
              text: `Notes read earlier in this conversation:\n\n${knownBlocks.join('\n\n')}`,
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: m.content },
          ],
        }
      : { role: m.role, content: m.content },
  );

  const searchNotes = async (input: any): Promise<string> => {
    const query = typeof input?.query === 'string' ? input.query.trim() : '';
    if (!query) return 'Error: query is required.';
    const limit = Math.min(Math.max(Number(input?.limit) || SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
    const { docs } = await buildNoteResultsByMode({
      mode: 'auto',
      q: query,
      baseFilter: { archived: { $ne: true } },
      offset: 0,
      limit,
    });
    const ids = docs.map((d: any) => String(d._id));
    const found = await NoteModel.find({ _id: { $in: ids } })
      .select({ title: 1, markdown: 1, subjectId: 1, topicId: 1, 'recipe.description': 1 })
      .lean();
    const byId = new Map(found.map((n: any) => [String(n._id), n]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[];
    const located = await withLocations(
      ordered.map((n) => ({
        id: String(n._id),
        title: n.title || 'Untitled',
        text: n.markdown || n.recipe?.description || '',
        subjectId: n.subjectId ? String(n.subjectId) : undefined,
        topicId: n.topicId ? String(n.topicId) : undefined,
      })),
    );
    send({ type: 'activity', text: `Searched “${query}”: ${located.length} ${located.length === 1 ? 'match' : 'matches'}` });
    if (!located.length) return 'No matching notes.';
    return located
      .map((n) => {
        const number = numberById.get(n.id);
        return [
          `- id: ${n.id}${number ? ` (already read as note ${number})` : ''}`,
          `  title: ${n.title}`,
          n.location ? `  location: ${n.location}` : '',
          `  snippet: ${snippet(n.text)}`,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');
  };

  const readNotes = async (input: any): Promise<string> => {
    const ids: string[] = Array.isArray(input?.ids)
      ? Array.from(new Set(input.ids.filter((id: unknown): id is string => typeof id === 'string')))
      : [];
    if (!ids.length) return 'Error: ids is required.';
    const requested = ids.slice(0, MAX_READ_PER_CALL);
    const fresh = requested.filter((id) => !numberById.has(id) && isValidObjectId(id));
    const { included } = await loadSourceNotes(null, fresh, { readOnly: true });
    const archived = new Set(
      (await NoteModel.find({ _id: { $in: fresh }, archived: true }).select({ _id: 1 }).lean()).map((d: any) =>
        String(d._id),
      ),
    );
    const located = new Map(
      (await withLocations(included.filter((n) => !archived.has(n.id)))).map((n) => [n.id, n]),
    );

    let readCount = 0;
    const parts = requested.map((id) => {
      const number = numberById.get(id);
      if (number) return `Note ${number} (${id}) was already read; see above.`;
      if (archived.has(id)) return `${id}: this note is archived.`;
      const note: (SourceNote & { location?: string }) | undefined = located.get(id);
      if (!note) return `${id}: no note with this id, or it has no text.`;
      const text = note.text.slice(0, MAX_NOTE_CHARS);
      if (charsUsed + text.length > MAX_INPUT_CHARS) {
        return `${id}: not read. You've read as much as fits in this conversation; answer with what you have.`;
      }
      charsUsed += text.length;
      const source: AskSource = {
        id: note.id,
        title: note.title,
        subjectId: note.subjectId,
        topicId: note.topicId,
        location: note.location,
      };
      sources.push(source);
      const n = sources.length;
      numberById.set(note.id, n);
      send({ type: 'source', source });
      readCount++;
      return noteXml(n, note, text) + (note.text.length > MAX_NOTE_CHARS ? '\n(Note truncated.)' : '');
    });
    if (ids.length > requested.length) {
      parts.push(`Only the first ${MAX_READ_PER_CALL} ids were read; ask again for the rest.`);
    }
    if (readCount) send({ type: 'activity', text: `Read ${readCount} ${readCount === 1 ? 'note' : 'notes'}` });
    return parts.join('\n\n');
  };

  try {
    let wroteText = false;
    for (let round = 0; ; round++) {
      if (wroteText) {
        send({ type: 'restart' });
        wroteText = false;
      }
      const stream = client.beta.messages.stream(
        {
          model: CONSOLIDATE_MODEL,
          max_tokens: 32000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          system: ASK_ALL_SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        },
        { signal: abort.signal },
      );
      stream.on('text', (delta) => {
        wroteText = true;
        send({ type: 'text', text: delta });
      });
      const final = await stream.finalMessage();
      // Thinking and tool-use blocks go back unchanged for the next round.
      messages.push({ role: 'assistant', content: final.content as any });

      if (final.stop_reason !== 'tool_use') {
        if (final.stop_reason === 'max_tokens') {
          send({ type: 'text', text: '\n\n> **Note:** the answer was cut off because it reached the maximum length.' });
        } else if (final.stop_reason === 'refusal') {
          send({ type: 'text', text: '\n\n> **Note:** Claude declined to answer this question.' });
        }
        break;
      }
      if (round >= MAX_ROUNDS) {
        send({
          type: 'text',
          text: '\n\n> **Note:** Claude stopped searching after reaching the search limit, so this may be incomplete.',
        });
        break;
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of final.content as any[]) {
        if (block.type !== 'tool_use') continue;
        let content: string;
        try {
          content =
            block.name === 'search_notes'
              ? await searchNotes(block.input)
              : block.name === 'read_notes'
                ? await readNotes(block.input)
                : `Unknown tool ${block.name}.`;
        } catch (err: any) {
          console.error('[ask-all] tool failed', block.name, err);
          content = `Error: ${err?.message ?? 'the tool failed'}`;
        }
        results.push({ type: 'tool_result', tool_use_id: block.id, content });
      }
      const extra: Anthropic.Beta.BetaTextBlockParam[] =
        round === MAX_ROUNDS - 1
          ? [{ type: 'text', text: 'That was the last search. Answer now with what you have found, and say if the search may be incomplete.' }]
          : [];
      // Cache through the newest results; earlier markers are dropped to stay
      // within the API's limit on cache breakpoints.
      for (const m of messages) {
        if (m.role === 'user' && Array.isArray(m.content) && m.content.some((b: any) => b.type === 'tool_result')) {
          m.content.forEach((b: any) => delete b.cache_control);
        }
      }
      const content: (Anthropic.Beta.BetaToolResultBlockParam | Anthropic.Beta.BetaTextBlockParam)[] = [...results, ...extra];
      (content[content.length - 1] as any).cache_control = { type: 'ephemeral' };
      messages.push({ role: 'user', content });
    }
    res.end();
  } catch (err: any) {
    if (abort.signal.aborted) return;
    console.error('[ask-all] stream failed', err);
    const msg =
      err instanceof Anthropic.APIError ? `${err.status ?? ''} ${err.message}`.trim() : String(err?.message ?? err);
    send({ type: 'error', message: msg });
    res.end();
  }
}

// POST /api/v1/ask/save
// Save an answer as a new note in the chosen topic.
export async function saveAskAllAnswer(req: Request, res: Response) {
  const body = (req.body ?? {}) as AskAllSaveRequest;
  if (typeof body.markdown !== 'string' || !body.markdown.trim()) {
    return res.status(400).json({ message: 'markdown is required' });
  }
  if (!body.topicId || !isValidObjectId(body.topicId)) {
    return res.status(400).json({ message: 'Choose a topic to save the note in' });
  }
  const topic: any = await TopicModel.findById(body.topicId).select({ subjectId: 1 }).lean();
  if (!topic) return res.status(404).json({ message: 'That topic no longer exists' });
  const topicId = String(body.topicId);

  const ids = Array.isArray(body.noteIds) ? body.noteIds.filter((id) => isValidObjectId(id)) : [];
  const existing = await NoteModel.find({ _id: { $in: ids } }).select({ _id: 1 }).lean();
  const sourceIds = existing.map((d: any) => String(d._id));

  const title = (body.title ?? '').trim() || 'Answer from Claude';
  const min = await NoteModel.findOne({ topicId }).sort({ order: 1 }).select({ order: 1 }).lean();
  const created = await NoteModel.create({
    subjectId: String(topic.subjectId),
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
    console.error('[embeddings] ask-all save failed', noteId, err);
  });
}
