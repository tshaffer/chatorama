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
