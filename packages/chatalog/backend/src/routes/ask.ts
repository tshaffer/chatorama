import { Router } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { getClaudeClient } from '../ai/claudeClient';
import { NoteModel } from '../models/Note';

const askRouter = Router();

const MAX_TOOL_ROUNDS = 6;
const NOTE_CONTENT_LIMIT = 6000;
const SEARCH_LIMIT = 8;

function buildSnippet(text: string, maxLen = 280): string {
  if (!text) return '';
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^\)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1')
    .replace(/^[>#]+\s+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1) + '…' : cleaned;
}

async function toolSearchNotes(query: string) {
  const docs = await NoteModel.find(
    { $text: { $search: query }, recipe: { $exists: false } },
    { score: { $meta: 'textScore' } },
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(SEARCH_LIMIT)
    .select({ title: 1, markdown: 1, tags: 1, updatedAt: 1 })
    .lean();

  return docs.map((doc: any) => ({
    id: String(doc._id),
    title: doc.title || 'Untitled',
    snippet: buildSnippet(doc.markdown || ''),
    tags: doc.tags || [],
    wordCount: (doc.markdown || '').split(/\s+/).filter(Boolean).length,
    updatedAt: doc.updatedAt,
  }));
}

async function toolSearchRecipes(query: string) {
  const docs = await NoteModel.find(
    { $text: { $search: query }, recipe: { $exists: true } },
    { score: { $meta: 'textScore' } },
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(SEARCH_LIMIT)
    .select({
      title: 1,
      'recipe.prepTimeMinutes': 1,
      'recipe.cookTimeMinutes': 1,
      'recipe.totalTimeMinutes': 1,
      'recipe.yield': 1,
      'recipe.description': 1,
      'recipe.cuisine': 1,
      'recipe.category': 1,
      'recipe.ingredientsRaw': 1,
      'recipe.stepsRaw': 1,
    })
    .lean();

  return docs.map((doc: any) => {
    const r = doc.recipe || {};
    return {
      id: String(doc._id),
      title: doc.title || 'Untitled',
      prepTimeMinutes: r.prepTimeMinutes ?? null,
      cookTimeMinutes: r.cookTimeMinutes ?? null,
      totalTimeMinutes: r.totalTimeMinutes ?? null,
      yield: r.yield ?? null,
      description: r.description ?? null,
      cuisine: r.cuisine ?? null,
      category: r.category ?? [],
      ingredients: (r.ingredientsRaw ?? []).slice(0, 30),
      instructions: (r.stepsRaw ?? []).slice(0, 10),
    };
  });
}

async function toolGetNote(id: string) {
  let doc: any;
  try {
    doc = await NoteModel.findById(id)
      .select({ title: 1, markdown: 1, tags: 1, updatedAt: 1, docKind: 1 })
      .lean();
  } catch {
    return null;
  }
  if (!doc) return null;
  const markdown = doc.markdown || '';
  const truncated = markdown.length > NOTE_CONTENT_LIMIT;
  return {
    id: String(doc._id),
    title: doc.title || 'Untitled',
    content: truncated
      ? `${markdown.slice(0, NOTE_CONTENT_LIMIT)}\n\n[Note truncated — full note is ${markdown.length} chars]`
      : markdown,
    tags: doc.tags || [],
    updatedAt: doc.updatedAt,
  };
}

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_notes',
    description:
      "Search the user's text notes (not recipes) by keyword. Returns titles and snippets. Call get_note to read the full content of a promising result.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search terms' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_recipes',
    description:
      "Search the user's saved recipes. Returns full recipe details including prep/cook times, ingredients, and instructions.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Recipe name, ingredient, or description' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_note',
    description:
      'Retrieve the full markdown content of a specific note by its ID. Use this when a snippet from search_notes is not enough to answer the question.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The note ID from a previous search_notes result' },
      },
      required: ['id'],
    },
  },
];

const SYSTEM_PROMPT = `You are the Ask assistant for Chatalog, a personal knowledge base for saving and organizing notes and conversations.

Your job is to answer the user's questions by searching their notes and recipes using the tools available to you.

## Rules
- Always search before answering — never assume what is or isn't in the user's data.
- For questions about food, recipes, cooking times, or ingredients: use search_recipes.
- For all other questions about notes, topics, or conversations: use search_notes.
- If a snippet from search_notes is not enough to answer fully, use get_note to read the full note.
- You may call multiple tools in sequence to gather enough information.
- If nothing relevant is found after searching, say so clearly — do not invent information.
- Keep answers concise and grounded in what you actually found.
- When citing a specific note or recipe, mention its title.`;

interface ConversationTurn {
  question: string;
  answer: string;
}

interface Source {
  id: string;
  title: string;
  docKind: 'note' | 'recipe';
}

askRouter.post('/', async (req, res) => {
  const { question, history } = req.body as {
    question?: string;
    history?: ConversationTurn[];
  };

  if (!question?.trim()) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  try {
    const client = getClaudeClient();

    const historyMessages: Anthropic.MessageParam[] = (history ?? [])
      .slice(-6)
      .flatMap((turn): Anthropic.MessageParam[] => [
        { role: 'user', content: turn.question },
        { role: 'assistant', content: turn.answer },
      ]);

    const messages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: 'user', content: question.trim() },
    ];

    const accessedSources = new Map<string, Source>();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text');
        const answer = textBlock?.type === 'text' ? textBlock.text : '';
        res.json({ answer, sources: Array.from(accessedSources.values()) });
        return;
      }

      if (response.stop_reason === 'tool_use') {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          let result: unknown = null;

          if (block.name === 'search_notes') {
            const input = block.input as { query: string };
            result = await toolSearchNotes(input.query);
            for (const item of result as any[]) {
              accessedSources.set(item.id, { id: item.id, title: item.title, docKind: 'note' });
            }
          } else if (block.name === 'search_recipes') {
            const input = block.input as { query: string };
            result = await toolSearchRecipes(input.query);
            for (const item of result as any[]) {
              accessedSources.set(item.id, { id: item.id, title: item.title, docKind: 'recipe' });
            }
          } else if (block.name === 'get_note') {
            const input = block.input as { id: string };
            result = await toolGetNote(input.id);
            if (result) {
              const r = result as any;
              const existing = accessedSources.get(r.id);
              accessedSources.set(r.id, {
                id: r.id,
                title: r.title,
                docKind: existing?.docKind ?? 'note',
              });
            }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result === null ? 'Not found.' : JSON.stringify(result),
          });
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }

    res.status(500).json({ error: 'No answer was produced.' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: 'Claude API is not configured (missing ANTHROPIC_API_KEY)' });
      return;
    }
    console.error('[ask] error', error);
    res.status(500).json({ error: 'Failed to answer question' });
  }
});

export default askRouter;
