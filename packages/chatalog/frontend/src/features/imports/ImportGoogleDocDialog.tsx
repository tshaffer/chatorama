import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Stack,
} from '@mui/material';
import { useImportGoogleDocFromDriveMutation, useGetGoogleOAuthStatusQuery } from '../notes/notesApi';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: (noteId: string) => void;
};

function extractDriveFileId(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    const fromParam = url.searchParams.get('id');
    if (fromParam) return fromParam;
    const m = url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m?.[1]) return m[1];
  } catch {
    // not a URL
  }

  const m = trimmed.match(/[a-zA-Z0-9_-]{10,}/);
  return m?.[0];
}

export default function ImportGoogleDocDialog({
  open,
  onClose,
  onImported,
}: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: oauthStatus, isFetching: oauthLoading, refetch } =
    useGetGoogleOAuthStatusQuery(undefined, { skip: !open });
  const [importFromDrive, { isLoading }] = useImportGoogleDocFromDriveMutation();

  const driveFileId = useMemo(() => extractDriveFileId(input), [input]);
  const connected = Boolean(oauthStatus?.connected);

  const handleClose = () => {
    setInput('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Import Google Doc</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Google Doc URL or File ID"
            placeholder="https://docs.google.com/document/d/FILE_ID/edit"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            helperText={driveFileId ? `Detected file ID: ${driveFileId}` : 'Paste a Google Doc URL or fileId.'}
            fullWidth
          />

          {!connected ? (
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Google Drive is not connected.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => window.open('/api/v1/google/oauth/start', '_blank', 'noopener,noreferrer')}
              >
                Connect Google Drive
              </Button>
              <Button size="small" onClick={() => refetch()} disabled={oauthLoading}>
                {oauthLoading ? 'Checking…' : 'Refresh connection status'}
              </Button>
            </Stack>
          ) : null}

          {error ? (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!driveFileId || !connected || isLoading}
          onClick={async () => {
            if (!driveFileId) return;
            setError(null);
            try {
              const res = await importFromDrive({ driveFileId }).unwrap();
              onImported?.(res.noteId);
              handleClose();
            } catch (err: any) {
              const msg = err?.data?.error ?? err?.message ?? 'Import failed';
              setError(String(msg));
            }
          }}
        >
          {isLoading ? 'Importing…' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
