import { useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, FormControl, InputLabel, Select, MenuItem, CircularProgress
} from '@mui/material';
import { useSelector } from 'react-redux';
import { useMoveNotesMutation } from './notesApi';
import { subjectsApi } from '../subjects/subjectsApi';
import { skipToken } from '@reduxjs/toolkit/query/react';

type Props = {
  open: boolean;
  onClose: () => void;
  noteIds: string[];
  // optional: provide current source to enable smart invalidation/hints
  source?: { subjectId: string; topicId: string };
};

export default function MoveNotesDialog({ open, onClose, noteIds, source }: Props) {
  const { data: subjects } = subjectsApi.useGetSubjectsQuery();
  const [subjectId, setSubjectId] = useState<string>('');
  const [topicId, setTopicId] = useState<string>('');

  // Lazy-fetch topics for the chosen subject (adjust to your API)
  const { data: topicsData, isFetching: topicsLoading } =
    subjectsApi.useGetTopicsForSubjectQuery(subjectId ? subjectId : skipToken);

  const [moveNotes, { isLoading }] = useMoveNotesMutation();

  const canSubmit = subjectId && topicId && noteIds.length > 0 && !isLoading;

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await moveNotes({
        noteIds,
        dest: { subjectId, topicId },
      }).unwrap();
      onClose();
    } catch (e) {
      // Optional: toast/snackbar
      // console.error(e);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Move {noteIds.length} {noteIds.length === 1 ? 'note' : 'notes'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel id="move-subject-label">Subject</InputLabel>
            <Select
              labelId="move-subject-label"
              value={subjectId}
              label="Subject"
              onChange={(e) => {
                setSubjectId(e.target.value);
                setTopicId(''); // reset topic when subject changes
              }}
            >
              {(subjects ?? []).map(s => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth disabled={!subjectId || topicsLoading}>
            <InputLabel id="move-topic-label">Topic</InputLabel>
            <Select
              labelId="move-topic-label"
              value={topicId}
              label="Topic"
              onChange={(e) => setTopicId(e.target.value)}
              renderValue={(v) => {
                const t = topicsData?.find(t => t.id === v);
                return t?.name ?? '';
              }}
            >
              {topicsLoading && <MenuItem value=""><CircularProgress size={18} /></MenuItem>}
              {(topicsData ?? []).map(t => (
                <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
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
