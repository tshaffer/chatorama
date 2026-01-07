import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { NoteModel } from '../models/Note';
import { computeEmbeddingTextAndHash } from '../ai/embeddingText';
import { embedText } from '../ai/embed';
import type {
  SearchRequestV1,
  SearchResponseV1,
  SearchHitNoteV1,
} from '@chatorama/chatalog-shared';

export const searchRouter = Router();

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
    const body = req.body as Partial<SearchRequestV1>;

    if (body.version !== 1) {
      return res.status(400).json({ error: 'Unsupported search request version' });
    }

    const q = (body.q ?? '').trim();
    if (!q) {
      const empty: SearchResponseV1 = { version: 1, hits: [] };
      return res.json(empty);
    }

    const targetTypes = body.targetTypes ?? [];
    if (!Array.isArray(targetTypes) || !targetTypes.includes('note')) {
      return res.status(400).json({ error: 'Search v1 supports targetTypes: [note]' });
    }

    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);
    const offset = Math.max(body.offset ?? 0, 0);

    const filters = body.filters ?? {};
    const mongoFilter: any = {
      $text: { $search: q },
    };
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

    if (and.length) mongoFilter.$and = and;

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
searchRouter.get('/semantic', async (req: Request, res: Response, next: NextFunction) => {
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
});

/**
 * GET /api/search/hybrid?q=...&limit=...&mode=auto|hybrid|semantic|keyword
 *
 * Response:
 * {
 *   query: string;
 *   mode: "auto"|"hybrid"|"semantic"|"keyword";
 *   limit: number;
 *   results: Array<{
 *     id: string;
 *     title: string;
 *     summary?: string;
 *     subjectId?: string;
 *     topicId?: string;
 *     updatedAt?: string;
 *     score: number; // semantic => semanticScore, keyword => textScore, hybrid/auto => fused
 *     semanticScore?: number;
 *     textScore?: number;
 *     sources: Array<"semantic"|"keyword">;
 *   }>;
 * }
 */
const hybridSearchHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawQ = String(req.query.q ?? '').trim();
    const q = rawQ;
    const isMatchAll = q === '*' || q === '';

    const limit = clampInt(req.query.limit, 1, 50, 20);
    const modeRaw = String(req.query.mode ?? 'auto').toLowerCase();
    const mode =
      modeRaw === 'semantic' || modeRaw === 'keyword' || modeRaw === 'hybrid' ? modeRaw : 'auto';

    const minSemanticScoreParam = parseMinSemanticScore((req.query as any).minSemanticScore);
    const defaultMinSemanticScore =
      mode === 'semantic' ? 0.7 : mode === 'hybrid' || mode === 'auto' ? 0.55 : undefined;
    const minSemanticScore =
      minSemanticScoreParam !== undefined ? minSemanticScoreParam : defaultMinSemanticScore;

    const { atlasFilter, postFilter, combinedFilter } = buildNoteFilterFromQuery(req.query);

    if (isMatchAll && atlasFilter.recipe?.$exists === true) {
      const docs = await NoteModel.find(combinedFilter)
        .sort({ contentUpdatedAt: -1, updatedAt: -1 })
        .limit(limit)
        .lean()
        .exec();

      const results = (docs ?? []).map((d: any) => ({
        id: String(d._id),
        title: String(d.title ?? ''),
        summary: d.summary ? String(d.summary) : undefined,
        snippet: undefined,
        subjectId: d.subjectId ? String(d.subjectId) : undefined,
        topicId: d.topicId ? String(d.topicId) : undefined,
        updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
        score: 0,
        semanticScore: undefined,
        textScore: undefined,
        sources: ['browse'],
      }));

      return res.json({
        query: q,
        mode: mode as any,
        limit,
        filters: {
          ...combinedFilter,
          ...(minSemanticScore !== undefined ? { minSemanticScore } : {}),
        },
        results,
      });
    }

    if (!q) return res.status(400).json({ error: 'q is required' });

    const runSemantic = mode === 'semantic' || mode === 'hybrid' || mode === 'auto';
    const runKeyword = mode === 'keyword' || mode === 'hybrid' || mode === 'auto';

    const semanticLimit = runSemantic ? limit : 0;
    const keywordLimit = runKeyword ? limit : 0;

    // Kick off in parallel where possible
    const [semantic, keyword] = await Promise.all([
      runSemantic
        ? semanticSearchNotes(q, semanticLimit, atlasFilter, postFilter)
        : Promise.resolve([]),
      runKeyword ? keywordSearchNotes(q, keywordLimit, combinedFilter) : Promise.resolve([]),
    ]);

    let semanticResults = semantic;
    if (runSemantic && minSemanticScore !== undefined) {
      semanticResults = semanticResults.filter((r) => (r.semanticScore ?? 0) >= minSemanticScore);
    }

    let results: any[];

    if (mode === 'semantic') {
      results = toSemanticOnlyResults(semanticResults, limit);
    } else if (mode === 'keyword') {
      results = toKeywordOnlyResults(keyword, limit);
    } else {
      // hybrid/auto: RRF fusion + raw-score explainability
      results = fuseByRRF(semanticResults, keyword, limit);
    }

    return res.json({
      query: q,
      mode: mode as any,
      limit,
      filters: {
        ...combinedFilter,
        ...(minSemanticScore !== undefined ? { minSemanticScore } : {}),
      },
      results,
    });
  } catch (err) {
    next(err);
  }
};

