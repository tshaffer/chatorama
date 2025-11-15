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

import { useImportChatworthyMutation, type ImportResponse } from '../features/imports/importsApi';
import { useMoveNotesMutation, useUpdateNoteMutation } from '../features/notes/notesApi';
import {
  useGetSubjectsQuery,
  useCreateSubjectMutation,
  useCreateTopicMutation,
} from '../features/subjects/subjectsApi';
import {
  ImportResultsDialog,
  type EditableImportedNoteRow,
} from '../features/imports/ImportResultsDialog';

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
  const [moveNotes] = useMoveNotesMutation();
  const [updateNote] = useUpdateNoteMutation();
  const [createSubject] = useCreateSubjectMutation();
  const [createTopic] = useCreateTopicMutation();

  const { data: subjects = [] } = useGetSubjectsQuery();

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
        msg: res.imported === 1 ? 'Imported 1 note' : `Imported ${res.imported} notes`,
        severity: 'success',
      });
      // We'll call onDone() after the user finishes the review dialog.
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

    const byId = new Map(lastImport.results.map((r) => [r.noteId, r]));

    // subjectName -> subjectId
    const subjectNameToId = new Map<string, string>();
    for (const s of subjects) {
      if (s.name?.trim()) {
        subjectNameToId.set(s.name.trim(), s.id);
      }
    }
    for (const r of lastImport.results) {
      if (r.subjectName && r.subjectId) {
        subjectNameToId.set(r.subjectName.trim(), r.subjectId);
      }
    }

    // subjectId -> (topicName -> topicId)
    const topicNameToIdBySubject = new Map<string, Map<string, string>>();
    for (const r of lastImport.results) {
      const sid = r.subjectId;
      if (!sid || !r.topicName || !r.topicId) continue;
      const key = r.topicName.trim();
      if (!key) continue;
      let m = topicNameToIdBySubject.get(sid);
      if (!m) {
        m = new Map();
        topicNameToIdBySubject.set(sid, m);
      }
      m.set(key, r.topicId);
    }

    for (const row of rows) {
      const orig = byId.get(row.noteId);
      if (!orig) continue;

      // 1) Title changes
      if (row.editedTitle && row.editedTitle !== orig.title) {
        try {
          await updateNote({
            noteId: row.noteId,
            patch: { title: row.editedTitle },
          }).unwrap();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Failed to update note title', e);
        }
      }

      // 2) Resolve desired subject name
      const desiredSubjectName =
        row.subjectLabel?.trim() ||
        orig.subjectName?.trim() ||
        '';

      let finalSubjectId = orig.subjectId ?? '';
      if (desiredSubjectName) {
        let sid = subjectNameToId.get(desiredSubjectName);
        if (!sid) {
          try {
            const created = await createSubject({ name: desiredSubjectName }).unwrap();
            sid = created.id;
            subjectNameToId.set(desiredSubjectName, sid);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to create subject', e);
            sid = finalSubjectId; // fallback to original
          }
        }
        if (sid) {
          finalSubjectId = sid;
        }
      }

      // 3) Resolve desired topic name
      const desiredTopicName =
        row.topicLabel?.trim() ||
        orig.topicName?.trim() ||
        '';

      let finalTopicId = orig.topicId ?? '';
      if (desiredTopicName && finalSubjectId) {
        let topicsMap = topicNameToIdBySubject.get(finalSubjectId);
        if (!topicsMap) {
          topicsMap = new Map();
          topicNameToIdBySubject.set(finalSubjectId, topicsMap);
        }

        let tid = topicsMap.get(desiredTopicName);
        if (!tid) {
          try {
            const createdTopic = await createTopic({
              subjectId: finalSubjectId,
              name: desiredTopicName,
            }).unwrap();
            tid = createdTopic.id;
            topicsMap.set(desiredTopicName, tid);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to create topic', e);
            tid = finalTopicId; // fallback
          }
        }

        if (tid) {
          finalTopicId = tid;
        }
      }

      const origSubjectId = orig.subjectId ?? '';
      const origTopicId = orig.topicId ?? '';

      const canMove = finalSubjectId && finalTopicId;
      if (
        canMove &&
        (finalSubjectId !== origSubjectId || finalTopicId !== origTopicId)
      ) {
        try {
          await moveNotes({
            noteIds: [row.noteId],
            dest: { subjectId: finalSubjectId, topicId: finalTopicId },
          }).unwrap();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Failed to move note', e);
        }
      }
    }

    setReviewOpen(false);
    setLastImport(null);
    onDone?.();
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

  // Show pulsing dots while the import request is in flight
  const overlay = (
    <Backdrop
      open={isLoading}
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
      {dialog}
      {overlay}
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
