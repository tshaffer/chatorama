import { memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetSubjectsQuery, useGetTopicsForSubjectQuery } from '../features/subjects/subjectsApi';
import { Topic } from '@shared/types';

// at top of the file
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const safeId = (o: { id?: string } | undefined) => o?.id ?? '';


export default function Home() {
  const navigate = useNavigate();
  const { data: subjects = [], isLoading } = useGetSubjectsQuery();

  const topSubjects = subjects.slice(0, 3);

  return (
    <Box sx={{ py: 2 }}>
      {/* Hero */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Welcome to Chatalog
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Organize notes in a simple hierarchy: <strong>Subject → Topic → Note</strong>.
          Click below to browse your notes or jump straight into a subject.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button component={Link} to="/s" variant="contained" size="large">
            Open Notes
          </Button>
          {/* Keep this if you have a seed route; otherwise remove */}
          <Button component={Link} to="/s/development" variant="outlined" size="large">
            Quick demo (Development)
          </Button>
        </Stack>
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {/* Quick links to Subjects/Topics */}
      <Typography variant="overline" color="text.secondary">
        Quick Links
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
        {isLoading && (
          <>
            <Skeleton variant="rounded" height={140} sx={{ flex: 1, minWidth: 260 }} />
            <Skeleton variant="rounded" height={140} sx={{ flex: 1, minWidth: 260 }} />
            <Skeleton variant="rounded" height={140} sx={{ flex: 1, minWidth: 260 }} />
          </>
        )}
        {!isLoading &&
          topSubjects.map((s) => (
            <SubjectCard key={safeId(s)} subjectId={safeId(s)} subjectName={s.name} />
          ))}
        {!isLoading && topSubjects.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No subjects yet.
          </Typography>
        )}
      </Stack>

      <Box sx={{ mt: 4 }}>
        <Typography variant="caption" color="text.secondary">
          Tip: Your selection is encoded in the URL (e.g. <code>/s/&lt;subject&gt;/t/&lt;topic&gt;/n/&lt;note&gt;</code>),
          so refreshes and deep links just work.
        </Typography>
      </Box>
    </Box>
  );
}

const SubjectCard = memo(function SubjectCard(props: {
  subjectId: string; // now required
  subjectName: string;
}) {
  const navigate = useNavigate();
  const { data: topics = [], isLoading } = useGetTopicsForSubjectQuery(props.subjectId);

  const chips = topics.slice(0, 3);
  const subjectHref = `/s/${props.subjectId}-${slugify(props.subjectName)}`;

  return (
    <Card variant="outlined" sx={{ minWidth: 260, flex: 1 }}>
      <CardActionArea onClick={() => navigate(subjectHref)}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {props.subjectName}
          </Typography>

          {isLoading ? (
            <Stack direction="row" spacing={1}>
              <Skeleton variant="rounded" width={80} height={24} />
              <Skeleton variant="rounded" width={80} height={24} />
              <Skeleton variant="rounded" width={80} height={24} />
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {chips.map((t: Topic) => {
                const chipHref = `/s/${props.subjectId}-${slugify(props.subjectName)}/t/${safeId(t)}-${slugify(t.name)}`;
                return (
                  <Chip
                    key={safeId(t) || t.name}
                    size="small"
                    label={t.name}
                    component={Link}
                    to={chipHref}
                    clickable
                    onClick={(e) => e.stopPropagation()}
                    sx={{ mr: 0.5, mb: 0.5 }}
                  />
                );
              })}
              {chips.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  No topics yet
                </Typography>
              )}
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
});
