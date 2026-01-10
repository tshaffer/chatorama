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
import { buildSearchSpec } from '@chatorama/chatalog-shared';
import {
  buildIngredientFilterForSource,
  buildNoteFilterFromSpec,
  isNonEmptyFilter,
  splitAndDedupTokens,
} from '../utils/search/noteFilters';
import { buildSearchPipeline } from '../search/buildSearchPipeline';

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

function resolveSearchIntentFromSpec(spec: SearchSpec): {
  mode: 'browse' | 'semantic';
  normalizedQuery: string;
  queryText: string | null;
  scope: SearchSpec['scope'];
  filters: SearchSpec['filters'];
  sort: 'relevance' | 'recent';
  debug: { isEmptyQuery: boolean; treatedAsWildcard: boolean };
} {
  const normalizedQuery = String(spec.query ?? '').trim();
  const isEmptyQuery = normalizedQuery.length === 0;
  const treatedAsWildcard = isEmptyQuery || normalizedQuery === '*';

  const mode = treatedAsWildcard ? 'browse' : 'semantic';

  const lastUsedScopeRaw = String(spec.lastUsedScope ?? '').trim().toLowerCase();
  const lastUsedScope =
    lastUsedScopeRaw === 'all' || lastUsedScopeRaw === 'notes' || lastUsedScopeRaw === 'recipes'
      ? lastUsedScopeRaw
      : undefined;

  const scope = spec.scope ?? (treatedAsWildcard ? (lastUsedScope ?? 'all') : 'all');

  const sort: 'relevance' | 'recent' = mode === 'browse' ? 'recent' : 'relevance';

  return {
    mode,
    normalizedQuery,
    queryText: mode === 'browse' ? null : normalizedQuery,
    scope,
    filters: spec.filters ?? {},
    sort,
    debug: { isEmptyQuery, treatedAsWildcard },
  };
}

