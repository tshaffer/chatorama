import type { RootState } from '../../store';
import { createSelector } from '@reduxjs/toolkit';
import { buildSearchSpec } from '@chatorama/chatalog-shared';

export const selectSearchDraft = (s: RootState) => s.search.draft;
export const selectSearchCommitted = (s: RootState) => s.search.committed;
export const selectLastUsedScope = (s: RootState) => s.search.lastUsedScope;

export const selectSearchDraftText = (s: RootState) => s.search.draft.text;
export const selectSearchCommittedText = (s: RootState) => s.search.committed.text;

export const selectFiltersDialogOpen = (s: RootState) => s.search.ui.filtersDialogOpen;

export const selectSearchSpec = createSelector([selectSearchCommitted], (search) =>
  buildSearchSpec({
    query: search.text,
    mode: search.mode,
    scope: search.scope,
    limit: search.limit,
    subjectId: search.filters.subjectId,
    topicId: search.filters.topicId,
    status: search.filters.status,
    tags: search.filters.tags,
    updatedFrom: search.filters.updatedFrom,
    updatedTo: search.filters.updatedTo,
    minSemanticScore: search.filters.minSemanticScore,
    prepTimeMax: search.filters.prepTimeMax,
    cookTimeMax: search.filters.cookTimeMax,
    totalTimeMax: search.filters.totalTimeMax,
    cuisine: search.filters.cuisine,
    category: search.filters.category,
    keywords: search.filters.keywords,
    includeIngredients: search.filters.includeIngredients,
    excludeIngredients: search.filters.excludeIngredients,
  })
);
