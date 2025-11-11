// src/pages/TopicNotesPage.tsx
import { useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, LinearProgress, Typography } from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query'; // ← add this
import { useGetNotePreviewsForTopicQuery } from '../features/subjects/subjectsApi';
import { useReorderNotesInTopicMutation } from '../features/notes/notesApi';
import ReorderableNotesList from '../features/notes/ReorderableNotesList';

const takeObjectId = (slug?: string) => slug?.match(/^[a-f0-9]{24}/i)?.[0];

export default function TopicNotesPage() {
  const { subjectSlug, topicSlug } = useParams();
  const subjectId = useMemo(() => takeObjectId(subjectSlug), [subjectSlug]);
  const topicId   = useMemo(() => takeObjectId(topicSlug), [topicSlug]);
  const navigate  = useNavigate();

  // ✅ Use skipToken if either id is missing
  const { data: notes = [], isLoading } =
    useGetNotePreviewsForTopicQuery(
      subjectId && topicId ? { subjectId, topicId } : skipToken
    );

  const [reorder] = useReorderNotesInTopicMutation();

  const onReordered = useCallback(
    (noteIdsInOrder: string[]) => {
      if (!subjectId || !topicId) return;
      reorder({ subjectId, topicId, noteIdsInOrder });
    },
    [reorder, subjectId, topicId]
  );

  const onNoteClick = (noteId: string) => navigate(`/n/${noteId}`);

  // Optional small guard UI (renders for a split second during redirects)
  if (!subjectId || !topicId) return <Box p={2}><LinearProgress /></Box>;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Notes</Typography>
      {isLoading ? (
        <LinearProgress />
      ) : notes.length ? (
        <ReorderableNotesList
          topicId={topicId}
          notes={notes}
          onReordered={onReordered}
          onNoteClick={onNoteClick}
        />
      ) : (
        <Box sx={{ color: 'text.secondary', fontSize: 14 }}>No notes yet</Box>
      )}
    </Box>
  );
}
