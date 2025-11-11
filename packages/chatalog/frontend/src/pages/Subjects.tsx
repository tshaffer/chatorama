// packages/chatalog/frontend/src/pages/Subjects.tsx
import { useMemo } from 'react';
import { Box, Stack, Typography, Divider, CircularProgress } from '@mui/material';
import { useGetSubjectsQuery } from '../features/subjects/subjectsApi';
import CreateSubjectButton from '../components/subjects/CreateSubjectButton';
import SubjectAccordion from '../components/subjects/SubjectAccordion';

export default function SubjectsPage() {
  const { data: subjects, isLoading, isFetching, error } = useGetSubjectsQuery();

  const body = useMemo(() => {
    if (isLoading) return <Stack alignItems="center" py={6}><CircularProgress /></Stack>;
    if (error) return <Typography color="error" sx={{ p: 2 }}>Failed to load subjects.</Typography>;
    if (!subjects?.length) {
      return (
        <Stack alignItems="center" spacing={2} py={6}>
          <Typography variant="h6">No subjects yet</Typography>
          <Typography variant="body2" color="text.secondary">Create your first subject to get started.</Typography>
        </Stack>
      );
    }
    return (
      <Stack spacing={1}>
        {subjects.map((s) => (
          <SubjectAccordion key={s.id} subject={{ id: s.id!, name: s.name }} />
        ))}
      </Stack>
    );
  }, [subjects, isLoading, error]);

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h5">Subjects</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {isFetching && <CircularProgress size={18} />}
          <CreateSubjectButton />
        </Stack>
      </Stack>
      <Divider sx={{ mb: 2 }} />
      {body}
    </Box>
  );
}
