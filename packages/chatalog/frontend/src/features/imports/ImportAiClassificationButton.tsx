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
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import {
  useImportAiClassificationPreviewMutation,
  type ImportResponse,
  useApplyChatworthyImportMutation,
} from './importsApi'; // adjust path if this file lives elsewhere
import { useGetSubjectsQuery } from '../subjects/subjectsApi';
import {
  ImportResultsDialog,
  type EditableImportedNoteRow,
} from './ImportResultsDialog';

type Props = {
  onDone?: () => void;
  /** 'icon' for AppBar actions, 'button' for inline usage */
  mode?: 'icon' | 'button';
  /** Optional: tweak tooltip text */
  tooltip?: string;
};

export default function ImportAiClassificationButton({
  onDone,
  mode = 'button',
  tooltip = 'Import notes from AI classification (using backend-configured paths)',
}: Props) {
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

  const handleStartPreview = async () => {
    try {
      const res = await importAiPreview().unwrap();

      if (!res.results.length) {
        setSnack({
          open: true,
          msg: 'No notes found to import in this AI batch.',
          severity: 'error',
        });
        return;
      }

      setLastImport(res);
      setReviewOpen(true);

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
        {dialog}
        {overlay}
        <Tooltip title={tooltip}>
          <span>
            <IconButton
              size="small"
              aria-label="Import from AI classification"
              onClick={handleStartPreview}
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
      {dialog}
      {overlay}
      <Tooltip title={tooltip}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              buttonDisabled ? <CircularProgress size={16} /> : <AutoAwesomeIcon />
            }
            onClick={handleStartPreview}
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
