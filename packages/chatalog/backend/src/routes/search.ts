import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { NoteModel } from '../models/Note';
import { computeEmbeddingTextAndHash } from '../ai/embeddingText';
import { embedText } from '../ai/embed';
import type {
  SearchRequestV1,
  SearchResponseV1,
  SearchHitNoteV1,
  SearchSpec,
} from '@chatorama/chatalog-shared';

export const searchRouter = Router();

function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.CHATALOG_ADMIN_TOKEN;
  if (!expected) {
    return res.status(500).json({
      error: 'CHATALOG_ADMIN_TOKEN is not configured',
    });
  }

  const provided = req.header('x-chatalog-admin');
  if (!provided || provided !== expected) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return next();
}

function normalizeScope(
  value: unknown,
  fallback: SearchSpec['scope'] = 'notes',
): SearchSpec['scope'] {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'all' || raw === 'notes' || raw === 'recipes') {
    return raw as SearchSpec['scope'];
  }
  return fallback;
}

function stripMarkdownVerySimple(md: string): string {
  if (!md) return '';
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^\)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1')
    .replace(/^[>#]+\s+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQueryTerms(q: string): string[] {
  if (!q) return [];
  const raw = q
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const terms: string[] = [];
  const seen = new Set<string>();

  for (const t of raw) {
    const norm = t.toLowerCase();
    if (norm.length < 2) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    terms.push(t);
    if (terms.length >= 8) break;
  }
  return terms;
}

function buildSnippetAroundMatch(md: string, terms: string[], windowSize = 260): string {
  const text = stripMarkdownVerySimple(md);
  if (!text) return '';

  if (!terms.length) {
    return text.length > windowSize ? `${text.slice(0, windowSize - 1)}…` : text;
  }

  const lower = text.toLowerCase();
  let bestIdx = -1;

  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1) {
      bestIdx = idx;
      break;
    }
  }

  if (bestIdx === -1) {
    return text.length > windowSize ? `${text.slice(0, windowSize - 1)}…` : text;
  }

  const start = Math.max(0, bestIdx - Math.floor(windowSize * 0.35));
  const end = Math.min(text.length, start + windowSize);

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

