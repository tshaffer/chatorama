// frontend/src/features/quickNotes/QuickCaptureDialog.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack, Button, FormControl, InputLabel, Select, MenuItem, Box, Typography } from '@mui/material';
import { useAddQuickNoteMutation, useAddQuickNoteAssetMutation } from './quickNotesApi';
import { useUploadImageMutation } from '../notes/notesApi';
import { useGetSubjectsWithTopicsQuery } from '../subjects/subjectsApi';
import type { Subject, Topic } from '@chatorama/chatalog-shared';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: (newId: string) => void;
  defaultSubjectId?: string;
  defaultTopicId?: string;
};

function deriveTitle(markdown: string): string {
  const trimmed = (markdown || '').trim();
  if (!trimmed) return '';
  // 1) First markdown heading
  const heading = trimmed.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 120);
  // 2) First non-empty line / sentence
  const firstLine = trimmed.split(/\r?\n/).find(l => l.trim().length > 0)?.trim() || '';
  const sentence = firstLine.split(/(?<=\.|\?|!)\s/)[0] || firstLine;
  return sentence.slice(0, 120);
}

export default function QuickCaptureDialog({
  open, onClose, onSaved, defaultSubjectId, defaultTopicId,
}: Props) {
  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [subjectId, setSubjectId] = useState<string | undefined>(defaultSubjectId);
  const [topicId, setTopicId] = useState<string | undefined>(defaultTopicId);
  const [pendingUploadedAssetIds, setPendingUploadedAssetIds] = useState<string[]>([]);

  const [addQuickNote, { isLoading, error }] = useAddQuickNoteMutation();
  const [addQuickNoteAsset] = useAddQuickNoteAssetMutation();
  const [uploadImage, { isLoading: isUploading }] = useUploadImageMutation();
  const { data: subjects = [] } = useGetSubjectsWithTopicsQuery();
  const markdownInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const derivedTitle = useMemo(() => title.trim() ? '' : deriveTitle(markdown), [title, markdown]);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setMarkdown('');
      setSubjectId(defaultSubjectId);
      setTopicId(defaultTopicId);
      setPendingUploadedAssetIds([]);
    }
  }, [open, defaultSubjectId, defaultTopicId]);

  const handleSave = useCallback(async () => {
    const finalTitle = title.trim() || derivedTitle || 'Untitled quick note';
    const res = await addQuickNote({
      title: finalTitle,
      markdown,
      subjectId,
      topicId,
    }).unwrap();
    if (res.id && pendingUploadedAssetIds.length) {
      await Promise.all(
        pendingUploadedAssetIds.map((assetId, idx) =>
          addQuickNoteAsset({
            quickNoteId: res.id,
            assetId,
            order: idx,
          }).unwrap(),
        ),
      );
    }
    onSaved?.(res.id ?? '');
    onClose();
  }, [addQuickNote, title, derivedTitle, markdown, subjectId, topicId, onClose, onSaved, pendingUploadedAssetIds, addQuickNoteAsset]);

  // Cmd/Ctrl + Enter to save
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && markdown.trim()) {
      e.preventDefault();
      if (!isLoading) handleSave();
    }
  };

  const openInsertLinkDialog = () => {
    const textarea = markdownInputRef.current;
    const value = markdown ?? '';
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
    const safeStart = Math.max(0, Math.min(start, markdown.length));
    const safeEnd = Math.max(safeStart, Math.min(end, markdown.length));
    const mdLink = `[${text}](${url})`;
    const next =
      markdown.slice(0, safeStart) + mdLink + markdown.slice(safeEnd);
    setMarkdown(next);
    setLinkDialogOpen(false);
    requestAnimationFrame(() => {
      if (markdownInputRef.current) {
        const pos = safeStart + mdLink.length;
        markdownInputRef.current.focus();
        markdownInputRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const insertAtCursor = useCallback(
    (snippet: string) => {
      const ta = markdownInputRef.current;
      const start = ta?.selectionStart ?? markdown.length;
      const end = ta?.selectionEnd ?? markdown.length;

      setMarkdown((prev) => {
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
    [markdown.length],
  );

  const handlePickImage = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      try {
        const { asset } = await uploadImage(file).unwrap();
        insertAtCursor(`\n\n![](/api/assets/${asset.id}/content "w=md")\n\n`);
        setPendingUploadedAssetIds((prev) => [...prev, asset.id]);
      } catch (err) {
        console.error('Insert image failed', err);
      }
    },
    [uploadImage, insertAtCursor],
  );

  // simple subject→topic select data
  const selectedSubject = subjects.find(s => s.id === subjectId) as (Subject & { topics?: Topic[] }) | undefined;
  const topics = selectedSubject?.topics ?? [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>New Quick Note</DialogTitle>
      <DialogContent dividers onKeyDown={onKeyDown}>
        <Stack spacing={2} mt={0.5}>
          <TextField
            label="Title (optional)"
            placeholder={derivedTitle ? `Will use: “${derivedTitle}”` : 'Add a short title'}
            value={title}
            onChange={e => setTitle(e.target.value)}
            inputProps={{ maxLength: 140 }}
            fullWidth
            autoFocus
          />
          <TextField
            label="Body (Markdown)"
            placeholder="Jot it down… (Cmd/Ctrl+Enter to save)"
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            fullWidth
            multiline
            minRows={6}
            inputRef={markdownInputRef}
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
            <Button
              size="small"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              Insert Image...
            </Button>
          </Box>
          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="qc-subject-label">Subject (optional)</InputLabel>
              <Select
                labelId="qc-subject-label"
                label="Subject (optional)"
                value={subjectId ?? ''}
                onChange={e => {
                  const v = e.target.value as string;
                  setSubjectId(v || undefined);
                  setTopicId(undefined);
                }}
              >
                <MenuItem value=""><em>Unfiled</em></MenuItem>
                {subjects.map(s => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!subjectId}>
              <InputLabel id="qc-topic-label">Topic (optional)</InputLabel>
              <Select
                labelId="qc-topic-label"
                label="Topic (optional)"
                value={topicId ?? ''}
                onChange={e => setTopicId((e.target.value as string) || undefined)}
              >
                <MenuItem value=""><em>Unfiled</em></MenuItem>
                {topics.map(t => (
                  <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {!!error && (
            <Box>
              <Typography color="error" variant="body2">
                {(error as any)?.data?.message ?? 'Failed to save note.'}
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={isLoading || !markdown.trim()}
        >
          {isLoading ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>

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
    </Dialog>
  );
}
