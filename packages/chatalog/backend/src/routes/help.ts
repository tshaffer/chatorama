import { Router } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import { getClaudeClient } from '../ai/claudeClient';
import { helpTopics } from '@chatorama/chatalog-shared';

const helpRouter = Router();

const MAX_HISTORY_TURNS = 6;

interface HelpConversationTurn {
  question: string;
  answer: string;
  citedSlugs: string[];
  toolUseId: string;
}

const systemInstructions = `You are the in-app Help assistant for Chatalog, a personal knowledge base for saving and organizing notes and conversations.

Your job is to answer the user's question using ONLY the help documentation provided below, by calling the provide_answer tool.

## Rules
- Base your answer strictly on the provided documentation. Do not invent features or behavior not described.
- If the documentation doesn't cover the question, say so plainly (e.g. "The help docs don't cover that") rather than guessing.
- Keep answers concise and task-oriented — a few sentences or a short list, not a full article.
- Use earlier conversation turns for context (resolving "it"/"that" or follow-ups), but always ground the answer in the documentation.
- In citedSlugs, list the slugs of the topics you actually drew on, in relevance order. Return an empty array if none were relevant.`;

function buildContextBlock(): string {
  return helpTopics
    .map((topic) => `### [${topic.slug}] ${topic.title}\n\n${topic.body}`)
    .join('\n\n---\n\n');
}

function buildHistoryMessages(history: HelpConversationTurn[]): Anthropic.MessageParam[] {
  return history.slice(-MAX_HISTORY_TURNS).flatMap((turn): Anthropic.MessageParam[] => [
    { role: 'user', content: turn.question },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: turn.toolUseId,
          name: 'provide_answer',
          input: { answer: turn.answer, citedSlugs: turn.citedSlugs },
        },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: turn.toolUseId, content: 'Acknowledged.' }],
    },
  ]);
}

helpRouter.post('/ask', async (req, res) => {
  const { question, history } = req.body as { question?: string; history?: HelpConversationTurn[] };
  if (!question?.trim()) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  try {
    const client = getClaudeClient();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: systemInstructions,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: buildContextBlock(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'provide_answer',
          description: 'Provide the answer to the user\'s help question.',
          input_schema: {
            type: 'object' as const,
            properties: {
              answer: {
                type: 'string',
                description: 'The answer to the question, based only on the provided help documentation.',
              },
              citedSlugs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Slugs of the help topics used to answer, in relevance order. Empty if none were relevant.',
              },
            },
            required: ['answer', 'citedSlugs'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'provide_answer' },
      messages: [
        ...buildHistoryMessages(history ?? []),
        { role: 'user', content: question.trim() },
      ],
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(500).json({ error: 'Claude did not return an answer' });
      return;
    }

    const input = toolUse.input as { answer: string; citedSlugs: string[] };
    const topicsBySlug = new Map(helpTopics.map((t) => [t.slug, t]));
    const citations = (input.citedSlugs ?? [])
      .map((slug) => topicsBySlug.get(slug))
      .filter((t): t is (typeof helpTopics)[number] => t !== undefined)
      .map((t) => ({ slug: t.slug, title: t.title }));

    res.json({
      answer: input.answer,
      citations,
      citedSlugs: input.citedSlugs ?? [],
      toolUseId: toolUse.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: 'Claude API is not configured (missing ANTHROPIC_API_KEY)' });
      return;
    }
    console.error('Help question failed', error);
    res.status(500).json({ error: 'Failed to answer question' });
  }
});

export default helpRouter;
