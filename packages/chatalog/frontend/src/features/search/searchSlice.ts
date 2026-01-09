import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SearchModeUi, SearchQuery } from './searchTypes';
import { getDefaultSearchQuery } from './searchUrl';

export type SearchSliceState = {
  draft: SearchQuery;
  committed: SearchQuery;
  lastUsedScope: 'notes' | 'recipes';
  ui: {
    filtersDialogOpen: boolean;
    showLeftPanel: boolean;
  };
};

const initialQuery = getDefaultSearchQuery();

const initialState: SearchSliceState = {
  draft: initialQuery,
  committed: initialQuery,
  lastUsedScope: 'notes',
  ui: {
    filtersDialogOpen: false,
    showLeftPanel: true,
  },
};

function clampLimit(n: number) {
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

export const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    hydrateFromUrl(state, action: PayloadAction<SearchQuery>) {
      state.committed = action.payload;
      state.draft = action.payload;
      if (action.payload.scope === 'notes' || action.payload.scope === 'recipes') {
        state.lastUsedScope = action.payload.scope;
      }
    },

    setDraftText(state, action: PayloadAction<string>) {
      state.draft.text = action.payload ?? '';
    },

    setDraftMode(state, action: PayloadAction<SearchModeUi>) {
      state.draft.mode = action.payload;
    },

    setDraftLimit(state, action: PayloadAction<number>) {
      state.draft.limit = clampLimit(action.payload);
    },

    setDraftUpdatedFrom(state, action: PayloadAction<string | undefined>) {
      state.draft.filters.updatedFrom = action.payload?.trim() || undefined;
    },

    setDraftUpdatedTo(state, action: PayloadAction<string | undefined>) {
      state.draft.filters.updatedTo = action.payload?.trim() || undefined;
    },

    setDraftMinSemanticScore(state, action: PayloadAction<number | undefined>) {
      const v = action.payload;
      state.draft.filters.minSemanticScore =
        v == null || !Number.isFinite(v) ? undefined : Math.max(0, Math.min(1, v));
    },

    setDraftSubjectId(state, action: PayloadAction<string | undefined>) {
      state.draft.filters.subjectId = action.payload?.trim() || undefined;
    },

    setDraftTopicId(state, action: PayloadAction<string | undefined>) {
      state.draft.filters.topicId = action.payload?.trim() || undefined;
    },

    commitDraft(state) {
      state.committed = state.draft;
    },

    resetDraftToCommitted(state) {
      state.draft = state.committed;
    },

    setFiltersDialogOpen(state, action: PayloadAction<boolean>) {
      state.ui.filtersDialogOpen = Boolean(action.payload);
    },
  },
});

export const {
  hydrateFromUrl,
  setDraftText,
  setDraftMode,
  setDraftLimit,
  setDraftUpdatedFrom,
  setDraftUpdatedTo,
  setDraftMinSemanticScore,
  setDraftSubjectId,
  setDraftTopicId,
  commitDraft,
  resetDraftToCommitted,
  setFiltersDialogOpen,
} = searchSlice.actions;

export default searchSlice.reducer;
