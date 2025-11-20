// frontend/src/features/imports/ImportAiClassificationButton.tsx
import React, { useState } from 'react';
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  IconButton,
  Backdrop,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useApplyChatworthyImportMutation, useImportAiClassificationPreviewMutation, type ImportResponse } from './importsApi';
import { useGetSubjectsQuery } from '../subjects/subjectsApi';
import { ImportResultsDialog, type EditableImportedNoteRow } from './ImportResultsDialog';

// import {
//   useImportAiClassificationPreviewMutation,
//   type ImportResponse,
// } from '../features/imports/importsApi';
// import {
//   useApplyChatworthyImportMutation,
// } from '../features/imports/importsApi';
// import { useGetSubjectsQuery } from '../features/subjects/subjectsApi';
// import {
//   ImportResultsDialog,
//   type EditableImportedNoteRow,
// } from '../features/imports/ImportResultsDialog';

type Props = {
  onDone?: () => void;
  /** 'icon' for AppBar actions, 'button' for inline usage */
  mode?: 'icon' | 'button';
  /** Optional: tweak tooltip text */
  tooltip?: string;
};

function AiImportLauncherDialog(props: {
  open: boolean;
  onClose: () => void;
  onSubmit: (paths: { aiSeedPath: string; aiClassificationPath: string }) => void;
  loading: boolean;
}) {
  const { open, onClose, onSubmit, loading } = props;
  const [aiSeedPath, setAiSeedPath] = useState('');
  const [aiClassificationPath, setAiClassificationPath] = useState('');
  const [errors, setErrors] = useState<{ seed?: string; classification?: string }>({});

  const handleSubmit = () => {
    const nextErrors: { seed?: string; classification?: string } = {};
    if (!aiSeedPath.trim()) nextErrors.seed = 'Required';
    if (!aiClassificationPath.trim()) nextErrors.classification = 'Required';

    setErrors(nextErrors);
    if (nextErrors.seed || nextErrors.classification) return;

    onSubmit({ aiSeedPath: aiSeedPath.trim(), aiClassificationPath: aiClassificationPath.trim() });
  };

  const disabled = loading;

  return (
    <Dialog open={open} onClose={disabled ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Import from AI Classification</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Path to ai-seed.json"
            value={aiSeedPath}
            onChange={(e) => setAiSeedPath(e.target.value)}
            error={!!errors.seed}
            helperText={errors.seed || 'Batch-specific ai-seed.json for this AI import.'}
            fullWidth
            size="small"
            disabled={disabled}
          />
          <TextField
            label="Path to ai-classification.json"
            value={aiClassificationPath}
            onChange={(e) => setAiClassificationPath(e.target.value)}
            error={!!errors.classification}
            helperText={errors.classification || 'Classification JSON returned by ChatGPT.'}
            fullWidth
            size="small"
            disabled={disabled}
          />
          <Box sx={{ mt: 1 }}>
            <Alert severity="info" variant="outlined">
              These paths should be readable by the backend process (e.g. on your dev machine).
            </Alert>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={disabled}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={disabled}
          startIcon={loading ? <CircularProgress size={16} /> : null}
        >
          Preview…
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ImportAiClassificationButton({
  onDone,
  mode = 'button',
  tooltip = 'Import notes from AI classification (ai-seed.json + ai-classification.json)',
}: Props) {
  const [launchOpen, setLaunchOpen] = useState(false);

  const [importAiPreview, { isLoading: isPreviewLoading }] =
    useImportAiClassificationPreviewMutation();
  const [applyChatworthyImport, { isLoading: isApplying }] =
    useApplyChatworthyImportMutation();

  const { data: subjects = [] } = useGetSubjectsQuery();

  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    severity: 'success' | 'error';
  }>({ open: false, msg: '', severity: 'success' });

  const [lastImport, setLastImport] = useState<ImportResponse | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const handleLaunch = () => setLaunchOpen(true);
  const handleCloseLaunch = () => setLaunchOpen(false);

  const handleLaunchSubmit = async (paths: { aiSeedPath: string; aiClassificationPath: string }) => {
    try {
      const res = await importAiPreview(paths).unwrap();
      if (!res.results.length) {
        setSnack({
          open: true,
          msg: 'No notes found to import in this AI batch.',
          severity: 'error',
        });
        setLaunchOpen(false);
        return;
      }

      setLastImport(res);
      setReviewOpen(true);
      setLaunchOpen(false);

      setSnack({
        open: true,
        msg:
          res.imported === 1
            ? 'Loaded 1 AI-classified note for review'
            : `Loaded ${res.imported} AI-classified notes for review`,
        severity: 'success',
      });
    } catch (err: any) {
      const msg =
        err?.data?.message ||
        err?.error ||
        (typeof err === 'string' ? err : '') ||
        'AI import preview failed';
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
        rows: rows.map(r => ({
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
            ? 'Created 1 note from AI classification'
            : `Created ${res.created} notes from AI classification`,
        severity: 'success',
      });

      setReviewOpen(false);
      setLastImport(null);
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

  const overlay = (
    <Backdrop
      open={isPreviewLoading || isApplying}
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

  const buttonDisabled = isPreviewLoading || isApplying;

  if (mode === 'icon') {
    return (
      <>
        <AiImportLauncherDialog
          open={launchOpen}
          onClose={handleCloseLaunch}
          onSubmit={handleLaunchSubmit}
          loading={isPreviewLoading}
        />
        {dialog}
        {overlay}
        <Tooltip title={tooltip}>
          <span>
            <IconButton
              size="small"
              aria-label="Import from AI classification"
              onClick={handleLaunch}
              disabled={buttonDisabled}
              sx={(theme) => ({
                borderRadius: 2,
                backgroundColor: alpha(theme.palette.common.white, 0.18),
                '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.28) },
              })}
            >
              {buttonDisabled ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
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

  // Inline button variant (if you ever want it elsewhere)
  return (
    <>
      <AiImportLauncherDialog
        open={launchOpen}
        onClose={handleCloseLaunch}
        onSubmit={handleLaunchSubmit}
        loading={isPreviewLoading}
      />
      {dialog}
      {overlay}
      <Tooltip title={tooltip}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={buttonDisabled ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
            onClick={handleLaunch}
            disabled={buttonDisabled}
            color="inherit"
          >
            AI Import
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
