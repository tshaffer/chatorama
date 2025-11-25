// frontend/src/features/imports/ImportChatworthyButton.tsx
import { useRef, useState } from 'react';
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  IconButton,
  Backdrop,
  Box,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useDispatch } from 'react-redux';

import {
  useImportChatworthyMutation,
  type ImportResponse,
  useApplyChatworthyImportMutation,
} from './importsApi';
import { useGetSubjectsWithTopicsQuery } from '../subjects/subjectsApi';
import {
  ImportResultsDialog,
  type EditableImportedNoteRow,
} from './ImportResultsDialog';
import { chatalogApi } from '../api/chatalogApi';

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
  const dispatch = useDispatch();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [importChatworthy, { isLoading }] = useImportChatworthyMutation();
  const [applyChatworthyImport, { isLoading: isApplying }] =
    useApplyChatworthyImportMutation();

  const { data: subjects = [] } = useGetSubjectsWithTopicsQuery();

  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    severity: 'success' | 'error';
  }>({ open: false, msg: '', severity: 'success' });

  const [lastImport, setLastImport] = useState<ImportResponse | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

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
      setLastImport(res);
      setReviewOpen(true);

      setSnack({
        open: true,
        msg:
          res.imported === 1
            ? 'Imported 1 note for review'
            : `Imported ${res.imported} notes for review`,
        severity: 'success',
      });
      // We'll call onDone() after the user finishes the review dialog + apply.
    } catch (err: any) {
      const msg =
        err?.data?.message ||
        err?.error ||
        (typeof err === 'string' ? err : '') ||
        'Import failed';
      setSnack({ open: true, msg, severity: 'error' });
    }
  };

  const handleCloseReview = () => {
    setReviewOpen(false);
  };

  const handleApplyEdits = async (rows: EditableImportedNoteRow[]) => {
    if (!lastImport) {
      setReviewOpen(false);
      return;
    }

    try {
      const payload = {
        rows: rows.map((r) => ({
          importKey: r.importKey,
          title: r.editedTitle,
          body: r.body,
          subjectLabel: r.subjectLabel,
          topicLabel: r.topicLabel,
          tags: r.tags,
          summary: r.summary,
          provenanceUrl: r.provenanceUrl,
          chatworthyNoteId: r.chatworthyNoteId,
          chatworthyChatId: r.chatworthyChatId,
          chatworthyChatTitle: r.chatworthyChatTitle,
          chatworthyFileName: r.chatworthyFileName,
          chatworthyTurnIndex: r.chatworthyTurnIndex,
          chatworthyTotalTurns: r.chatworthyTotalTurns,
        })),
      };

      const res = await applyChatworthyImport(payload).unwrap();

      setSnack({
        open: true,
        msg:
          res.created === 1
            ? 'Created 1 note'
            : `Created ${res.created} notes`,
        severity: 'success',
      });

      setReviewOpen(false);
      setLastImport(null);

      // 🔥 Force all RTK Query data to refetch so new notes show up everywhere
      dispatch(chatalogApi.util.resetApiState());

      // Optional callback for callers (if passed)
      onDone?.();
    } catch (err: any) {
      const msg =
        err?.data?.message ||
        err?.error ||
        (typeof err === 'string' ? err : '') ||
        'Apply failed';
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

  const dialog =
    lastImport && reviewOpen ? (
      <ImportResultsDialog
        open={reviewOpen}
        onClose={handleCloseReview}
        importedNotes={lastImport.results}
        subjects={subjects}
        onApply={handleApplyEdits}
      />
    ) : null;

  // Show pulsing dots while the import *or* apply request is in flight
  const overlay = (
    <Backdrop
      open={isLoading || isApplying}
      sx={{
        color: '#fff',
        zIndex: (theme) => theme.zIndex.modal + 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          '@keyframes pulse': {
            '0%, 80%, 100%': { transform: 'scale(0)', opacity: 0.4 },
            '40%': { transform: 'scale(1)', opacity: 1 },
          },
          '& .dot': {
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: 'common.white',
            animation: 'pulse 1.2s infinite ease-in-out both',
          },
          '& .dot:nth-of-type(2)': {
            animationDelay: '0.2s',
          },
          '& .dot:nth-of-type(3)': {
            animationDelay: '0.4s',
          },
        }}
      >
        <Box className="dot" />
        <Box className="dot" />
        <Box className="dot" />
      </Box>
    </Backdrop>
  );

  if (mode === 'icon') {
    // Action icon for AppBar
    return (
      <>
        {fileInput}
        {dialog}
        {overlay}
        <Tooltip title={tooltip}>
          <span>
            <IconButton
              size="small"
              aria-label="Import"
              onClick={pickFile}
              disabled={isLoading || isApplying}
              sx={(theme) => ({
                borderRadius: 2,
                backgroundColor: alpha(theme.palette.common.white, 0.18),
                '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.28) },
              })}
            >
              {isLoading || isApplying ? <CircularProgress size={16} /> : <UploadFileIcon />}
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
      {dialog}
      {overlay}
      <Tooltip title={tooltip}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              isLoading || isApplying ? <CircularProgress size={16} /> : <UploadFileIcon />
            }
            onClick={pickFile}
            disabled={isLoading || isApplying}
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
