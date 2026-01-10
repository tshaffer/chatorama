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
const PREFS_KEY = 'chatalog.search.prefs';

type SearchPrefs = {
  selectedScope?: 'all' | 'notes' | 'recipes';
  lastUsedScope?: 'all' | 'notes' | 'recipes';
};

function loadPrefs(): SearchPrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SearchPrefs;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function savePrefs(prefs: SearchPrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore persistence errors
  }
}

const persisted = loadPrefs();
const initialSelectedScope = persisted.selectedScope ?? 'all';
const initialLastUsedScope = persisted.lastUsedScope ?? initialSelectedScope;

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
      if (
        action.payload.scope === 'notes' ||
        action.payload.scope === 'recipes' ||
        action.payload.scope === 'all'
      ) {
        if (action.payload.scope !== 'all' || state.selectedScope === 'all') {
          state.selectedScope = action.payload.scope;
          state.lastUsedScope = action.payload.scope;
          savePrefs({ selectedScope: state.selectedScope, lastUsedScope: state.lastUsedScope });
        }
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

    setSelectedScope(state, action: PayloadAction<'all' | 'notes' | 'recipes'>) {
      state.selectedScope = action.payload;
      state.lastUsedScope = action.payload;
      state.draft.scope = action.payload;
      state.committed.scope = action.payload;
      savePrefs({ selectedScope: state.selectedScope, lastUsedScope: state.lastUsedScope });
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
  setSelectedScope,
  setFiltersDialogOpen,
} = searchSlice.actions;

export default searchSlice.reducer;
