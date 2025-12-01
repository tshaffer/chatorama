// src/pages/SubjectIndex.tsx
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LinkNoteToTargetDialog from '../features/relations/LinkNoteToTargetDialog';
import {
  Box,
  CircularProgress,
  Typography,
  Stack,
  Card,
  CardContent,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  Button,
} from '@mui/material';

import { useGetTopicsForSubjectQuery } from '../features/subjects/subjectsApi';
import { useGetSubjectsQuery, useGetSubjectRelationsSummaryQuery } from '../features/subjects/subjectsApi';
import { skipToken } from '@reduxjs/toolkit/query';

const takeObjectId = (slug?: string) => slug?.match(/^[a-f0-9]{24}/i)?.[0];
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default function SubjectIndex() {
  const { subjectSlug } = useParams<{ subjectSlug: string }>();
  const navigate = useNavigate();

  const subjectId = useMemo(() => takeObjectId(subjectSlug), [subjectSlug]);

  // Load all subjects so we can resolve the subject name
  const { data: subjects = [], isLoading: subjectsLoading } = useGetSubjectsQuery();

  const {
    data: relationsSummary,
    isLoading: relLoading,
    isError: relError,
    error: relErrorObj,
    refetch: refetchRelations,
  } = useGetSubjectRelationsSummaryQuery(subjectId ?? (skipToken as any));

  const subject = useMemo(
    () => subjects.find((s) => s.id === subjectId),
    [subjects, subjectId],
  );

  // Topics for this subject (same as before)
  const {
    data: topics = [],
    isLoading: topicsLoading,
    isError: topicsError,
    error: topicsErrorObj,
  } = useGetTopicsForSubjectQuery(subjectId ?? '');

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const loading = subjectsLoading || topicsLoading;

  // ---- render ----

  if (!subjectId) {
    return (
      <Box p={2}>
        <Typography variant="h6">Invalid subject link</Typography>
        <Typography variant="body2" color="text.secondary">
          The subject id in the URL is missing or malformed.
        </Typography>
      </Box>
    );
  }

  if (loading && !subject && !topics.length) {
    return (
      <Box p={2} display="flex" alignItems="center" justifyContent="center">
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (topicsError) {
    return (
      <Box p={2}>
        <Typography variant="h6" color="error">
          Failed to load subject.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {String(
            (topicsErrorObj as any)?.data ??
            (topicsErrorObj as any)?.message ??
            topicsErrorObj,
          )}
        </Typography>
      </Box>
    );
  }

  const subjectName =
    subject?.name ??
    // fallback: try to infer from slug part after id
    (subjectSlug ? subjectSlug.replace(/^[a-f0-9]{24}-?/i, '').replace(/-/g, ' ') : 'Subject');

  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
        boxSizing: 'border-box',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: (theme) => theme.zIndex.appBar - 1,
          bgcolor: 'background.paper',
          pt: 1,
        }}
      >
        <Typography variant="h4" sx={{ mb: 0.5 }}>
          {subjectName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Subject overview
        </Typography>
      </Box>

      <Divider />

      {/* Two-column layout on larger screens, stacked on small */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ flex: 1, minHeight: 0 }}
      >
        {/* LEFT: topics in this subject */}
        <Card
          variant="outlined"
          sx={{
            flex: { xs: '0 0 auto', md: 1 },
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <CardContent
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              height: '100%',
            }}
          >
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              Topics in this subject
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Click a topic to view its notes and relations.
            </Typography>

            {topicsLoading && topics.length === 0 ? (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CircularProgress size={20} />
              </Box>
            ) : topics.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No topics yet for this subject.
              </Typography>
            ) : (
              <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', mt: 0.5 }}>
                <List dense>
                  {topics.map((t) => {
                    const topicId = t.id ?? (t as any)._id;
                    const topicHref = `/s/${subjectSlug}/t/${topicId}-${slugify(t.name)}`;
                    return (
                      <ListItemButton
                        key={topicId}
                        onClick={() => navigate(topicHref)}
                      >
                        <ListItemText primary={t.name} />
                      </ListItemButton>
                    );
                  })}
                </List>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Subject-level relations */}
        <Card
          variant="outlined"
          sx={{
            flex: { xs: '0 0 auto', md: 1 },
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 0.5 }}
            >
              <Typography variant="h6">
                Subject relations
              </Typography>
              {subjectId && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setLinkDialogOpen(true)}
                >
                  Link note to subject
                </Button>
              )}
            </Stack>
            {relLoading && !relationsSummary && (
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 2,
                }}
              >
                <CircularProgress size={20} />
              </Box>
            )}

            {relError && (
              <Typography variant="body2" color="error">
                Failed to load subject relations:{' '}
                {String(
                  (relErrorObj as any)?.data ??
                  (relErrorObj as any)?.message ??
                  relErrorObj,
                )}
              </Typography>
            )}

            {!relLoading && !relError && relationsSummary && (
              <>
                {relationsSummary.relatedTopics.length === 0 &&
                  relationsSummary.relatedNotes.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No notes have explicitly linked to this subject yet. Use note
                    relations to associate notes and topics with this subject.
                  </Typography>
                ) : (
                  <>
                    {/* Related topics */}
                    {relationsSummary.relatedTopics.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                          Related topics
                        </Typography>
                        <List dense>
                          {relationsSummary.relatedTopics.map((rt) => {
                            const t = rt.topic;
                            const topicHref = `/s/${subjectSlug}/t/${t.id}-${slugify(
                              t.name,
                            )}`;
                            return (
                              <ListItemButton
                                key={t.id}
                                onClick={() => navigate(topicHref)}
                              >
                                <ListItemText
                                  primary={t.name}
                                  secondary={
                                    rt.noteCount === 1
                                      ? '1 note references this subject.'
                                      : `${rt.noteCount} notes reference this subject.`
                                  }
                                />
                              </ListItemButton>
                            );
                          })}
                        </List>
                      </Box>
                    )}

                    {/* Related notes */}
                    {relationsSummary.relatedNotes.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                          Related notes
                        </Typography>
                        <List dense>
                          {relationsSummary.relatedNotes.map((n) => (
                            <ListItemButton
                              key={n.id}
                              onClick={() => navigate(`/n/${n.id}`)}
                            >
                              <ListItemText
                                primary={n.title || 'Untitled'}
                                secondary={n.summary}
                              />
                            </ListItemButton>
                          ))}
                        </List>
                      </Box>
                    )}
                  </>
                )}
              </>
            )}

            {!relLoading && !relError && !relationsSummary && (
              <Typography variant="body2" color="text.secondary">
                No relations data available for this subject yet.
              </Typography>
            )}
          </CardContent>
        </Card>
        {subjectId && (
          <LinkNoteToTargetDialog
            open={linkDialogOpen}
            onClose={() => setLinkDialogOpen(false)}
            targetType="subject"
            targetId={subjectId}
            defaultKind="also-about"
            onLinked={refetchRelations}
          />
        )}
      </Stack>
    </Box >
  );
}
