import { useMemo, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  LinearProgress,
  Typography,
  Toolbar,
  Button,
  Stack,
  Tooltip,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query';

import { useGetTopicNotesWithRelationsQuery } from '../features/notes/notesApi';
import ReorderableNotesList from '../features/notes/ReorderableNotesList';
import MoveNotesDialog from '../features/notes/MoveNotesDialog';
import SubjectTopicTree from '../features/subjects/SubjectTopicTree';

// Extract leading ObjectId from "<id>" or "<id>-<slug>"
const takeObjectId = (slug?: string) => slug?.match(/^[a-f0-9]{24}/i)?.[0];

export default function TopicNotesPage() {
  const { subjectSlug, topicSlug } = useParams();
  const subjectId = useMemo(() => takeObjectId(subjectSlug), [subjectSlug]);
  const topicId   = useMemo(() => takeObjectId(topicSlug),   [topicSlug]);
  const navigate  = useNavigate();

  // Selected notes (multi-select)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback((ids: string[]) => setSelectedIds(new Set(ids)), []);
  const hasSelection = selectedIds.size > 0;

  const [moveOpen, setMoveOpen] = useState(false);

  // ✅ ALWAYS call the hook. Use skipToken when IDs are not ready.
  const {
    data,
    isLoading,
    isError,
    error,
  } = useGetTopicNotesWithRelationsQuery(
    subjectId && topicId ? { subjectId, topicId } : skipToken,
  );

  const notes = data?.notes ?? [];
  const relatedTopicNotes   = data?.relatedTopicNotes ?? [];
  const relatedSubjectNotes = data?.relatedSubjectNotes ?? [];
  const relatedDirectNotes  = data?.relatedDirectNotes ?? [];

  const onReordered = useCallback(
    (noteIdsInOrder: string[]) => {
      // You already have reorder mutation wired; left as-is
      // e.g., reorder({ subjectId: subjectId!, topicId: topicId!, noteIdsInOrder });
    },
    [],
  );

  const onOpenNote = (noteId: string) => navigate(`/n/${noteId}`);

  const allIds = useMemo(
    () => notes.map(n => String((n as any).id ?? (n as any)._id)),
    [notes],
  );

  const renderRelatedList = (
    title: string,
    items: typeof notes,
  ) => {
    if (!items.length) return null;
    return (
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          {title}
        </Typography>
        <List dense>
          {items.map(n => (
            <ListItemButton
              key={n.id}
              onClick={() => onOpenNote(n.id)}
            >
              <ListItemText
                primary={n.title || 'Untitled'}
                secondary={n.summary}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* LEFT: hierarchy tree */}
      <SubjectTopicTree width={260} />

      {/* RIGHT: notes UI */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          p: 2,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* If URL is malformed / missing ids, show a friendly message */}
        {!subjectId || !topicId ? (
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              No topic selected
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use the Subjects & Topics tree on the left to pick a topic.
            </Typography>
          </Box>
        ) : (
          <>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="h6">Notes</Typography>
              <Toolbar disableGutters sx={{ gap: 1, minHeight: 'auto' }}>
                <Tooltip title="Select all notes in this topic">
                  <span>
                    <Button
                      size="small"
                      disabled={!notes.length}
                      onClick={() => selectAll(allIds)}
                    >
                      Select All
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title="Clear selection">
                  <span>
                    <Button
                      size="small"
                      disabled={!hasSelection}
                      onClick={clearSelection}
                    >
                      Clear
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title="Move selected notes to another topic">
                  <span>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!hasSelection}
                      onClick={() => setMoveOpen(true)}
                    >
                      Move ({selectedIds.size})
                    </Button>
                  </span>
                </Tooltip>
              </Toolbar>
            </Stack>

            {/* Error state */}
            {isError ? (
              <Box>
                <Typography color="error" sx={{ mb: 1 }}>
                  Failed to load notes.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {String((error as any)?.data ?? (error as any)?.message ?? error)}
                </Typography>
              </Box>
            ) : isLoading ? (
              <LinearProgress />
            ) : notes.length ? (
              <>
                <ReorderableNotesList
                  topicId={topicId}
                  notes={notes}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onReordered={onReordered}
                  onOpenNote={onOpenNote}
                />

                {/* Related sections */}
                {renderRelatedList('Related notes from other topics', relatedTopicNotes)}
                {renderRelatedList('Related notes by subject', relatedSubjectNotes)}
                {renderRelatedList('Directly related notes', relatedDirectNotes)}
              </>
            ) : (
              <Box sx={{ color: 'text.secondary', fontSize: 14 }}>
                No notes yet
              </Box>
            )}

            <MoveNotesDialog
              open={moveOpen}
              onClose={() => {
                setMoveOpen(false);
                clearSelection();
              }}
              noteIds={[...selectedIds]}
              source={{ subjectId, topicId }}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
