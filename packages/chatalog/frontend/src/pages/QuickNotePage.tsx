// chatalog/frontend/src/pages/QuickNotePage.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  useParams,
  Link as RouterLink,
  useNavigate,
} from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  Breadcrumbs,
  Link,
  Skeleton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import '../styles/markdown.css';

import {
  useGetQuickNotesQuery,
  useUpdateQuickNoteMutation,
  useDeleteQuickNoteMutation,
  useConvertQuickNoteMutation,
} from '../features/quickNotes/quickNotesApi';
import { useGetSubjectsWithTopicsQuery } from '../features/subjects/subjectsApi';
import type { Subject, Topic } from '@chatorama/chatalog-shared';
import type { QuickNote } from '../types/entities';

export default function QuickNotePage() {
  const { quickNoteId } = useParams<{ quickNoteId: string }>();
  const navigate = useNavigate();

  const {
    data: quickNotes = [],
    isLoading,
    isError,
  } = useGetQuickNotesQuery();

  const { data: subjects = [] } = useGetSubjectsWithTopicsQuery();

  const note = useMemo(
    () => quickNotes.find((qn: QuickNote) => qn.id === quickNoteId),
    [quickNotes, quickNoteId]
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editMarkdown, setEditMarkdown] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Convert dialog state
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [subjectLabel, setSubjectLabel] = useState('');
  const [topicLabel, setTopicLabel] = useState('');

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const [updateQuickNote, { isLoading: isSaving }] = useUpdateQuickNoteMutation();
  const [deleteQuickNote, { isLoading: isDeleting }] = useDeleteQuickNoteMutation();
  const [convertQuickNote, { isLoading: isConverting }] = useConvertQuickNoteMutation();

  // Build options like ImportResultsDialog
  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    subjects
      .map((s: Subject) => s.name?.trim())
      .filter(Boolean)
      .forEach(name => set.add(name as string));
    return Array.from(set);
  }, [subjects]);

  // Subject currently selected/typed in the Convert dialog
  const selectedSubject = useMemo(() => {
    const trimmed = subjectLabel.trim();
    if (!trimmed) return undefined;

    return subjects.find(
      (s: Subject) => s.name?.trim() === trimmed
    ) as (Subject & { topics?: Topic[] }) | undefined;
  }, [subjects, subjectLabel]);

  // Topic options: ONLY topics for the selected Subject.
  // Still keep the current typed topicLabel in the list so it doesn't "disappear".
  const topicOptions = useMemo(() => {
    const set = new Set<string>();

    if (selectedSubject) {
      (selectedSubject.topics ?? []).forEach((t: Topic) => {
        const name = t.name?.trim();
        if (name) set.add(name);
      });
    }

    // If user typed a new topic that's not in the subject's topics yet,
    // include it so Autocomplete still shows it in the dropdown.
    const trimmedTopic = topicLabel.trim();
    if (trimmedTopic && !set.has(trimmedTopic)) {
      set.add(trimmedTopic);
    }

    return Array.from(set);
  }, [selectedSubject, topicLabel]);

  // Initialize edit fields + convert dialog defaults when note loads
  useEffect(() => {
    if (note) {
      const fallbackTitle =
        note.title?.trim() ||
        (note.markdown ? note.markdown.split('\n')[0] : '(untitled quick note)');
      setEditTitle(fallbackTitle);
      setEditMarkdown(note.markdown ?? '');

      // default subject/topic labels derived from note's subjectId/topicId
      const subject = subjects.find(s => s.id === note.subjectId) as
        | (Subject & { topics?: Topic[] })
        | undefined;
      const topic = subject?.topics?.find(t => t.id === note.topicId);

      setSubjectLabel(subject?.name ?? '');
      setTopicLabel(topic?.name ?? '');
    }
  }, [note, subjects]);

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="text" width="40%" height={40} />
        <Skeleton variant="text" width="20%" />
        <Skeleton variant="rounded" height={200} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (isError || !note) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>
          Quick Note not found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          We couldn&apos;t load that quick note. It may have been deleted.
        </Typography>
        <Link component={RouterLink} to="/quick-notes">
          Back to Quick Notes
        </Link>
      </Box>
    );
  }

  const created = note.createdAt
    ? new Date(note.createdAt).toLocaleString()
    : undefined;

  const displayTitle =
    note.title?.trim() ||
    (note.markdown ? note.markdown.split('\n')[0] : '(untitled quick note)');

  // ---------- Edit handlers ----------
  const handleStartEdit = () => setIsEditing(true);

  const handleCancelEdit = () => {
    const fallbackTitle =
      note.title?.trim() ||
      (note.markdown ? note.markdown.split('\n')[0] : '(untitled quick note)');
    setEditTitle(fallbackTitle);
    setEditMarkdown(note.markdown ?? '');
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    try {
      const trimmedTitle = editTitle.trim();
      await updateQuickNote({
        id: note.id,
        title: trimmedTitle || 'Untitled quick note',
        markdown: editMarkdown,
      }).unwrap();
      setIsEditing(false);
      setSnackbar({
        open: true,
        message: 'Quick note updated',
        severity: 'success',
      });
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err?.data?.message ?? 'Failed to update quick note',
        severity: 'error',
      });
    }
  };

  // ---------- Delete handlers ----------
  const handleConfirmDelete = async () => {
    try {
      await deleteQuickNote(note.id).unwrap();
      setDeleteDialogOpen(false);
      setSnackbar({
        open: true,
        message: 'Quick note deleted',
        severity: 'success',
      });
      navigate('/quick-notes');
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err?.data?.message ?? 'Failed to delete quick note',
        severity: 'error',
      });
    }
  };

  // ---------- Convert handlers ----------
  const openConvertDialog = () => {
    // ensure dialog shows most recent guesses when opened
    if (note) {
      const subject = subjects.find(s => s.id === note.subjectId) as
        | (Subject & { topics?: Topic[] })
        | undefined;
      const topic = subject?.topics?.find(t => t.id === note.topicId);

      setSubjectLabel(prev => prev || subject?.name || '');
      setTopicLabel(prev => prev || topic?.name || '');
    }
    setConvertDialogOpen(true);
  };

  const handleConvertConfirm = async () => {
    const trimmedSubject = subjectLabel.trim();
    const trimmedTopic = topicLabel.trim();
    if (!trimmedSubject || !trimmedTopic) {
      return;
    }

    try {
      const res = await convertQuickNote({
        id: note.id,
        subjectLabel: trimmedSubject,
        topicLabel: trimmedTopic,
      }).unwrap();

      setConvertDialogOpen(false);
      setSnackbar({
        open: true,
        message: 'Converted to full note',
        severity: 'success',
      });

      if (res.noteId) {
        navigate(`/n/${res.noteId}`);
      } else {
        navigate('/notes');
      }
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err?.data?.message ?? 'Failed to convert quick note',
        severity: 'error',
      });
    }
  };

  const isConvertConfirmDisabled =
    isConverting || !subjectLabel.trim() || !topicLabel.trim();

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <Breadcrumbs aria-label="breadcrumb">
          <Link component={RouterLink} to="/quick-notes" underline="hover" color="inherit">
            Quick Notes
          </Link>
          <Typography color="text.primary" noWrap>
            {displayTitle}
          </Typography>
        </Breadcrumbs>

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
        >
          {isEditing ? (
            <TextField
              label="Title"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              fullWidth
              variant="outlined"
              size="medium"
            />
          ) : (
            <Typography variant="h4">{displayTitle}</Typography>
          )}

          <Stack direction="row" spacing={1}>
            {isEditing ? (
              <>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editMarkdown.trim()}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outlined"
                size="small"
                onClick={handleStartEdit}
              >
                Edit
              </Button>
            )}

            <Button
              variant="outlined"
              size="small"
              color="error"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={isDeleting || isConverting}
            >
              Delete
            </Button>

            <Button
              variant="contained"
              size="small"
              color="primary"
              onClick={openConvertDialog}
              disabled={isConverting}
            >
              Convert to Note
            </Button>
          </Stack>
        </Stack>

        {created && (
          <Typography variant="body2" color="text.secondary">
            Created {created}
          </Typography>
        )}
      </Stack>

      <Box
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          maxWidth: '80ch',
        }}
      >
        {isEditing ? (
          <TextField
            label="Body (Markdown)"
            value={editMarkdown}
            onChange={e => setEditMarkdown(e.target.value)}
            fullWidth
            multiline
            minRows={10}
          />
        ) : (
          <Box className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks] as any}
              rehypePlugins={[rehypeHighlight] as any}
            >
              {note.markdown ?? ''}
            </ReactMarkdown>
          </Box>
        )}
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete quick note?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently delete the quick note. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Convert dialog with Subject / Topic (ImportResults-style) */}
      <Dialog
        open={convertDialogOpen}
        onClose={() => setConvertDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Convert to full note</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Choose a Subject and Topic for the new note. You can pick an existing
            label or type a new one.
          </Typography>

          <Stack spacing={2}>
            <Autocomplete
              freeSolo
              options={subjectOptions}
              value={subjectLabel}
              onChange={(_e, newValue) => setSubjectLabel(newValue ?? '')}
              onInputChange={(_e, newInputValue) =>
                setSubjectLabel(newInputValue ?? '')
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Subject label"
                  placeholder="Subject label"
                  size="small"
                />
              )}
            />

            <Autocomplete
              freeSolo
              options={topicOptions}
              value={topicLabel}
              onChange={(_e, newValue) => setTopicLabel(newValue ?? '')}
              onInputChange={(_e, newInputValue) =>
                setTopicLabel(newInputValue ?? '')
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Topic label"
                  placeholder="Topic label"
                  size="small"
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConvertDialogOpen(false)}
            disabled={isConverting}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConvertConfirm}
            disabled={isConvertConfirmDisabled}
          >
            {isConverting ? 'Converting…' : 'OK'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for success/error messages */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
