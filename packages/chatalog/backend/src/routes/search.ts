import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { NoteModel } from '../models/Note';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
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
  splitAndDedupTokens,
} from '../utils/search/noteFilters';
import { canonicalizeFilterTokens } from '../utils/ingredientTokens';

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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type ParsedQueryOperators = {
  text: string;
  subject?: string;
  topic?: string;
  tags: string[];
  importedOnly?: boolean;
};

function parseQueryOperators(input: string): ParsedQueryOperators {
  const tags: string[] = [];
  let subject: string | undefined;
  let topic: string | undefined;
  let importedOnly: boolean | undefined;

  const re = /(^|\s)(subject|topic|tag|imported):\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi;
  const stripped = input.replace(re, (_match, prefix, key, v1, v2, v3) => {
    const value = String(v1 ?? v2 ?? v3 ?? '').trim();
    if (!value) return ' ';
    const k = String(key).toLowerCase();
    if (k === 'subject') subject = value;
    if (k === 'topic') topic = value;
    if (k === 'tag') tags.push(value);
    if (k === 'imported') {
      const v = value.toLowerCase();
      if (v === 'true' || v === '1' || v === 'yes') importedOnly = true;
    }
    return prefix && String(prefix).trim() ? ' ' : ' ';
  });

  const text = stripped.replace(/\s+/g, ' ').trim();
  return { text, subject, topic, tags, importedOnly };
}

async function resolveSubjectId(value: string): Promise<string | undefined> {
  const re = new RegExp(`^${escapeRegex(value)}$`, 'i');
  const doc = await SubjectModel.findOne({
    $or: [{ name: re }, { slug: re }],
  })
    .select({ _id: 1 })
    .lean();
  return doc?._id ? String(doc._id) : undefined;
}

async function resolveTopicByValue(
  value: string,
  subjectId?: string,
): Promise<{ id: string; subjectId?: string } | undefined> {
  const re = new RegExp(`^${escapeRegex(value)}$`, 'i');
  const doc = await TopicModel.findOne({
    ...(subjectId ? { subjectId } : {}),
    $or: [{ name: re }, { slug: re }],
  })
    .select({ _id: 1, subjectId: 1 })
    .lean();
  if (!doc?._id) return undefined;
  return { id: String(doc._id), subjectId: doc.subjectId ?? undefined };
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

function isPlainObject(v: any): v is Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function stableStringify(value: any): string {
  // deterministic-ish stringify for small filter objects
  const seen = new WeakSet();
  const helper = (v: any): any => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[Circular]';
    seen.add(v);

    if (Array.isArray(v)) return v.map(helper);

    const keys = Object.keys(v).sort();
    const out: any = {};
    for (const k of keys) out[k] = helper(v[k]);
    return out;
  };
  return JSON.stringify(helper(value));
}

function mergeAnd(base: any, extra: any): any {
  if (!extra || !Object.keys(extra).length) return base;

  // Normalize base into {$and: []} form (but don't lose base leaf if it exists)
  let out = base;
  if (!out || !Object.keys(out).length) {
    out = { $and: [] };
  } else if (!out.$and) {
    out = { $and: [out] };
  } else if (!Array.isArray(out.$and)) {
    out = { $and: [out] };
  }

  // Flatten extra if it has $and
  if (extra.$and && Array.isArray(extra.$and)) {
    out.$and.push(...extra.$and);
  } else {
    out.$and.push(extra);
  }

  return out;
}

/**
 * Remove scope gating + exact duplicates from combinedFilter so we don't double-apply
 * constraints that are already enforced via `and[]` (base clauses).
 */
