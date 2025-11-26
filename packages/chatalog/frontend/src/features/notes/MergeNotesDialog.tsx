import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Radio,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { NotePreview } from '@chatorama/chatalog-shared';
import { useMergeNotesInTopicMutation } from './notesApi';

export type MergeNotesDialogProps = {
  open: boolean;
  topicId: string;
  notes: NotePreview[];
  onClose: () => void;
  onMerged?: (mergedNoteId: string) => void;
};

export default function MergeNotesDialog({
  open,
  topicId,
  notes,
  onClose,
  onMerged,
}: MergeNotesDialogProps) {
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noteMap = useMemo(() => {
    const m = new Map<string, NotePreview>();
    notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [notes]);

  const [mergeNotes, { isLoading }] = useMergeNotesInTopicMutation();

  useEffect(() => {
    if (!open) return;
    const ids = notes.map((n) => n.id);
    setOrderedIds(ids);
    const initialPrimary = ids[0] ?? '';
    setPrimaryId(initialPrimary);
    setTitle(noteMap.get(initialPrimary)?.title ?? '');
    setTitleEdited(false);
    setError(null);
  }, [open, notes, noteMap]);

  const move = (id: string, dir: -1 | 1) => {
    setOrderedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[nextIdx]] = [copy[nextIdx], copy[idx]];
      return copy;
    });
  };

  const handlePrimaryChange = (id: string) => {
    setPrimaryId(id);
    if (!titleEdited) {
      setTitle(noteMap.get(id)?.title ?? '');
    }
  };

  const handleMerge = async () => {
    if (!primaryId || orderedIds.length < 2) return;
    setError(null);
    try {
      const res = await mergeNotes({
        topicId,
        primaryNoteId: primaryId,
        noteIdsInOrder: orderedIds,
        title: title.trim() || undefined,
      }).unwrap();
      onMerged?.(res.mergedNoteId);
      onClose();
    } catch (e: any) {
      const msg =
        e?.data?.message ||
        e?.error ||
        (typeof e === 'string' ? e : '') ||
        'Failed to merge notes';
      setError(msg);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Merge notes</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose a primary note, reorder the merged sequence, and optionally edit the final title.
          The primary note will be updated; the others will be deleted. Tags will be combined, and
          content will be concatenated with separators.
        </Typography>

        <TextField
          fullWidth
          label="Merged title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleEdited(true);
          }}
          sx={{ mb: 2 }}
        />

        <List dense>
          {orderedIds.map((id, idx) => {
            const note = noteMap.get(id);
            if (!note) return null;
            return (
              <ListItem key={id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1 }}>
                <Radio
                  edge="start"
                  checked={primaryId === id}
                  onChange={() => handlePrimaryChange(id)}
                  value={id}
                  inputProps={{ 'aria-label': `Select ${note.title} as primary` }}
                />
                <ListItemText
                  primary={note.title || 'Untitled'}
                  secondary={
                    note.tags?.length ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {note.tags.map((t) => (
                          <Chip key={t} label={t} size="small" />
                        ))}
                      </Box>
                    ) : undefined
                  }
                />
                <ListItemSecondaryAction>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton
                      size="small"
                      onClick={() => move(id, -1)}
                      disabled={idx === 0}
                      aria-label="Move up"
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => move(id, 1)}
                      disabled={idx === orderedIds.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </ListItemSecondaryAction>
              </ListItem>
            );
          })}
        </List>

        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleMerge}
          disabled={isLoading || orderedIds.length < 2 || !primaryId}
        >
          {isLoading ? 'Merging…' : 'Merge'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
