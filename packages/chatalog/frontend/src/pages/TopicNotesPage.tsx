import { useMemo, useCallback, useState, useEffect } from 'react';
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
import {
  useGetImportBatchesQuery,
  useGetImportBatchNotesQuery,
} from '../features/imports/importsApi';
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
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedBatchId(null);
    setSelectedIds(new Set());
  }, [subjectSlug, topicSlug]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedBatchId]);

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

  const { data: importBatches = [], refetch: refetchBatches } = useGetImportBatchesQuery();
  const selectedBatch = useMemo(
    () => importBatches.find((b) => b.id === selectedBatchId) ?? null,
    [importBatches, selectedBatchId],
  );
  const {
    data: batchNotes = [],
    isLoading: batchLoading,
    isError: batchError,
    error: batchErrorObj,
    refetch: refetchBatchNotes,
  } = useGetImportBatchNotesQuery(selectedBatchId ?? skipToken);

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

  const isBatchMode = !!selectedBatchId;
  const activeNotes = isBatchMode ? batchNotes : notes;
  const activeLoading = isBatchMode ? batchLoading : isLoading;
  const activeError = isBatchMode ? batchError : isError;
  const activeErrorObj = isBatchMode ? batchErrorObj : error;

  const onReordered = useCallback(
    (noteIdsInOrder: string[]) => {
      if (selectedBatchId) return;
      if (!subjectId || !topicId) return;
      reorder({ subjectId, topicId, noteIdsInOrder });
    },
    [reorder, subjectId, topicId, selectedBatchId],
  );

  const onOpenNote = (noteId: string) => navigate(`/n/${noteId}`);

  const allIds = useMemo(
    () => activeNotes.map(n => String((n as any).id ?? (n as any)._id)),
    [activeNotes],
  );
  const selectedNotes = useMemo(
    () => activeNotes.filter(n => selectedIds.has(n.id)),
    [activeNotes, selectedIds],
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
      if (selectedBatchId) {
        await Promise.all([refetchBatchNotes(), refetchBatches()]);
      } else {
        await refetchNotes();
      }
    } catch (e) {
      setDeleteDialogOpen(false);
    }
  }, [deleteNote, hasSelection, selectedIds, refetchNotes, refetchBatchNotes, refetchBatches, selectedBatchId, clearSelection]);

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
        height: '100%',   // ⬅️ let it fill the parent instead of using viewport math
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* LEFT: hierarchy tree */}
      <Box
        sx={{
          width: 260,
          flexShrink: 0,
          borderRight: (theme) => `1px solid ${theme.palette.divider}`,
          pr: 1.5,
          mr: 1.5,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',        // ⬅️ fill TopicNotesPage’s height
          overflowY: 'auto',     // ⬅️ this panel owns the scroll
          gap: 2,
        }}
      >
        <SubjectTopicTree
          width="100%"
          disableBorder
          onSubjectSelected={() => setSelectedBatchId(null)}
          onTopicSelected={() => setSelectedBatchId(null)}
        />

        <ImportHistorySection
          batches={importBatches}
          selectedBatchId={selectedBatchId}
          onSelectBatch={(id) => {
            setSelectedBatchId(id);
            clearSelection();
          }}
        />
      </Box>

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
          overflow: 'hidden',
        }}
      >
        {(!subjectId || !topicId) && !isBatchMode ? (
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
              sx={{
                mb: 1,
                position: 'sticky',
                top: 0,
                zIndex: (theme) => theme.zIndex.appBar - 1,
                bgcolor: 'background.paper',
                py: 1,
              }}
            >
              <Box>
                <Typography variant="h6">
                  {isBatchMode && selectedBatch
                    ? `Import on ${new Date(selectedBatch.createdAt).toLocaleString()}`
                    : 'Notes'}
                </Typography>
                {isBatchMode && selectedBatch && (
                  <Typography variant="body2" color="text.secondary">
                    {selectedBatch.importedCount} notes imported,{' '}
                    {selectedBatch.remainingCount} currently in Chatalog
                  </Typography>
                )}
              </Box>
              <Toolbar disableGutters sx={{ gap: 1, minHeight: 'auto' }}>
                <Tooltip title="Select all notes in this topic">
                  <span>
                    <Button
                      size="small"
                      disabled={!activeNotes.length}
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
                      disabled={selectedIds.size < 2 || isBatchMode}
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
                overflowX: 'hidden',
              }}
            >
              {activeError ? (
                <Box>
                  <Typography color="error" sx={{ mb: 1 }}>
                    Failed to load notes.
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {String(
                      (activeErrorObj as any)?.data ??
                      (activeErrorObj as any)?.message ??
                      activeErrorObj,
                    )}
                  </Typography>
                </Box>
              ) : activeLoading ? (
                <LinearProgress />
              ) : activeNotes.length ? (
                <>
                  <ReorderableNotesList
                    topicId={selectedBatchId || topicId || ''}
                    notes={activeNotes}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onReordered={isBatchMode ? () => { } : onReordered}
                    onOpenNote={onOpenNote}
                  />

                  {!isBatchMode && (
                    <>
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
                  )}
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
              source={
                selectedBatchId || !subjectId || !topicId
                  ? undefined
                  : { subjectId, topicId }
              }
            />
            {topicId && !isBatchMode && (
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

type ImportHistoryProps = {
  batches: { id: string; createdAt: string; importedCount: number; remainingCount: number }[];
  selectedBatchId: string | null;
  onSelectBatch: (id: string) => void;
};

function ImportHistorySection({ batches, selectedBatchId, onSelectBatch }: ImportHistoryProps) {
  const items = useMemo(
    () => [...batches].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [batches],
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return { date, time };
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{ flexShrink: 0 }}
      >
        Import History
      </Typography>

      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No imports yet
        </Typography>
      ) : (
        <Stack spacing={0.5}>
          {items.map((b) => {
            const { date, time } = formatDate(b.createdAt);
            const selected = selectedBatchId === b.id;
            return (
              <Box
                key={b.id}
                onClick={() => onSelectBatch(b.id)}
                sx={{
                  border: '1px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  p: 1,
                  cursor: 'pointer',
                  bgcolor: selected ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {date}, {time}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {b.importedCount} imported, {b.remainingCount} remaining
                </Typography>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
