// DeleteSubjectAction.tsx
import { useState } from 'react';
import { IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useDeleteSubjectMutation } from '../../features/subjects/subjectsApi';

export default function DeleteSubjectAction({ subjectId, subjectName }: { subjectId: string; subjectName: string }) {
  const [open, setOpen] = useState(false);
  const [del, { isLoading }] = useDeleteSubjectMutation();

  const onConfirm = async () => {
    await del({ subjectId }).unwrap();
    setOpen(false);
  };

  return (
    <>
      <IconButton size="small" onClick={() => setOpen(true)}><DeleteIcon /></IconButton>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Delete Subject</DialogTitle>
        <DialogContent>
          <Typography>
            Delete “{subjectName}”? This will also delete all of its topics and notes. This cannot be undone.
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
