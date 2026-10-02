// frontend/src/features/settings/settingsSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../store'; // adjust path if needed

export interface NoteStatusVisibilitySettings {
  showUnset: boolean;
  showCompleted: boolean;
  showOther: boolean;
}

export interface SettingsState {
  noteStatusVisibility: NoteStatusVisibilitySettings;
}

const NOTE_STATUS_VISIBILITY_KEY = 'chatalog.noteStatusVisibility';

const defaultNoteStatusVisibility: NoteStatusVisibilitySettings = {
  showUnset: true,
  showCompleted: true,
  showOther: true,
};

function loadNoteStatusVisibility(): NoteStatusVisibilitySettings {
  if (typeof window === 'undefined') return defaultNoteStatusVisibility;
  try {
    const raw = window.localStorage.getItem(NOTE_STATUS_VISIBILITY_KEY);
    if (!raw) return defaultNoteStatusVisibility;
    const parsed = JSON.parse(raw);
    const pick = (k: keyof NoteStatusVisibilitySettings) =>
      typeof parsed?.[k] === 'boolean' ? parsed[k] : defaultNoteStatusVisibility[k];
    return {
      showUnset: pick('showUnset'),
      showCompleted: pick('showCompleted'),
      showOther: pick('showOther'),
    };
  } catch {
    return defaultNoteStatusVisibility;
  }
}

function saveNoteStatusVisibility(v: NoteStatusVisibilitySettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTE_STATUS_VISIBILITY_KEY, JSON.stringify(v));
  } catch {
    // ignore persistence errors
  }
}

const initialState: SettingsState = {
  noteStatusVisibility: loadNoteStatusVisibility(),
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setNoteStatusVisibility(
      state,
      action: PayloadAction<Partial<NoteStatusVisibilitySettings>>,
    ) {
      state.noteStatusVisibility = {
        ...state.noteStatusVisibility,
        ...action.payload,
      };
      saveNoteStatusVisibility(state.noteStatusVisibility);
    },
  },
});

export const { setNoteStatusVisibility } = settingsSlice.actions;

export const selectNoteStatusVisibility = (state: RootState) =>
  state.settings.noteStatusVisibility;

export default settingsSlice.reducer;
