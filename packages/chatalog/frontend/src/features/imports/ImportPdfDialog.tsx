import { useEffect, useState } from 'react';
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
import SubjectTopicPickerFields from './SubjectTopicPickerFields';

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
  const [subjectLabel, setSubjectLabel] = useState('');
  const [topicLabel, setTopicLabel] = useState('');
  const [pdfSummaryMarkdown, setPdfSummaryMarkdown] = useState('');

  useEffect(() => {
    if (!open) return;
    setSubjectLabel('');
    setTopicLabel('');
    setPdfSummaryMarkdown(defaultSummaryFromFileName(fileName));
  }, [open, fileName]);

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
          <SubjectTopicPickerFields
            subjectLabel={subjectLabel}
            topicLabel={topicLabel}
            onSubjectLabelChange={setSubjectLabel}
            onTopicLabelChange={setTopicLabel}
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
