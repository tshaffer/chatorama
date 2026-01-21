// frontend/src/features/imports/ImportPdfButton.tsx
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

import { useImportPdfMutation } from './importsApi';
import ImportPdfDialog from './ImportPdfDialog';

type Props = {
  onDone?: () => void;
  /** 'icon' for AppBar actions, 'button' for inline usage */
  mode?: 'icon' | 'button';
  /** Optional: tweak tooltip text */
  tooltip?: string;
};

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export default function ImportPdfButton({
  onDone,
  mode = 'button',
  tooltip = 'Import PDF',
}: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [importPdf, { isLoading }] = useImportPdfMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    severity: 'success' | 'error';
  }>({ open: false, msg: '', severity: 'success' });

  const pickFile = () => {
    inputRef.current?.click();
  };

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) {
      setPendingFile(null);
      setDialogOpen(false);
      return;
    }

    if (file.size > MAX_PDF_BYTES) {
      setSnack({ open: true, msg: 'File is too large (>50MB).', severity: 'error' });
      setPendingFile(null);
      return;
    }

    if (file.type !== 'application/pdf') {
      setSnack({ open: true, msg: 'Only PDF files are supported.', severity: 'error' });
      setPendingFile(null);
      return;
    }

    setPendingFile(file);
    setDialogOpen(true);
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf"
      hidden
      onChange={onFileChosen}
    />
  );

  const pdfDialog = (
    <ImportPdfDialog
      open={dialogOpen}
      fileName={pendingFile?.name ?? ''}
      busy={isLoading}
      onCancel={() => {
        setDialogOpen(false);
        setPendingFile(null);
      }}
      onConfirm={async ({ subjectLabel, topicLabel, pdfSummaryMarkdown }) => {
        if (!pendingFile) return;
        try {
          const res = await importPdf({
            file: pendingFile,
            subjectLabel,
            topicLabel,
            pdfSummaryMarkdown,
          }).unwrap();
          setDialogOpen(false);
          setPendingFile(null);
          setSnack({ open: true, msg: 'PDF imported', severity: 'success' });
          navigate(`/n/${res.noteId}`);
          onDone?.();
        } catch (err: any) {
          const msg =
            err?.data?.error ||
            err?.data?.message ||
            err?.error ||
            (typeof err === 'string' ? err : '') ||
            'Import failed';
          setSnack({ open: true, msg, severity: 'error' });
        }
      }}
    />
  );

  if (mode === 'icon') {
    return (
      <>
        {fileInput}
        {pdfDialog}
        <Tooltip title={tooltip}>
          <span>
            <IconButton
              size="small"
              aria-label="Import PDF"
              onClick={pickFile}
              disabled={isLoading}
              sx={(theme) => ({
                borderRadius: 2,
                backgroundColor: alpha(theme.palette.common.white, 0.18),
                '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.28) },
              })}
            >
              {isLoading ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
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

  return (
    <>
      {fileInput}
      {pdfDialog}
      <Tooltip title={tooltip}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={isLoading ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
            onClick={pickFile}
            disabled={isLoading}
            color="inherit"
          >
            Import PDF
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
