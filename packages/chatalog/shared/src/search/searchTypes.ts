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
