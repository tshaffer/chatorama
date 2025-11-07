// src/features/imports/ImportChatworthyButton.tsx
import { useRef, useState } from 'react';
import { Button, CircularProgress, Snackbar, Alert, Tooltip } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useImportChatworthyMutation } from '../features/imports/importsApi';

export default function ImportChatworthyButton({ onDone }: { onDone?: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [importChatworthy, { isLoading }] = useImportChatworthyMutation();
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false,
    msg: '',
    severity: 'success',
  });

  const pickFile = () => inputRef.current?.click();

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = ''; // allow re-picking same file later
    if (!file) return;

    try {
      const res = await importChatworthy(file).unwrap();
      setSnack({
        open: true,
        msg: res.imported === 1 ? 'Imported 1 note' : `Imported ${res.imported} notes`,
        severity: 'success',
      });
      onDone?.();
    } catch (err: any) {
      setSnack({
        open: true,
        msg: err?.data?.message ?? 'Import failed',
        severity: 'error',
      });
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown"
        hidden
        onChange={onFileChosen}
      />
      <Tooltip title="Import Chatworthy Markdown">
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
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(s => ({ ...s, open: false }))}
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
