import type { SearchRequestV1, SearchSpec } from '@chatorama/chatalog-shared';

function sortedCsv(values: string[] | undefined): string[] {
  const items = (values ?? [])
    .map((v) => String(v).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return items;
}

export function buildSearchRequestV1(spec: SearchSpec): SearchRequestV1 {
  const f = spec.filters ?? ({} as any);
  const tagsAll = sortedCsv(f.tags);

  return {
    version: 1,
    q: String(spec.query ?? ''),
    scope: spec.scope ?? 'notes',
    targetTypes: ['note'],
    limit: spec.limit ?? 20,
    offset: 0,
    filters: {
      subjectId: f.subjectId || undefined,
      topicId: f.topicId || undefined,
      status: f.status || undefined,
      tagsAll,
      updatedAtFrom: f.updatedFrom || undefined,
      updatedAtTo: f.updatedTo || undefined,
      createdAtFrom: undefined,
      createdAtTo: undefined,
      importedOnly: undefined,
      sourceType: undefined,
      importBatchId: undefined,
      chatworthyChatId: undefined,
    },
  };
}

export function buildLegacySearchUrl(
  spec: SearchSpec,
  opts: { explain?: boolean } = {},
): { url: string; params: Record<string, string> } {
  const params = new URLSearchParams();
  params.set('q', String(spec.query ?? ''));
  if (spec.mode) params.set('mode', spec.mode);
  if (spec.limit != null) params.set('limit', String(spec.limit));
  const explain = opts.explain ?? spec.explain;
  if (explain) params.set('explain', '1');
  const scope = spec.scope ?? 'notes';
  params.set('scope', scope);
  const f = spec.filters ?? ({} as any);
  if (f.subjectId) params.set('subjectId', f.subjectId);
  if (f.topicId) params.set('topicId', f.topicId);
  if (f.minSemanticScore != null) {
    params.set('minSemanticScore', String(f.minSemanticScore));
  }
  if (scope === 'recipes') {
    if (Number.isFinite(f.prepTimeMax as any)) {
      params.set('maxPrepMinutes', String(f.prepTimeMax));
    }
    if (Number.isFinite(f.cookTimeMax as any)) {
      params.set('maxCookMinutes', String(f.cookTimeMax));
    }
    if (Number.isFinite(f.totalTimeMax as any)) {
      params.set('maxTotalMinutes', String(f.totalTimeMax));
    }
  }
  if (f.status) params.set('status', f.status);

  const tags = sortedCsv(f.tags);
  if (tags.length) params.set('tags', tags.join(','));

  const cuisine = sortedCsv(f.cuisine);
  const category = sortedCsv(f.category);
  const keywords = sortedCsv(f.keywords);
  const includeIngredients = sortedCsv(f.includeIngredients);
  const excludeIngredients = sortedCsv(f.excludeIngredients);

  if (scope === 'recipes') {
    if (cuisine.length) params.set('cuisine', cuisine.join(','));
    if (category.length) params.set('category', category.join(','));
    if (keywords.length) params.set('keywords', keywords.join(','));
    if (includeIngredients.length) params.set('includeIngredients', includeIngredients.join(','));
    if (excludeIngredients.length) params.set('excludeIngredients', excludeIngredients.join(','));
  }

  if (f.updatedFrom) params.set('updatedFrom', f.updatedFrom);
  if (f.updatedTo) params.set('updatedTo', f.updatedTo);

  const url = `search?${params.toString()}`;
  return { url, params: Object.fromEntries(params.entries()) };
}
