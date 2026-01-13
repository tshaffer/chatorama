import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SearchModeUi, SearchQuery } from './searchTypes';
import { getDefaultSearchQuery } from './searchUrl';

export type SearchSliceState = {
  draft: SearchQuery;
  committed: SearchQuery;
  selectedScope: 'all' | 'notes' | 'recipes';
  lastUsedScope: 'all' | 'notes' | 'recipes';
  ui: {
    filtersDialogOpen: boolean;
    showLeftPanel: boolean;
  };
};

const initialQuery = getDefaultSearchQuery();
const LAST_USED_SCOPE_KEY = 'chatalog.lastUsedScope';

type StoredScope = 'all' | 'notes' | 'recipes';

function loadLastUsedScope(): StoredScope | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(LAST_USED_SCOPE_KEY);
    if (!raw) return undefined;
    const parsed = String(raw).trim().toLowerCase();
    if (parsed === 'all' || parsed === 'notes' || parsed === 'recipes') {
      return parsed as StoredScope;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function saveLastUsedScope(scope: StoredScope) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_USED_SCOPE_KEY, scope);
  } catch {
    // ignore persistence errors
  }
}

const persistedLastUsedScope = loadLastUsedScope();
const initialSelectedScope = persistedLastUsedScope ?? 'notes';
const initialLastUsedScope = persistedLastUsedScope ?? initialSelectedScope;

const initialState: SearchSliceState = {
  draft: { ...initialQuery, scope: initialSelectedScope },
  committed: { ...initialQuery, scope: initialSelectedScope },
  selectedScope: initialSelectedScope,
  lastUsedScope: initialLastUsedScope,
  ui: {
    filtersDialogOpen: false,
    showLeftPanel: true,
  },
};

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    hydrateFromUrl(state, action: PayloadAction<SearchQuery>) {
      state.committed = action.payload;
      state.draft = action.payload;
      if (
        action.payload.scope === 'notes' ||
        action.payload.scope === 'recipes' ||
        action.payload.scope === 'all'
      ) {
        state.selectedScope = action.payload.scope;
        state.lastUsedScope = action.payload.scope;
        saveLastUsedScope(state.lastUsedScope);
      }
    },

    setDraftText(state, action: PayloadAction<string>) {
      state.draft.text = action.payload ?? '';
    },

    setDraftMode(state, action: PayloadAction<SearchModeUi>) {
      state.draft.mode = action.payload;
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

    resetDraftToCommitted(state) {
      state.draft = state.committed;
    },

    setSelectedScope(state, action: PayloadAction<'all' | 'notes' | 'recipes'>) {
      state.selectedScope = action.payload;
      state.lastUsedScope = action.payload;
      state.draft.scope = action.payload;
      state.committed.scope = action.payload;
      saveLastUsedScope(state.lastUsedScope);
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
  setDraftUpdatedFrom,
  setDraftUpdatedTo,
  setDraftMinSemanticScore,
  resetDraftToCommitted,
  setSelectedScope,
  setFiltersDialogOpen,
} = searchSlice.actions;

export default searchSlice.reducer;