searchRouter.post('/', async (req, res, next) => {
  try {
    console.log('POST /api/v1/search called with body:', req.body);
    const body = req.body as Partial<SearchRequestV1>;

    if (body.version !== 1) {
      return res.status(400).json({ error: 'Unsupported search request version' });
    }

    const q = (body.q ?? '').trim();
    const treatedAsWildcard = q === '' || q === '*';
    const scope = normalizeScope(body.scope, 'notes');

    const targetTypes = body.targetTypes ?? [];
    if (!Array.isArray(targetTypes) || !targetTypes.includes('note')) {
      return res.status(400).json({ error: 'Search v1 supports targetTypes: [note]' });
    }

    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);
    const offset = Math.max(body.offset ?? 0, 0);

    const filters = body.filters ?? {};
    const and: any[] = [];

    if (filters.subjectId) and.push({ subjectId: filters.subjectId });
    if (filters.topicId) and.push({ topicId: filters.topicId });

    if (filters.status && String(filters.status).trim()) {
      and.push({ status: String(filters.status).trim() });
    }

    if (filters.importedOnly) {
      and.push({ importBatchId: { $exists: true, $nin: [null, ''] } });
    }

    const tagsAll =
      Array.isArray(filters.tagsAll)
        ? filters.tagsAll.map((t) => String(t).trim()).filter(Boolean)
        : [];
    if (Array.isArray(tagsAll) && tagsAll.length > 0) {
      const tags = tagsAll.map((t: any) => String(t).trim()).filter(Boolean);
      if (tags.length) and.push({ tags: { $all: tags } });
    }

    if (filters.updatedAtFrom || filters.updatedAtTo) {
      const range: any = {};
      if (filters.updatedAtFrom) {
        const d = new Date(filters.updatedAtFrom);
        if (!Number.isNaN(d.getTime())) range.$gte = d;
      }
      if (filters.updatedAtTo) {
        const d = new Date(filters.updatedAtTo);
        if (!Number.isNaN(d.getTime())) range.$lte = d;
      }
      if (Object.keys(range).length) and.push({ contentUpdatedAt: range });
    }

    if (filters.createdAtFrom || filters.createdAtTo) {
      const range: any = {};
      if (filters.createdAtFrom) {
        const d = new Date(filters.createdAtFrom);
        if (!Number.isNaN(d.getTime())) range.$gte = d;
      }
      if (filters.createdAtTo) {
        const d = new Date(filters.createdAtTo);
        if (!Number.isNaN(d.getTime())) range.$lte = d;
      }
      if (Object.keys(range).length) and.push({ createdAt: range });
    }

    if (filters.sourceType && String(filters.sourceType).trim()) {
      and.push({ sourceType: String(filters.sourceType).trim() });
    }

    if (filters.importBatchId && String(filters.importBatchId).trim()) {
      and.push({ importBatchId: String(filters.importBatchId).trim() });
    }

    if (filters.chatworthyChatId && String(filters.chatworthyChatId).trim()) {
      and.push({ chatworthyChatId: String(filters.chatworthyChatId).trim() });
    }

    if (scope === 'recipes') {
      and.push({ docKind: 'recipe' });
    } else if (scope === 'notes') {
      and.push({ docKind: 'note' });
    }

    const mongoFilter: any = treatedAsWildcard ? {} : { $text: { $search: q } };
    if (and.length) mongoFilter.$and = and;

    if (treatedAsWildcard) {
      const total = await NoteModel.countDocuments(mongoFilter).exec();
      const docs = await NoteModel.find(mongoFilter)
        .sort({ contentUpdatedAt: -1, updatedAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec();

      const hits: SearchHitNoteV1[] = (docs ?? []).map((d: any) => ({
        targetType: 'note',
        id: String(d._id),
        subjectId: d.subjectId,
        topicId: d.topicId,
        title: d.title ?? 'Untitled',
        docKind: d.docKind,
        updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
      }));

      const response: SearchResponseV1 = { version: 1, total, hits };
      return res.json(response);
    }

    const pipeline: any[] = [
      { $match: mongoFilter },
      { $addFields: { score: { $meta: 'textScore' } } },
      { $sort: { score: -1 } },
      {
        $facet: {
          hits: [
            { $skip: offset },
            { $limit: limit },
            {
              $project: {
                title: 1,
                subjectId: 1,
                topicId: 1,
                docKind: 1,
                markdown: 1,
                updatedAt: 1,
                score: 1,
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [faceted] = await NoteModel.aggregate(pipeline).exec();
    const total = faceted?.total?.[0]?.count ?? 0;
    const docs = faceted?.hits ?? [];

    const terms = extractQueryTerms(q);

    const hits: SearchHitNoteV1[] = docs.map((d: any) => ({
      targetType: 'note',
      id: String(d._id),
      subjectId: d.subjectId,
      topicId: d.topicId,
      title: d.title ?? 'Untitled',
      docKind: d.docKind,
      snippet: buildSnippetAroundMatch(d.markdown ?? '', terms),
      score: typeof d.score === 'number' ? d.score : undefined,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
    }));

    const response: SearchResponseV1 = { version: 1, total, hits };
    return res.json(response);
  } catch (err) {
    return next(err);
  }
});

// Purpose: Admin-only semantic search debugging.
// Usage: Internal tooling/scripts only.
// Example: curl -H "x-chatalog-admin: $CHATALOG_ADMIN_TOKEN" "http://localhost:3000/api/v1/search/semantic?q=hello&limit=5"
/**
 * GET /api/search/semantic?q=...&limit=...
 *
 * Returns:
 * {
 *   query: string;
 *   limit: number;
 *   results: Array<{
 *     id: string;
 *     title: string;
 *     summary?: string;
 *     subjectId?: string;
 *     topicId?: string;
 *     updatedAt?: string;
 *     score: number;
 *   }>;
 * }
 */
searchRouter.get(
  '/semantic',
  requireAdminToken,
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.status(400).json({ error: 'q is required' });

    const limit = clampInt(req.query.limit, 1, 50, 20);

    // 1) Embed the query text
    const { vector: queryVector } = await embedText(q, { model: 'text-embedding-3-small' });

    // 2) Atlas vector search
    // IMPORTANT: Ensure you created an Atlas Search vector index with this name.
    const indexName = 'notes_vector_index';

    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: indexName,
          path: 'embedding',
          queryVector,
          numCandidates: Math.max(limit * 10, 100),
          limit,
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          summary: 1,
          subjectId: 1,
          topicId: 1,
          updatedAt: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
      { $sort: { score: -1 } },
    ];

    const docs = await NoteModel.aggregate(pipeline).exec();

    const results = (docs ?? []).map((d: any) => ({
      id: String(d._id),
      title: String(d.title ?? ''),
      summary: d.summary ? String(d.summary) : undefined,
      subjectId: d.subjectId ? String(d.subjectId) : undefined,
      topicId: d.topicId ? String(d.topicId) : undefined,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
      score: typeof d.score === 'number' ? d.score : Number(d.score ?? 0),
    }));

    return res.json({ query: q, limit, results });
  } catch (err) {
    return next(err);
  }
  },
);

// Purpose: Admin-only maintenance to populate missing contentUpdatedAt fields.
// Usage: Internal tooling/scripts only.
// Example: curl -X POST -H "x-chatalog-admin: $CHATALOG_ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"limit":100}' "http://localhost:3000/api/v1/search/contentUpdatedAt/backfill"
/**
 * POST /api/search/contentUpdatedAt/backfill
 *
 * Body (optional):
 * {
 *   limit?: number; // default 100
 * }
 *
 * Response:
 * {
 *   examined: number;
 *   updated: number;
 *   updatedIds: string[];
 * }
 */
searchRouter.post(
  '/contentUpdatedAt/backfill',
  requireAdminToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.body?.limit, 1, 500, 100);

      const docs = await NoteModel.find({ contentUpdatedAt: { $exists: false } })
        .select({ _id: 1, updatedAt: 1, createdAt: 1 })
        .limit(limit)
        .lean()
        .exec();

      let updated = 0;
      const updatedIds: string[] = [];

      for (const d of docs) {
        const v = (d as any).updatedAt ?? (d as any).createdAt ?? new Date();
        const r = await NoteModel.updateOne(
          { _id: d._id, contentUpdatedAt: { $exists: false } },
          { $set: { contentUpdatedAt: v } },
        ).exec();
        if (r.modifiedCount) {
          updated += 1;
          updatedIds.push(String(d._id));
        }
      }

      return res.json({ examined: docs.length, updated, updatedIds });
    } catch (err) {
      return next(err);
    }
  },
);

// Purpose: Admin-only maintenance to backfill or refresh embeddings.
// Usage: Internal tooling/scripts only.
// Example: curl -X POST -H "x-chatalog-admin: $CHATALOG_ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"limit":25,"force":false}' "http://localhost:3000/api/v1/search/embeddings/backfill"
/**
 * POST /api/search/embeddings/backfill
 *
 * Body (optional):
 * {
 *   limit?: number;               // default 50
 *   force?: boolean;              // default false (re-embed even if hash matches)
 *   model?: string;               // default "text-embedding-3-small"
 *   maxMarkdownChars?: number;    // default 8000
 * }
 *
 * Response:
 * {
 *   examined: number;
 *   updated: number;
 *   skipped: number;
 *   errors: number;
 *   updatedIds: string[];
 * }
 */
searchRouter.post(
  '/embeddings/backfill',
  requireAdminToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = clampInt(req.body?.limit, 1, 500, 50);
      const force = Boolean(req.body?.force ?? false);
      const model = String(req.body?.model ?? 'text-embedding-3-small');
      const maxMarkdownChars = clampInt(req.body?.maxMarkdownChars, 1000, 50000, 8000);

      // Phase 1: always prioritize notes missing embeddings entirely
      const missingEmbeddingFilter = {
        $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }],
      };

      let candidates = await NoteModel.find(missingEmbeddingFilter)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean()
        .exec();

      // Phase 2: if we didn't fill the batch, include "stale" notes
      if (candidates.length < limit) {
        const remaining = limit - candidates.length;

        const staleFilter = {
          $and: [
            { embedding: { $exists: true, $ne: [] } },
            { embeddingTextHash: { $exists: true } },
            { embeddingUpdatedAt: { $exists: true } },
            { $expr: { $lt: ['$embeddingUpdatedAt', '$updatedAt'] } },
          ],
        };

        const more = await NoteModel.find(staleFilter)
          .sort({ updatedAt: -1 })
          .limit(remaining)
          .lean()
          .exec();

        candidates = candidates.concat(more);
      }

      let examined = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      const updatedIds: string[] = [];
      const errorSamples: Array<{ noteId: string; message: string }> = [];

      let stoppedDueToRateLimit = false;
      let retryAfterSeconds: number | undefined = undefined;

      for (const note of candidates) {
        examined += 1;

        try {
          const { text, hash } = computeEmbeddingTextAndHash(note, {
            includeMarkdown: true,
            maxMarkdownChars,
            includeSummary: true,
            includeTags: true,
            includeRecipe: true,
          });

          const hasEmbedding = Array.isArray(note.embedding) && note.embedding.length > 0;
          const hashMatches = Boolean(note.embeddingTextHash) && note.embeddingTextHash === hash;

          if (!force && hasEmbedding && hashMatches) {
            // This note may have been selected because embeddingUpdatedAt < updatedAt,
            // even though the actual embedded text hasn't changed. Mark it "fresh"
            // so we don't keep re-processing it forever.
            await NoteModel.updateOne(
              { _id: note._id },
              { $set: { embeddingUpdatedAt: new Date() } },
            ).exec();

            skipped += 1;
            continue;
          }

          if (!text || text.length < 10) {
            skipped += 1;
            continue;
          }

          const { vector, model: usedModel } = await embedText(text, { model });

          await NoteModel.updateOne(
            { _id: note._id },
            {
              $set: {
                embedding: vector,
                embeddingModel: usedModel,
                embeddingTextHash: hash,
                embeddingUpdatedAt: new Date(),
              },
            },
          ).exec();

          updated += 1;
          updatedIds.push(String(note._id));
        } catch (e) {
          errors += 1;
          const msg =
            e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);

          if (errorSamples.length < 5) {
            errorSamples.push({ noteId: String(note?._id ?? 'unknown'), message: msg });
          }

          // eslint-disable-next-line no-console
          console.error('[embeddings/backfill] failed for note', note?._id, e);

          // If OpenAI says 429 or quota exhausted, stop immediately.
          if (isOpenAI429(e)) {
            stoppedDueToRateLimit = true;
            retryAfterSeconds = parseRetryAfterSeconds(e) ?? retryAfterSeconds;
            break;
          }
        }
      }

      return res.json({
        examined,
        updated,
        skipped,
        errors,
        updatedIds,
        errorSamples,
        stoppedDueToRateLimit,
        retryAfterSeconds,
      });
    } catch (err) {
      return next(err);
    }
  },
);

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseRetryAfterSeconds(err: any): number | undefined {
  const h = err?.headers;
  const ra = h?.['retry-after'] ?? h?.['Retry-After'];
  if (!ra) return undefined;

  const n = Number(ra);
  if (Number.isFinite(n) && n > 0) return n;

  // retry-after can sometimes be HTTP date; ignore for now
  return undefined;
}

function isOpenAI429(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  if (status === 429) return true;

  // OpenAI SDK includes .code/.type on some errors
  const code = err?.code ?? err?.error?.code;
  const type = err?.type ?? err?.error?.type;

  return code === 'insufficient_quota' || type === 'insufficient_quota';
}
