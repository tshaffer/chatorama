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

const initialState: SettingsState = {
  noteStatusVisibility: {
    showUnset: true,
    showCompleted: true,
    showOther: true,
  },
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
    },
  },
});

export const { setNoteStatusVisibility } = settingsSlice.actions;

export const selectNoteStatusVisibility = (state: RootState) =>
  state.settings.noteStatusVisibility;

export default settingsSlice.reducer;
