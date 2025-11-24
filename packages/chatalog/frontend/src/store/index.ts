// frontend/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import type { TypedUseSelectorHook } from 'react-redux';
import { useDispatch, useSelector } from 'react-redux';
import { chatalogApi } from '../features/api/chatalogApi';
// existing imports...
import settingsReducer from '../features/settings/settingsSlice'; // ⬅️ NEW

// If/when you add more slices, import and add to reducer below.
// import uiReducer from '../features/ui/uiSlice';

export const store = configureStore({
  reducer: {
    // RTK Query root slice
    [chatalogApi.reducerPath]: chatalogApi.reducer,

    // other reducers here:
    // ui: uiReducer,
    settings: settingsReducer,
  },
  middleware: (getDefault) =>
    getDefault().concat(chatalogApi.middleware),
  devTools: true,
});

// Enable refetchOnFocus/refetchOnReconnect behaviors for RTKQ
setupListeners(store.dispatch);

// Typed Redux helpers
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
