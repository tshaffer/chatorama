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

export function buildSearchRequest(
  spec: SearchSpec,
  opts: { explain?: boolean } = {},
): SearchRequestForDebug {
  const params = new URLSearchParams();
  params.set('q', String(spec.query ?? ''));
  if (spec.mode) params.set('mode', spec.mode);
  if (spec.limit != null) params.set('limit', String(spec.limit));
  const explain = opts.explain ?? spec.explain;
  if (explain) params.set('explain', '1');
  const scope = spec.scope ?? 'all';
  params.set('scope', scope);
  const lastUsedScope = (spec as any).lastUsedScope ?? scope;
  params.set('lastUsedScope', String(lastUsedScope));
  const f = spec.filters ?? ({} as any);
  if (f.subjectId) params.set('subjectId', f.subjectId);
  if (f.topicId) params.set('topicId', f.topicId);
  if (f.minSemanticScore != null) {
    params.set('minSemanticScore', String(f.minSemanticScore));
  }
  if (Number.isFinite(f.prepTimeMax as any)) {
    params.set('maxPrepMinutes', String(f.prepTimeMax));
  }
  if (Number.isFinite(f.cookTimeMax as any)) {
    params.set('maxCookMinutes', String(f.cookTimeMax));
  }
  if (Number.isFinite(f.totalTimeMax as any)) {
    params.set('maxTotalMinutes', String(f.totalTimeMax));
  }
  if (f.status) params.set('status', f.status);

  const tags = sortedCsv(f.tags);
  if (tags) params.set('tags', tags);

  const cuisine = sortedCsv(f.cuisine);
  const category = sortedCsv(f.category);
  const keywords = sortedCsv(f.keywords);
  const includeIngredients = sortedCsv(f.includeIngredients);
  const excludeIngredients = sortedCsv(f.excludeIngredients);

  if (cuisine) params.set('cuisine', cuisine);
  if (category) params.set('category', category);
  if (keywords) params.set('keywords', keywords);
  if (includeIngredients) params.set('includeIngredients', includeIngredients);
  if (excludeIngredients) params.set('excludeIngredients', excludeIngredients);

  if (f.updatedFrom) params.set('updatedFrom', f.updatedFrom);
  if (f.updatedTo) params.set('updatedTo', f.updatedTo);

  const url = `search?${params.toString()}`;
  return { url, params: Object.fromEntries(params.entries()) };
}
