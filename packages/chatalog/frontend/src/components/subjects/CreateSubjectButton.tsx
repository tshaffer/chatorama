// CreateSubjectButton.tsx
import { useState } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, TextField, DialogActions } from '@mui/material';
import { useCreateSubjectMutation } from '../../features/subjects/subjectsApi';

export default function CreateSubjectButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [createSubject, { isLoading }] = useCreateSubjectMutation();

  const onSubmit = async () => {
    if (!name.trim()) return;
    await createSubject({ name: name.trim() }).unwrap();
    setName('');
    setOpen(false);
  };

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>New Subject</Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Create Subject</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={isLoading || !name.trim()} onClick={onSubmit}>Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
