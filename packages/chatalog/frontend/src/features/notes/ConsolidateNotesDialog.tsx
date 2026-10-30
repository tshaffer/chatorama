// frontend/src/features/notes/ConsolidateNotesDialog.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import type { ConsolidateSaveResult, NotePreview } from '@chatorama/chatalog-shared';
import MarkdownBody from '../../components/MarkdownBody';
import { useSaveConsolidatedNoteMutation } from './notesApi';
import { streamConsolidateDraft, type ConsolidateExcludedNote } from './consolidateDraft';

export type ConsolidateNotesDialogProps = {
  open: boolean;
  subjectId?: string;
  topicId: string;
  topicName: string;
  notes: NotePreview[]; // in topic order
  onClose: () => void;
  onSaved: (result: ConsolidateSaveResult, title: string) => void;
};

type DraftVersion = {
  markdown: string;
  kind: 'ai' | 'edited';
  // The refinement request that produced this version (AI versions only)
  request?: string;
  stopped?: boolean;
};

const QUICK_INSTRUCTIONS: { label: string; text: string }[] = [
  { label: 'Shorter', text: 'Make it as concise as possible.' },
  { label: 'Keep as Q&A', text: 'Keep a question-and-answer format.' },
  { label: 'Use tables', text: 'Use tables wherever information can be compared.' },
  { label: 'Steps only', text: 'Keep only actionable steps and commands.' },
  { label: 'Keep history', text: 'Keep a short history of what changed and why.' },
];

const DEFAULT_BEHAVIOR = [
  'Keeps every distinct fact, command, setting, and caveat; drops chat filler.',
  'Merges overlapping content so each fact appears once.',
  'When notes conflict, keeps the final state (later notes win).',
  'Organizes by topic with headings, lists, and tables; keeps links and images.',
  'Adds nothing that isn’t in the notes.',
];

