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
