import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Stack, Button, Typography,
} from '@mui/material';
import { useUpdateQuickNoteMutation } from './quickNotesApi';
import type { QuickNote } from './quickNotesApi';

export default function QuickNoteEditDialog({
  open, onClose, note,
}: {
  open: boolean;
  onClose: () => void;
  note?: QuickNote;
}) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [markdown, setMarkdown] = useState(note?.markdown ?? '');
  const [updateNote, { isLoading, error }] = useUpdateQuickNoteMutation();

  useEffect(() => {
    setTitle(note?.title ?? '');
    setMarkdown(note?.markdown ?? '');
  }, [note?.id, open]);

  const save = async () => {
    if (!note) return;
    await updateNote({ id: note.id, title, markdown }).unwrap();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Edit Quick Note</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} mt={0.5}>
          <TextField
            label="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            fullWidth
          />
          <TextField
            label="Body (Markdown)"
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            fullWidth
            multiline
            minRows={6}
          />
          {!!error && <Typography color="error" variant="body2">Failed to save changes.</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={isLoading || !markdown.trim()}>
          {isLoading ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
