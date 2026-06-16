import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { useApplyMarkdownImportMutation } from './importsApi';
import SubjectTopicPickerFields from './SubjectTopicPickerFields';

// Must match MARKDOWN_EMBEDDING_CHAR_LIMIT in imports.markdown.ts
const EMBEDDING_CHAR_LIMIT = 8_000;

type ImportMode = 'per-section' | 'single';

type SectionPreview = { title: string; charCount: number };

type DialogState = {
  file: File;
  fileCharCount: number;
  sections: SectionPreview[];
  mode: ImportMode;
  subjectLabel: string;
  topicLabel: string;
};

/** Parse H2 headings from raw markdown text for client-side preview. */
function parseSections(text: string, docTitle: string): SectionPreview[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: SectionPreview[] = [];

  let foundFirstH2 = false;
  let currentTitle = '';
  let currentLines: string[] = [];
  let preambleLines: string[] = [];

  const flush = (title: string, bodyLines: string[]) => {
    const body = bodyLines.join('\n').trim();
    if (body) sections.push({ title, charCount: body.length });
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (!foundFirstH2) {
        flush(docTitle, preambleLines);
        foundFirstH2 = true;
      } else {
        flush(currentTitle, currentLines);
      }
      currentTitle = line.replace(/^##\s+/, '').trim();
      currentLines = [line];
    } else if (!foundFirstH2) {
      if (!/^#\s+/.test(line)) preambleLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  if (foundFirstH2) {
    flush(currentTitle, currentLines);
  } else {
    flush(docTitle, preambleLines);
  }

  return sections;
}

export type ImportMarkdownRef = {
  processFile: (file: File) => Promise<void>;
};

type Props = {
  mode?: 'icon' | 'button' | 'controlled';
  tooltip?: string;
  onDone?: () => void;
};

const ImportMarkdownButton = forwardRef<ImportMarkdownRef, Props>(
function ImportMarkdownButton({
  mode = 'button',
  tooltip = 'Import Markdown',
  onDone,
}: Props, ref) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [applyMarkdown, { isLoading }] = useApplyMarkdownImportMutation();

  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    severity: 'success' | 'error';
  }>({ open: false, msg: '', severity: 'success' });

  const closeSnack = () => setSnack((s) => ({ ...s, open: false }));

  const pickFile = () => inputRef.current?.click();

  const processFile = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.md') && !lower.endsWith('.markdown')) {
      setSnack({ open: true, msg: 'Only .md and .markdown files are supported.', severity: 'error' });
      return;
    }
    const text = await file.text();
    const h1Match = text.match(/^#\s+(.+)$/m);
    const docTitle = h1Match?.[1]?.trim() || file.name.replace(/\.(md|markdown)$/i, '');
    const sections = parseSections(text, docTitle);
    const fileCharCount = text.length;
    const defaultMode: ImportMode =
      fileCharCount > EMBEDDING_CHAR_LIMIT ? 'per-section' : 'single';
    setDialogState({ file, fileCharCount, sections, mode: defaultMode, subjectLabel: '', topicLabel: '' });
  }, []);

  useImperativeHandle(ref, () => ({ processFile }), [processFile]);

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (file) processFile(file);
  };

  const handleImport = useCallback(async () => {
    if (!dialogState) return;
    const { file, mode: importMode, subjectLabel, topicLabel } = dialogState;

    try {
      const res = await applyMarkdown({
        file,
        mode: importMode,
        subjectLabel,
        topicLabel,
      }).unwrap();

      setDialogState(null);
      setSnack({
        open: true,
        msg: `Imported ${res.created} note${res.created !== 1 ? 's' : ''}.`,
        severity: 'success',
      });

      if (res.subjectId && res.topicId) {
        navigate(`/s/${res.subjectId}/t/${res.topicId}`);
      }

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
  }, [applyMarkdown, dialogState, navigate, onDone]);

  const canSubmit =
    !!dialogState &&
    dialogState.subjectLabel.trim().length > 0 &&
    dialogState.topicLabel.trim().length > 0 &&
    !isLoading;

  const exceedsLimit = (dialogState?.fileCharCount ?? 0) > EMBEDDING_CHAR_LIMIT;

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".md,.markdown"
      hidden
      onChange={onFileChosen}
    />
  );

  const dialog = dialogState && (
    <Dialog
      open
      onClose={() => !isLoading && setDialogState(null)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Import Markdown</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>

          <Typography variant="body2" color="text.secondary">
            <strong>{dialogState.file.name}</strong>
            {' — '}
            {dialogState.fileCharCount.toLocaleString()} characters
          </Typography>

          {/* File size warning */}
          {exceedsLimit && (
            <Alert severity="warning" icon={<WarningAmberIcon />}>
              This file exceeds the {EMBEDDING_CHAR_LIMIT.toLocaleString()}-character
              embedding limit. Importing as a single note will limit semantic search
              to the first portion of the content.{' '}
              <strong>One note per section</strong> is recommended.
            </Alert>
          )}

          {/* Import mode */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Import mode
            </Typography>
            <FormControl>
              <RadioGroup
                value={dialogState.mode}
                onChange={(e) =>
                  setDialogState((s) => s && ({ ...s, mode: e.target.value as ImportMode }))
                }
              >
                <FormControlLabel
                  value="per-section"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2">One note per section</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Each ## heading becomes a separate note — recommended for long documents
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="single"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2">Single note for entire document</Typography>
                      <Typography variant="caption" color="text.secondary">
                        The whole file becomes one note
                        {exceedsLimit ? ' — semantic search will be partial' : ''}
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>
          </Box>

          {/* Warn again if user switches to single on a large file */}
          {exceedsLimit && dialogState.mode === 'single' && (
            <Alert severity="error" icon={<WarningAmberIcon />}>
              Single note selected for a {dialogState.fileCharCount.toLocaleString()}-character
              file. Only the first ~{EMBEDDING_CHAR_LIMIT.toLocaleString()} characters will
              be semantically indexed.
            </Alert>
          )}

          <Divider />

          {/* Subject / Topic */}
          <SubjectTopicPickerFields
            subjectLabel={dialogState.subjectLabel}
            topicLabel={dialogState.topicLabel}
            onSubjectLabelChange={(v) =>
              setDialogState((s) => s && ({ ...s, subjectLabel: v }))
            }
            onTopicLabelChange={(v) =>
              setDialogState((s) => s && ({ ...s, topicLabel: v }))
            }
          />

          {/* Section preview */}
          {dialogState.mode === 'per-section' && dialogState.sections.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Sections to import ({dialogState.sections.length})
              </Typography>
              <Stack
                spacing={0.5}
                sx={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1,
                }}
              >
                {dialogState.sections.map((s, i) => (
                  <Stack key={i} direction="row" alignItems="center" spacing={1}>
                    {s.charCount > EMBEDDING_CHAR_LIMIT && (
                      <Tooltip title={`${s.charCount.toLocaleString()} chars — exceeds embedding limit`}>
                        <WarningAmberIcon fontSize="small" color="warning" />
                      </Tooltip>
                    )}
                    <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                      {s.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {s.charCount.toLocaleString()} chars
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={() => setDialogState(null)} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={!canSubmit}
          startIcon={isLoading ? <CircularProgress size={16} /> : undefined}
        >
          {isLoading ? 'Importing…' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const snackbar = (
    <Snackbar
      open={snack.open}
      autoHideDuration={4000}
      onClose={closeSnack}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert onClose={closeSnack} severity={snack.severity} variant="filled" sx={{ width: '100%' }}>
        {snack.msg}
      </Alert>
    </Snackbar>
  );

  // Controlled mode: no file picker or trigger — dialog only.
  if (mode === 'controlled') {
    return (
      <>
        {dialog}
        {snackbar}
      </>
    );
  }

  if (mode === 'icon') {
    return (
      <>
        {fileInput}
        {dialog}
        <Tooltip title={tooltip}>
          <span>
            <IconButton
              size="small"
              aria-label="Import Markdown"
              onClick={pickFile}
              disabled={isLoading}
              sx={(theme) => ({
                borderRadius: 2,
                backgroundColor: alpha(theme.palette.common.white, 0.18),
                '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.28) },
              })}
            >
              {isLoading ? <CircularProgress size={16} /> : <ArticleOutlinedIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        {snackbar}
      </>
    );
  }

  return (
    <>
      {fileInput}
      {dialog}
      <Tooltip title={tooltip}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={isLoading ? <CircularProgress size={16} /> : <ArticleOutlinedIcon />}
            onClick={pickFile}
            disabled={isLoading}
            color="inherit"
          >
            Import Markdown
          </Button>
        </span>
      </Tooltip>
      {snackbar}
    </>
  );
});

export default ImportMarkdownButton;
