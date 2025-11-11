// DeleteTopicAction.tsx
import { useState } from 'react';
import { IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useDeleteTopicMutation } from '../../features/subjects/subjectsApi';

export default function DeleteTopicAction({
  subjectId, topicId, topicName,
}: { subjectId: string; topicId: string; topicName: string }) {
  const [open, setOpen] = useState(false);
  const [del, { isLoading }] = useDeleteTopicMutation();

  const onConfirm = async () => {
    await del({ subjectId, topicId }).unwrap();
    setOpen(false);
  };

  return (
    <>
      <IconButton size="small" onClick={() => setOpen(true)}><DeleteIcon /></IconButton>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Delete Topic</DialogTitle>
        <DialogContent>
          <Typography>
            Delete “{topicName}”? This will also delete all notes under this topic. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button color="error" disabled={isLoading} onClick={onConfirm}>Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
