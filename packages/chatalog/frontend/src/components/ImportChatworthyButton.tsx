// src/features/imports/ImportChatworthyButton.tsx
import { useRef, useState } from 'react';
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useImportChatworthyMutation } from '../features/imports/importsApi'; // keep your existing path

type Props = {
  onDone?: () => void;
  /** 'icon' for AppBar actions, 'button' for inline usage */
  mode?: 'icon' | 'button';
  /** Optional: tweak tooltip text */
  tooltip?: string;
  /** Optional: override accept attribute */
  accept?: string;
};

export default function ImportChatworthyButton({
  onDone,
  mode = 'button',
  tooltip = 'Import Chatworthy export (ZIP or Markdown)',
  accept = '.zip,.cbz,.tar,.tgz,.gz,.md,.markdown',
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [importChatworthy, { isLoading }] = useImportChatworthyMutation();
  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    severity: 'success' | 'error';
  }>({ open: false, msg: '', severity: 'success' });

  const pickFile = () => inputRef.current?.click();

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = ''; // allow re-picking same file later
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      setSnack({ open: true, msg: 'File is too large (>100MB).', severity: 'error' });
      return;
    }

    try {
      const res = await importChatworthy(file).unwrap();
      setSnack({
        open: true,
        msg: res.imported === 1 ? 'Imported 1 note' : `Imported ${res.imported} notes`,
        severity: 'success',
      });
      onDone?.();
      // If exactly one note was imported, jump directly to it using the ID-only route.
      // NotePage supports /n/:noteId, so we don’t need slugs here.
      // if (res.results?.length === 1 && res.results[0]?.noteId) {
      //   navigate(`/n/${res.results[0].noteId}`);
      // } else {
      //   onDone?.();
      // }
    } catch (err: any) {
      const msg =
        err?.data?.message ||
        err?.error ||
        (typeof err === 'string' ? err : '') ||
        'Import failed';
      setSnack({ open: true, msg, severity: 'error' });
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      hidden
      onChange={onFileChosen}
    />
  );

  if (mode === 'icon') {
    // Action icon for AppBar
    return (
      <>
        {fileInput}
        <Tooltip title={tooltip}>
          <span>
            <IconButton
              size="small"
              aria-label="Import"
              onClick={pickFile}
              disabled={isLoading}
              sx={(theme) => ({
                borderRadius: 2,
                backgroundColor: alpha(theme.palette.common.white, 0.18),
                '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.28) },
              })}
            >
              {isLoading ? <CircularProgress size={16} /> : <UploadFileIcon />}
            </IconButton>
          </span>
        </Tooltip>
        <Snackbar
          open={snack.open}
          autoHideDuration={4000}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnack((s) => ({ ...s, open: false }))}
            severity={snack.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {snack.msg}
          </Alert>
        </Snackbar>
      </>
    );
  }

  // Default: inline button usage
  return (
    <>
      {fileInput}
      <Tooltip title={tooltip}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={isLoading ? <CircularProgress size={16} /> : <UploadFileIcon />}
            onClick={pickFile}
            disabled={isLoading}
            color="inherit"
          >
            Import
          </Button>
        </span>
      </Tooltip>
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
