export type SearchMode = 'auto' | 'hybrid' | 'semantic' | 'keyword' | 'browse';
export type SearchSource = 'semantic' | 'keyword';

export interface SearchFilters {
  subjectId?: string;
  topicId?: string;

  // Reserved for later (do not use yet; keep for forward compatibility)
  tags?: string[];
  status?: string;
  hasRecipe?: boolean;
  updatedAfter?: string; // ISO string
  updatedBefore?: string; // ISO string
  minSemanticScore?: number; // NEW (0..1)
}

export interface SearchResultItem {
  id: string;
  title: string;
  summary?: string;
  snippet?: string;
  subjectId?: string;
  topicId?: string;
  updatedAt?: string;

  sources: SearchSource[];

  /**
   * Score meaning:
   * - mode=semantic: Atlas vectorSearchScore (cosine-ish)
   * - mode=keyword: Mongo textScore
   * - mode=hybrid/auto: fused RRF score
   */
  score: number;

  // Explainability (present when available):
  semanticScore?: number;
  textScore?: number;
  explain?: SearchExplain;
}

export type SearchExplain = {
  sources: {
    keyword?: {
      rank: number;
    };
    semantic?: {
      rank: number;
      score?: number;
    };
  };
  fusion: {
    method: 'rrf';
    k: number;
    contributions: {
      keyword?: number;
      semantic?: number;
    };
    combinedScore: number;
  };
};

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  limit: number;
  filters: SearchFilters;
  results: SearchResultItem[];
  intent?: ResolvedSearchIntentV1;

  debug?: {
    fusion: 'rrf';
    semanticCount: number;
    keywordCount: number;
    overlapCount: number;
    fusedCount: number;
    returnedCount: number;
    timingsMs: {
      semantic: number;
      keyword: number;
      fuse: number;
      total: number;
    };
    semantic?: {
      attempted: boolean;
      ok: boolean;
      reason?:
        | 'disabled'
        | 'not_configured'
        | 'missing_index'
        | 'missing_embedding_field'
        | 'filtered_to_zero'
        | 'no_results'
        | 'error';
      errorMessage?: string;
    };
  };

  // Reserved for later (pagination)
  nextCursor?: string;
}

export type SearchTargetTypeV1 = 'note';

export interface SearchFiltersV1 {
  subjectId?: string;
  topicId?: string;

  // Milestone 4A
  status?: string;           // exact match
  tagsAll?: string[];        // must contain all
  importedOnly?: boolean;    // importBatchId exists
  updatedAtFrom?: string;    // ISO date
  updatedAtTo?: string;      // ISO date

  // 4B
  createdAtFrom?: string;    // ISO date
  createdAtTo?: string;      // ISO date
  sourceType?: string;       // note.sourceType
  importBatchId?: string;    // exact match
  chatworthyChatId?: string; // exact match
}

export interface SearchRequestV1 {
  version: 1;
  q: string;
  targetTypes: SearchTargetTypeV1[];
  filters?: SearchFiltersV1;
  limit?: number;
  offset?: number;
  scope?: SearchScopeV1;
  lastUsedScope?: SearchScopeV1;
}

export interface SearchHitNoteV1 {
  targetType: 'note';
  id: string;
  subjectId?: string;
  topicId?: string;
  title: string;
  snippet?: string;
  score?: number;
  updatedAt?: string;
}

export interface SearchResponseV1 {
  version: 1;
  total?: number; // NEW: total hit count for the query+filters
  hits: SearchHitNoteV1[];
}

export type SearchScope = 'all' | 'recipes' | 'notes';

export type SearchModeV1 = 'browse' | 'semantic';

export type SearchScopeV1 = 'all' | 'notes' | 'recipes';

export type ResolvedSearchIntentV1 = {
  mode: SearchModeV1;
  normalizedQuery: string;
  queryText: string | null;
  scope: SearchScopeV1;
  filters: SearchFiltersV1 | SearchQueryFilters | Record<string, unknown>;
  sort: 'relevance' | 'recent';
  debug: {
    isEmptyQuery: boolean;
    treatedAsWildcard: boolean;
  };
};

export type SearchQueryFilters = {
  subjectId?: string;
  topicId?: string;
  status?: string;
  tags: string[];
  updatedFrom?: string;
  updatedTo?: string;
  minSemanticScore?: number;
  prepTimeMax?: number;
  cookTimeMax?: number;
  totalTimeMax?: number;
  cuisine: string[];
  category: string[];
  keywords: string[];
  includeIngredients: string[];
  excludeIngredients: string[];
};

export type SearchQuery = {
  text: string;
  mode: SearchMode;
  limit: number;
  scope: SearchScope;
  filters: SearchQueryFilters;
};

export type SearchSpec = {
  query: string;
  mode: SearchMode;
  limit: number;
  scope: SearchScope;
  filters: SearchQueryFilters;
  explain?: boolean;
  lastUsedScope?: SearchScope;
};

export type SavedSearch = {
  id: string;
  name: string;
  query: SearchQuery;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateSavedSearchRequest = {
  name: string;
  query: SearchQuery;
};

export type CreateSavedSearchResponse = SavedSearch;

export type ListSavedSearchesResponse = {
  items: SavedSearch[];
};

export type DeleteSavedSearchResponse = { ok: true };
