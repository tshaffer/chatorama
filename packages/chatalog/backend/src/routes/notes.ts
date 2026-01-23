// routes/notes.ts
import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import {
  listNotes,
  getNote,
  createNote,
  patchNote,
  deleteNote,
  listNotesByTopicWithRelations, // make sure this is imported
} from '../controllers/notesController';
import { NoteModel } from '../models/Note';
import { NoteAssetModel } from '../models/NoteAsset';
import { AssetModel } from '../models/Asset';
import { LinkedPageSnapshotModel } from '../models/LinkedPageSnapshot';
import { embedText } from '../ai/embed';
import { hashEmbeddingText } from '../ai/embeddingText';
import { lookup } from 'node:dns/promises';

const notesRouter = Router();
const MAX_URLS_PER_REQUEST = 5;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_EXTRACTED_CHARS = 100_000;
const MAX_EMBEDDING_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 10_000;

// These resolve to /api/v1/notes/... because you'll mount at api.use('/notes', ...)

// IMPORTANT: specific routes BEFORE the param route
notesRouter.get('/by-topic-with-relations',
  listNotesByTopicWithRelations);                   // GET    /api/v1/notes/by-topic-with-relations
notesRouter.get('/', listNotes);                    // GET    /api/v1/notes
notesRouter.get('/:id', getNote);                   // GET    /api/v1/notes/:id
notesRouter.post('/', createNote);                  // POST   /api/v1/notes

// POST /api/v1/notes/:noteId/assets
notesRouter.post('/:noteId/assets', async (req, res, next) => {
  try {
    const { noteId } = req.params;
    const { assetId, caption } = req.body ?? {};
    if (!assetId || typeof assetId !== 'string') {
      return res.status(400).json({ error: 'assetId is required' });
    }

    const note = await NoteModel.findById(noteId).lean();
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const asset = await AssetModel.findById(assetId).exec();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    try {
      const created = await NoteAssetModel.create({ noteId, assetId, caption });
      const populated = await created.populate('assetId');
      const assetJson =
        (populated.assetId as any)?.toJSON?.() ?? populated.assetId;
      const payload: any = {
        ...populated.toJSON(),
        assetId: asset.id,
        asset: assetJson,
      };
      return res.status(201).json(payload);
    } catch (err: any) {
      if (err?.code === 11000) {
        const existing = await NoteAssetModel.findOne({ noteId, assetId })
          .populate('assetId')
          .exec();
        if (existing) {
          const assetJson =
            (existing.assetId as any)?.toJSON?.() ?? existing.assetId;
          const payload: any = {
            ...existing.toJSON(),
            assetId: asset.id,
            asset: assetJson,
          };
          return res.json(payload);
        }
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

type SnapshotResult = {
  url: string;
  status: 'ok' | 'error' | 'blocked' | 'timeout';
  fetchedAt?: string;
  title?: string;
  textChars?: number;
  error?: string;
};

type FetchOutcome = {
  finalUrl: string;
  html: string;
  title?: string;
  byline?: string;
  excerpt?: string;
  text: string;
};

class SnapshotFetchError extends Error {
  status: SnapshotResult['status'];
  constructor(status: SnapshotResult['status'], message: string) {
    super(message);
    this.status = status;
  }
}

function assertHttpUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SnapshotFetchError('blocked', `Only http/https URLs are allowed: ${u.toString()}`);
  }
  return u;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  return false;
}

async function disallowLocalhostOrPrivate(u: URL) {
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host === '127.0.0.1') {
    throw new SnapshotFetchError('blocked', `Refusing localhost URL: ${u.toString()}`);
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new SnapshotFetchError('blocked', `Refusing private IP URL: ${u.toString()}`);
  }

  try {
    const resolved = await lookup(host, { all: true });
    for (const r of resolved) {
      if (r.family === 4 && isPrivateIpv4(r.address)) {
        throw new SnapshotFetchError('blocked', `Refusing private IP URL: ${u.toString()}`);
      }
      if (r.family === 6 && isPrivateIpv6(r.address)) {
        throw new SnapshotFetchError('blocked', `Refusing private IP URL: ${u.toString()}`);
      }
    }
  } catch (err) {
    if (err instanceof SnapshotFetchError) throw err;
  }
}

function extractReadableText(url: string, html: string) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    const fallbackText = dom.window.document.body?.textContent ?? '';
    const text = fallbackText
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      title: dom.window.document.title || undefined,
      byline: undefined,
      excerpt: undefined,
      text,
    };
  }

  const text = (article.textContent ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title: article.title ?? undefined,
    byline: article.byline ?? undefined,
    excerpt: article.excerpt ?? undefined,
    text,
  };
}

