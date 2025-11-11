// src/pages/NotesIndex.tsx
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useGetSubjectsQuery } from '../features/subjects/subjectsApi';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const safeId = (o: { id?: string } | undefined) => o?.id ?? '';

export default function NotesIndex() {
  const navigate = useNavigate();
  const { data: subjects = [], isLoading } = useGetSubjectsQuery();

  const first = useMemo(() => subjects[0], [subjects]);

  /*
    console.log('Subjects loaded:', subjects);
    console.log('isLoading:', isLoading);
  */
  useEffect(() => {
    if (isLoading) return;
    if (first) {
      const id = safeId(first);
      navigate(`/s/${id}-${slugify(first.name)}`, { replace: true });
    } else {
      // No subjects yet → send to Subjects page
      navigate('/subjects', { replace: true });
    }
  }, [isLoading, first, navigate]);

  // brief spinner while we decide where to go
  return (
    <Box p={2} display="flex" alignItems="center" justifyContent="center">
      <CircularProgress size={20} />
    </Box>
  );
}
