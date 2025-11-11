// src/router.tsx
import { createBrowserRouter } from 'react-router-dom';
import AppShell from './AppShell';
import Home from './pages/Home';
import SubjectsPage from './pages/Subjects';
import QuickNotesPage from './features/quickNotes/QuickNotesPage';
import TopicNotesPage from './pages/TopicNotesPage';
import NotePage from './pages/NotePage';
import NotesIndex from './pages/NotesIndex';
import SubjectIndex from './pages/SubjectIndex';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'home', element: <Home /> },

      // Toolbar "Notes" → choose first subject (or /subjects if none)
      { path: 's', element: <NotesIndex /> },

      // Selecting a subject → auto-jump to its first topic
      { path: 's/:subjectSlug', element: <SubjectIndex /> },

      // Topic view → show notes list (drag-to-reorder lives here)
      { path: 's/:subjectSlug/t/:topicSlug', element: <TopicNotesPage /> },

      // Note view (with/without slug)
      { path: 's/:subjectSlug/t/:topicSlug/n/:noteId-:noteSlug', element: <NotePage /> },
      { path: 's/:subjectSlug/t/:topicSlug/n/:noteId', element: <NotePage /> },

      // Direct deep link to a note id
      { path: 'n/:noteId', element: <NotePage /> },

      { path: 'subjects', element: <SubjectsPage /> },
      { path: 'quick-notes', element: <QuickNotesPage /> },

      { path: '*', element: <div style={{ padding: 16 }}>Not found (inside AppShell)</div> },
    ],
  },
  { path: '*', element: <div style={{ padding: 16 }}>Not found</div> },
]);
