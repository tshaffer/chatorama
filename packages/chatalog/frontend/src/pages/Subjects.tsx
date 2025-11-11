// src/pages/Subjects.tsx
import { memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardActionArea, CardContent, Stack, Typography, Chip, Skeleton, Divider
} from '@mui/material';
import { useGetSubjectsQuery, useGetTopicsForSubjectQuery } from '../features/subjects/subjectsApi';
import type { Topic } from '@chatorama/chatalog-shared';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const safeId = (o: { id?: string } | undefined) => o?.id ?? '';

export default function SubjectsPage() {
  const { data: subjects = [], isLoading } = useGetSubjectsQuery();

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" sx={{ mb: 1.5 }}>Subjects</Typography>
      <Divider sx={{ mb: 2 }} />

      <Stack spacing={2}>
        {isLoading && (
          <>
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={120} />
          </>
        )}

        {!isLoading && subjects.map((s) => (
          <SubjectCard
            key={safeId(s)}
            subjectId={safeId(s)}
            subjectName={s.name}
          />
        ))}

        {!isLoading && subjects.length === 0 && (
          <Typography color="text.secondary">No subjects yet.</Typography>
        )}
      </Stack>
    </Box>
  );
}

const SubjectCard = memo(function SubjectCard(props: {
  subjectId: string;
  subjectName: string;
}) {
  const navigate = useNavigate();
  const { data: topics = [], isLoading } = useGetTopicsForSubjectQuery(props.subjectId);

  const subjectHref = `/s/${props.subjectId}-${slugify(props.subjectName)}`;

  return (
    <Card variant="outlined">
      <CardActionArea onClick={() => navigate(subjectHref)}>
        <CardContent>
          <Typography variant="h6" gutterBottom>{props.subjectName}</Typography>

          <Typography variant="overline" color="text.secondary">Topics</Typography>
          {isLoading ? (
            <Stack direction="row" spacing={1}>
              <Skeleton variant="rounded" width={120} height={24} />
              <Skeleton variant="rounded" width={120} height={24} />
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {topics.length === 0 && (
                <Typography variant="caption" color="text.secondary">No topics yet</Typography>
              )}

              {topics.map((t: Topic) => {
                const topicHref =
                  `/s/${props.subjectId}-${slugify(props.subjectName)}/t/${safeId(t)}-${slugify(t.name)}`;
                return (
                  <Chip
                    key={safeId(t) || t.name}
                    size="small"
                    label={t.name}
                    component={Link}
                    to={topicHref}
                    clickable
                    // IMPORTANT: don’t trigger the card’s onClick
                    onClick={(e) => e.stopPropagation()}
                    sx={{ mr: 0.5, mb: 0.5 }}
                  />
                );
              })}
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
});
