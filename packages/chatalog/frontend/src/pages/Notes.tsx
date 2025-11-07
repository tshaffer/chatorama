// src/pages/Notes.tsx
import React, { useCallback } from 'react';
import { Box, Paper } from '@mui/material';
import Sidebar from '../components/Sidebar';
import MainArea from '../components/MainArea';
import ResizeHandle from '../components/ResizeHandle';
import { usePersistentState } from '../hooks/usePersistentState';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { skipToken } from '@reduxjs/toolkit/query'; // ← NEW
import { useGetNoteQuery } from '../features/notes/notesApi';

const MIN_SIDEBAR = 220;
const MAX_SIDEBAR = 480;
const DEFAULT_SIDEBAR = 300;

const safeId = (o: {id?: string } | undefined) => o?.id ?? '';

function slugify(s: string) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function Notes() {
  const navigate = useNavigate();
  const { subjectSlug, topicSlug, noteId, noteSlug } = useParams<{
    subjectSlug?: string;
    topicSlug?: string;
    noteId?: string;     // from route: /n/:noteId-:noteSlug  OR  /n/:noteId
    noteSlug?: string;   // present only in the first pattern
  }>();

  const id = useMemo(() => (noteId ?? '').split('-')[0], [noteId]);

  // Fetch by ID only (guard with skipToken to avoid /notes/undefined)
  const { data: note } = useGetNoteQuery(id ? id : skipToken); // ← CHANGED

  // Optional: keep URL canonical if title's slug changed
  useEffect(() => {
    if (!note || !id || !subjectSlug || !topicSlug) return;
    const expectedSlug = slugify(note.title);
    if (noteSlug !== expectedSlug) {
      navigate(`/s/${subjectSlug}/t/${topicSlug}/n/${safeId(note)}-${expectedSlug}`, { replace: true });
    }
  }, [note, id, noteSlug, subjectSlug, topicSlug, navigate]);

  const [sidebarWidth, setSidebarWidth] = usePersistentState<number>(
    'ui.sidebarWidth',
    DEFAULT_SIDEBAR
  );

  const onDrag = useCallback(
    (dx: number) => {
      setSidebarWidth((w) => {
        const next = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, w + dx));
        return next;
      });
    },
    [setSidebarWidth]
  );

  return (
    <Box
      display="grid"
      gridTemplateColumns={`${sidebarWidth}px 6px 1fr`}
      height="calc(100vh - 64px)"
    >
      <Paper variant="outlined" square sx={{ p: 1, overflow: 'auto' }}>
        <Sidebar />
      </Paper>

      <ResizeHandle aria-label="Resize sidebar" onDrag={onDrag} style={{}} />

      <Box sx={{ overflow: 'hidden' }}>
        <MainArea />
      </Box>
    </Box>
  );
}
