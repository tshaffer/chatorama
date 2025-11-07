// frontend/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import { chatalogApi } from '../features/api/chatalogApi';

// If/when you add more slices, import and add to reducer below.
// import uiReducer from '../features/ui/uiSlice';

export const store = configureStore({
  reducer: {
    // RTK Query root slice
    [chatalogApi.reducerPath]: chatalogApi.reducer,

    // other reducers here:
    // ui: uiReducer,
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
