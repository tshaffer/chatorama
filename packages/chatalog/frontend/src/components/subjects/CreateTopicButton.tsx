// CreateTopicButton.tsx
import { useState } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, TextField, DialogActions } from '@mui/material';
import { useCreateTopicMutation } from '../../features/subjects/subjectsApi';

export default function CreateTopicButton({ subjectId }: { subjectId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [createTopic, { isLoading }] = useCreateTopicMutation();

  const onSubmit = async () => {
    if (!name.trim()) return;
    await createTopic({ subjectId, name: name.trim() }).unwrap();
    setName('');
    setOpen(false);
  };

  return (
    <>
      <Button variant="outlined" size="small" onClick={() => setOpen(true)}>New Topic</Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Create Topic</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Name" value={name} onChange={e => setName(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={isLoading || !name.trim()} onClick={onSubmit}>Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
