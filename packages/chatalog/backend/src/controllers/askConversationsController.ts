// controllers/askConversationsController.ts
//
// Saved Ask Claude conversations. The dialog saves each finished answer so a
// conversation can be set aside and continued later.
import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import type {
  AppendAskConversationTurnRequest,
  AskConversationNoteStatus,
  AskConversationSummary,
  AskConversationTurnInput,
  AskConversationWithNotes,
  CreateAskConversationRequest,
  UpdateAskConversationRequest,
} from '@chatorama/chatalog-shared';
import { AskConversationModel } from '../models/AskConversation';
import { NoteModel } from '../models/Note';

const MAX_TURNS = 200;
const MAX_TITLE = 200;

function cleanTitle(title: unknown): string {
  return typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : '';
}

// Returns the turn to store, or null if it's malformed.
function cleanTurn(turn: any): AskConversationTurnInput | null {
  if (!turn || typeof turn.question !== 'string' || typeof turn.answer !== 'string') return null;
  if (!turn.question.trim() || !turn.answer.trim()) return null;
  if (!Array.isArray(turn.sources)) return null;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const sources = turn.sources
    .filter((s: any) => s && typeof s.id === 'string')
    .map((s: any) => ({
      id: s.id,
      title: typeof s.title === 'string' ? s.title : '',
      subjectId: str(s.subjectId),
      topicId: str(s.topicId),
      location: str(s.location),
    }));
  const activity = Array.isArray(turn.activity)
    ? turn.activity.filter((a: unknown): a is string => typeof a === 'string').slice(0, 100)
    : undefined;
  return {
    question: turn.question,
    answer: turn.answer,
    stopped: turn.stopped ? true : undefined,
    sources,
    activity: activity?.length ? activity : undefined,
  };
}

async function findConversation(req: Request, res: Response) {
  const { topicId, conversationId } = req.params;
  if (!isValidObjectId(conversationId)) {
    res.status(404).json({ message: 'Conversation not found' });
    return null;
  }
  // No topicId: a conversation across all notes
  const conversation = await AskConversationModel.findOne({ _id: conversationId, topicId: topicId ?? null });
  if (!conversation) res.status(404).json({ message: 'Conversation not found' });
  return conversation;
}

