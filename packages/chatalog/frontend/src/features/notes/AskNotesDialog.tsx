// frontend/src/features/notes/AskNotesDialog.tsx
// Ask Claude questions about a set of notes. Answers stream into a short
// conversation; any answer can be copied, saved as a note, or (on the topic
// page) handed to Consolidate as instructions.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { AskNotesMessage } from '@chatorama/chatalog-shared';
import MarkdownBody from '../../components/MarkdownBody';
import { useSaveAskNotesAnswerMutation } from './notesApi';
import {
  citedSources,
  linkCitations,
  streamAskNotes,
  type AskNotesSource,
} from './askNotes';
import type { ConsolidateExcludedNote } from './consolidateDraft';

export type AskNotesDialogProps = {
  open: boolean;
  subjectId?: string;
  topicId: string;
  // e.g. "5 selected notes" or "all 12 notes in Project Launcher"
  scopeLabel: string;
  notes: { id: string; title: string }[];
  onClose: () => void;
  onSaved: (noteId: string, title: string) => void;
  // When provided, answers get a "Consolidate with this" action.
  onConsolidate?: (instructions: string) => void;
};

type Turn = {
  question: string;
  answer: string;
  stopped?: boolean;
};

const STARTERS: { label: string; text: string; multiOnly?: boolean }[] = [
  { label: 'Summarize', text: 'Summarize these notes.' },
  {
    label: 'Suggest improvements',
    text: 'Suggest improvements to these notes: what should be clarified, corrected, reorganized, or removed?',
  },
  {
    label: 'Find contradictions or outdated info',
    text: 'Find contradictions, or information that looks outdated, in these notes.',
  },
  { label: 'What’s missing?', text: 'What important information or open questions are missing from these notes?' },
  { label: 'Action items', text: 'List the action items, decisions, and next steps in these notes.' },
  {
    label: 'Compare',
    text: 'Compare these notes: where do they overlap, and how do they differ?',
    multiOnly: true,
  },
];

// The first H1 of an answer, if any, makes a good note title.
function extractTitle(markdown: string): string {
  const m = markdown.match(/^\s*#\s+(.+?)\s*#*\s*$/m);
  return m ? m[1].trim() : '';
}

// Rendered answer as standalone HTML for pasting into Mail, Docs, Word, etc.:
// links made absolute and tables given visible borders.
function answerHtml(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button').forEach((b) => b.remove());
  // Strip renderer-only attributes (e.g. node="[object Object]")
  clone.querySelectorAll('[node]').forEach((n) => n.removeAttribute('node'));
  clone.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    a.setAttribute('href', new URL(a.getAttribute('href')!, window.location.origin).href);
  });
  clone.querySelectorAll<HTMLElement>('table').forEach((t) => {
    t.style.borderCollapse = 'collapse';
  });
  clone.querySelectorAll<HTMLElement>('th, td').forEach((c) => {
    c.style.border = '1px solid #ccc';
    c.style.padding = '4px 8px';
    c.style.textAlign = 'left';
  });
  return `<meta charset="utf-8">${clone.innerHTML}`;
}

function defaultTitle(turn: Turn): string {
  const fromAnswer = extractTitle(turn.answer);
  if (fromAnswer) return fromAnswer;
  const q = turn.question.replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '');
  return q.length > 80 ? `${q.slice(0, 77)}…` : q;
}

