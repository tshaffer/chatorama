// src/pages/Subjects.tsx
import { memo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  Chip,
  Skeleton,
  Divider,
  TextField,
  Button,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  useGetSubjectsQuery,
  useGetTopicsForSubjectQuery,
  useCreateSubjectMutation,
  useDeleteSubjectMutation,
  useRenameSubjectMutation,
  useCreateTopicMutation,
  useDeleteTopicMutation,
  useRenameTopicMutation,
  useReorderSubjectsMutation,
  useReorderTopicsMutation,
} from '../features/subjects/subjectsApi';
import type { Topic } from '@chatorama/chatalog-shared';
import InlineEditableName from '../components/InlineEditableName';
import ConfirmIconButton from '../components/ConfirmIconButton';

import ReorderSubjectsDialog, {
  type ReorderItem as ReorderSubjectItem,
} from '../features/subjects/ReorderSubjectsDialog';
import ReorderTopicsDialog from '../features/subjects/ReorderTopicsDialog';


const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const safeId = (o: { id?: string } | undefined) => o?.id ?? '';

export default function ManageSubjectsPage() {
  const { data: subjects = [], isLoading } = useGetSubjectsQuery();
  const [newSubjectName, setNewSubjectName] = useState('');
  const [createSubject, { isLoading: creatingSubject }] = useCreateSubjectMutation();

  const [reorderSubjectsOpen, setReorderSubjectsOpen] = useState(false);
  const [reorderSubjects, { isLoading: reorderingSubjects }] = useReorderSubjectsMutation();

  const handleCreateSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    await createSubject({ name }).unwrap();
    setNewSubjectName('');
  };

  const handleSaveReorderSubjects = async (orderedIds: string[]) => {
    if (!orderedIds.length) {
      setReorderSubjectsOpen(false);
      return;
    }
    await reorderSubjects({ orderedIds }).unwrap();
    setReorderSubjectsOpen(false);
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Manage Hierarchy
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create, rename, and delete subjects and topics. Changes here update the Notes hierarchy.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            placeholder="New subject"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateSubject()}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateSubject}
            disabled={creatingSubject || !newSubjectName.trim()}
          >
            Add
          </Button>
          <Button
            variant="outlined"
            onClick={() => setReorderSubjectsOpen(true)}
            disabled={isLoading || subjects.length < 2}
          >
            Reorder subjects…
          </Button>
        </Stack>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {/* Subject list */}
      <Stack spacing={2}>
        {isLoading && (
          <>
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={120} />
          </>
        )}

        {!isLoading &&
          subjects.map((s) => (
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

      <ReorderSubjectsDialog
        open={reorderSubjectsOpen}
        onClose={() => setReorderSubjectsOpen(false)}
        subjects={subjects.map(
          (s): ReorderSubjectItem => ({
            id: safeId(s),
            name: s.name,
          })
        )}
        onSave={handleSaveReorderSubjects}
        loading={reorderingSubjects}
      />
    </Box>
  );
}

const SubjectCard = memo(function SubjectCard(props: {
  subjectId: string;
  subjectName: string;
}) {
  const navigate = useNavigate();

  // queries/mutations for subject
  const [deleteSubject] = useDeleteSubjectMutation();
  const [renameSubject] = useRenameSubjectMutation();

  // topics for this subject
  const { data: topics = [], isLoading } = useGetTopicsForSubjectQuery(props.subjectId);
  const [createTopic, { isLoading: creatingTopic }] = useCreateTopicMutation();
  const [deleteTopic] = useDeleteTopicMutation();
  const [renameTopic] = useRenameTopicMutation();

  // local state for creating a topic
  const [newTopicName, setNewTopicName] = useState('');

  // local state for inline topic editing
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicDraft, setEditingTopicDraft] = useState('');

  // timers for topic chips (single vs double click)
  const chipTimersRef = useRef<Record<string, number | null>>({});

  const [reorderTopicsOpen, setReorderTopicsOpen] = useState(false);
  const [reorderTopics, { isLoading: reorderingTopics }] = useReorderTopicsMutation();

  const beginEditTopic = (t: Topic) => {
    setEditingTopicId(safeId(t));
    setEditingTopicDraft(t.name);
  };

  const saveEditTopic = async () => {
    if (!editingTopicId) return;
    const name = editingTopicDraft.trim();
    if (name) {
      await renameTopic({
        subjectId: props.subjectId,
        topicId: editingTopicId,
        name,
      }).unwrap();
    }
    setEditingTopicId(null);
  };

  const cancelEditTopic = () => {
    setEditingTopicId(null);
  };

  const handleCreateTopic = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const name = newTopicName.trim();
    if (!name) return;
    await createTopic({ subjectId: props.subjectId, name }).unwrap();
    setNewTopicName('');
  };

  const handleSaveReorderTopics = async (orderedTopicIds: string[]) => {
    if (!orderedTopicIds.length) {
      setReorderTopicsOpen(false);
      return;
    }
    await reorderTopics({
      subjectId: props.subjectId,
      orderedTopicIds,
    }).unwrap();
    setReorderTopicsOpen(false);
  };

  return (
    <Card
      variant="outlined"
      sx={{ cursor: 'default' }}
    >
      <CardContent sx={{ pb: 2 }}>
        {/* Header row */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1 }}
        >
          {/* Subject title: double-click to rename */}
          <Box sx={{ fontWeight: 600 }}>
            <InlineEditableName
              value={props.subjectName}
              startEditingOn="doubleClick"
              onSave={async (name) => {
                await renameSubject({
                  subjectId: props.subjectId,
                  name,
                }).unwrap();
              }}
            />
          </Box>

          <ConfirmIconButton
            title="Delete subject?"
            message="This will delete the subject and all its topics/notes."
            tooltip="Delete subject"
            icon={<DeleteIcon />}
            onConfirm={async () => {
              await deleteSubject({ subjectId: props.subjectId }).unwrap();
            }}
          />
        </Stack>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 0.5 }}
        >
          <Typography variant="overline" color="text.secondary">
            Topics
          </Typography>

          {topics.length > 1 && (
            <Button
              size="small"
              variant="text"
              onClick={(e) => {
                e.stopPropagation();
                setReorderTopicsOpen(true);
              }}
              disabled={reorderingTopics}
            >
              Reorder…
            </Button>
          )}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {topics.length === 0 && !isLoading && (
            <Typography variant="caption" color="text.secondary">
              No topics yet
            </Typography>
          )}

          {topics.map((t: Topic) => {
            const tid = safeId(t);
            const topicHref =
              `/s/${props.subjectId}-${slugify(props.subjectName)}/t/${tid}-${slugify(t.name)}`;

            const isEditing = editingTopicId === tid;
            if (isEditing) {
              return (
                <TextField
                  key={tid || t.name}
                  size="small"
                  value={editingTopicDraft}
                  onChange={(e) => setEditingTopicDraft(e.target.value)}
                  onBlur={saveEditTopic}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEditTopic();
                    if (e.key === 'Escape') cancelEditTopic();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  sx={{ mr: 0.5, mb: 0.5, minWidth: 160 }}
                  autoFocus
                />
              );
            }

            return (
              <Chip
                key={tid || t.name}
                size="small"
                label={t.name}
                clickable
                onClick={(e) => {
                  e.stopPropagation();
                  // arm a per-chip nav timer
                  const prev = chipTimersRef.current[tid];
                  if (prev) clearTimeout(prev);
                  chipTimersRef.current[tid] = window.setTimeout(() => {
                    chipTimersRef.current[tid] = null;
                    navigate(topicHref);
                  }, 250);
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // cancel the armed single-click nav for this chip
                  const timer = chipTimersRef.current[tid];
                  if (timer) {
                    clearTimeout(timer);
                    chipTimersRef.current[tid] = null;
                  }
                  beginEditTopic(t);
                }}
                onDelete={async (e) => {
                  (e as any)?.stopPropagation?.();
                  (e as any)?.preventDefault?.();
                  const timer = chipTimersRef.current[tid];
                  if (timer) {
                    clearTimeout(timer);
                    chipTimersRef.current[tid] = null;
                  }
                  if (confirm(`Delete topic “${t.name}”?`)) {
                    await deleteTopic({ subjectId: props.subjectId, topicId: tid }).unwrap();
                  }
                }}
                sx={{ mr: 0.5, mb: 0.5 }}
              />
            );
          })}
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <TextField
            size="small"
            placeholder="New topic"
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTopic(e as any)}
            onClick={(e) => e.stopPropagation()}
            sx={{ minWidth: 220 }}
          />
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={(e) => {
              e.stopPropagation();
              handleCreateTopic(e);
            }}
            disabled={creatingTopic || !newTopicName.trim()}
          >
            Add topic
          </Button>
        </Stack>

        <ReorderTopicsDialog
          open={reorderTopicsOpen}
          onClose={() => setReorderTopicsOpen(false)}
          subjectName={props.subjectName}
          topics={topics.map((t) => ({
            id: safeId(t),
            name: t.name,
          }))}
          onSave={handleSaveReorderTopics}
          loading={reorderingTopics}
        />

      </CardContent>
    </Card>
  );
});
