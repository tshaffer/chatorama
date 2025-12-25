import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { ChatRegistryModel } from '../models/ChatRegistry';
import { ENV } from '../config/env';

type BaselineImportOptions = {
  filePath?: string | null;
  dryRun?: boolean;
};

type BaselineImportResult = {
  ok: boolean;
  filePathUsed: string;
  dryRun: boolean;
  totalInFile: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

type ConversationLike = Record<string, any>;

function resolveConversationsPath(explicitPath?: string | null): { filePath: string; ensuredDir?: string } {
  if (explicitPath) return { filePath: path.resolve(explicitPath) };
  if (ENV.CONVERSATIONS_JSON_PATH) return { filePath: path.resolve(ENV.CONVERSATIONS_JSON_PATH) };

  const dir = path.resolve(__dirname, '../../data');
  const filePath = path.join(dir, 'conversations.json');
  return { filePath, ensuredDir: dir };
}

function normalizeTopic(title?: string, subject?: string): string | undefined {
  if (!title) return undefined;
  if (!subject) return title.trim();

  const re = new RegExp(
    `^\\s*${subject.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*(?:–|—|-|:)\\s*`,
    'iu'
  );
  const stripped = title.replace(re, '').trim();
  return stripped || title.trim();
}

function parseDateMaybe(v: any): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function extractChatId(conv: ConversationLike): string | null {
  const candidates = [conv.chatId, conv.id, conv.conversation_id, conv.conversationId];
  const found = candidates.find((c) => typeof c === 'string' && c.trim());
  return found ? String(found).trim() : null;
}

function buildFields(conv: ConversationLike): {
  chatId: string | null;
  chatTitle?: string;
  projectName?: string;
  subject?: string;
  topic?: string;
  pageUrl?: string;
  lastExportedAt?: Date;
} {
  const chatId = extractChatId(conv);
  const chatTitle = conv.title ?? conv.chatTitle;
  const projectName = conv.projectName ?? conv.project ?? conv.subject;
  const subject = conv.subject || projectName || (typeof chatTitle === 'string'
    ? (chatTitle.split(/ - |:|–|—/)[0] || '').trim()
    : undefined);
  const topic =
    conv.topic ||
    normalizeTopic(typeof chatTitle === 'string' ? chatTitle : undefined, typeof subject === 'string' ? subject : undefined) ||
    (typeof chatTitle === 'string' ? chatTitle : undefined);
  const lastExportedAt = parseDateMaybe(conv.lastExportedAt ?? conv.exportedAt);

  const pageUrl =
    conv.pageUrl ||
    (chatId ? `https://chatgpt.com/c/${chatId}` : undefined);

  return {
    chatId,
    chatTitle,
    projectName,
    subject,
    topic,
    pageUrl,
    lastExportedAt,
  };
}

function fieldsDiffer(existing: any, next: Record<string, any>): boolean {
  const keys = Object.keys(next);
  for (const k of keys) {
    if (next[k] === undefined) continue;
    if (k === 'lastExportedAt') {
      const a = existing?.[k] ? new Date(existing[k]).getTime() : undefined;
      const b = next[k] instanceof Date ? next[k].getTime() : undefined;
      if (a !== b) return true;
    } else if ((existing?.[k] ?? undefined) !== next[k]) {
      return true;
    }
  }
  return false;
}

export async function importChatRegistriesFromFile(
  options: BaselineImportOptions
): Promise<BaselineImportResult> {
  const { filePath, dryRun = false } = options;
  const { filePath: resolved, ensuredDir } = resolveConversationsPath(filePath);

  if (ensuredDir) {
    await fs.mkdir(ensuredDir, { recursive: true });
  }

  const errors: string[] = [];
  let raw: string;
  try {
    raw = await fs.readFile(resolved, 'utf8');
  } catch (err: any) {
    throw new Error(`Failed to read conversations.json at ${resolved}: ${err?.message || err}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Invalid JSON in ${resolved}: ${err?.message || err}`);
  }

  const list: ConversationLike[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.conversations)
      ? parsed.conversations
      : [];
  if (!Array.isArray(list) || !list.length) {
    throw new Error(`No conversations found in ${resolved}`);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const conv of list) {
    const fields = buildFields(conv);
    if (!fields.chatId) {
      errors.push('Missing chatId in conversation: ' + JSON.stringify(conv).slice(0, 200));
      skipped += 1;
      continue;
    }

    const set: Record<string, any> = {};
    if (fields.chatTitle) set.chatTitle = fields.chatTitle;
    if (fields.projectName) set.projectName = fields.projectName;
    if (fields.subject) set.subject = fields.subject;
    if (fields.topic) set.topic = fields.topic;
    if (fields.pageUrl) set.pageUrl = fields.pageUrl;
    if (fields.lastExportedAt) set.lastExportedAt = fields.lastExportedAt;

    const existing = await ChatRegistryModel.findOne({ chatId: fields.chatId }).lean().exec();
    if (!existing) {
      inserted += 1;
      if (!dryRun) {
        await ChatRegistryModel.updateOne(
          { chatId: fields.chatId },
          {
            $set: set,
            $setOnInsert: { chatId: fields.chatId, status: 'UNREVIEWED' },
          },
          { upsert: true }
        ).exec();
      }
      continue;
    }

    const differs = fieldsDiffer(existing, set);
    if (!differs) {
      skipped += 1;
      continue;
    }

    updated += 1;
    if (!dryRun) {
      await ChatRegistryModel.updateOne(
        { chatId: fields.chatId },
        { $set: set, $setOnInsert: { chatId: fields.chatId, status: existing.status || 'UNREVIEWED' } },
        { upsert: false }
      ).exec();
    }
  }

  return {
    ok: errors.length === 0,
    filePathUsed: resolved,
    dryRun,
    totalInFile: list.length,
    inserted,
    updated,
    skipped,
    errors,
  };
}

const router = Router();

router.post('/chat-registries', async (req: Request, res: Response, next) => {
  try {
    const { filePath = null, dryRun = false } = (req.body as BaselineImportOptions) || {};
    const result = await importChatRegistriesFromFile({ filePath, dryRun });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