searchRouter.post('/', async (req, res, next) => {
  try {
    const body = req.body as Partial<SearchRequestV1>;

    if (body.version !== 1) {
      return res.status(400).json({ error: 'Unsupported search request version' });
    }

    const q = (body.q ?? '').trim();
    const treatedAsWildcard = q === '' || q === '*';
    const scopeRaw = String(body.scope ?? '').trim().toLowerCase();
    const scope =
      scopeRaw === 'all' || scopeRaw === 'notes' || scopeRaw === 'recipes' ? scopeRaw : undefined;

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
      and.push({ recipe: { $exists: true } });
    } else if (scope === 'notes') {
      and.push({ recipe: { $exists: false } });
    } else if (treatedAsWildcard) {
      const lastUsedScopeRaw = String(body.lastUsedScope ?? '').trim().toLowerCase();
      if (lastUsedScopeRaw === 'recipes') {
        and.push({ recipe: { $exists: true } });
      } else if (lastUsedScopeRaw === 'notes') {
        and.push({ recipe: { $exists: false } });
      }
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
    const baseSpec = buildSearchSpec({ ...(req.query as any), query: req.query.q });
    const rawScope = String(req.query.scope ?? '').trim().toLowerCase();
    const explicitScope =
      rawScope === 'recipes' || rawScope === 'notes' || rawScope === 'all' ? rawScope : undefined;
    const lastUsedScopeRaw = String(req.query.lastUsedScope ?? '').trim().toLowerCase();
    const lastUsedScope: SearchSpec['scope'] | undefined =
      lastUsedScopeRaw === 'recipes' || lastUsedScopeRaw === 'notes' || lastUsedScopeRaw === 'all'
        ? lastUsedScopeRaw
        : undefined;
    const specForIntent = {
      ...baseSpec,
      scope: explicitScope ?? baseSpec.scope,
      lastUsedScope,
    };
    const intent = resolveSearchIntentFromSpec(specForIntent);
    const q = intent.normalizedQuery;

    const limit = baseSpec.limit;
    const mode = baseSpec.mode;

    const scope = intent.scope;
    const spec: SearchSpec = { ...baseSpec, scope };
    const minSemanticScoreParam = parseMinSemanticScore((req.query as any).minSemanticScore);

    const defaultMinSemanticScore =
      scope === 'recipes'
        ? mode === 'semantic'
          ? 0.45
          : mode === 'hybrid' || mode === 'auto'
            ? 0.35
            : undefined
        : mode === 'semantic'
          ? 0.7
          : mode === 'hybrid' || mode === 'auto'
            ? 0.55
            : undefined;
    const minSemanticScore =
      minSemanticScoreParam !== undefined ? minSemanticScoreParam : defaultMinSemanticScore;
    const includeTokens = splitAndDedupTokens(spec.filters.includeIngredients);
    const excludeTokens = splitAndDedupTokens(spec.filters.excludeIngredients);

    let ingredientSource: 'normalized' | 'raw' | null = null;
    if (scope === 'recipes' && (includeTokens.length || excludeTokens.length)) {
      const hasNormalized = await NoteModel.exists({ 'recipe.ingredients.0': { $exists: true } });
      if (hasNormalized) ingredientSource = 'normalized';
      else {
        const hasRaw = await NoteModel.exists({ 'recipe.ingredientsRaw.0': { $exists: true } });
        if (hasRaw) ingredientSource = 'raw';
      }

      if (!ingredientSource) {
        return res.json({
          query: q,
          mode: mode as any,
          limit,
          filters: {
            scope,
            includeIngredients: includeTokens,
            excludeIngredients: excludeTokens,
            ...(minSemanticScore !== undefined ? { minSemanticScore } : {}),
          },
          results: [],
        });
      }
    }

    const ingredientFilter =
      ingredientSource && (includeTokens.length || excludeTokens.length)
        ? buildIngredientFilterForSource(ingredientSource, includeTokens, excludeTokens)
        : undefined;

    const { atlasFilter, postFilter, combinedFilter } = buildNoteFilterFromSpec(
      spec,
      ingredientFilter,
    );

    if (intent.mode === 'browse') {
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
        mode: 'browse',
        limit,
        filters: {
          ...combinedFilter,
        },
        intent,
        results,
      });
    }

    const runSemantic = mode === 'semantic' || mode === 'hybrid' || mode === 'auto';
    const runKeyword = mode === 'keyword' || mode === 'hybrid' || mode === 'auto';

    const semanticLimit = runSemantic ? limit : 0;
    const keywordLimit = runKeyword ? limit : 0;

    // Kick off in parallel where possible
    const semanticSpec: SearchSpec = { ...spec, limit: semanticLimit };
    const keywordSpec: SearchSpec = { ...spec, limit: keywordLimit };

    const isHybridMode = mode === 'hybrid';
    const explainRequested = String(req.query.explain ?? '') === '1';
    const explain = isHybridMode && explainRequested;
    const totalStart = Date.now();
    let semanticMs = 0;
    let keywordMs = 0;
    let fuseMs = 0;
    const semanticDebug: SemanticDebugInfo | undefined = isHybridMode
      ? { attempted: false, ok: false }
      : undefined;
    if (semanticDebug && !runSemantic) {
      semanticDebug.reason = 'disabled';
    }
    let semanticRawCount = 0;

    const [semantic, keyword] = await Promise.all([
      runSemantic
        ? (async () => {
          const start = Date.now();
          if (semanticDebug) semanticDebug.attempted = true;
          try {
            const hits = await semanticSearchNotes(semanticSpec, ingredientFilter);
            semanticMs = Date.now() - start;
            if (semanticDebug) semanticDebug.ok = true;
            semanticRawCount = hits.length;
            if (semanticDebug) semanticDebug.rawCount = hits.length;
            return hits;
          } catch (err) {
            semanticMs = Date.now() - start;
            if (semanticDebug) {
              semanticDebug.ok = false;
              const mapped = mapSemanticError(err);
              semanticDebug.reason = mapped.reason;
              semanticDebug.errorMessage = mapped.errorMessage;
            }
            return [];
          }
        })()
        : Promise.resolve([]),
      runKeyword
        ? (async () => {
          const start = Date.now();
          const hits = await keywordSearchNotes(keywordSpec, ingredientFilter);
          keywordMs = Date.now() - start;
          return hits;
        })()
        : Promise.resolve([]),
    ]);

    let semanticResults = semantic;
    if (runSemantic && minSemanticScore !== undefined) {
      semanticResults = semanticResults.filter((r) => (r.semanticScore ?? 0) >= minSemanticScore);
    }
    if (semanticDebug) {
      semanticDebug.minSemanticScore = minSemanticScore;
      semanticDebug.postFilterCount = semanticResults.length;
    }
    const keywordRankById = explain
      ? new Map(keyword.map((hit, idx) => [hit.id, idx + 1]))
      : undefined;
    const semanticRankById = explain
      ? new Map(semanticResults.map((hit, idx) => [hit.id, idx + 1]))
      : undefined;
    if (semanticDebug && semanticDebug.attempted && semanticDebug.ok && !semanticDebug.reason) {
      if (semanticResults.length === 0) {
        const rawCount = semanticDebug.rawCount ?? 0;

        if (rawCount > 0 && minSemanticScore !== undefined) {
          semanticDebug.reason = 'filtered_to_zero';
        } else {
          const hasEmbeddings = await hasEmbeddingDocs(combinedFilter, scope);
          semanticDebug.reason = hasEmbeddings ? 'no_results' : 'missing_embedding_field';
        }
      }
    }

    let results: any[];

    if (mode === 'semantic') {
      results = toSemanticOnlyResults(semanticResults, limit);
    } else if (mode === 'keyword') {
      results = toKeywordOnlyResults(keyword, limit);
    } else {
      const fuseStart = Date.now();
      // hybrid/auto: RRF fusion + raw-score explainability
      results = fuseByRRF(semanticResults, keyword, limit, {
        explain,
        keywordRankById,
        semanticRankById,
      });
      fuseMs = Date.now() - fuseStart;
    }

    const overlapCount = (() => {
      if (!isHybridMode) return 0;
      const semanticIds = new Set(semanticResults.map((r) => r.id));
      let overlap = 0;
      for (const r of keyword) {
        if (semanticIds.has(r.id)) overlap += 1;
      }
      return overlap;
    })();

    const debug =
      isHybridMode
        ? {
          fusion: 'rrf' as const,
          minSemanticScore,
          semanticCount: semanticResults.length,
          keywordCount: keyword.length,
          overlapCount,
          fusedCount: results.length,
          returnedCount: Math.min(results.length, limit),
          timingsMs: {
            semantic: semanticMs,
            keyword: keywordMs,
            fuse: fuseMs,
            total: Date.now() - totalStart,
          },
          semantic: semanticDebug,
        }
        : undefined;

    return res.json({
      query: q,
      mode: mode as any,
      limit,
      filters: {
        ...combinedFilter,
        ...(minSemanticScore !== undefined ? { minSemanticScore } : {}),
      },
      intent,
      results,
      ...(debug ? { debug } : {}),
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

function parseMinSemanticScore(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

const NOTES_VECTOR_INDEX_NAME = 'notes_vector_index';
const NOTES_VECTOR_PATH = 'embedding';

// Atlas index name is the same; it contains BOTH vector fields now.
const RECIPES_VECTOR_INDEX_NAME = 'notes_vector_index';
const RECIPES_VECTOR_PATH = 'recipeEmbedding';

type SemanticDebugReason =
  | 'disabled'
  | 'not_configured'
  | 'missing_index'
  | 'missing_embedding_field'
  | 'filtered_to_zero'
  | 'no_results'
  | 'error';

type SemanticDebugInfo = {
  attempted: boolean;
  ok: boolean;
  reason?: SemanticDebugReason;
  errorMessage?: string;
  rawCount?: number;
  postFilterCount?: number;
  minSemanticScore?: number;
};

function truncateErrorMessage(message: string, maxLen = 300): string {
  if (!message) return '';
  if (message.length <= maxLen) return message;
  const trimmed = maxLen > 3 ? maxLen - 3 : maxLen;
  return `${message.slice(0, trimmed)}...`;
}

function mapSemanticError(err: unknown): { reason: SemanticDebugReason; errorMessage: string } {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? '');
  const normalized = message.toLowerCase();
  const missingIndexHints =
    (normalized.includes('search index') &&
      (normalized.includes('not found') || normalized.includes('does not exist'))) ||
    normalized.includes('search index not found') ||
    (normalized.includes('index') && normalized.includes('not found'));
  if (missingIndexHints) {
    return { reason: 'missing_index', errorMessage: truncateErrorMessage(message) };
  }

  const missingEmbeddingHints =
    normalized.includes('embedding') &&
    normalized.includes('path') &&
    (normalized.includes('missing') || normalized.includes('does not exist'));
  if (missingEmbeddingHints) {
    return { reason: 'missing_embedding_field', errorMessage: truncateErrorMessage(message) };
  }

  return { reason: 'error', errorMessage: truncateErrorMessage(message) };
}

async function hasEmbeddingDocs(filter: Record<string, any>, scope: string): Promise<boolean> {
  const notesClause = { [NOTES_VECTOR_PATH]: { $exists: true, $ne: [] } };
  const recipesClause = { [RECIPES_VECTOR_PATH]: { $exists: true, $ne: [] } };
  const embeddingClause =
    scope === 'all' ? { $or: [notesClause, recipesClause] } : scope === 'recipes' ? recipesClause : notesClause;
  const query = isNonEmptyFilter(filter) ? { $and: [filter, embeddingClause] } : embeddingClause;
  const exists = await NoteModel.exists(query);
  return Boolean(exists);
}

type SearchHit = {
  id: string;
  title: string;
  summary?: string;
  snippet?: string;
  subjectId?: string;
  topicId?: string;
  updatedAt?: string;
  docKind: string;

  _source: 'semantic' | 'keyword';
  // Raw source scores (not normalized, used for explainability)
  semanticScore?: number; // from $meta: vectorSearchScore
  textScore?: number; // from $meta: textScore
};

async function semanticSearchNotes(
  spec: SearchSpec,
  ingredientFilter?: Record<string, any>,
): Promise<SearchHit[]> {
  if (spec.limit <= 0) return [];

  const { vector: queryVector } = await embedText(spec.query, { model: 'text-embedding-3-small' });

  const runVectorSearch = async (
    scope: 'notes' | 'recipes',
    limit: number,
    postFilter?: Record<string, any>,
  ) => {
    const indexName = scope === 'recipes' ? RECIPES_VECTOR_INDEX_NAME : NOTES_VECTOR_INDEX_NAME;
    const vectorPath = scope === 'recipes' ? RECIPES_VECTOR_PATH : NOTES_VECTOR_PATH;
    const vectorStage: any = {
      index: indexName,
      path: vectorPath,
      queryVector,
      numCandidates: Math.max(limit * 10, 100),
      limit,
    };

    const pipeline = buildSearchPipeline(
      { ...spec, scope, limit },
      { vectorStage, ingredientFilter: postFilter },
    );

    const docs = await NoteModel.aggregate(pipeline).exec();

    return (docs ?? []).map((d: any) => ({
      id: String(d._id),
      title: String(d.title ?? ''),
      summary: d.summary ? String(d.summary) : undefined,
      subjectId: d.subjectId ? String(d.subjectId) : undefined,
      topicId: d.topicId ? String(d.topicId) : undefined,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
      _source: 'semantic' as const,
      docKind: d.docKind,
      semanticScore: typeof d.score === 'number' ? d.score : Number(d.score ?? 0),
    }));
  };

  if (spec.scope === 'notes') {
    return runVectorSearch('notes', spec.limit);
  }

  if (spec.scope === 'recipes') {
    return runVectorSearch('recipes', spec.limit, ingredientFilter);
  }

  const perScopeLimit = Math.max(spec.limit * 2, spec.limit);
  const [noteHits, recipeHits] = await Promise.all([
    runVectorSearch('notes', perScopeLimit),
    runVectorSearch('recipes', perScopeLimit, ingredientFilter),
  ]);

  const merged = new Map<string, SearchHit>();
  for (const hit of [...noteHits, ...recipeHits]) {
    const existing = merged.get(hit.id);
    if (!existing || (hit.semanticScore ?? 0) > (existing.semanticScore ?? 0)) {
      merged.set(hit.id, hit);
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => (b.semanticScore ?? 0) - (a.semanticScore ?? 0))
    .slice(0, spec.limit);
}

async function keywordSearchNotes(
  spec: SearchSpec,
  ingredientFilter?: Record<string, any>,
): Promise<SearchHit[]> {
  if (spec.limit <= 0) return [];
  const tokens = tokenizeQuery(spec.query);

  const pipeline = buildSearchPipeline(spec, { ingredientFilter, includeMarkdown: true });

  const docs = await NoteModel.aggregate(pipeline).exec();

  return (docs ?? []).map((d: any) => ({
    id: String(d._id),
    title: String(d.title ?? ''),
    summary: d.summary ? String(d.summary) : undefined,
    snippet: makeKeywordSnippet(d.markdown, tokens),
    subjectId: d.subjectId ? String(d.subjectId) : undefined,
    topicId: d.topicId ? String(d.topicId) : undefined,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
    _source: 'keyword',
    docKind: d.docKind,
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
    docKind: h.docKind,
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
    docKind: h.docKind,
    sources: ['keyword'] as Array<'semantic' | 'keyword'>,
  }));
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
type FuseExplainOptions = {
  explain?: boolean;
  keywordRankById?: Map<string, number>;
  semanticRankById?: Map<string, number>;
};

function fuseByRRF(
  semantic: SearchHit[],
  keyword: SearchHit[],
  limit: number,
  opts: FuseExplainOptions = {},
) {
  const k = 60; // common RRF constant
  const wSemantic = 1.0; // tune later if desired
  const wKeyword = 1.0; // tune later if desired
  const explain = Boolean(opts.explain);

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
      docKind?: string;
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
          docKind: hit.docKind,
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
      docKind: x.docKind,
      snippet: x.snippet,
      sources: Array.from(x.sources),
      explain: explain
        ? (() => {
          const keywordRank = opts.keywordRankById?.get(x.id);
          const semanticRank = opts.semanticRankById?.get(x.id);
          const keywordContribution =
            keywordRank != null ? 1 / (k + keywordRank) : undefined;
          const semanticContribution =
            semanticRank != null ? 1 / (k + semanticRank) : undefined;
          return {
            sources: {
              ...(keywordRank != null ? { keyword: { rank: keywordRank } } : {}),
              ...(semanticRank != null
                ? { semantic: { rank: semanticRank, score: x.semanticScore } }
                : {}),
            },
            fusion: {
              method: 'rrf' as const,
              k,
              contributions: {
                ...(keywordContribution != null ? { keyword: keywordContribution } : {}),
                ...(semanticContribution != null ? { semantic: semanticContribution } : {}),
              },
              combinedScore: (keywordContribution ?? 0) + (semanticContribution ?? 0),
            },
          };
        })()
        : undefined,
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
