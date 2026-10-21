import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { useMoveTopicMutation, useGetSubjectsQuery } from './subjectsApi';
import { sortByStringKeyCI } from '../../utils/sort';

type Props = {
  open: boolean;
  onClose: () => void;
  topicId: string;
  topicName: string;
  sourceSubjectId: string;
};

export default function MoveTopicDialog({ open, onClose, topicId, topicName, sourceSubjectId }: Props) {
  const { data: subjects } = useGetSubjectsQuery();
  const sortedSubjects = useMemo(
    () => sortByStringKeyCI(
      (subjects ?? []).filter((s) => s.id !== sourceSubjectId),
      (s) => s.name,
    ),
    [subjects, sourceSubjectId],
  );

  const [destSubjectId, setDestSubjectId] = useState<string>('');

  useEffect(() => {
    if (open) setDestSubjectId('');
  }, [open]);

  const [moveTopic, { isLoading }] = useMoveTopicMutation();

  const canSubmit = Boolean(destSubjectId) && !isLoading;

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await moveTopic({ subjectId: sourceSubjectId, topicId, destSubjectId }).unwrap();
      onClose();
    } catch {
      // TODO: show error toast
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Move "{topicName}" to another subject</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel id="move-topic-subject-label">Destination subject</InputLabel>
            <Select
              labelId="move-topic-subject-label"
              value={destSubjectId}
              label="Destination subject"
              onChange={(e) => setDestSubjectId(e.target.value)}
            >
              {sortedSubjects.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button disabled={!canSubmit} variant="contained" onClick={handleSubmit}>
          {isLoading ? 'Moving…' : 'Move'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