function stripScopeConstraints(combinedFilter: any, baseAndClauses: any[]): any {
  if (!combinedFilter || !Object.keys(combinedFilter).length) return combinedFilter;

  // Build a set of base clause signatures for dedupe
  const baseSigs = new Set<string>(
    (baseAndClauses ?? [])
      .filter(Boolean)
      .map((c) => stableStringify(c)),
  );

  const isScopeGateClause = (clause: any): boolean => {
    if (!isPlainObject(clause)) return false;

    // Remove recipe scope gate if present in combinedFilter
    // { recipe: { $exists: true } }
    if (
      clause.recipe &&
      isPlainObject(clause.recipe) &&
      clause.recipe.$exists === true &&
      Object.keys(clause).length === 1
    ) {
      return true;
    }

    // Remove "notes-only" gate if you used it (optional)
    // { recipe: { $exists: false } }
    if (
      clause.recipe &&
      isPlainObject(clause.recipe) &&
      clause.recipe.$exists === false &&
      Object.keys(clause).length === 1
    ) {
      return true;
    }

    // Legacy: remove docKind gates if any linger
    // { docKind: 'recipe' } or { docKind: 'note' }
    if (typeof clause.docKind === 'string' && Object.keys(clause).length === 1) {
      return true;
    }

    return false;
  };

  const filterClauseArray = (clauses: any[]) =>
    (clauses ?? []).filter((clause) => {
      if (!clause || !Object.keys(clause).length) return false;
      if (isScopeGateClause(clause)) return false;

      const sig = stableStringify(clause);
      if (baseSigs.has(sig)) return false; // exact duplicate of a base clause

      return true;
    });

  // If combinedFilter is an $and, clean its children
  if (combinedFilter.$and && Array.isArray(combinedFilter.$and)) {
    const cleaned = filterClauseArray(combinedFilter.$and);

    if (cleaned.length === 0) return {};
    if (cleaned.length === 1) return cleaned[0];
    return { $and: cleaned };
  }

  // If combinedFilter is a single clause, remove it if it's a scope gate or duplicate
  if (isScopeGateClause(combinedFilter)) return {};

  const sig = stableStringify(combinedFilter);
  if (baseSigs.has(sig)) return {};

  return combinedFilter;
}

type ParsedRecipeQuery = {
  mustTokens: string[];
  anyTokens: string[];
  phrases: string[];
  notTokens: string[];
};

function tokenizeRecipeQuery(input: string): string[] {
  const re = /"[^"]+"|\S+/g;
  return (input.match(re) ?? []).map((s) => s.trim()).filter(Boolean);
}

function parseRecipeQuery(q: string): ParsedRecipeQuery {
  const toks = tokenizeRecipeQuery(q);

  const mustTokens: string[] = [];
  const anyTokens: string[] = [];
  const phrases: string[] = [];
  const notTokens: string[] = [];

  let inOrMode = false;

  for (let raw of toks) {
    const upper = raw.toUpperCase();
    if (upper === 'OR' || raw === '|') {
      inOrMode = true;
      continue;
    }

    let neg = false;
    if (raw.startsWith('-') && raw.length > 1) {
      neg = true;
      raw = raw.slice(1);
    }

    if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
      const p = raw.slice(1, -1).trim();
      if (!p) continue;
      if (neg) notTokens.push(p);
      else phrases.push(p);
      continue;
    }

    const t = raw.trim();
    if (!t) continue;

    if (neg) notTokens.push(t);
    else if (inOrMode) anyTokens.push(t);
    else mustTokens.push(t);
  }

  return { mustTokens, anyTokens, phrases, notTokens };
}

function buildIngredientIntentFilter(parsed: ParsedRecipeQuery) {
  const { mustTokens, anyTokens, phrases, notTokens } = parsed;

  const must = canonicalizeFilterTokens(mustTokens);
  const any = canonicalizeFilterTokens(anyTokens);
  const phraseTokens = canonicalizeFilterTokens(phrases);
  const not = canonicalizeFilterTokens(notTokens);

  const and: any[] = [];

  if (must.length) {
    and.push(...must.map((t) => ({ 'recipe.ingredientTokens': t })));
  }

  if (phraseTokens.length) {
    and.push(...phraseTokens.map((t) => ({ 'recipe.ingredientTokens': t })));
  }

  if (any.length) {
    and.push({ $or: any.map((t) => ({ 'recipe.ingredientTokens': t })) });
  }

  if (not.length) {
    and.push({ $nor: not.map((t) => ({ 'recipe.ingredientTokens': t })) });
  }

  if (and.length === 0) return null;
  return and.length === 1 ? and[0] : { $and: and };
}

function buildRegexIntentFilter(parsed: ParsedRecipeQuery) {
  const { mustTokens, anyTokens, phrases, notTokens } = parsed;

  const mkWord = (t: string) => new RegExp(`\\b${escapeRegex(t)}\\b`, 'i');
  const mkPhrase = (p: string) => new RegExp(escapeRegex(p), 'i');

  const and: any[] = [];

  for (const t of mustTokens) and.push({ markdown: { $regex: mkWord(t) } });

  for (const p of phrases) and.push({ markdown: { $regex: mkPhrase(p) } });

  if (anyTokens.length) {
    and.push({ $or: anyTokens.map((t) => ({ markdown: { $regex: mkWord(t) } })) });
  }

  if (notTokens.length) {
    and.push({ $nor: notTokens.map((t) => ({ markdown: { $regex: mkWord(t) } })) });
  }

  if (and.length === 0) return null;
  return and.length === 1 ? and[0] : { $and: and };
}