type HeaderOverrides = Record<string, string>;

function sanitizeHeaderOverrides(input: unknown): HeaderOverrides | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const allowed = new Set(['accept-language', 'referer']);
  const out: HeaderOverrides = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = String(key).toLowerCase().trim();
    if (!allowed.has(k)) continue;
    if (typeof value !== 'string') continue;
    const v = value.trim();
    if (!v) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

async function fetchHtmlWithGuardrails(
  rawUrl: string,
  headerOverrides?: HeaderOverrides,
): Promise<FetchOutcome> {
  let current = assertHttpUrl(rawUrl);
  await disallowLocalhostOrPrivate(current);

  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;

    try {
      const headers = {
        'User-Agent':
          'Mozilla/5.0 (compatible; ChatalogLinkedSnapshot/1.0; +https://example.invalid)',
        Accept: 'text/html,application/xhtml+xml',
        ...(headerOverrides ?? {}),
      };
      res = await fetch(current.toString(), {
        redirect: 'manual',
        headers,
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        throw new SnapshotFetchError('timeout', 'Fetch timed out');
      }
      throw new SnapshotFetchError('error', `Fetch failed: ${String(err?.message ?? err)}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new SnapshotFetchError('error', 'Redirect response missing Location header');
      }
      const nextUrl = new URL(location, current.toString());
      current = assertHttpUrl(nextUrl.toString());
      await disallowLocalhostOrPrivate(current);
      continue;
    }

    if (res.status === 403) {
      throw new SnapshotFetchError('blocked', 'Fetch blocked (403 Forbidden)');
    }
    if (!res.ok) {
      throw new SnapshotFetchError('error', `Fetch failed: ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new SnapshotFetchError('blocked', `Unsupported content-type: ${contentType}`);
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new SnapshotFetchError('blocked', 'Response too large');
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_RESPONSE_BYTES) {
      throw new SnapshotFetchError('blocked', 'Response too large');
    }

    const html = buf.toString('utf8');
    const { title, byline, excerpt, text } = extractReadableText(current.toString(), html);

    return {
      finalUrl: current.toString(),
      html,
      title: title ?? undefined,
      byline: byline ?? undefined,
      excerpt: excerpt ?? undefined,
      text,
    };
  }

  throw new SnapshotFetchError('error', 'Too many redirects');
}

function extractUrlsFromMarkdown(markdown: string): string[] {
  const out = new Set<string>();
  const linkRe = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(markdown)) !== null) {
    const raw = match[1].trim();
    const cleaned = raw.replace(/[),.;\]]+$/g, '');
    out.add(cleaned);
  }
  const stripped = markdown.replace(linkRe, '');
  const bareRe = /https?:\/\/[^\s)]+/gi;
  while ((match = bareRe.exec(stripped)) !== null) {
    const raw = match[0].trim();
    const cleaned = raw.replace(/[),.;\]]+$/g, '');
    out.add(cleaned);
  }
  return Array.from(out);
}

