// frontend/src/features/quickNotes/QuickCaptureDialog.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack, Button, FormControl, InputLabel, Select, MenuItem, Box, Typography } from '@mui/material';
import { useAddQuickNoteMutation } from './quickNotesApi';
import { useGetSubjectsWithTopicsQuery } from '../subjects/subjectsApi';
import type { Subject, Topic } from '@chatorama/chatalog-shared';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: (newId: string) => void;
  defaultSubjectId?: string;
  defaultTopicId?: string;
};

function deriveTitle(markdown: string): string {
  const trimmed = (markdown || '').trim();
  if (!trimmed) return '';
  // 1) First markdown heading
  const heading = trimmed.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 120);
  // 2) First non-empty line / sentence
  const firstLine = trimmed.split(/\r?\n/).find(l => l.trim().length > 0)?.trim() || '';
  const sentence = firstLine.split(/(?<=\.|\?|!)\s/)[0] || firstLine;
  return sentence.slice(0, 120);
}

export default function QuickCaptureDialog({
  open, onClose, onSaved, defaultSubjectId, defaultTopicId,
}: Props) {
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [subjectId, setSubjectId] = useState<string | undefined>(defaultSubjectId);
  const [topicId, setTopicId] = useState<string | undefined>(defaultTopicId);

  const [addQuickNote, { isLoading, error, data }] = useAddQuickNoteMutation();
  const { data: subjects = [] } = useGetSubjectsWithTopicsQuery();

  const derivedTitle = useMemo(() => title.trim() ? '' : deriveTitle(markdown), [title, markdown]);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setMarkdown('');
      setSubjectId(defaultSubjectId);
      setTopicId(defaultTopicId);
    }
  }, [open, defaultSubjectId, defaultTopicId]);

  const handleSave = useCallback(async () => {
    const finalTitle = title.trim() || derivedTitle || 'Untitled quick note';
    const res = await addQuickNote({
      title: finalTitle,
      markdown,
      subjectId,
      topicId,
    }).unwrap();
    onSaved?.(res.id ?? '');
    onClose();
  }, [addQuickNote, title, derivedTitle, markdown, subjectId, topicId, onClose, onSaved]);

  // Cmd/Ctrl + Enter to save
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && markdown.trim()) {
      e.preventDefault();
      if (!isLoading) handleSave();
    }
  };

  // simple subject→topic select data
  const selectedSubject = subjects.find(s => s.id === subjectId) as (Subject & { topics?: Topic[] }) | undefined;
  const topics = selectedSubject?.topics ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>New Quick Note</DialogTitle>
      <DialogContent dividers onKeyDown={onKeyDown}>
        <Stack spacing={2} mt={0.5}>
          <TextField
            label="Title (optional)"
            placeholder={derivedTitle ? `Will use: “${derivedTitle}”` : 'Add a short title'}
            value={title}
            onChange={e => setTitle(e.target.value)}
            inputProps={{ maxLength: 140 }}
            fullWidth
            autoFocus
          />
          <TextField
            label="Body (Markdown)"
            placeholder="Jot it down… (Cmd/Ctrl+Enter to save)"
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            fullWidth
            multiline
            minRows={6}
          />
          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="qc-subject-label">Subject (optional)</InputLabel>
              <Select
                labelId="qc-subject-label"
                label="Subject (optional)"
                value={subjectId ?? ''}
                onChange={e => {
                  const v = e.target.value as string;
                  setSubjectId(v || undefined);
                  setTopicId(undefined);
                }}
              >
                <MenuItem value=""><em>Unfiled</em></MenuItem>
                {subjects.map(s => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!subjectId}>
              <InputLabel id="qc-topic-label">Topic (optional)</InputLabel>
              <Select
                labelId="qc-topic-label"
                label="Topic (optional)"
                value={topicId ?? ''}
                onChange={e => setTopicId((e.target.value as string) || undefined)}
              >
                <MenuItem value=""><em>Unfiled</em></MenuItem>
                {topics.map(t => (
                  <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {!!error && (
            <Box>
              <Typography color="error" variant="body2">
                {(error as any)?.data?.message ?? 'Failed to save note.'}
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={isLoading || !markdown.trim()}
        >
          {isLoading ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
