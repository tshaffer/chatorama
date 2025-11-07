// src/router.tsx
import { createBrowserRouter } from 'react-router-dom';
import AppShell from './AppShell';
import Home from './pages/Home';
import Notes from './pages/Notes';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // Home
      { index: true, element: <Home /> },
      { path: 'home', element: <Home /> }, // optional alias

      // Notes hierarchy
      // List all subjects
      { path: 's', element: <Notes /> },

      // Subject-level list
      { path: 's/:subjectSlug', element: <Notes /> },

      // Topic-level list
      { path: 's/:subjectSlug/t/:topicSlug', element: <Notes /> },

      // NOTE DETAIL (ID-first, slug cosmetic):
      // Preferred canonical pattern → /s/{subject}/t/{topic}/n/{noteId}-{noteSlug}
      // Example: /s/aiux/t/prompt-design/n/66ff2ad4a2f0c8e7d1b2c3d4-designing-effective-prompts
      { path: 's/:subjectSlug/t/:topicSlug/n/:noteId-:noteSlug', element: <Notes /> },

      // Optional: allow ID-only (no slug) — still renders the same page
      { path: 's/:subjectSlug/t/:topicSlug/n/:noteId', element: <Notes /> },

      // Catch-all (inside shell)
      { path: '*', element: <div style={{ padding: 16 }}>Not found (inside AppShell)</div> },
    ],
  },

  // Fallback (outside shell)
  { path: '*', element: <div style={{ padding: 16 }}>Not found</div> },
]);

