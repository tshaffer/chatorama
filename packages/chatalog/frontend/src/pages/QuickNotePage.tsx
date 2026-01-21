// chatalog/frontend/src/pages/QuickNotePage.tsx
import { useEffect, useMemo, useState, useRef, useCallback, type ChangeEvent } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';

import MarkdownBody from '../components/MarkdownBody';
import '../styles/markdown.css';
import SubjectTopicPickerDialog from '../components/SubjectTopicPickerDialog';

import {
  useGetQuickNotesQuery,
  useUpdateQuickNoteMutation,
  useDeleteQuickNoteMutation,
  useConvertQuickNoteMutation,
  useAddQuickNoteAssetMutation,
} from '../features/quickNotes/quickNotesApi';
import { useUploadImageMutation } from '../features/notes/notesApi';
import { useGetSubjectsWithTopicsQuery } from '../features/subjects/subjectsApi';
import type { Subject, Topic } from '@chatorama/chatalog-shared';
import type { QuickNote } from '../types/entities';

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertImageTitle(md: string, src: string, newTitle: string): string {
  const srcEsc = escapeRegExp(src);
  const re = new RegExp(`!\\[([^\\]]*)\\]\\(\\s*${srcEsc}(\\s+"[^"]*")?\\s*\\)`, 'm');
  const m = md.match(re);
  if (!m) return md;

  const alt = m[1] ?? '';
  const replacement = `![${alt}](${src} "${newTitle}")`;
  return md.replace(re, replacement);
}

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
  const [convertDefaults, setConvertDefaults] = useState<{
    subjectLabel: string;
    topicLabel: string;
  }>({ subjectLabel: '', topicLabel: '' });
  const markdownInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [resizeTarget, setResizeTarget] = useState<{
    src?: string;
    title?: string;
    alt?: string;
  } | null>(null);
  const [resizePreset, setResizePreset] = useState<'sm' | 'md' | 'lg' | 'full' | 'custom'>('md');
  const [resizePx, setResizePx] = useState<string>('520');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const [updateQuickNote, { isLoading: isSaving }] = useUpdateQuickNoteMutation();
  const [deleteQuickNote, { isLoading: isDeleting }] = useDeleteQuickNoteMutation();
  const [convertQuickNote, { isLoading: isConverting }] = useConvertQuickNoteMutation();
  const [uploadImage] = useUploadImageMutation();
  const [addQuickNoteAsset] = useAddQuickNoteAssetMutation();

  const insertAtCursor = useCallback(
    (snippet: string) => {
      const ta = markdownInputRef.current;
      const start = ta?.selectionStart ?? editMarkdown.length;
      const end = ta?.selectionEnd ?? editMarkdown.length;

      setEditMarkdown((prev) => {
        const before = prev.slice(0, start);
        const after = prev.slice(end);
        return before + snippet + after;
      });

      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        const pos = start + snippet.length;
        try {
          ta.setSelectionRange(pos, pos);
        } catch {
          // Ignore selection errors
        }
      });
    },
    [editMarkdown.length],
  );

  const handleRequestResizeImage = useCallback((img: { src?: string; title?: string; alt?: string }) => {
    setResizeTarget(img);

    const t = img.title ?? '';
    const m = t.match(/\bw=([^\s"]+)/);
    const w = m?.[1];

    if (w === 'sm' || w === 'md' || w === 'lg' || w === 'full') {
      setResizePreset(w);
      setResizePx(w === 'sm' ? '320' : w === 'md' ? '520' : w === 'lg' ? '760' : '520');
    } else if (w && /^\d+$/.test(w)) {
      setResizePreset('custom');
      setResizePx(w);
    } else if (w && /^\d+px$/.test(w)) {
      setResizePreset('custom');
      setResizePx(w.replace(/px$/, ''));
    } else {
      setResizePreset('md');
      setResizePx('520');
    }

    setResizeOpen(true);
  }, []);

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

      setConvertDefaults({
        subjectLabel: subject?.name ?? '',
        topicLabel: topic?.name ?? '',
      });
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

  const openInsertLinkDialog = () => {
    const textarea = markdownInputRef.current;
    const value = editMarkdown ?? '';
    if (textarea) {
      const start = textarea.selectionStart ?? value.length;
      const end = textarea.selectionEnd ?? start;
      setSelectionRange({ start, end });
      const selectedText = value.slice(start, end);
      setLinkText(selectedText);
    } else {
      setSelectionRange({ start: value.length, end: value.length });
      setLinkText('');
    }
    setLinkUrl('');
    setLinkDialogOpen(true);
  };

  const handleInsertLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const text = linkText.trim() || url;
    const { start, end } = selectionRange;
    const safeStart = Math.max(0, Math.min(start, editMarkdown.length));
    const safeEnd = Math.max(safeStart, Math.min(end, editMarkdown.length));
    const mdLink = `[${text}](${url})`;
    const next =
      editMarkdown.slice(0, safeStart) + mdLink + editMarkdown.slice(safeEnd);
    setEditMarkdown(next);
    setLinkDialogOpen(false);
    requestAnimationFrame(() => {
      if (markdownInputRef.current) {
        const pos = safeStart + mdLink.length;
        markdownInputRef.current.focus();
        markdownInputRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const handlePickImage = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !note) return;

      try {
        const { asset } = await uploadImage(file).unwrap();
        await addQuickNoteAsset({ quickNoteId: note.id, assetId: asset.id, order: 0 }).unwrap();
        insertAtCursor(`\n\n![](/api/assets/${asset.id}/content "w=md")\n\n`);
      } catch (err) {
        console.error('Insert image failed', err);
      }
    },
    [note, uploadImage, addQuickNoteAsset, insertAtCursor],
  );

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

      setConvertDefaults({
        subjectLabel: subject?.name ?? '',
        topicLabel: topic?.name ?? '',
      });
    }
    setConvertDialogOpen(true);
  };

  const handleConvertConfirm = async ({
    subjectLabel,
    topicLabel,
  }: {
    subjectLabel: string;
    topicLabel: string;
  }) => {
    try {
      const res = await convertQuickNote({
        id: note.id,
        subjectLabel,
        topicLabel,
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

  return (
    <Box
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
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

      {/* Scroll region */}
      <Box
        sx={{
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'auto',
          pb: 2,
        }}
      >
        {/* content card */}
        <Box
          sx={{
            mt: 2,
            p: 2,
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            backgroundColor: 'background.paper',
            width: '100%',
          }}
        >
          {isEditing ? (
            <Stack spacing={2} alignItems="stretch" sx={{ height: '100%' }}>
              <TextField
                label="Body (Markdown)"
                value={editMarkdown}
                onChange={e => setEditMarkdown(e.target.value)}
                fullWidth
                multiline
                inputRef={markdownInputRef}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  '& .MuiInputBase-root': {
                    alignItems: 'stretch',
                  },
                  '& textarea': {
                    flex: 1,
                    minHeight: 0,
                    overflow: 'auto',
                  },
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePickImage}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button size="small" onClick={openInsertLinkDialog}>
                  Insert link
                </Button>
                <Button size="small" onClick={() => fileInputRef.current?.click()}>
                  Insert Image...
                </Button>
              </Box>
              <Typography variant="subtitle2" color="text.secondary">
                Preview
              </Typography>
              <MarkdownBody
                markdown={editMarkdown}
                enableImageSizingUi
                onRequestResizeImage={handleRequestResizeImage}
              />
            </Stack>
          ) : (
            <MarkdownBody markdown={note.markdown ?? ''} />
          )}
        </Box>
      </Box>

      <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)}>
        <DialogTitle>Insert link</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Link text"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            autoFocus
          />
          <TextField
            label="URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
          />
          <Typography variant="caption" color="text.secondary">
            Links open in a new tab. Use http(s), mailto:, or tel: URLs.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleInsertLink}
            disabled={!linkUrl.trim()}
          >
            Insert
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={resizeOpen} onClose={() => setResizeOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Image size</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="qn-img-size-preset">Width</InputLabel>
              <Select
                labelId="qn-img-size-preset"
                label="Width"
                value={resizePreset}
                onChange={(e) => setResizePreset(e.target.value as any)}
              >
                <MenuItem value="sm">Small</MenuItem>
                <MenuItem value="md">Medium</MenuItem>
                <MenuItem value="lg">Large</MenuItem>
                <MenuItem value="full">Full</MenuItem>
                <MenuItem value="custom">Custom (px)</MenuItem>
              </Select>
            </FormControl>

            {resizePreset === 'custom' && (
              <TextField
                label="Width (px)"
                size="small"
                value={resizePx}
                onChange={(e) => setResizePx(e.target.value)}
                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
              />
            )}

            <Typography variant="caption" color="text.secondary">
              Sizes are stored in markdown as image title tokens (e.g. &quot;w=md&quot;).
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResizeOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const src = resizeTarget?.src;
              if (!src) return;

              let wToken: string = resizePreset;
              if (resizePreset === 'custom') {
                const n = parseInt(resizePx, 10);
                if (!Number.isFinite(n) || n <= 0) return;
                wToken = String(n);
              }

              setEditMarkdown((prev) => upsertImageTitle(prev, src, `w=${wToken}`));
              setResizeOpen(false);
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

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
      <SubjectTopicPickerDialog
        open={convertDialogOpen}
        title="Convert to full note"
        description="Choose a Subject and Topic for the new note. You can pick an existing label or type a new one."
        initialSubjectLabel={convertDefaults.subjectLabel}
        initialTopicLabel={convertDefaults.topicLabel}
        okText={isConverting ? 'Converting…' : 'OK'}
        cancelText="Cancel"
        busy={isConverting}
        onCancel={() => setConvertDialogOpen(false)}
        onConfirm={handleConvertConfirm}
      />

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
