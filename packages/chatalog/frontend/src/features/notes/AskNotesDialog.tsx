// frontend/src/features/notes/AskNotesDialog.tsx
// Ask Claude questions about a set of notes. Answers stream into a short
// conversation; any answer can be copied, saved as a note, or (on the topic
// page) handed to Consolidate as instructions. The conversation is saved after
// each answer so it can be continued later.
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
  CircularProgress,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import type {
  ApplyNoteChangesResult,
  AskConversationNoteStatus,
  AskConversationTurnInput,
  AskNotesMessage,
} from '@chatorama/chatalog-shared';
import MarkdownBody from '../../components/MarkdownBody';
import {
  useAppendAskConversationTurnMutation,
  useCreateAskConversationMutation,
  useLazyGetAskConversationQuery,
  useSaveAskNotesAnswerMutation,
  useUpdateAskConversationMutation,
} from './notesApi';
import {
  citedSources,
  linkCitations,
  streamAskNotes,
  type AskNotesSource,
} from './askNotes';
import type { ConsolidateExcludedNote } from './consolidateDraft';
import ChangePlanDialog from './ChangePlanDialog';

export type AskNotesDialogProps = {
  open: boolean;
  subjectId?: string;
  topicId: string;
  // e.g. "5 selected notes" or "all 12 notes in Project Launcher"
  scopeLabel: string;
  notes: { id: string; title: string }[];
  // Continue this saved conversation instead of starting a new one. Its own
  // notes are used, and scopeLabel and notes are ignored.
  conversationId?: string | null;
  onClose: () => void;
  onSaved: (noteId: string, title: string) => void;
  // When provided, answers get a "Consolidate with this" action, given the
  // conversation's notes.
  onConsolidate?: (instructions: string, notes: { id: string; title: string }[]) => void;
  // Called after a "Plan these changes" plan is applied; the dialog is done at that point.
  onChangesApplied: (result: ApplyNoteChangesResult, summary: string) => void;
};

type Turn = {
  question: string;
  answer: string;
  stopped?: boolean;
  // The notes this answer was given from; its [n] citations refer to these
  sources: AskNotesSource[];
  savedNoteId?: string;
};

// Where the conversation open in the dialog is saved. Replaced each time the
// dialog opens, so saves still finishing for an earlier conversation can't
// touch the new one.
type SavedConversation = {
  id: string | null;
  turnCount: number;
  // Dialog turn index -> position in the saved conversation. Answers that
  // were never saved (stopped before any text) have no position.
  positions: Map<number, number>;
  // Saves run one at a time, in order
  queue: Promise<unknown>;
};

function newSavedConversation(): SavedConversation {
  return { id: null, turnCount: 0, positions: new Map(), queue: Promise.resolve() };
}

const NOTE_STATUS_LABEL: Partial<Record<AskConversationNoteStatus, string>> = {
  changed: 'Changed since',
  archived: 'Archived: left out',
  missing: 'No longer in this topic: left out',
};

// Title for a new conversation: picked suggestions by name, then anything typed
function conversationTitle(labels: string[], typed: string): string {
  const q = [labels.join(' + '), typed.replace(/\s+/g, ' ').trim()].filter(Boolean).join(': ');
  return q.length > 80 ? `${q.slice(0, 77)}…` : q;
}

// Suggested requests. Any number can be picked, alone or with a typed question.
// `notes` is "this note" or "these notes".
const STARTERS: { label: string; text: (notes: string) => string; multiOnly?: boolean }[] = [
  { label: 'Summarize', text: (notes) => `Summarize ${notes}.` },
  {
    label: 'Suggest improvements',
    text: (notes) =>
      `Suggest improvements to ${notes}: what should be clarified, corrected, reorganized, or removed?`,
  },
  {
    label: 'Find contradictions or outdated info',
    text: (notes) => `Find contradictions, or information that looks outdated, in ${notes}.`,
  },
  {
    label: 'What’s missing?',
    text: (notes) => `What important information or open questions are missing from ${notes}?`,
  },
  { label: 'Action items', text: (notes) => `List the action items, decisions, and next steps in ${notes}.` },
  {
    label: 'Compare',
    text: (notes) => `Compare ${notes}: where do they overlap, and how do they differ?`,
    multiOnly: true,
  },
];

