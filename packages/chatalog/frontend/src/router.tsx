// src/router.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppShell from './AppShell';
import Home from './pages/Home';
import SubjectsPage from './pages/Subjects';
import TopicNotesPage from './pages/TopicNotesPage';
import NotePage from './pages/NotePage';
import SubjectIndex from './pages/SubjectIndex';
import QuickNotesPage from './pages/QuickNotes';
import QuickNotePage from './pages/QuickNotePage';
import RelationsPage from './pages/RelationsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'home', element: <Home /> },

      // NEW: entry point for Tree + Notes layout
      { path: 'notes', element: <TopicNotesPage /> },

      // Selecting a subject → auto-jump to its first topic
      { path: 's/:subjectSlug', element: <SubjectIndex /> },

      // Topic view → show notes list (drag-to-reorder lives here)
      { path: 's/:subjectSlug/t/:topicSlug', element: <TopicNotesPage /> },

      // Note view (with/without slug)
      { path: 's/:subjectSlug/t/:topicSlug/n/:noteId-:noteSlug', element: <NotePage /> },
      { path: 's/:subjectSlug/t/:topicSlug/n/:noteId', element: <NotePage /> },

      // Direct deep link to a note id
      { path: 'n/:noteId', element: <NotePage /> },

      // Redirect old /subjects to the new manage route
      { path: 'subjects', element: <Navigate to="/subjects/manage" replace /> },

      // Manage Subjects (reuses existing SubjectsPage for now)
      { path: 'subjects/manage', element: <SubjectsPage /> },

      // Relations stub
      { path: 'relations', element: <RelationsPage /> },

      { path: 'quick-notes', element: <QuickNotesPage /> },
      { path: 'quick-notes/:quickNoteId', element: <QuickNotePage /> },

      { path: '*', element: <div style={{ padding: 16 }}>Not found (inside AppShell)</div> },
    ],
  },
  { path: '*', element: <div style={{ padding: 16 }}>Not found</div> },
]);
