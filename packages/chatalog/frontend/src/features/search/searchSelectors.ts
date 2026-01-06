import type { RootState } from '../../store';

export const selectSearchDraft = (s: RootState) => s.search.draft;
export const selectSearchCommitted = (s: RootState) => s.search.committed;

export const selectSearchDraftText = (s: RootState) => s.search.draft.text;
export const selectSearchCommittedText = (s: RootState) => s.search.committed.text;

export const selectFiltersDialogOpen = (s: RootState) => s.search.ui.filtersDialogOpen;
