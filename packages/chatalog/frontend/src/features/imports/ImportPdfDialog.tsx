import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Stack,
  Button,
  TextField,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import { useGetSubjectsWithTopicsQuery } from '../subjects/subjectsApi';
import type { Subject, Topic } from '@chatorama/chatalog-shared';

type Props = {
  open: boolean;
  fileName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (payload: {
    subjectLabel: string;
    topicLabel: string;
    pdfSummaryMarkdown: string;
  }) => void;
};

function defaultSummaryFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\.pdf$/i, '');
}

export default function ImportPdfDialog({
  open,
  fileName,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const { data: subjects = [] } = useGetSubjectsWithTopicsQuery();
  const [subjectLabel, setSubjectLabel] = useState('');
  const [topicLabel, setTopicLabel] = useState('');
  const [pdfSummaryMarkdown, setPdfSummaryMarkdown] = useState('');

  useEffect(() => {
    if (!open) return;
    setSubjectLabel('');
    setTopicLabel('');
    setPdfSummaryMarkdown(defaultSummaryFromFileName(fileName));
  }, [open, fileName]);

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    subjects
      .map((s: Subject) => s.name?.trim())
      .filter(Boolean)
      .forEach((name) => set.add(name as string));
    return Array.from(set);
  }, [subjects]);

  const selectedSubject = useMemo(() => {
    const trimmed = subjectLabel.trim();
    if (!trimmed) return undefined;

    return subjects.find(
      (s: Subject) => s.name?.trim() === trimmed
    ) as (Subject & { topics?: Topic[] }) | undefined;
  }, [subjects, subjectLabel]);

  const topicOptions = useMemo(() => {
    const set = new Set<string>();

    if (selectedSubject) {
      (selectedSubject.topics ?? []).forEach((t: Topic) => {
        const name = t.name?.trim();
        if (name) set.add(name);
      });
    }

    const trimmedTopic = topicLabel.trim();
    if (trimmedTopic && !set.has(trimmedTopic)) {
      set.add(trimmedTopic);
    }

    return Array.from(set);
  }, [selectedSubject, topicLabel]);

  const isConfirmDisabled =
    busy ||
    !subjectLabel.trim() ||
    !topicLabel.trim() ||
    !pdfSummaryMarkdown.trim();

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Import PDF</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Choose a Subject and Topic for the note that will contain this PDF.
        </Typography>

        <Stack spacing={2}>
          <Autocomplete
            freeSolo
            options={subjectOptions}
            value={subjectLabel}
            onChange={(_e, newValue) => setSubjectLabel(newValue ?? '')}
            onInputChange={(_e, newInputValue) =>
              setSubjectLabel(newInputValue ?? '')
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Subject label"
                placeholder="Subject label"
                size="small"
              />
            )}
          />

          <Autocomplete
            freeSolo
            options={topicOptions}
            value={topicLabel}
            onChange={(_e, newValue) => setTopicLabel(newValue ?? '')}
            onInputChange={(_e, newInputValue) =>
              setTopicLabel(newInputValue ?? '')
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Topic label"
                placeholder="Topic label"
                size="small"
              />
            )}
          />

          <TextField
            label="Summary (Markdown)"
            placeholder="Add a summary for this PDF"
            value={pdfSummaryMarkdown}
            onChange={(e) => setPdfSummaryMarkdown(e.target.value)}
            multiline
            minRows={4}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() =>
            onConfirm({
              subjectLabel: subjectLabel.trim(),
              topicLabel: topicLabel.trim(),
              pdfSummaryMarkdown: pdfSummaryMarkdown.trim(),
            })
          }
          disabled={isConfirmDisabled}
        >
          {busy ? 'Working…' : 'Continue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
