import type { SearchSpec } from '@chatorama/chatalog-shared';

export type SearchRequestForDebug = {
  url: string;
  params: Record<string, string>;
};

function sortedCsv(values: string[] | undefined): string | undefined {
  const items = (values ?? [])
    .map((v) => String(v).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return items.length ? items.join(',') : undefined;
}

export function buildSearchRequest(spec: SearchSpec): SearchRequestForDebug {
  const params = new URLSearchParams();
  params.set('q', spec.query);
  if (spec.mode) params.set('mode', spec.mode);
  if (spec.limit != null) params.set('limit', String(spec.limit));
  if (spec.scope && spec.scope !== 'all') params.set('scope', spec.scope);
  if (spec.filters.subjectId) params.set('subjectId', spec.filters.subjectId);
  if (spec.filters.topicId) params.set('topicId', spec.filters.topicId);
  if (spec.filters.minSemanticScore != null) {
    params.set('minSemanticScore', String(spec.filters.minSemanticScore));
  }
  if (Number.isFinite(spec.filters.prepTimeMax as any)) {
    params.set('maxPrepMinutes', String(spec.filters.prepTimeMax));
  }
  if (Number.isFinite(spec.filters.cookTimeMax as any)) {
    params.set('maxCookMinutes', String(spec.filters.cookTimeMax));
  }
  if (Number.isFinite(spec.filters.totalTimeMax as any)) {
    params.set('maxTotalMinutes', String(spec.filters.totalTimeMax));
  }
  if (spec.filters.status) params.set('status', spec.filters.status);

  const tags = sortedCsv(spec.filters.tags);
  if (tags) params.set('tags', tags);

  const cuisine = sortedCsv(spec.filters.cuisine);
  const category = sortedCsv(spec.filters.category);
  const keywords = sortedCsv(spec.filters.keywords);
  const includeIngredients = sortedCsv(spec.filters.includeIngredients);
  const excludeIngredients = sortedCsv(spec.filters.excludeIngredients);

  if (cuisine) params.set('cuisine', cuisine);
  if (category) params.set('category', category);
  if (keywords) params.set('keywords', keywords);
  if (includeIngredients) params.set('includeIngredients', includeIngredients);
  if (excludeIngredients) params.set('excludeIngredients', excludeIngredients);

  if (spec.filters.updatedFrom) params.set('updatedFrom', spec.filters.updatedFrom);
  if (spec.filters.updatedTo) params.set('updatedTo', spec.filters.updatedTo);

  const url = `search?${params.toString()}`;
  return { url, params: Object.fromEntries(params.entries()) };
}