function matchesRegexIntent(parsed: ParsedRecipeQuery, markdown: string | undefined): boolean {
  const { mustTokens, anyTokens, phrases, notTokens } = parsed;
  const text = String(markdown ?? '');

  if (!mustTokens.length && !anyTokens.length && !phrases.length && !notTokens.length) {
    return true;
  }

  const mkWord = (t: string) => new RegExp(`\\b${escapeRegex(t)}\\b`, 'i');
  const mkPhrase = (p: string) => new RegExp(escapeRegex(p), 'i');

  for (const t of mustTokens) {
    if (!mkWord(t).test(text)) return false;
  }

  for (const p of phrases) {
    if (!mkPhrase(p).test(text)) return false;
  }

  if (anyTokens.length) {
    const anyHit = anyTokens.some((t) => mkWord(t).test(text));
    if (!anyHit) return false;
  }

  if (notTokens.length) {
    const hasNot = notTokens.some((t) => mkWord(t).test(text));
    if (hasNot) return false;
  }

  return true;
}

async function buildRecipeUnionResults(args: {
  q: string;
  baseFilter: any; // already includes recipe:{exists:true} + structured filters
  parsed: ParsedRecipeQuery;
  offset: number;
  limit: number;
}) {
  const { q, baseFilter, parsed, offset, limit } = args;
  void q;

  // Fetch more than needed to allow union/dedup while still paginating.
  // Keep it bounded so it doesn’t explode.
  const fetchCap = Math.min(Math.max((offset + limit) * 5, 50), 500);

  const baseAnd: any[] =
    baseFilter?.$and && Array.isArray(baseFilter.$and)
      ? [...baseFilter.$and]
      : baseFilter && Object.keys(baseFilter).length
        ? [baseFilter]
        : [];

  // -------- Channel A: regex fallback over markdown (intent-aware) --------
  const regexIntent = buildRegexIntentFilter(parsed);

  let regexQuery: any;
  if (regexIntent) {
    regexQuery = { $and: [...baseAnd, regexIntent] };
  } else {
    regexQuery = baseAnd.length ? { $and: [...baseAnd] } : {};
  }

  const regexDocs = await NoteModel.find(regexQuery)
    .select({ title: 1, subjectId: 1, topicId: 1, docKind: 1, markdown: 1, updatedAt: 1 })
    .sort({ contentUpdatedAt: -1, updatedAt: -1 })
    .limit(fetchCap)
    .lean()
    .exec();
  const filteredRegexDocs = (regexDocs ?? []).filter((d: any) =>
    matchesRegexIntent(parsed, d?.markdown),
  );

  // -------- Channel B: ingredientTokens (intent-aware) --------
  const ingredientIntent = buildIngredientIntentFilter(parsed);
  let ingredientDocs: any[] = [];
  if (ingredientIntent) {
    const ingredientQuery =
      baseAnd.length ? { $and: [...baseAnd, ingredientIntent] } : ingredientIntent;

    ingredientDocs = await NoteModel.find(ingredientQuery)
      .select({ title: 1, subjectId: 1, topicId: 1, docKind: 1, markdown: 1, updatedAt: 1 })
      .sort({ contentUpdatedAt: -1, updatedAt: -1 })
      .limit(fetchCap)
      .lean()
      .exec();
  }

  // -------- Union + dedupe (prefer ingredient channel first) --------
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const d of ingredientDocs ?? []) {
    const id = String(d._id);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({ ...d, _id: d._id, __channel: 'ingredient' });
  }

  for (const d of filteredRegexDocs ?? []) {
    const id = String(d._id);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({ ...d, _id: d._id, __channel: 'regex' });
  }

  const total = merged.length;
  const page = merged.slice(offset, offset + limit);

  return { total, docs: page };
}

