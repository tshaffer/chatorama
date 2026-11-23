export type SearchScope = 'all' | 'recipes' | 'notes';
export type SearchModeUi = 'auto' | 'hybrid' | 'semantic' | 'keyword';

export type SearchFilters = {
  subjectId?: string;
  topicId?: string;
  status?: string;
  tags: string[];
  importedOnly?: boolean;
  /** Notes in archived subjects are included unless this says otherwise */
  archivedSubjects?: 'exclude' | 'only';
  updatedFrom?: string; // YYYY-MM-DD
  updatedTo?: string; // YYYY-MM-DD
  minSemanticScore?: number;

  cuisine: string[];
  category: string[];
  keywords: string[];

  prepTimeMax?: number;
  cookTimeMax?: number;
  totalTimeMax?: number;

  includeIngredients: string[];
  excludeIngredients: string[];

  cooked?: 'any' | 'ever' | 'never';
  cookedWithinDays?: number;
  minAvgCookedRating?: number;
};

export type SearchQuery = {
  text: string;
  scope: SearchScope;
  mode: SearchModeUi;
  limit: number;
  filters: SearchFilters;
};