export default function AskNotesDialog({
  open,
  subjectId,
  topicId,
  scopeLabel,
  notes,
  onClose,
  onSaved,
  onConsolidate,
}: AskNotesDialogProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<AskNotesSource[]>([]);
  const [excluded, setExcluded] = useState<ConsolidateExcludedNote[]>([]);
  const [inputChars, setInputChars] = useState(0);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [savingTurn, setSavingTurn] = useState<number | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [savedTurns, setSavedTurns] = useState<Set<number>>(new Set());
  const [copiedTurn, setCopiedTurn] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const answerEls = useRef(new Map<number, HTMLDivElement>());

  const [saveAnswer, { isLoading: isSaving }] = useSaveAskNotesAnswerMutation();

  const noteIds = useMemo(() => notes.map((n) => n.id), [notes]);

  // Reset whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setTurns([]);
    setInput('');
    setStreaming(false);
    setError(null);
    setSources([]);
    setExcluded([]);
    setInputChars(0);
    setNotesExpanded(false);
    setSavingTurn(null);
    setSavedTurns(new Set());
    setCopiedTurn(null);
  }, [open]);

  // Stop any in-flight answer when the dialog unmounts
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the newest answer in view while it streams
  const lastAnswerLength = turns[turns.length - 1]?.answer.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, lastAnswerLength]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || streaming) return;
      setError(null);
      setInput('');

      // Stopped or empty answers are left out of the history Claude sees.
      const history: AskNotesMessage[] = turns
        .filter((t) => t.answer.trim() && !t.stopped)
        .flatMap((t) => [
          { role: 'user' as const, content: t.question },
          { role: 'assistant' as const, content: t.answer },
        ]);

      const controller = new AbortController();
      abortRef.current = controller;
      const index = turns.length;
      setTurns((prev) => [...prev, { question: q, answer: '' }]);
      setStreaming(true);

      const update = (patch: Partial<Turn>) =>
        setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));

      try {
        await streamAskNotes({
          topicId,
          signal: controller.signal,
          body: { noteIds, messages: [...history, { role: 'user', content: q }] },
          onMeta: (meta) => {
            setSources(meta.sources);
            setExcluded(meta.excluded);
            setInputChars(meta.inputChars);
          },
          onText: (text) => update({ answer: text }),
        });
      } catch (err: any) {
        if (controller.signal.aborted) {
          update({ stopped: true });
        } else {
          // Drop the failed turn and put the question back so it can be retried
          setTurns((prev) => prev.filter((_, i) => i !== index));
          setInput(q);
          setError(err?.message ?? 'Request failed');
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStreaming(false);
      }
    },
    [streaming, turns, topicId, noteIds],
  );

  const handleStop = () => abortRef.current?.abort();

  const unsavedAnswers = turns.some((t, i) => t.answer.trim() && !savedTurns.has(i));

  const requestClose = () => {
    if (isSaving) return;
    if (unsavedAnswers) setConfirmCloseOpen(true);
    else discardAndClose();
  };

  const discardAndClose = () => {
    abortRef.current?.abort();
    setConfirmCloseOpen(false);
    onClose();
  };

  const handleCopy = async (index: number) => {
    const markdown = turns[index].answer;
    const el = answerEls.current.get(index);
    try {
      // Both formats: apps that take formatted text (Mail, Docs) use the HTML,
      // Markdown editors and plain-text fields get the Markdown.
      let copied = false;
      if (el && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([answerHtml(el)], { type: 'text/html' }),
              'text/plain': new Blob([markdown], { type: 'text/plain' }),
            }),
          ]);
          copied = true;
        } catch {
          // Some browsers refuse rich clipboard writes; fall back to Markdown only.
        }
      }
      if (!copied) {
        await navigator.clipboard.writeText(markdown);
      }
      setCopiedTurn(index);
      setTimeout(() => setCopiedTurn((c) => (c === index ? null : c)), 1500);
    } catch {
      setError('Couldn’t copy to the clipboard.');
    }
  };

  const startSave = (index: number) => {
    setSaveTitle(defaultTitle(turns[index]));
    setSavingTurn(index);
  };

  const handleSave = async () => {
    if (savingTurn === null) return;
    const turn = turns[savingTurn];
    const title = saveTitle.trim() || defaultTitle(turn);
    // Citations become links so they still work in the saved note.
    const markdown = `> **Question:** ${turn.question.replace(/\n+/g, ' ')}\n\n${linkCitations(
      turn.answer,
      sources,
    )}`;
    try {
      const result = await saveAnswer({
        topicId,
        subjectId,
        noteIds,
        title,
        markdown,
        question: turn.question,
      }).unwrap();
      setSavedTurns((prev) => new Set(prev).add(savingTurn));
      setSavingTurn(null);
      onSaved(result.noteId, title);
    } catch (err: any) {
      setError(err?.data?.message ?? err?.message ?? 'Save failed');
    }
  };

  const starters = STARTERS.filter((s) => !s.multiOnly || notes.length > 1);
  const theseNotes = notes.length === 1 ? 'this note' : 'these notes';
  const excludedIds = new Set(excluded.map((e) => e.id));

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { height: '90vh' } }}
      >
        <DialogTitle>Ask Claude about {scopeLabel}</DialogTitle>

        <DialogContent
          dividers
          sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0 }}
        >
          <Accordion
            disableGutters
            expanded={notesExpanded}
            onChange={(_e, v) => setNotesExpanded(v)}
            sx={{ flexShrink: 0 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">
                Notes ({notes.length})
              </Typography>
              {inputChars > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  — ~{Math.round(inputChars / 4).toLocaleString()} tokens sent with each question
                </Typography>
              )}
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, maxHeight: 200, overflowY: 'auto' }}>
              <List dense disablePadding>
                {notes.map((n, index) => (
                  <ListItem key={n.id} disableGutters>
                    <ListItemText
                      primary={
                        <span>
                          {index + 1}. {n.title || 'Untitled'}
                          {excludedIds.has(n.id) && (
                            <Chip size="small" label="Skipped: no text" sx={{ ml: 1 }} />
                          )}
                        </span>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>

          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ flexShrink: 0 }}>
              {error}
            </Alert>
          )}

          {/* Conversation */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 1 }}>
            {turns.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Ask anything about {theseNotes}, or start with one of these:
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  justifyContent="center"
                  sx={{ flexWrap: 'wrap', rowGap: 1 }}
                >
                  {starters.map((s) => (
                    <Chip
                      key={s.label}
                      label={s.label}
                      variant="outlined"
                      onClick={() => ask(s.text)}
                    />
                  ))}
                </Stack>
              </Box>
            ) : (
              <Stack spacing={2}>
                {turns.map((turn, index) => {
                  const isLast = index === turns.length - 1;
                  const isStreaming = streaming && isLast;
                  const cited = citedSources(turn.answer, sources);
                  return (
                    <Box key={index}>
                      <Box
                        sx={{
                          bgcolor: 'action.hover',
                          borderRadius: 1,
                          px: 1.5,
                          py: 1,
                          mb: 1,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        <Typography variant="body2" fontWeight={600}>
                          {turn.question}
                        </Typography>
                      </Box>
                      {turn.answer ? (
                        <Box
                          ref={(node: HTMLDivElement | null) => {
                            if (node) answerEls.current.set(index, node);
                            else answerEls.current.delete(index);
                          }}
                        >
                          <MarkdownBody markdown={linkCitations(turn.answer, sources)} enableToc={false} />
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Claude is reading the notes…
                        </Typography>
                      )}
                      {isStreaming && <LinearProgress sx={{ mt: 1 }} />}
                      {turn.stopped && (
                        <Typography variant="caption" color="text.secondary">
                          Stopped. This answer won’t be included in follow-up questions.
                        </Typography>
                      )}
                      {!isStreaming && turn.answer.trim() && (
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}
                        >
                          {cited.length > 0 && (
                            <>
                              <Typography variant="caption" color="text.secondary">
                                Sources:
                              </Typography>
                              {cited.map((s) => (
                                <Tooltip key={s.id} title="Open this note in a new tab">
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    label={`${sources.indexOf(s) + 1}. ${s.title}`}
                                    onClick={() => window.open(`/n/${s.id}`, '_blank', 'noopener')}
                                    sx={{ maxWidth: 260 }}
                                  />
                                </Tooltip>
                              ))}
                            </>
                          )}
                          <Box sx={{ flex: 1 }} />
                          <Button
                            size="small"
                            startIcon={<ContentCopyIcon fontSize="small" />}
                            title="Copies formatted text for apps like Mail and Docs, and Markdown for Markdown editors"
                            onClick={() => handleCopy(index)}
                          >
                            {copiedTurn === index ? 'Copied' : 'Copy'}
                          </Button>
                          <Button
                            size="small"
                            disabled={savedTurns.has(index) || streaming}
                            onClick={() => startSave(index)}
                          >
                            {savedTurns.has(index) ? 'Saved' : 'Save as note'}
                          </Button>
                          {onConsolidate && (
                            <Tooltip title="Open Consolidate on these notes, with this answer as its instructions">
                              <span>
                                <Button
                                  size="small"
                                  disabled={streaming}
                                  onClick={() =>
                                    onConsolidate(
                                      // Citation numbers mean nothing to Consolidate, so drop them.
                                      `Apply the following suggestions where the notes support them:\n\n${turn.answer.replace(
                                        / ?\[\d{1,3}\]/g,
                                        '',
                                      )}`,
                                    )
                                  }
                                >
                                  Consolidate with this
                                </Button>
                              </span>
                            </Tooltip>
                          )}
                        </Stack>
                      )}
                      {savingTurn === index && (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                          <TextField
                            size="small"
                            label="New note title"
                            value={saveTitle}
                            autoFocus
                            onChange={(e) => setSaveTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSave();
                              }
                            }}
                            sx={{ flex: 1 }}
                          />
                          <Button onClick={() => setSavingTurn(null)} disabled={isSaving}>
                            Cancel
                          </Button>
                          <Button variant="contained" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? 'Saving…' : 'Save'}
                          </Button>
                        </Stack>
                      )}
                    </Box>
                  );
                })}
                <div ref={bottomRef} />
              </Stack>
            )}
          </Box>

          <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ flexShrink: 0 }}>
            <TextField
              fullWidth
              multiline
              autoFocus
              maxRows={6}
              size="small"
              placeholder={turns.length ? 'Ask a follow-up…' : `Ask a question about ${theseNotes}…`}
              value={input}
              disabled={streaming}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
            />
            {streaming ? (
              <Button variant="outlined" color="inherit" startIcon={<StopIcon />} onClick={handleStop}>
                Stop
              </Button>
            ) : (
              <Button
                variant="contained"
                endIcon={<SendIcon />}
                disabled={!input.trim()}
                onClick={() => ask(input)}
              >
                Ask
              </Button>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={requestClose} disabled={isSaving}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)}>
        <DialogTitle>Close this conversation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Conversations aren’t kept. To keep an answer, use Save as note first.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCloseOpen(false)}>Keep asking</Button>
          <Button color="error" onClick={discardAndClose}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
