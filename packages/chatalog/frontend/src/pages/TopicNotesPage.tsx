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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query';
import { useSelector } from 'react-redux';

import {
  useGetTopicNotesWithRelationsQuery,
  useReorderNotesInTopicMutation,
  useDeleteNoteMutation,
} from '../features/notes/notesApi';
import { useGetTopicRelationsSummaryQuery } from '../features/subjects/subjectsApi';
import ReorderableNotesList from '../features/notes/ReorderableNotesList';
import MoveNotesDialog from '../features/notes/MoveNotesDialog';
import MergeNotesDialog from '../features/notes/MergeNotesDialog';
import SubjectTopicTree from '../features/subjects/SubjectTopicTree';
import LinkNoteToTargetDialog from '../features/relations/LinkNoteToTargetDialog';
import { NoteStatusIndicator } from '../features/notes/NoteStatusIndicator';
import { selectNoteStatusVisibility } from '../features/settings/settingsSlice';

// Extract leading ObjectId from "<id>" or "<id>-<slug>"
const takeObjectId = (slug?: string) => slug?.match(/^[a-f0-9]{24}/i)?.[0];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default function TopicNotesPage() {
  const { subjectSlug, topicSlug } = useParams();
  const subjectId = useMemo(() => takeObjectId(subjectSlug), [subjectSlug]);
  const topicId = useMemo(() => takeObjectId(topicSlug), [topicSlug]);
  const navigate = useNavigate();

  const noteStatusVisibility = useSelector(selectNoteStatusVisibility);

  const [reorder] = useReorderNotesInTopicMutation();
  const [deleteNote, { isLoading: isDeleting }] = useDeleteNoteMutation();

  // Selected notes (multi-select)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [linkTopicDialogOpen, setLinkTopicDialogOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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

  const topicNotesQueryArg =
    subjectId && topicId ? { subjectId, topicId } : skipToken;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch: refetchNotes,
  } = useGetTopicNotesWithRelationsQuery(topicNotesQueryArg, {
    refetchOnMountOrArgChange: true,
  });

  const {
    data: topicRelSummary,
    isLoading: topicRelLoading,
    isError: topicRelError,
    error: topicRelErrorObj,
    refetch: refetchTopicRelations,
  } = useGetTopicRelationsSummaryQuery(
    subjectId && topicId ? { subjectId, topicId } : (skipToken as any),
  );

  const notes = data?.notes ?? [];
  const relatedSubjectNotes = data?.relatedSubjectNotes ?? [];
  const relatedDirectNotes = data?.relatedDirectNotes ?? [];

  const onReordered = useCallback(
    (noteIdsInOrder: string[]) => {
      if (!subjectId || !topicId) return;
      reorder({ subjectId, topicId, noteIdsInOrder });
    },
    [reorder, subjectId, topicId],
  );

  const onOpenNote = (noteId: string) => navigate(`/n/${noteId}`);

  const allIds = useMemo(
    () => notes.map(n => String((n as any).id ?? (n as any)._id)),
    [notes],
  );
  const selectedNotes = useMemo(
    () => notes.filter(n => selectedIds.has(n.id)),
    [notes, selectedIds],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!hasSelection) return;
    try {
      const ids = Array.from(selectedIds);

      for (const id of ids) {
        await deleteNote({ noteId: id } as any).unwrap();
      }

      setDeleteDialogOpen(false);
      clearSelection();
      await refetchNotes();
    } catch (e) {
      setDeleteDialogOpen(false);
    }
  }, [deleteNote, hasSelection, selectedIds, refetchNotes]);

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
            <ListItemButton key={n.id} onClick={() => onOpenNote(n.id)}>
              <ListItemText
                primary={
                  <span>
                    {n.title || 'Untitled'}
                    <NoteStatusIndicator
                      status={n.status}
                      {...noteStatusVisibility}
                    />
                  </span>
                }
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
      id="topic-notes-page"
      sx={{
        display: 'flex',
        height: 'calc(100vh - 64px)',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* LEFT: hierarchy tree */}
      <SubjectTopicTree width={260} />

      {/* RIGHT: notes UI */}
      <Box
        id="mainPanel"
        sx={{
          flex: 1,
          minWidth: 0,
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {!subjectId || !topicId ? (
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              No topic selected
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use the Subjects &amp; Topics tree on the left to pick a topic.
            </Typography>
          </Box>
        ) : (
          <>
            {/* Header + toolbar */}
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
                <Tooltip title="Merge selected notes into one">
                  <span>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={selectedIds.size < 2}
                      onClick={() => setMergeOpen(true)}
                    >
                      Merge ({selectedIds.size})
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title="Permanently delete selected notes">
                  <span>
                    <Button
                      size="small"
                      color="error"
                      disabled={!hasSelection || isDeleting}
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      {isDeleting
                        ? 'Deleting…'
                        : `Delete (${selectedIds.size})`}
                    </Button>
                  </span>
                </Tooltip>
              </Toolbar>
            </Stack>

            {/* Scrollable body */}
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
              }}
            >
              {isError ? (
                <Box>
                  <Typography color="error" sx={{ mb: 1 }}>
                    Failed to load notes.
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {String(
                      (error as any)?.data ??
                      (error as any)?.message ??
                      error,
                    )}
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

                  {renderRelatedList(
                    'Related notes by subject',
                    relatedSubjectNotes,
                  )}
                  {renderRelatedList(
                    'Directly related notes',
                    relatedDirectNotes,
                  )}

                  {/* Incoming references */}
                  <Box sx={{ mt: 3 }}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ mb: 1 }}
                    >
                      <Typography variant="subtitle1">
                        Incoming references to this topic
                      </Typography>
                      {topicId && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setLinkTopicDialogOpen(true)}
                        >
                          Link note to topic
                        </Button>
                      )}
                    </Stack>

                    {topicRelLoading && !topicRelSummary && (
                      <Typography variant="body2" color="text.secondary">
                        Loading incoming relations…
                      </Typography>
                    )}

                    {topicRelError && (
                      <Typography variant="body2" color="error">
                        Failed to load topic relations:{' '}
                        {String(
                          (topicRelErrorObj as any)?.data ??
                          (topicRelErrorObj as any)?.message ??
                          topicRelErrorObj,
                        )}
                      </Typography>
                    )}

                    {!topicRelLoading &&
                      !topicRelError &&
                      topicRelSummary && (
                        <>
                          {topicRelSummary.relatedTopics.length === 0 &&
                            topicRelSummary.relatedNotes.length === 0 ? (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              No notes in other topics explicitly reference
                              this topic yet.
                            </Typography>
                          ) : (
                            <>
                              {topicRelSummary.relatedTopics.length > 0 && (
                                <Box sx={{ mb: 2 }}>
                                  <Typography
                                    variant="subtitle2"
                                    color="text.secondary"
                                    sx={{ mb: 0.5 }}
                                  >
                                    Other topics that reference this one
                                  </Typography>
                                  <List dense>
                                    {topicRelSummary.relatedTopics.map(rt => {
                                      const t = rt.topic;
                                      const sameSubject =
                                        t.subjectId &&
                                        t.subjectId === subjectId;
                                      const subjectSlugForNav =
                                        sameSubject && subjectSlug
                                          ? subjectSlug
                                          : t.subjectId
                                            ? `${t.subjectId}-subject`
                                            : '';

                                      const topicSlugForNav = `${t.id}-${slugify(
                                        t.name,
                                      )}`;

                                      const href =
                                        subjectSlugForNav &&
                                          topicSlugForNav
                                          ? `/s/${subjectSlugForNav}/t/${topicSlugForNav}`
                                          : undefined;

                                      return (
                                        <ListItemButton
                                          key={t.id}
                                          disabled={!href}
                                          onClick={() => {
                                            if (!href) return;
                                            navigate(href);
                                          }}
                                        >
                                          <ListItemText
                                            primary={t.name}
                                            secondary={
                                              rt.noteCount === 1
                                                ? '1 note in this topic references this topic.'
                                                : `${rt.noteCount} notes in this topic reference this topic.`
                                            }
                                          />
                                        </ListItemButton>
                                      );
                                    })}
                                  </List>
                                </Box>
                              )}

                              {topicRelSummary.relatedNotes.length > 0 && (
                                <>
                                  <Typography
                                    variant="subtitle2"
                                    color="text.secondary"
                                    sx={{ mb: 0.5 }}
                                  >
                                    Notes that reference this topic
                                  </Typography>
                                  <List dense>
                                    {topicRelSummary.relatedNotes.map(n => (
                                      <ListItemButton
                                        key={n.id}
                                        onClick={() => onOpenNote(n.id)}
                                      >
                                        <ListItemText
                                          primary={
                                            <span>
                                              {n.title || 'Untitled'}
                                              <NoteStatusIndicator
                                                status={n.status}
                                                {...noteStatusVisibility}
                                              />
                                            </span>
                                          }
                                          secondary={n.summary}
                                        />
                                      </ListItemButton>
                                    ))}
                                  </List>
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}
                  </Box>
                </>
              ) : (
                <Box sx={{ color: 'text.secondary', fontSize: 14 }}>
                  No notes yet
                </Box>
              )}
            </Box>

            {/* Move dialog */}
            <MoveNotesDialog
              open={moveOpen}
              onClose={() => {
                setMoveOpen(false);
                clearSelection();
              }}
              noteIds={[...selectedIds]}
              source={{ subjectId, topicId }}
            />
            {topicId && (
              <MergeNotesDialog
                open={mergeOpen}
                topicId={topicId}
                notes={selectedNotes}
                onClose={() => setMergeOpen(false)}
                onMerged={() => {
                  setMergeOpen(false);
                  clearSelection();
                  refetchNotes();
                }}
              />
            )}

            {/* DELETE CONFIRMATION DIALOG */}
            <Dialog
              open={deleteDialogOpen}
              onClose={() => (!isDeleting ? setDeleteDialogOpen(false) : null)}
            >
              <DialogTitle>Delete selected notes?</DialogTitle>
              <DialogContent>
                <DialogContentText>
                  {selectedIds.size === 1
                    ? 'Are you sure you want to permanently delete this note? This action cannot be undone.'
                    : `Are you sure you want to permanently delete ${selectedIds.size} notes? This action cannot be undone.`}
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmDelete}
                  color="error"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </Button>
              </DialogActions>
            </Dialog>
          </>
        )}
      </Box>

      {topicId && (
        <LinkNoteToTargetDialog
          open={linkTopicDialogOpen}
          onClose={() => setLinkTopicDialogOpen(false)}
          targetType="topic"
          targetId={topicId}
          defaultKind="also-about"
          onLinked={refetchTopicRelations}
        />
      )}
    </Box>
  );
}
