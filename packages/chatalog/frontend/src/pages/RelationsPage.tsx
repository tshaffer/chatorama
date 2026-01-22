import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  IconButton,
  Tooltip,
  Stack,
} from '@mui/material';
import LaunchIcon from '@mui/icons-material/Launch';

import {
  useGetAllNotesForRelationsQuery,
} from '../features/notes/notesApi';
import {
  useGetSubjectsQuery,
} from '../features/subjects/subjectsApi';
import {
  useGetAllTopicsQuery,
} from '../features/topics/topicsApi';

import type {
  NotePreview,
  NoteRelation,
  NoteRelationTargetType,
  Subject,
  Topic,
} from '@chatorama/chatalog-shared';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

type RelationEdge = {
  source: NotePreview;
  relation: NoteRelation;
};

function targetTypeLabel(t: NoteRelationTargetType): string {
  if (t === 'note') return 'Note';
  if (t === 'topic') return 'Topic';
  return 'Subject';
}

export default function RelationsPage() {
  const navigate = useNavigate();

  const {
    data: notes = [],
    isLoading: notesLoading,
    isError: notesError,
    error: notesErrorObj,
  } = useGetAllNotesForRelationsQuery();

  const {
    data: subjects = [],
    isLoading: subjectsLoading,
  } = useGetSubjectsQuery();

  const {
    data: topics = [],
    isLoading: topicsLoading,
  } = useGetAllTopicsQuery();

  const loading = notesLoading || subjectsLoading || topicsLoading;

  const notesById = useMemo(() => {
    const m = new Map<string, NotePreview>();
    for (const n of notes) {
      m.set(n.id, n);
    }
    return m;
  }, [notes]);

  const subjectsById = useMemo(() => {
    const m = new Map<string, Subject>();
    for (const s of subjects as Subject[]) {
      m.set(s.id, s);
    }
    return m;
  }, [subjects]);

  const topicsById = useMemo(() => {
    const m = new Map<string, Topic>();
    for (const t of topics as Topic[]) {
      m.set(t.id, t);
    }
    return m;
  }, [topics]);

  const edges: RelationEdge[] = useMemo(() => {
    const out: RelationEdge[] = [];
    for (const n of notes) {
      const rels = (n.relations ?? []) as NoteRelation[];
      for (const r of rels) {
        if (!r || !r.targetId?.trim()) continue;
        out.push({ source: n, relation: r });
      }
    }
    return out;
  }, [notes]);

  const handleOpenTarget = (rel: NoteRelation) => {
    const { targetType, targetId } = rel;

    if (targetType === 'note') {
      navigate(`/n/${targetId}`);
      return;
    }

    if (targetType === 'subject') {
      const subject = subjectsById.get(targetId);
      if (!subject) return;
      const subjectSlug = `${subject.id}-${slugify(subject.name)}`;
      navigate(`/s/${subjectSlug}`);
      return;
    }

    if (targetType === 'topic') {
      const topic = topicsById.get(targetId);
      if (!topic) return;
      const subject = subjectsById.get(topic.subjectId);
      if (!subject) return;

      const subjectSlug = `${subject.id}-${slugify(subject.name)}`;
      const topicSlug = `${topic.id}-${slugify(topic.name)}`;
      navigate(`/s/${subjectSlug}/t/${topicSlug}`);
      return;
    }
  };

  const renderTargetLabel = (rel: NoteRelation): string => {
    const { targetType, targetId } = rel;

    if (targetType === 'note') {
      const n = notesById.get(targetId);
      return n?.title || 'Note';
    }

    if (targetType === 'subject') {
      const s = subjectsById.get(targetId);
      return s?.name || 'Subject';
    }

    const t = topicsById.get(targetId);
    if (t) {
      const subj = subjectsById.get(t.subjectId);
      if (subj) return `${subj.name} / ${t.name}`;
      return t.name;
    }

    return 'Unknown';
  };

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        p: { xs: 1, sm: 2 },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          mb: 2,
          py: 1,
        }}
      >
        <Box>
          <Typography variant="h4" gutterBottom>
            Relations
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This view shows all note relations across subjects, topics, and notes.
          </Typography>
        </Box>
        <Chip
          size="small"
          label={`${edges.length} relation${edges.length === 1 ? '' : 's'}`}
        />
      </Stack>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {loading && !notes.length ? (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : notesError ? (
          <Box>
            <Typography variant="h5" gutterBottom>
              Relations
            </Typography>
            <Typography color="error" variant="body2">
              Failed to load relations:{' '}
              {String(
                (notesErrorObj as any)?.data ??
                  (notesErrorObj as any)?.message ??
                  notesErrorObj,
              )}
            </Typography>
          </Box>
        ) : edges.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No relations defined yet. Use the Relations panel in the note editor to
            link notes to subjects, topics, and other notes.
          </Typography>
        ) : (
          <Table size="small" sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                <TableCell>From note</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Target</TableCell>
                <TableCell>Target type</TableCell>
                <TableCell align="right">Open</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* NOTE: Do not alphabetize relation edges; order is derived. */}
              {edges.map((edge, idx) => {
                const { source, relation } = edge;
                const targetLabel = renderTargetLabel(relation);

                return (
                  <TableRow key={`${source.id}-${idx}`}>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Typography variant="body2" noWrap>
                        {source.title || 'Untitled'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={relation.kind}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography variant="body2" noWrap>
                        {targetLabel}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {targetTypeLabel(relation.targetType)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Open target">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenTarget(relation)}
                            disabled={
                              relation.targetType === 'topic' &&
                              !topicsById.get(relation.targetId)
                            }
                          >
                            <LaunchIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Box>
    </Box>
  );
}