notesRouter.post('/:noteId/index-linked-pages', async (req, res, next) => {
  try {
    const { noteId } = req.params;
    if (!isValidObjectId(noteId)) {
      return res.status(400).json({ error: 'Invalid noteId' });
    }

    const body = req.body ?? {};
    const urlsInput = Array.isArray(body.urls) ? body.urls : undefined;
    const force = Boolean(body.force);
    const headerOverrides = sanitizeHeaderOverrides(body.headers);

    const note = await NoteModel.findById(noteId).lean().exec();
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const urls = urlsInput?.length
      ? urlsInput.map((u: unknown) => String(u).trim()).filter(Boolean)
      : extractUrlsFromMarkdown(String(note.markdown ?? ''));

    if (urls.length > MAX_URLS_PER_REQUEST) {
      return res.status(400).json({ error: `Too many urls (max ${MAX_URLS_PER_REQUEST})` });
    }

    const results: SnapshotResult[] = [];

    for (const rawUrl of urls) {
      try {
        const resolved = assertHttpUrl(rawUrl);
        await disallowLocalhostOrPrivate(resolved);

        const fetched = await fetchHtmlWithGuardrails(resolved.toString(), headerOverrides);
        const trimmedText = fetched.text.slice(0, MAX_EXTRACTED_CHARS).trim();
        if (!trimmedText) {
          throw new SnapshotFetchError('error', 'No readable text extracted');
        }

        const contentHash = hashEmbeddingText(trimmedText);
        const existing = await LinkedPageSnapshotModel.findOne({
          noteId,
          url: fetched.finalUrl,
        }).lean();

        if (existing && !force && existing.contentHash === contentHash) {
          results.push({
            url: fetched.finalUrl,
            status: existing.status,
            fetchedAt: existing.fetchedAt?.toISOString?.() ?? undefined,
            title: existing.title,
            textChars: existing.textChars,
          });
          continue;
        }

        const embeddingText = `${fetched.title ?? ''}\n\n${trimmedText}`
          .trim()
          .slice(0, MAX_EMBEDDING_CHARS);
        const { vector, model } = await embedText(embeddingText, {
          model: 'text-embedding-3-small',
        });

        const doc = await LinkedPageSnapshotModel.findOneAndUpdate(
          { noteId, url: fetched.finalUrl },
          {
            $set: {
              noteId,
              url: fetched.finalUrl,
              title: fetched.title,
              excerpt: fetched.excerpt,
              extractedText: trimmedText,
              contentHash,
              fetchedAt: new Date(),
              status: 'ok',
              error: undefined,
              textChars: trimmedText.length,
              embedding: vector,
              embeddingModel: model,
              embeddingTextHash: contentHash,
              embeddingUpdatedAt: new Date(),
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();

        results.push({
          url: fetched.finalUrl,
          status: 'ok',
          fetchedAt: doc?.fetchedAt?.toISOString?.() ?? new Date().toISOString(),
          title: doc?.title,
          textChars: doc?.textChars,
        });
      } catch (err: any) {
        const status: SnapshotResult['status'] =
          err instanceof SnapshotFetchError ? err.status : 'error';
        const message = err instanceof Error ? err.message : String(err);

        await LinkedPageSnapshotModel.findOneAndUpdate(
          { noteId, url: rawUrl },
          {
            $set: {
              noteId,
              url: rawUrl,
              title: undefined,
              excerpt: undefined,
              extractedText: '',
              contentHash: hashEmbeddingText(''),
              fetchedAt: new Date(),
              status,
              error: message,
              textChars: 0,
              embedding: undefined,
              embeddingModel: undefined,
              embeddingTextHash: undefined,
              embeddingUpdatedAt: undefined,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();

        results.push({
          url: rawUrl,
          status,
          error: message,
        });
      }
    }

    return res.json({ noteId: String(noteId), results });
  } catch (err) {
    return next(err);
  }
});

notesRouter.patch('/:id', patchNote);               // PATCH  /api/v1/notes/:id
notesRouter.delete('/:id', deleteNote);             // DELETE /api/v1/notes/:id

export default notesRouter;
