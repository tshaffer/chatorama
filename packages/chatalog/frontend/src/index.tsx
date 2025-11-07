// chatalog/client/src/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { RouterProvider } from 'react-router-dom';

import { setupListeners } from '@reduxjs/toolkit/query';
import { store } from './store';
import { theme } from './theme';
import { router } from './router';  // <-- make sure this matches your new router.tsx export

import { API_BASE } from './lib/apiBase';

setupListeners(store.dispatch);

function Root() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>
  );
}

const container = document.getElementById('root')!;
createRoot(container).render(<Root />);

(async () => {
  try {
    const r = await fetch(`${API_BASE}/health`);
    console.log('Health:', r.ok ? await r.text() : r.status);
  } catch (e) {
    console.error('Health check failed:', e);
  }
})();