// Stable endpoint for the UI:
searchRouter.get('/', hybridSearchHandler);

// Back-compat alias (optional but helpful to keep):
searchRouter.get('/hybrid', hybridSearchHandler);

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

function clampIntOpt(value: any, min: number, max: number): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseMinSemanticScore(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

type SearchHit = {
  id: string;
  title: string;
  summary?: string;
  snippet?: string;
  subjectId?: string;
  topicId?: string;
  updatedAt?: string;

  _source: 'semantic' | 'keyword';
  // Raw source scores (not normalized, used for explainability)
  semanticScore?: number; // from $meta: vectorSearchScore
  textScore?: number; // from $meta: textScore
};

async function semanticSearchNotes(
  q: string,
  limit: number,
  atlasFilter: Record<string, any>,
  postFilter?: Record<string, any>,
): Promise<SearchHit[]> {
  if (limit <= 0) return [];

  const { vector: queryVector } = await embedText(q, { model: 'text-embedding-3-small' });

  const indexName = 'notes_vector_index';

  const vectorStage: any = {
    index: indexName,
    path: 'embedding',
    queryVector,
    numCandidates: Math.max(limit * 10, 100),
    limit,
  };

  if (isNonEmptyFilter(atlasFilter)) {
    // Pre-filter documents for vector search.
    vectorStage.filter = atlasFilter;
  }

  const pipeline: any[] = [
    { $vectorSearch: vectorStage },
    ...(isNonEmptyFilter(postFilter) ? [{ $match: postFilter }] : []),
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

  return (docs ?? []).map((d: any) => ({
    id: String(d._id),
    title: String(d.title ?? ''),
    summary: d.summary ? String(d.summary) : undefined,
    subjectId: d.subjectId ? String(d.subjectId) : undefined,
    topicId: d.topicId ? String(d.topicId) : undefined,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
    _source: 'semantic',
    semanticScore: typeof d.score === 'number' ? d.score : Number(d.score ?? 0),
  }));
}

async function keywordSearchNotes(
  q: string,
  limit: number,
  filter: Record<string, any>,
): Promise<SearchHit[]> {
  if (limit <= 0) return [];
  const tokens = tokenizeQuery(q);

  // MongoDB text search. Requires the text index already defined on NoteSchema.
  const docs = await NoteModel.find(
    { $text: { $search: q }, ...(isNonEmptyFilter(filter) ? filter : {}) },
    {
      score: { $meta: 'textScore' },
      title: 1,
      summary: 1,
      markdown: 1,
      subjectId: 1,
      topicId: 1,
      updatedAt: 1,
    },
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean()
    .exec();

  return (docs ?? []).map((d: any) => ({
    id: String(d._id),
    title: String(d.title ?? ''),
    summary: d.summary ? String(d.summary) : undefined,
    snippet: makeKeywordSnippet(d.markdown, tokens),
    subjectId: d.subjectId ? String(d.subjectId) : undefined,
    topicId: d.topicId ? String(d.topicId) : undefined,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
    _source: 'keyword',
    textScore:
      typeof (d as any).score === 'number'
        ? (d as any).score
        : Number((d as any).score ?? 0),
  }));
}

function toSemanticOnlyResults(hits: SearchHit[], limit: number) {
  return hits.slice(0, limit).map((h) => ({
    id: h.id,
    title: h.title,
    summary: h.summary,
    subjectId: h.subjectId,
    topicId: h.topicId,
    updatedAt: h.updatedAt,
    score: h.semanticScore ?? 0,
    semanticScore: h.semanticScore,
    textScore: undefined,
    sources: ['semantic'] as Array<'semantic' | 'keyword'>,
  }));
}

function toKeywordOnlyResults(hits: SearchHit[], limit: number) {
  return hits.slice(0, limit).map((h) => ({
    id: h.id,
    title: h.title,
    summary: h.summary,
    snippet: h.snippet,
    subjectId: h.subjectId,
    topicId: h.topicId,
    updatedAt: h.updatedAt,
    score: h.textScore ?? 0,
    semanticScore: undefined,
    textScore: h.textScore,
    sources: ['keyword'] as Array<'semantic' | 'keyword'>,
  }));
}

function buildNoteFilterFromQuery(query: any): {
  atlasFilter: Record<string, any>;
  postFilter: Record<string, any>;
  combinedFilter: Record<string, any>;
} {
  const atlasFilter: Record<string, any> = {};
  const postFilter: Record<string, any> = {};

  const scope = String(query.scope ?? '').trim().toLowerCase();
  if (scope === 'recipes') {
    atlasFilter.recipe = { $exists: true };
  } else if (scope === 'notes') {
    atlasFilter.recipe = { $exists: false };
  }

  const subjectId = String(query.subjectId ?? '').trim();
  if (subjectId) atlasFilter.subjectId = subjectId;

  const topicId = String(query.topicId ?? '').trim();
  if (topicId) atlasFilter.topicId = topicId;

  // tags=tag1,tag2,tag3  => match ANY tag
  const tagsRaw = String(query.tags ?? '').trim();
  if (tagsRaw) {
    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (tags.length) atlasFilter.tags = { $in: tags };
  }

  const maxPrepMinutes = clampIntOpt(query.maxPrepMinutes, 0, 72460);
  if (maxPrepMinutes != null) {
    atlasFilter['recipe.prepTimeMinutes'] = { $lte: maxPrepMinutes };
  }

  const maxCookMinutes = clampIntOpt(query.maxCookMinutes, 0, 72460);
  if (maxCookMinutes != null) {
    atlasFilter['recipe.cookTimeMinutes'] = { $lte: maxCookMinutes };
  }

  const maxTotalMinutes = clampIntOpt(query.maxTotalMinutes, 0, 72460);
  if (maxTotalMinutes != null) {
    atlasFilter['recipe.totalTimeMinutes'] = { $lte: maxTotalMinutes };
  }

  const cuisine = String(query.cuisine ?? '').trim();
  if (cuisine) {
    atlasFilter['recipe.cuisine'] = eqFilter(cuisine);
  }

  const category = String(query.category ?? '').trim();
  if (category) {
    atlasFilter['recipe.category'] = inFilter([category]);
  }

  const keyword = String(query.keyword ?? '').trim();
  if (keyword) {
    atlasFilter['recipe.keywords'] = inFilter([keyword]);
  }

  const includeTokens = splitAndDedupTokens(query.includeIngredients);
  const excludeTokens = splitAndDedupTokens(query.excludeIngredients);

  if (includeTokens.length) {
    const includeClauses = includeTokens.map((t) => buildIngredientsFilter(t));
    postFilter.$and = [
      ...(Array.isArray(postFilter.$and) ? postFilter.$and : []),
      ...includeClauses,
    ];
  }

  if (excludeTokens.length) {
    atlasFilter.$and = [
      ...(Array.isArray(atlasFilter.$and) ? atlasFilter.$and : []),
      { 'recipe.ingredientsRaw': { $nin: excludeTokens } },
    ];
  }

  const combinedFilter = mergeFilters(atlasFilter, postFilter);
  return { atlasFilter, postFilter, combinedFilter };
}

function isNonEmptyFilter(filter: Record<string, any> | undefined | null): boolean {
  return !!filter && Object.keys(filter).length > 0;
}

function splitAndDedupTokens(raw: unknown): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  const parts = s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return parts.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryRegex(token: string): RegExp {
  const e = escapeRegex(token);
  const pattern = token.length >= 3 ? `\\b${e}\\b` : e;
  return new RegExp(pattern, 'i');
}

function buildIngredientsFilter(token: string) {
  const re = wordBoundaryRegex(token);
  const clause = { $regex: re };
  return {
    $or: [
      { 'recipe.ingredientsEditedRaw': { $elemMatch: clause } },
      { 'recipe.ingredientsRaw': { $elemMatch: clause } },
      { 'recipe.ingredientsEdited.name': clause },
      { 'recipe.ingredients.name': clause },
      { 'recipe.ingredientsEdited.raw': clause },
      { 'recipe.ingredients.raw': clause },
    ],
  };
}

function eqFilter(v: string) {
  return { $eq: v };
}

function inFilter(vals: string[]) {
  return { $in: vals };
}

function mergeFilters(atlasFilter: Record<string, any>, postFilter: Record<string, any>) {
  const hasAtlas = isNonEmptyFilter(atlasFilter);
  const hasPost = isNonEmptyFilter(postFilter);
  if (hasAtlas && hasPost) return { $and: [atlasFilter, postFilter] };
  if (hasAtlas) return atlasFilter;
  if (hasPost) return postFilter;
  return {};
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenizeQuery(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Returns a short snippet around the first match of any token.
 * - tokens should be normalized lowercase strings (already parsed)
 * - uses word-boundary-ish matching for tokens >= 3 chars
 */
function makeKeywordSnippet(markdown: string, tokens: string[], maxLen = 200): string | undefined {
  const text = String(markdown ?? '');
  if (!text || tokens.length === 0) return undefined;

  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;

  const patterns = tokens
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => {
      const e = escapeRegExp(t);
      return t.length >= 3 ? `\\b${e}\\b` : e;
    });

  if (patterns.length === 0) return undefined;

  const re = new RegExp(patterns.join('|'), 'i');
  const m = re.exec(cleaned);
  if (!m || m.index == null) return undefined;

  const hitStart = m.index;
  const hitEnd = hitStart + (m[0]?.length ?? 0);

  const context = Math.floor((maxLen - (hitEnd - hitStart)) / 2);
  const start = Math.max(0, hitStart - context);
  const end = Math.min(cleaned.length, hitEnd + context);

  let snippet = cleaned.slice(start, end).trim();

  if (start > 0) snippet = `…${snippet}`;
  if (end < cleaned.length) snippet = `${snippet}…`;

  return snippet;
}

/**
 * Reciprocal Rank Fusion (RRF):
 * - For each list, each item gets score += weight / (k + rank)
 * - Merge by id and keep union of sources
 *
 * This is simple, robust, and works well without needing to normalize different score types.
 */
function fuseByRRF(semantic: SearchHit[], keyword: SearchHit[], limit: number) {
  const k = 60; // common RRF constant
  const wSemantic = 1.0; // tune later if desired
  const wKeyword = 1.0; // tune later if desired

  const map = new Map<
    string,
    {
      id: string;
      title: string;
      summary?: string;
      subjectId?: string;
      topicId?: string;
      updatedAt?: string;
      score: number;
      semanticScore?: number;
      textScore?: number;
      snippet?: string;
      sources: Set<'semantic' | 'keyword'>;
    }
  >();

  function addList(list: SearchHit[], weight: number) {
    for (let i = 0; i < list.length; i += 1) {
      const hit = list[i];
      const rank = i + 1;
      const delta = weight / (k + rank);

      const existing = map.get(hit.id);
      if (existing) {
        existing.score += delta;
        existing.sources.add(hit._source);
        if (hit.semanticScore != null) {
          existing.semanticScore = existing.semanticScore ?? hit.semanticScore;
        }
        if (hit.textScore != null) {
          existing.textScore = existing.textScore ?? hit.textScore;
        }
        if (hit.snippet) {
          existing.snippet = existing.snippet ?? hit.snippet;
        }
        // Keep first non-empty fields
        if (!existing.title && hit.title) existing.title = hit.title;
        if (!existing.summary && hit.summary) existing.summary = hit.summary;
        if (!existing.subjectId && hit.subjectId) existing.subjectId = hit.subjectId;
        if (!existing.topicId && hit.topicId) existing.topicId = hit.topicId;
        if (!existing.updatedAt && hit.updatedAt) existing.updatedAt = hit.updatedAt;
      } else {
        map.set(hit.id, {
          id: hit.id,
          title: hit.title,
          summary: hit.summary,
          subjectId: hit.subjectId,
          topicId: hit.topicId,
          updatedAt: hit.updatedAt,
          score: delta,
          semanticScore: hit.semanticScore,
          textScore: hit.textScore,
          snippet: hit.snippet,
          sources: new Set([hit._source]),
        });
      }
    }
  }

  addList(semantic, wSemantic);
  addList(keyword, wKeyword);

  const fused = Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({
      id: x.id,
      title: x.title,
      summary: x.summary,
      subjectId: x.subjectId,
      topicId: x.topicId,
      updatedAt: x.updatedAt,
      score: x.score,
      semanticScore: x.semanticScore,
      textScore: x.textScore,
      snippet: x.snippet,
      sources: Array.from(x.sources),
    }));

  return fused;
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
