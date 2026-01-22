import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, FormControl, InputLabel, Select, MenuItem, CircularProgress
} from '@mui/material';
import { useMoveNotesMutation } from './notesApi';
import { subjectsApi } from '../subjects/subjectsApi';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { sortByStringKeyCI } from '../../utils/sort';

type Props = {
  open: boolean;
  onClose: () => void;
  noteIds: string[];
  // optional: provide current source to enable smart invalidation/hints
  source?: { subjectId: string; topicId: string };
};

export default function MoveNotesDialog({ open, onClose, noteIds, source }: Props) {
  const { data: subjects } = subjectsApi.useGetSubjectsQuery();
  const sortedSubjects = useMemo(
    () => sortByStringKeyCI(subjects ?? [], (s) => s.name),
    [subjects],
  );
  const [subjectId, setSubjectId] = useState<string>('');
  const [topicId, setTopicId] = useState<string>('');

  // ⬇️ When dialog opens, default Subject/Topic to current note's location (if provided)
  useEffect(() => {
    if (!open) return;

    // If we have a source, always sync to it when dialog opens
    if (source) {
      setSubjectId(source.subjectId ?? '');
      setTopicId(source.topicId ?? '');
    } else {
      // If no source is provided, reset selections when opening
      setSubjectId('');
      setTopicId('');
    }
  }, [open, source?.subjectId, source?.topicId]);

  // Lazy-fetch topics for the chosen subject (adjust to your API)
  const { data: topicsData, isFetching: topicsLoading } =
    subjectsApi.useGetTopicsForSubjectQuery(subjectId ? subjectId : skipToken);
  const sortedTopics = useMemo(
    () => sortByStringKeyCI(topicsData ?? [], (t) => t.name),
    [topicsData],
  );

  const [moveNotes, { isLoading }] = useMoveNotesMutation();

  const canSubmit = subjectId && topicId && noteIds.length > 0 && !isLoading;

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await moveNotes({
        noteIds,
        dest: { subjectId, topicId },
        // ⬇️ this is only used client-side for invalidatesTags
        source,
      }).unwrap();
      onClose();
    } catch (e) {
      // Optional: toast/snackbar
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Move {noteIds.length} {noteIds.length === 1 ? 'note' : 'notes'}
      </DialogTitle>
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
              {sortedSubjects.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
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
                const t = topicsData?.find((t) => t.id === v);
                return t?.name ?? '';
              }}
            >
              {topicsLoading && (
                <MenuItem value="">
                  <CircularProgress size={18} />
                </MenuItem>
              )}
              {sortedTopics.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
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