// The first H1 of the draft is Claude's suggested title.
function extractTitle(markdown: string): string {
  const m = markdown.match(/^\s*#\s+(.+?)\s*#*\s*$/m);
  return m ? m[1].trim() : '';
}

// The title is stored separately, so drop a leading H1 that just repeats it.
function stripLeadingTitle(markdown: string, title: string): string {
  const m = markdown.match(/^\s*#\s+(.+?)\s*#*\s*(\r?\n|$)/);
  if (m && m[1].trim() === title.trim()) return markdown.slice(m[0].length).replace(/^\s+/, '');
  return markdown;
}

export default function ConsolidateNotesDialog({
  open,
  subjectId,
  topicId,
  topicName,
  notes,
  onClose,
  onSaved,
}: ConsolidateNotesDialogProps) {
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');
  const [refineText, setRefineText] = useState('');
  const [refinements, setRefinements] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [archiveSources, setArchiveSources] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<ConsolidateExcludedNote[]>([]);
  const [inputChars, setInputChars] = useState(0);
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [saveConsolidatedNote, { isLoading: isSaving }] = useSaveConsolidatedNoteMutation();

  const noteMap = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  // Reset whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setOrderedIds(notes.map((n) => n.id));
    setInstructions('');
    setVersions([]);
    setCurrentIndex(0);
    setViewMode('preview');
    setRefineText('');
    setRefinements([]);
    setTitle('');
    setTitleEdited(false);
    setArchiveSources(true);
    setStreaming(false);
    setError(null);
    setExcluded([]);
    setInputChars(0);
    setSourcesExpanded(true);
    setInstructionsExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Stop any in-flight draft when the dialog unmounts
  useEffect(() => () => abortRef.current?.abort(), []);

  const current = versions[currentIndex];
  const hasDraft = versions.length > 0;

  // Suggested title follows the current draft until the user edits it
  useEffect(() => {
    if (titleEdited || !current) return;
    setTitle(extractTitle(current.markdown) || `${topicName} — Summary`);
  }, [current, titleEdited, topicName]);

  const excludedIds = useMemo(() => new Set(excluded.map((e) => e.id)), [excluded]);
  const archivableCount = orderedIds.filter((id) => !excludedIds.has(id)).length;

  const runDraft = useCallback(
    async (refinement?: string) => {
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;

      const base = refinement ? versions[currentIndex] : undefined;
      const newIndex = versions.length;
      setVersions((prev) => [...prev, { markdown: '', kind: 'ai', request: refinement }]);
      setCurrentIndex(newIndex);
      setViewMode('preview');
      setStreaming(true);
      setSourcesExpanded(false);
      setInstructionsExpanded(false);

      const update = (patch: Partial<DraftVersion>) =>
        setVersions((prev) => prev.map((v, i) => (i === newIndex ? { ...v, ...patch } : v)));

      try {
        await streamConsolidateDraft({
          topicId,
          signal: controller.signal,
          body: {
            noteIds: orderedIds,
            instructions: instructions.trim() || undefined,
            currentDraft: base?.markdown,
            refinement,
            priorRefinements: refinement ? refinements : undefined,
          },
          onMeta: (meta) => {
            setExcluded(meta.excluded);
            setInputChars(meta.inputChars);
          },
          onText: (text) => update({ markdown: text }),
        });
        if (refinement) setRefinements((prev) => [...prev, refinement]);
      } catch (err: any) {
        if (controller.signal.aborted) {
          update({ stopped: true });
        } else {
          // Drop the failed version and go back to the one we started from
          setVersions((prev) => prev.filter((_, i) => i !== newIndex));
          setCurrentIndex(Math.max(0, newIndex - 1));
          setError(err?.message ?? 'Draft failed');
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStreaming(false);
      }
    },
    [versions, currentIndex, topicId, orderedIds, instructions, refinements],
  );

  const handleStop = () => abortRef.current?.abort();

  const handleRefine = () => {
    const text = refineText.trim();
    if (!text || !current) return;
    setRefineText('');
    runDraft(text);
  };

  // Editing an AI version forks an "edited" version so the original stays in history.
  const handleEdit = (markdown: string) => {
    if (!current) return;
    if (current.kind === 'ai') {
      const newIndex = versions.length;
      setVersions((prev) => [...prev, { markdown, kind: 'edited' }]);
      setCurrentIndex(newIndex);
    } else {
      setVersions((prev) => prev.map((v, i) => (i === currentIndex ? { ...v, markdown } : v)));
    }
  };

  const move = (index: number, delta: number) => {
    setOrderedIds((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const requestClose = () => {
    if (isSaving) return;
    if (hasDraft) setConfirmDiscardOpen(true);
    else onClose();
  };

  const discardAndClose = () => {
    abortRef.current?.abort();
    setConfirmDiscardOpen(false);
    onClose();
  };

  const handleSave = async () => {
    if (!current?.markdown.trim()) return;
    const finalTitle = title.trim() || `${topicName} — Summary`;
    try {
      const result = await saveConsolidatedNote({
        topicId,
        subjectId,
        noteIds: orderedIds,
        title: finalTitle,
        markdown: stripLeadingTitle(current.markdown, finalTitle),
        instructions: instructions.trim() || undefined,
        archiveSources,
      }).unwrap();
      onSaved(result, finalTitle);
    } catch (err: any) {
      setError(err?.data?.message ?? err?.message ?? 'Save failed');
    }
  };

  const versionLabel = (v: DraftVersion, i: number) =>
    `v${i + 1}${v.kind === 'edited' ? ' (edited)' : ''}${v.stopped ? ' (stopped)' : ''}`;

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        fullWidth
        maxWidth="lg"
        PaperProps={{ sx: { height: '90vh' } }}
      >
        <DialogTitle>
          Consolidate {orderedIds.length} {orderedIds.length === 1 ? 'note' : 'notes'}
        </DialogTitle>

        <DialogContent
          dividers
          sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0 }}
        >
          {/* Sources */}
          <Accordion
            disableGutters
            expanded={sourcesExpanded}
            onChange={(_e, v) => setSourcesExpanded(v)}
            sx={{ flexShrink: 0 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Sources ({orderedIds.length})</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                — Claude reads them in this order; later notes win when they conflict
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, maxHeight: 240, overflowY: 'auto' }}>
              <List dense disablePadding>
                {orderedIds.map((id, index) => {
                  const n = noteMap.get(id);
                  const ex = excluded.find((e) => e.id === id);
                  return (
                    <ListItem
                      key={id}
                      disableGutters
                      secondaryAction={
                        <Stack direction="row">
                          <IconButton
                            size="small"
                            aria-label="Move up"
                            disabled={index === 0 || streaming || hasDraft}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUpwardIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label="Move down"
                            disabled={index === orderedIds.length - 1 || streaming || hasDraft}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDownwardIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      }
                    >
                      <ListItemText
                        primary={
                          <span>
                            {index + 1}. {n?.title || 'Untitled'}
                            {ex && (
                              <Chip
                                size="small"
                                label={`Skipped: ${ex.reason}`}
                                sx={{ ml: 1 }}
                              />
                            )}
                          </span>
                        }
                      />
                    </ListItem>
                  );
                })}
              </List>
            </AccordionDetails>
          </Accordion>

          {/* Instructions */}
          <Accordion
            disableGutters
            expanded={instructionsExpanded}
            onChange={(_e, v) => setInstructionsExpanded(v)}
            sx={{ flexShrink: 0 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Instructions</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }} noWrap>
                — {instructions.trim() ? instructions.trim() : 'optional; leave empty for the default'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={6}
                size="small"
                placeholder="e.g. Put the port table first. Leave out the Claude Code Exporter section."
                value={instructions}
                disabled={streaming || hasDraft}
                onChange={(e) => setInstructions(e.target.value)}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
                {QUICK_INSTRUCTIONS.map((q) => (
                  <Chip
                    key={q.label}
                    label={q.label}
                    size="small"
                    variant="outlined"
                    disabled={streaming || hasDraft}
                    onClick={() =>
                      setInstructions((prev) => (prev.trim() ? `${prev.trim()}\n${q.text}` : q.text))
                    }
                  />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
                What Claude does by default:
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {DEFAULT_BEHAVIOR.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </Box>
              </Typography>
              {hasDraft && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                  To change the draft now, use Refine below.
                </Typography>
              )}
            </AccordionDetails>
          </Accordion>

          {excluded.length > 0 && (
            <Alert severity="info" sx={{ flexShrink: 0 }}>
              {excluded.length === 1 ? '1 note was' : `${excluded.length} notes were`} skipped
              (recipes and PDF notes can’t be consolidated) and won’t be archived.
            </Alert>
          )}
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ flexShrink: 0 }}>
              {error}
            </Alert>
          )}

          {/* Draft */}
          {hasDraft ? (
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap', rowGap: 1 }}
              >
                {versions.map((v, i) => (
                  <Chip
                    key={i}
                    size="small"
                    label={versionLabel(v, i)}
                    color={i === currentIndex ? 'primary' : 'default'}
                    variant={i === currentIndex ? 'filled' : 'outlined'}
                    disabled={streaming}
                    onClick={() => setCurrentIndex(i)}
                  />
                ))}
                <Box sx={{ flex: 1 }} />
                {inputChars > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    ~{Math.round(inputChars / 4).toLocaleString()} input tokens
                  </Typography>
                )}
                {streaming ? (
                  <Button size="small" color="inherit" startIcon={<StopIcon />} onClick={handleStop}>
                    Stop
                  </Button>
                ) : (
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={viewMode}
                    onChange={(_e, v) => v && setViewMode(v)}
                  >
                    <ToggleButton value="preview">Preview</ToggleButton>
                    <ToggleButton value="edit">Edit Markdown</ToggleButton>
                  </ToggleButtonGroup>
                )}
              </Stack>
              {streaming && <LinearProgress />}
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
                {viewMode === 'edit' && !streaming ? (
                  <TextField
                    fullWidth
                    multiline
                    minRows={20}
                    value={current?.markdown ?? ''}
                    onChange={(e) => handleEdit(e.target.value)}
                    InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
                  />
                ) : current?.markdown ? (
                  <MarkdownBody markdown={current.markdown} enableToc={false} />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Claude is reading the notes…
                  </Typography>
                )}
              </Box>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}
              >
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Refine: e.g. make the port table the first section"
                  value={refineText}
                  disabled={streaming || !current?.markdown}
                  onChange={(e) => setRefineText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleRefine();
                    }
                  }}
                />
                <Button
                  variant="outlined"
                  endIcon={<SendIcon />}
                  disabled={streaming || !refineText.trim() || !current?.markdown}
                  onClick={handleRefine}
                >
                  Refine
                </Button>
              </Stack>
            </Box>
          ) : (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Click Generate to have Claude draft the consolidated note.
              </Typography>
            </Box>
          )}

          {hasDraft && (
            <Stack direction="row" spacing={2} alignItems="center" sx={{ flexShrink: 0 }}>
              <TextField
                size="small"
                label="New note title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleEdited(true);
                }}
                sx={{ flex: 1 }}
              />
              <Tooltip title="Archived notes are hidden from the topic list, Search, and Ask, and are listed under Sources on the new note. You can unarchive them anytime.">
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={archiveSources}
                      onChange={(e) => setArchiveSources(e.target.checked)}
                    />
                  }
                  label={`Archive the ${archivableCount} source ${archivableCount === 1 ? 'note' : 'notes'}`}
                />
              </Tooltip>
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={requestClose} disabled={isSaving}>
            Cancel
          </Button>
          {hasDraft ? (
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={streaming || isSaving || !current?.markdown.trim()}
            >
              {isSaving ? 'Saving…' : 'Save as note'}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={() => runDraft()}
              disabled={streaming || orderedIds.length === 0}
            >
              Generate
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDiscardOpen} onClose={() => setConfirmDiscardOpen(false)}>
        <DialogTitle>Discard the draft?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The consolidated draft hasn’t been saved. Your notes won’t be changed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscardOpen(false)}>Keep editing</Button>
          <Button color="error" onClick={discardAndClose}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
