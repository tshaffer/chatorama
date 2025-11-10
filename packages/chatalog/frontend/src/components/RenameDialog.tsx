import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControlLabel, Checkbox } from '@mui/material';

type Props = {
  open: boolean;
  entityLabel: 'Subject' | 'Topic';
  initialName: string;
  defaultPreserveSlug?: boolean; // default true to avoid breaking links
  onCancel: () => void;
  onConfirm: (newName: string, preserveSlug: boolean) => Promise<void> | void;
};

export default function RenameDialog({
  open,
  entityLabel,
  initialName,
  defaultPreserveSlug = true,
  onCancel,
  onConfirm,
}: Props) {
  const [name, setName] = useState(initialName);
  const [preserveSlug, setPreserveSlug] = useState(defaultPreserveSlug);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setPreserveSlug(defaultPreserveSlug);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialName, defaultPreserveSlug]);

  const handleConfirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required.'); return; }
    try {
      setSubmitting(true);
      await onConfirm(trimmed, preserveSlug);
    } catch (e: any) {
      setError(e?.message || 'Failed to rename.');
      setSubmitting(false);
      return;
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onCancel} fullWidth maxWidth="xs">
      <DialogTitle>Rename {entityLabel}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label={`${entityLabel} Name`}
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          error={!!error}
          helperText={error || ' '}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={preserveSlug}
              onChange={(e) => setPreserveSlug(e.target.checked)}
              disabled={submitting}
            />
          }
          label="Keep current URL slug"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button onClick={handleConfirm} disabled={submitting || !name.trim()} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}
