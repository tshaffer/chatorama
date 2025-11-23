import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  MenuItem,
  CircularProgress,
  Typography,
  Stack,
} from '@mui/material';

import type {
  NotePreview,
  NoteRelation,
  NoteRelationKind,
  NoteRelationTargetType,
} from '@chatorama/chatalog-shared';

import {
  useGetAllNotesForRelationsQuery,
  useUpdateNoteMutation,
} from '../notes/notesApi';
import { NoteStatusIndicator } from '../notes/NoteStatusIndicator'; // ⬅️ NEW

type Props = {
  open: boolean;
  onClose: () => void;

  targetType: NoteRelationTargetType; // 'subject' | 'topic' | 'note' (we'll use subject/topic)
  targetId: string;

  defaultKind?: NoteRelationKind;
  /**
   * Optional callback after a successful link.
   * Use this to refetch Subject/Topic relation summaries.
   */
  onLinked?: () => void;
};

const KIND_OPTIONS: NoteRelationKind[] = [
  'also-about',
  'see-also',
  'supports',
  'contrasts-with',
  'warning',
  'background',
];

const targetTypeLabel: Record<NoteRelationTargetType, string> = {
  note: 'note',
  topic: 'topic',
  subject: 'subject',
};

export default function LinkNoteToTargetDialog({
  open,
  onClose,
  targetType,
  targetId,
  defaultKind = 'also-about',
  onLinked,
}: Props) {
  const {
    data: notes = [],
    isLoading,
    isError,
    error,
  } = useGetAllNotesForRelationsQuery();

  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [kind, setKind] = useState<NoteRelationKind>(defaultKind);
  const [submitting, setSubmitting] = useState(false);

  const [updateNote] = useUpdateNoteMutation();

  const sortedNotes = useMemo(() => {
    const arr = [...notes] as NotePreview[];
    arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return arr;
  }, [notes]);

  const selectedNote = useMemo(
    () => sortedNotes.find((n) => n.id === selectedNoteId),
    [sortedNotes, selectedNoteId],
  );

  const canSubmit = !!selectedNote && !!targetId && !submitting;

  const handleSubmit = async () => {
    if (!selectedNote || !targetId) return;
    setSubmitting(true);
    try {
      const existing: NoteRelation[] = (selectedNote.relations ?? []) as NoteRelation[];

      // avoid exact duplicates
      const already = existing.some(
        (r) =>
          r.targetType === targetType &&
          r.targetId === targetId &&
          r.kind === kind,
      );

      const nextRelations: NoteRelation[] = already
        ? existing
        : [...existing, { targetType, targetId, kind }];

      await updateNote({
        noteId: selectedNote.id,
        patch: { relations: nextRelations },
      }).unwrap();

      if (onLinked) onLinked();
      onClose();
      setSelectedNoteId('');
    } catch (e) {
      console.error('Failed to add relation', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const targetLabel = targetTypeLabel[targetType];

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Link a note to this {targetLabel}</DialogTitle>
      <DialogContent dividers>
        {isLoading && !notes.length && (
          <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {isError && (
          <Typography color="error" variant="body2">
            Failed to load notes:{' '}
            {String(
              (error as any)?.data ?? (error as any)?.message ?? error,
            )}
          </Typography>
        )}

        {!isLoading && !isError && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Choose a note and relation kind. This will add a relation on the
              chosen note pointing to this {targetLabel}.
            </Typography>

            <TextField
              select
              fullWidth
              label="Note"
              size="small"
              value={selectedNoteId}
              onChange={(e) => setSelectedNoteId(e.target.value)}
            >
              {sortedNotes.map((n) => (
                <MenuItem key={n.id} value={n.id}>
                  {n.title || 'Untitled'}
                  {/* status indicator inline with note title */}
                  <NoteStatusIndicator status={n.status} />
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              fullWidth
              label="Relation kind"
              size="small"
              value={kind}
              onChange={(e) => setKind(e.target.value as NoteRelationKind)}
            >
              {KIND_OPTIONS.map((k) => (
                <MenuItem key={k} value={k}>
                  {k}
                </MenuItem>
              ))}
            </TextField>

            {selectedNote && selectedNote.summary && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="subtitle2">Note summary</Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedNote.summary}
                </Typography>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit}
        >
          {submitting ? 'Linking…' : 'Link note'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