searchRouter.post('/', async (req, res, next) => {
  try {
    console.log('POST /api/v1/search called with body:', req.body);
    const body = req.body as Partial<SearchRequestV1>;

    if (body.version !== 1) {
      return res.status(400).json({ error: 'Unsupported search request version' });
    }

    const parsedOps = parseQueryOperators(String(body.q ?? '').trim());
    const q = parsedOps.text;
    const treatedAsWildcard = q === '' || q === '*';
    const scope = normalizeScope(body.scope, 'notes');

    const targetTypes = body.targetTypes ?? [];
    if (!Array.isArray(targetTypes) || !targetTypes.includes('note')) {
      return res.status(400).json({ error: 'Search v1 supports targetTypes: [note]' });
    }

    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);
    const offset = Math.max(body.offset ?? 0, 0);

    const filters = body.filters ?? {};
    if (parsedOps.tags.length) {
      const existing = Array.isArray(filters.tagsAll) ? filters.tagsAll : [];
      const merged = new Set<string>([
        ...existing.map((t: any) => String(t).trim()).filter(Boolean),
        ...parsedOps.tags.map((t) => t.trim()).filter(Boolean),
      ]);
      filters.tagsAll = Array.from(merged);
    }
    if (parsedOps.importedOnly) {
      filters.importedOnly = true;
    }
    if (parsedOps.subject) {
      const resolved = await resolveSubjectId(parsedOps.subject);
      if (resolved) {
        filters.subjectId = resolved;
      }
    }
    if (parsedOps.topic) {
      const resolved = await resolveTopicByValue(parsedOps.topic, filters.subjectId);
      if (resolved?.id) {
        filters.topicId = resolved.id;
        if (!filters.subjectId && resolved.subjectId) {
          filters.subjectId = resolved.subjectId;
        }
      }
    }
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
      and.push({ recipe: { $exists: false } }); // optional, only if you truly want to exclude recipes
      // or keep docKind:'note' if that’s your canonical definition of “note”
    }

    const useTextSearch = !treatedAsWildcard && scope !== 'recipes';
    let mongoFilter: any = useTextSearch ? { $text: { $search: q } } : {};
    if (and.length) mongoFilter.$and = and;

    if (scope === 'recipes') {
      const spec = buildSearchSpec({
        query: q,
        scope,
        ...(filters as any),
        prepTimeMax: (filters as any).prepTimeMax ?? (body as any).prepTimeMax,
        cookTimeMax: (filters as any).cookTimeMax ?? (body as any).cookTimeMax,
        totalTimeMax: (filters as any).totalTimeMax ?? (body as any).totalTimeMax,
        cuisine: (filters as any).cuisine ?? (body as any).cuisine,
        category: (filters as any).category ?? (body as any).category,
        keywords: (filters as any).keywords ?? (body as any).keywords,
        includeIngredients: (filters as any).includeIngredients ?? (body as any).includeIngredients,
        excludeIngredients: (filters as any).excludeIngredients ?? (body as any).excludeIngredients,
      });

      const includeTokens = canonicalizeFilterTokens(
        splitAndDedupTokens(spec.filters.includeIngredients),
      );
      const excludeTokens = canonicalizeFilterTokens(
        splitAndDedupTokens(spec.filters.excludeIngredients),
      );
      let ingredientSource: 'tokens' | 'normalized' | 'raw' | null = null;

      if (includeTokens.length || excludeTokens.length) {
        const hasTokens = await NoteModel.exists({ 'recipe.ingredientTokens.0': { $exists: true } });
        if (hasTokens) ingredientSource = 'tokens';
        else {
          const hasNormalized = await NoteModel.exists({ 'recipe.ingredients.0': { $exists: true } });
          if (hasNormalized) ingredientSource = 'normalized';
          else {
            const hasRaw = await NoteModel.exists({ 'recipe.ingredientsRaw.0': { $exists: true } });
            if (hasRaw) ingredientSource = 'raw';
          }
        }

        if (!ingredientSource) {
          const response: SearchResponseV1 = { version: 1, total: 0, hits: [] };
          return res.json(response);
        }
      }

      const ingredientFilter =
        ingredientSource && (includeTokens.length || excludeTokens.length)
          ? buildIngredientFilterForSource(ingredientSource, includeTokens, excludeTokens)
          : undefined;

      const { combinedFilter } = buildNoteFilterFromSpec(spec, ingredientFilter);

      // Option 2: strip scope gates + exact duplicates (relative to base `and[]`)
      const cleanedCombined = stripScopeConstraints(combinedFilter, and);

      // Build a baseFilter that represents "recipes + structured filters"
      // NOTE: this baseFilter is used by both channels (text + ingredient)
      let baseFilter: any = and.length ? { $and: [...and] } : {};
      baseFilter = mergeAnd(baseFilter, cleanedCombined);

      // If we have a real query (not wildcard), do UNION: regex(markdown) ∪ ingredientTokens
      if (!treatedAsWildcard && q) {
        const parsed = parseRecipeQuery(q);

        const { total, docs } = await buildRecipeUnionResults({
          q,
          baseFilter,
          parsed,
          offset,
          limit,
        });

        const terms = extractQueryTerms(q);

        const hits: SearchHitNoteV1[] = (docs ?? []).map((d: any) => ({
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
      }

      // Otherwise (wildcard), fall through to existing code path which uses mongoFilter/find()
      // Make sure mongoFilter is set to baseFilter so wildcard uses structured filters properly.
      mongoFilter = baseFilter;
    }

    if (treatedAsWildcard || !useTextSearch) {
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
