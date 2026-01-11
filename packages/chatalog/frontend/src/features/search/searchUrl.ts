import type { SearchFilters, SearchModeUi, SearchQuery, SearchScope } from './searchTypes';

function splitCsv(s: string | null | undefined): string[] {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinCsv(arr: string[] | undefined): string | undefined {
  const a = (arr ?? []).map((x) => x.trim()).filter(Boolean);
  return a.length ? a.join(',') : undefined;
}

function numOrUndef(s: string | null): number | undefined {
  if (s == null) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function clampLimit(n: number | undefined): number {
  if (!Number.isFinite(n as any)) return 20;
  return Math.max(1, Math.min(50, Math.floor(n as number)));
}

function clamp01(n: number | undefined): number | undefined {
  if (n == null) return undefined;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

export function getDefaultSearchQuery(): SearchQuery {
  return {
    text: '',
    scope: 'notes',
    mode: 'auto',
    limit: 20,
    filters: {
      tags: [],
      cuisine: [],
      category: [],
      keywords: [],
      includeIngredients: [],
      excludeIngredients: [],
    },
  };
}

export function parseSearchQueryFromUrl(
  search: string,
  opts: { fallbackScope?: SearchScope } = {},
): SearchQuery {
  const q0 = getDefaultSearchQuery();
  const sp = new URLSearchParams(search);

  const text = (sp.get('q') ?? '').trim();

  const scopeRaw = (sp.get('scope') ?? '').trim() as SearchScope;
  const scopeFallback = opts.fallbackScope ?? 'notes';
  const scope: SearchScope =
    scopeRaw === 'recipes' || scopeRaw === 'notes' || scopeRaw === 'all' ? scopeRaw : scopeFallback;

  const modeRaw = (sp.get('mode') ?? '').trim() as SearchModeUi;
  const mode: SearchModeUi =
    modeRaw === 'auto' || modeRaw === 'hybrid' || modeRaw === 'semantic' || modeRaw === 'keyword'
      ? modeRaw
      : 'auto';

  const limit = clampLimit(numOrUndef(sp.get('limit')));

  const filters: SearchFilters = {
    ...q0.filters,

    subjectId: (sp.get('subjectId') ?? '').trim() || undefined,
    topicId: (sp.get('topicId') ?? '').trim() || undefined,
    status: (sp.get('status') ?? '').trim() || undefined,
    tags: splitCsv(sp.get('tags')),

    updatedFrom: (sp.get('updatedFrom') ?? '').trim() || undefined,
    updatedTo: (sp.get('updatedTo') ?? '').trim() || undefined,
    minSemanticScore: clamp01(numOrUndef(sp.get('minSemanticScore'))),

    cuisine: splitCsv(sp.get('cuisine')),
    category: splitCsv(sp.get('category')),
    keywords: splitCsv(sp.get('keywords')),

    prepTimeMax: numOrUndef(sp.get('maxPrepMinutes')) ?? numOrUndef(sp.get('prepMax')),
    cookTimeMax: numOrUndef(sp.get('maxCookMinutes')) ?? numOrUndef(sp.get('cookMax')),
    totalTimeMax: numOrUndef(sp.get('maxTotalMinutes')) ?? numOrUndef(sp.get('totalMax')),

    includeIngredients: splitCsv(sp.get('includeIngredients') ?? sp.get('includeIng')),
    excludeIngredients: splitCsv(sp.get('excludeIngredients') ?? sp.get('excludeIng')),
  };

  if (!filters.keywords.length) {
    filters.keywords = splitCsv(sp.get('keyword'));
  }

  return { text, scope, mode, limit, filters };
}

export function buildSearchUrlFromQuery(q: SearchQuery): string {
  const sp = new URLSearchParams();

  if (q.text.trim()) sp.set('q', q.text.trim());
  if (q.scope) sp.set('scope', q.scope);
  if (q.mode && q.mode !== 'auto') sp.set('mode', q.mode);
  if (q.limit && q.limit !== 20) sp.set('limit', String(clampLimit(q.limit)));

  const f = q.filters;

  if (f.subjectId) sp.set('subjectId', f.subjectId);
  if (f.topicId) sp.set('topicId', f.topicId);
  if (f.status) sp.set('status', f.status);

  const tags = joinCsv(f.tags);
  if (tags) sp.set('tags', tags);

  if (f.updatedFrom) sp.set('updatedFrom', f.updatedFrom);
  if (f.updatedTo) sp.set('updatedTo', f.updatedTo);

  if (f.minSemanticScore != null) sp.set('minSemanticScore', String(f.minSemanticScore));

  if (q.scope === 'recipes') {
    const cuisine = joinCsv(f.cuisine);
    const category = joinCsv(f.category);
    const keywords = joinCsv(f.keywords);
    if (cuisine) sp.set('cuisine', cuisine);
    if (category) sp.set('category', category);
    if (keywords) sp.set('keywords', keywords);

    if (f.prepTimeMax != null) sp.set('prepMax', String(f.prepTimeMax));
    if (f.cookTimeMax != null) sp.set('cookMax', String(f.cookTimeMax));
    if (f.totalTimeMax != null) sp.set('totalMax', String(f.totalTimeMax));

    const includeIng = joinCsv(f.includeIngredients);
    const excludeIng = joinCsv(f.excludeIngredients);
    if (includeIng) sp.set('includeIng', includeIng);
    if (excludeIng) sp.set('excludeIng', excludeIng);
  }

  const qs = sp.toString();
  return qs ? `/search?${qs}` : '/search';
}
