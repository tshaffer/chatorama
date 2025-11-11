// src/pages/SubjectIndex.tsx
import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useGetTopicsForSubjectQuery } from '../features/subjects/subjectsApi';

const takeObjectId = (slug?: string) => slug?.match(/^[a-f0-9]{24}/i)?.[0];
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default function SubjectIndex() {
  const { subjectSlug } = useParams<{ subjectSlug: string }>();
  const navigate = useNavigate();

  const subjectId = useMemo(() => takeObjectId(subjectSlug), [subjectSlug]);
  const { data: topics = [], isLoading } = useGetTopicsForSubjectQuery(subjectId ?? '');

  useEffect(() => {
    if (!subjectId || isLoading) return;
    if (topics.length > 0) {
      const first = topics[0];
      const topicId = first.id ?? (first as any)._id;
      navigate(`/s/${subjectSlug}/t/${topicId}-${slugify(first.name)}`, { replace: true });
    } else {
      // no topics yet — you can route somewhere else if you prefer
      // navigate('/subjects', { replace: true });
    }
  }, [subjectId, subjectSlug, topics, isLoading, navigate]);

  return (
    <Box p={2} display="flex" alignItems="center" justifyContent="center">
      <CircularProgress size={20} />
    </Box>
  );
}