// GET /api/v1/topics/:topicId/ask-conversations
// GET /api/v1/ask/conversations (conversations across all notes)
export async function listAskConversations(req: Request, res: Response) {
  const { topicId } = req.params;
  const docs = await AskConversationModel.find({ topicId: topicId ?? null })
    .sort({ updatedAt: -1 })
    .limit(50)
    .select({ title: 1, noteIds: 1, 'turns.question': 1, 'turns.sources.id': 1, createdAt: 1, updatedAt: 1 })
    .lean();
  const payload: AskConversationSummary[] = docs.map((d: any) => ({
    id: String(d._id),
    title: d.title,
    questionCount: d.turns?.length ?? 0,
    noteCount: topicId
      ? (d.noteIds?.length ?? 0)
      : new Set((d.turns ?? []).flatMap((t: any) => (t.sources ?? []).map((src: any) => src.id))).size,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
  res.json(payload);
}

// GET /api/v1/topics/:topicId/ask-conversations/:conversationId
// Includes how each of the conversation's notes stands now.
export async function getAskConversation(req: Request, res: Response) {
  const conversation = await findConversation(req, res);
  if (!conversation) return;
  const { topicId } = req.params;

  // Across all notes, the notes are whatever Claude found in any answer.
  const noteIds = topicId
    ? conversation.noteIds
    : Array.from(new Set(conversation.turns.flatMap((t) => t.sources.map((src) => src.id))));
  const titleById = new Map(conversation.turns.flatMap((t) => t.sources.map((src) => [src.id, src.title] as const)));
  const ids = noteIds.filter((id) => isValidObjectId(id));
  const found = await NoteModel.find({ _id: { $in: ids } })
    .select({ title: 1, topicId: 1, archived: 1, contentUpdatedAt: 1 })
    .lean();
  const byId = new Map(found.map((n: any) => [String(n._id), n]));
  const lastAnswered = conversation.turns.reduce(
    (max, t) => Math.max(max, new Date(t.answeredAt).getTime()),
    0,
  );

  const notes = noteIds.map((id) => {
    const n: any = byId.get(id);
    let status: AskConversationNoteStatus = 'unchanged';
    // A note moved to another topic can't be asked about from here.
    if (!n || (topicId && String(n.topicId) !== topicId)) status = 'missing';
    else if (n.archived) status = 'archived';
    else if (n.contentUpdatedAt && new Date(n.contentUpdatedAt).getTime() > lastAnswered) status = 'changed';
    return { id, title: n?.title ?? titleById.get(id) ?? '', status };
  });

  const payload: AskConversationWithNotes = { ...(conversation.toJSON() as any), notes };
  res.json(payload);
}

// POST /api/v1/topics/:topicId/ask-conversations
// Created with its first answer.
export async function createAskConversation(req: Request, res: Response) {
  const { topicId } = req.params;
  const body = (req.body ?? {}) as CreateAskConversationRequest;

  // Across all notes (no topic), Claude may not have found any notes yet.
  if (!Array.isArray(body.noteIds) || (topicId && body.noteIds.length === 0)) {
    return res.status(400).json({ message: 'noteIds[] is required' });
  }
  const turn = cleanTurn(body.turn);
  if (!turn) return res.status(400).json({ message: 'turn must have a question, an answer and sources' });

  const created = await AskConversationModel.create({
    topicId: topicId || undefined,
    title: cleanTitle(body.title) || 'Conversation with Claude',
    noteIds: body.noteIds.filter((id) => typeof id === 'string'),
    turns: [{ ...turn, answeredAt: new Date() }],
  });
  res.status(201).json(created.toJSON());
}

// POST /api/v1/topics/:topicId/ask-conversations/:conversationId/turns
export async function appendAskConversationTurn(req: Request, res: Response) {
  const body = (req.body ?? {}) as AppendAskConversationTurnRequest;
  const turn = cleanTurn(body.turn);
  if (!turn) return res.status(400).json({ message: 'turn must have a question, an answer and sources' });

  const conversation = await findConversation(req, res);
  if (!conversation) return;
  if (conversation.turns.length >= MAX_TURNS) {
    return res.status(413).json({ message: `Conversations are limited to ${MAX_TURNS} questions.` });
  }

  conversation.turns.push({ ...turn, answeredAt: new Date() });
  await conversation.save();
  res.json({ turnCount: conversation.turns.length });
}

// PATCH /api/v1/topics/:topicId/ask-conversations/:conversationId
export async function updateAskConversation(req: Request, res: Response) {
  const body = (req.body ?? {}) as UpdateAskConversationRequest;
  const conversation = await findConversation(req, res);
  if (!conversation) return;

  if (body.title !== undefined) {
    const title = cleanTitle(body.title);
    if (!title) return res.status(400).json({ message: 'title can’t be empty' });
    conversation.title = title;
  }
  if (body.savedNote) {
    const { turnIndex, noteId } = body.savedNote;
    const turn = Number.isInteger(turnIndex) ? conversation.turns[turnIndex] : undefined;
    if (!turn || typeof noteId !== 'string') {
      return res.status(400).json({ message: 'savedNote needs a valid turnIndex and noteId' });
    }
    turn.savedNoteId = noteId;
    conversation.markModified('turns');
  }

  await conversation.save();
  res.json(conversation.toJSON());
}

// DELETE /api/v1/topics/:topicId/ask-conversations/:conversationId
export async function deleteAskConversation(req: Request, res: Response) {
  const conversation = await findConversation(req, res);
  if (!conversation) return;
  await conversation.deleteOne();
  res.status(204).end();
}