// The question sent for the picked suggestions plus anything typed.
function composeQuestion(requests: string[], typed: string): string {
  const extra = typed.trim();
  if (requests.length === 0) return extra;
  const list =
    requests.length === 1 ? requests[0] : requests.map((r, i) => `${i + 1}. ${r}`).join('\n');
  return extra ? `${list}\n\n${extra}` : list;
}

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
  notes: newNotes,
  conversationId,
  onClose,
  onSaved,
  onConsolidate,
  onChangesApplied,
}: AskNotesDialogProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  // Labels of the suggestions picked for the next question
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<ConsolidateExcludedNote[]>([]);
  const [inputChars, setInputChars] = useState(0);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [savingTurn, setSavingTurn] = useState<number | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [copiedTurn, setCopiedTurn] = useState<number | null>(null);
  // The answer a "Plan these changes" plan is based on
  const [planTurn, setPlanTurn] = useState<number | null>(null);
  // A continued conversation: its title and how its notes stand now
  const [resumed, setResumed] = useState<{
    title: string;
    notes: { id: string; title: string; status: AskConversationNoteStatus }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const answerEls = useRef(new Map<number, HTMLDivElement>());
  const savedRef = useRef<SavedConversation>(newSavedConversation());

  const [saveAnswer, { isLoading: isSaving }] = useSaveAskNotesAnswerMutation();
  const [loadConversation] = useLazyGetAskConversationQuery();
  const [createConversation] = useCreateAskConversationMutation();
  const [appendTurn] = useAppendAskConversationTurnMutation();
  const [updateConversation] = useUpdateAskConversationMutation();

  // The notes questions are asked about. A continued conversation leaves out
  // notes that were archived or moved since.
  const notes = useMemo(
    () =>
      resumed
        ? resumed.notes
            .filter((n) => n.status === 'unchanged' || n.status === 'changed')
            .map(({ id, title }) => ({ id, title }))
        : newNotes,
    [resumed, newNotes],
  );
  const noteIds = useMemo(() => notes.map((n) => n.id), [notes]);

  // Reset whenever the dialog opens, loading the conversation being continued
  useEffect(() => {
    if (!open) return;
    const saved = newSavedConversation();
    savedRef.current = saved;
    setTurns([]);
    setInput('');
    setPicked(new Set());
    setStreaming(false);
    setError(null);
    setExcluded([]);
    setInputChars(0);
    setNotesExpanded(false);
    setSavingTurn(null);
    setCopiedTurn(null);
    setPlanTurn(null);
    setResumed(null);
    setSaveFailed(false);
    if (!conversationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    loadConversation({ topicId, conversationId }, false)
      .unwrap()
      .then((c) => {
        if (savedRef.current !== saved) return;
        saved.id = c.id;
        saved.turnCount = c.turns.length;
        c.turns.forEach((_t, i) => saved.positions.set(i, i));
        setResumed({ title: c.title, notes: c.notes });
        setTurns(
          c.turns.map((t) => ({
            question: t.question,
            answer: t.answer,
            stopped: t.stopped,
            sources: t.sources,
            savedNoteId: t.savedNoteId,
          })),
        );
      })
      .catch((err: any) => {
        if (savedRef.current !== saved) return;
        setError(err?.data?.message ?? err?.message ?? 'Couldn’t load this conversation');
      })
      .finally(() => {
        if (savedRef.current === saved) setLoading(false);
      });
  }, [open, conversationId, topicId, loadConversation]);

  // Stop any in-flight answer when the dialog unmounts
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the newest answer in view while it streams
  const lastAnswerLength = turns[turns.length - 1]?.answer.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, lastAnswerLength]);

  // Save a finished answer to the conversation, creating it with the first one.
  const persistTurn = useCallback(
    (saved: SavedConversation, localIndex: number, turn: AskConversationTurnInput, title: string) => {
      saved.queue = saved.queue.then(async () => {
        try {
          if (saved.id) {
            await appendTurn({ topicId, conversationId: saved.id, turn }).unwrap();
          } else {
            const created = await createConversation({
              topicId,
              title,
              noteIds,
              turn,
            }).unwrap();
            saved.id = created.id;
          }
          saved.positions.set(localIndex, saved.turnCount++);
        } catch (err: any) {
          if (savedRef.current === saved) {
            setSaveFailed(true);
            setError(`Couldn’t save this conversation: ${err?.data?.message ?? err?.message ?? 'request failed'}`);
          }
        }
      });
    },
    [appendTurn, createConversation, topicId, noteIds],
  );

  // The conversation through turn `last`, as Claude sees it. Stopped or empty
  // answers are left out.
  const historyThrough = useCallback(
    (last: number): AskNotesMessage[] =>
      turns
        .slice(0, last + 1)
        .filter((t) => t.answer.trim() && !t.stopped)
        .flatMap((t) => [
          { role: 'user' as const, content: t.question },
          { role: 'assistant' as const, content: t.answer },
        ]),
    [turns],
  );

  const planMessages = useMemo(
    () => (planTurn === null ? [] : historyThrough(planTurn)),
    [planTurn, historyThrough],
  );

  const ask = useCallback(
    // onFailed restores what was being asked so it can be retried
    async (question: string, title: string, onFailed: () => void) => {
      const q = question.trim();
      if (!q || streaming || loading || noteIds.length === 0) return;
      setError(null);
      setInput('');

      const history = historyThrough(turns.length - 1);
      const saved = savedRef.current;

      const controller = new AbortController();
      abortRef.current = controller;
      const index = turns.length;
      setTurns((prev) => [...prev, { question: q, answer: '', sources: [] }]);
      setStreaming(true);

      const update = (patch: Partial<Turn>) =>
        setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));

      let answer = '';
      let sources: AskNotesSource[] = [];
      try {
        await streamAskNotes({
          topicId,
          signal: controller.signal,
          body: { noteIds, messages: [...history, { role: 'user', content: q }] },
          onMeta: (meta) => {
            sources = meta.sources;
            update({ sources });
            setExcluded(meta.excluded);
            setInputChars(meta.inputChars);
          },
          onText: (text) => {
            answer = text;
            update({ answer: text });
          },
        });
        if (answer.trim()) persistTurn(saved, index, { question: q, answer, sources }, title);
      } catch (err: any) {
        if (controller.signal.aborted) {
          update({ stopped: true });
          // Keep what arrived, even if the dialog was closed mid-answer
          if (answer.trim()) persistTurn(saved, index, { question: q, answer, sources, stopped: true }, title);
        } else {
          // Drop the failed turn and put the question back so it can be retried
          setTurns((prev) => prev.filter((_, i) => i !== index));
          onFailed();
          setError(err?.message ?? 'Request failed');
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStreaming(false);
      }
    },
    [streaming, loading, turns, topicId, noteIds, historyThrough, persistTurn],
  );

  const handleStop = () => abortRef.current?.abort();

  const requestClose = () => {
    if (isSaving) return;
    if (saveFailed) setConfirmCloseOpen(true);
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
      turn.sources,
    )}`;
    const index = savingTurn;
    const saved = savedRef.current;
    try {
      const result = await saveAnswer({
        topicId,
        subjectId,
        noteIds,
        title,
        markdown,
        question: turn.question,
      }).unwrap();
      setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, savedNoteId: result.noteId } : t)));
      setSavingTurn(null);
      onSaved(result.noteId, title);
      // Remember it in the saved conversation too, once the answer itself is saved there
      saved.queue = saved.queue.then(async () => {
        const turnIndex = saved.positions.get(index);
        if (!saved.id || turnIndex === undefined) return;
        await updateConversation({
          topicId,
          conversationId: saved.id,
          savedNote: { turnIndex, noteId: result.noteId },
        })
          .unwrap()
          .catch(() => {
            // Not worth interrupting for: the note itself was saved.
          });
      });
    } catch (err: any) {
      setError(err?.data?.message ?? err?.message ?? 'Save failed');
    }
  };

  const starters = STARTERS.filter((s) => !s.multiOnly || notes.length > 1);
  const theseNotes = notes.length === 1 ? 'this note' : 'these notes';
  const canAsk = !loading && noteIds.length > 0 && !(conversationId && !resumed);
  const hasQuestion = Boolean(input.trim()) || picked.size > 0;

  const togglePicked = (label: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const submit = () => {
    const chosen = starters.filter((s) => picked.has(s.label));
    const question = composeQuestion(
      chosen.map((s) => s.text(theseNotes)),
      input,
    );
    if (!question) return;
    const typed = input;
    const pickedBefore = picked;
    setPicked(new Set());
    ask(question, conversationTitle(chosen.map((s) => s.label), typed), () => {
      setInput(typed);
      setPicked(pickedBefore);
    });
  };
  const excludedIds = new Set(excluded.map((e) => e.id));
  // Every note the conversation is about, including ones left out when continuing it
  const listedNotes: { id: string; title: string; status: AskConversationNoteStatus }[] =
    resumed?.notes ?? notes.map((n) => ({ ...n, status: 'unchanged' as const }));
  const changedCount = resumed?.notes.filter((n) => n.status === 'changed').length ?? 0;
  const leftOutCount = resumed ? resumed.notes.length - notes.length : 0;

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { height: '90vh' } }}
      >
        <DialogTitle sx={{ overflowWrap: 'anywhere' }}>
          {resumed ? `Ask Claude: ${resumed.title}` : conversationId ? 'Ask Claude' : `Ask Claude about ${scopeLabel}`}
        </DialogTitle>

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
                {listedNotes.map((n) => {
                  const position = notes.findIndex((a) => a.id === n.id);
                  return (
                    <ListItem key={n.id} disableGutters>
                      <ListItemText
                        primary={
                          <span>
                            {position >= 0 ? `${position + 1}. ` : ''}
                            {n.title || 'Untitled'}
                            {excludedIds.has(n.id) && (
                              <Chip size="small" label="Skipped: no text" sx={{ ml: 1 }} />
                            )}
                            {NOTE_STATUS_LABEL[n.status] && (
                              <Chip size="small" label={NOTE_STATUS_LABEL[n.status]} sx={{ ml: 1 }} />
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

          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ flexShrink: 0 }}>
              {error}
            </Alert>
          )}

          {resumed && (changedCount > 0 || leftOutCount > 0) && (
            <Alert severity="info" sx={{ flexShrink: 0 }}>
              {[
                changedCount > 0 &&
                  `${changedCount} ${changedCount === 1 ? 'note has' : 'notes have'} changed since the last answer, so earlier answers may be out of date. Claude will use the current ${changedCount === 1 ? 'version' : 'versions'}.`,
                leftOutCount > 0 &&
                  `${leftOutCount} ${leftOutCount === 1 ? 'note was' : 'notes were'} archived or moved and ${leftOutCount === 1 ? 'is' : 'are'} left out.`,
              ]
                .filter(Boolean)
                .join(' ')}{' '}
              Open <strong>Notes</strong> above to see which.
            </Alert>
          )}

          {/* Conversation */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 1 }}>
            {loading ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            ) : conversationId && !resumed ? null : turns.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Ask anything about {theseNotes}, or pick one or more suggestions below and click Ask.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {turns.map((turn, index) => {
                  const isLast = index === turns.length - 1;
                  const isStreaming = streaming && isLast;
                  const cited = citedSources(turn.answer, turn.sources);
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
                          <MarkdownBody markdown={linkCitations(turn.answer, turn.sources)} enableToc={false} />
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
                      {!isStreaming && turn.answer.trim() && cited.length > 0 && (
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            Sources:
                          </Typography>
                          {cited.map((s) => (
                            <Tooltip key={s.id} title="Open this note in a new tab">
                              <Chip
                                size="small"
                                variant="outlined"
                                label={`${turn.sources.indexOf(s) + 1}. ${s.title}`}
                                onClick={() => window.open(`/n/${s.id}`, '_blank', 'noopener')}
                                sx={{ maxWidth: 260 }}
                              />
                            </Tooltip>
                          ))}
                        </Stack>
                      )}
                      {!isStreaming && turn.answer.trim() && (
                        // Sticks to the bottom of the conversation while any of its answer is in view
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          justifyContent="flex-end"
                          sx={{
                            mt: 1,
                            py: 0.5,
                            flexWrap: 'wrap',
                            rowGap: 1,
                            position: 'sticky',
                            bottom: 0,
                            zIndex: 1,
                            bgcolor: 'background.paper',
                            borderTop: 1,
                            borderColor: 'divider',
                          }}
                        >
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
                            disabled={Boolean(turn.savedNoteId) || streaming}
                            onClick={() => startSave(index)}
                          >
                            {turn.savedNoteId ? 'Saved' : 'Save as note'}
                          </Button>
                          {!turn.stopped && (
                            <Tooltip title="Have Claude turn the conversation so far into changes to your notes, for you to review and apply">
                              <span>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={streaming}
                                  onClick={() => setPlanTurn(index)}
                                >
                                  Plan these changes…
                                </Button>
                              </span>
                            </Tooltip>
                          )}
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
                                      notes,
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

          {canAsk && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}
            >
              {starters.map((s) => {
                const on = picked.has(s.label);
                return (
                  <Chip
                    key={s.label}
                    size="small"
                    label={s.label}
                    title={s.text(theseNotes)}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    icon={on ? <CheckIcon /> : undefined}
                    disabled={streaming}
                    onClick={() => togglePicked(s.label)}
                  />
                );
              })}
              {picked.size > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {input.trim()
                    ? 'Asked together with your question'
                    : 'Click Ask, or add your own question to go with these'}
                </Typography>
              )}
            </Stack>
          )}

          <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ flexShrink: 0 }}>
            <TextField
              fullWidth
              multiline
              autoFocus
              maxRows={6}
              size="small"
              placeholder={
                noteIds.length === 0 && !loading
                  ? 'None of this conversation’s notes are available any more'
                  : turns.length
                    ? 'Ask a follow-up…'
                    : `Ask a question about ${theseNotes}…`
              }
              value={input}
              disabled={streaming || loading || noteIds.length === 0}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
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
                disabled={!hasQuestion || !canAsk}
                onClick={submit}
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

      <ChangePlanDialog
        open={planTurn !== null}
        subjectId={subjectId}
        topicId={topicId}
        notes={notes}
        messages={planMessages}
        onClose={() => setPlanTurn(null)}
        onApplied={(result, summary) => {
          setPlanTurn(null);
          // The notes have changed, so the conversation is over.
          abortRef.current?.abort();
          onChangesApplied(result, summary);
        }}
      />

      <Dialog open={confirmCloseOpen} onClose={() => setConfirmCloseOpen(false)}>
        <DialogTitle>Close this conversation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Part of this conversation couldn’t be saved, so it may be incomplete when you continue it later. To keep an answer for certain, use Save as note first.
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
