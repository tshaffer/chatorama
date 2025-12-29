// frontend/src/features/imports/ImportChatworthyButton.tsx
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Tooltip,
  IconButton,
  Backdrop,
  Box,
  Portal,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import {
  useImportChatworthyMutation,
  type ImportResponse,
  useApplyChatworthyImportMutation,
} from './importsApi';
import { notesApi } from '../notes/notesApi';
import { useGetSubjectsWithTopicsQuery } from '../subjects/subjectsApi';
import {
  ImportResultsDialog,
  type EditableImportedNoteRow,
} from './ImportResultsDialog';
import { chatalogApi } from '../api/chatalogApi';
import type { ApplyNoteImportCommand, CleanupNeededItem } from '@chatorama/chatalog-shared';
import { useAppDispatch } from '../../store';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

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
  // const dispatch = useDispatch();
  const dispatch = useAppDispatch();

  const navigate = useNavigate();

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
  const [cleanupNeeded, setCleanupNeeded] = useState<CleanupNeededItem[]>([]);

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
      setCleanupNeeded([]);

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

  const handleApplyEdits = async (
    rows: EditableImportedNoteRow[],
    commands: ApplyNoteImportCommand[],
  ) => {
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
        notes: commands,
      };

      const res = await applyChatworthyImport(payload).unwrap();
      setCleanupNeeded(res.cleanupNeeded ?? []);

      setSnack({
        open: true,
        msg:
          (res.created ?? 0) === 1
            ? 'Created 1 note'
            : `Created ${res.created ?? 0} notes`,
        severity: 'success',
      });

      setReviewOpen(false);
      setLastImport(null);

      // 🔥 Force all RTK Query data to refetch so new notes show up everywhere
      dispatch(chatalogApi.util.resetApiState());

      const firstNoteId = res.noteIds?.[0];
      if (firstNoteId) {
        try {
          // Fetch the created note so we can find subjectId/topicId
          const note = await dispatch(
            notesApi.endpoints.getNote.initiate(firstNoteId, { forceRefetch: true })
          ).unwrap();

          const subjectId = (note as any).subjectId as string | undefined;
          const topicId = (note as any).topicId as string | undefined;

          if (subjectId && topicId) {
            const subject = subjects.find((s: any) => s.id === subjectId);
            const topic = subject?.topics?.find((t: any) => t.id === topicId);

            if (subject && topic) {
              const subjectSlug = `${subject.id}-${slugify(subject.name)}`;
              const topicSlug = `${topic.id}-${slugify(topic.name)}`;

              // Spec: go to TopicNotesPage, then show the new note
              navigate(`/s/${subjectSlug}/t/${topicSlug}`);
              navigate(`/n/${firstNoteId}`);
            } else {
              // Fallback: at least show the note
              navigate(`/n/${firstNoteId}`);
            }
          } else {
            // Fallback: at least show the note
            navigate(`/n/${firstNoteId}`);
          }
        } catch {
          // Fallback: at least show the note
          navigate(`/n/${firstNoteId}`);
        }
      }

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


  const cleanupBanner =
    cleanupNeeded.length > 0 ? (
      <Box
        sx={{
          position: 'fixed',
          top: 24,                // adjust to taste
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: (theme) => theme.zIndex.modal + 1,
          minWidth: 420,          // keeps banner readable; adjust if needed
          maxWidth: '80vw',
        }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => setCleanupNeeded([])}   // dismiss button
          sx={{
            boxShadow: 3,
          }}
        >
          <div>Some notes may need manual cleanup because they contain multiple turns:</div>

          <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
            {cleanupNeeded.map((item) => (
              <li key={item.existingNoteId}>
                {[item.existingSubjectName, item.existingTopicName, item.existingNoteTitle]
                  .filter(Boolean)
                  .join(' / ') || item.existingNoteTitle}
              </li>
            ))}
          </ul>
        </Alert>
      </Box>
    ) : null;

  const dialog =
    lastImport && reviewOpen ? (
      <ImportResultsDialog
        open={reviewOpen}
        onClose={handleCloseReview}
        importedNotes={lastImport.results}
        combinedNote={lastImport.combinedNote}
        subjects={subjects}
        onApply={handleApplyEdits}
        hasDuplicateTurns={lastImport.hasDuplicateTurns}
        duplicateTurnCount={lastImport.duplicateTurnCount}
      />
    ) : null;

  // Show pulsing dots while the import *or* apply request is in flight
  const overlay = (
    <Portal>
      <Backdrop
        open={isLoading || isApplying}
        sx={{
          color: '#fff',
          // Keep spinner above the ImportResultsDialog paper/backdrop
          zIndex: (theme) => theme.zIndex.modal + 20,
          position: 'fixed',
          bgcolor: 'rgba(0,0,0,0.6)',
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
              // Fallback visibility even if animation is suppressed
              opacity: 0.8,
              transform: 'scale(1)',
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
    </Portal>
  );

  if (mode === 'icon') {
    // Action icon for AppBar
    return (
      <>
        {cleanupBanner}
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
      {cleanupBanner}
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
