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
import { useGetSubjectsWithTopicsQuery } from '../features/subjects/subjectsApi';
import type { Subject, Topic } from '@chatorama/chatalog-shared';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  initialSubjectLabel?: string;
  initialTopicLabel?: string;
  okText?: string;
  cancelText?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (payload: { subjectLabel: string; topicLabel: string }) => void;
};

export default function SubjectTopicPickerDialog({
  open,
  title,
  description,
  initialSubjectLabel = '',
  initialTopicLabel = '',
  okText = 'OK',
  cancelText = 'Cancel',
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const { data: subjects = [] } = useGetSubjectsWithTopicsQuery();
  const [subjectLabel, setSubjectLabel] = useState('');
  const [topicLabel, setTopicLabel] = useState('');

  useEffect(() => {
    if (!open) return;
    setSubjectLabel(initialSubjectLabel);
    setTopicLabel(initialTopicLabel);
  }, [open, initialSubjectLabel, initialTopicLabel]);

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

  const handleConfirm = () => {
    const trimmedSubject = subjectLabel.trim();
    const trimmedTopic = topicLabel.trim();
    if (!trimmedSubject || !trimmedTopic) return;
    onConfirm({ subjectLabel: trimmedSubject, topicLabel: trimmedTopic });
  };

  const isConfirmDisabled = busy || !subjectLabel.trim() || !topicLabel.trim();

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {description ? (
          <Typography variant="body2" sx={{ mb: 2 }}>
            {description}
          </Typography>
        ) : null}

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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          {cancelText}
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={isConfirmDisabled}
        >
          {busy ? 'Working…' : okText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
