export type SearchMode = 'auto' | 'hybrid' | 'semantic' | 'keyword';
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
}

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  limit: number;
  filters: SearchFilters;
  results: SearchResultItem[];

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
