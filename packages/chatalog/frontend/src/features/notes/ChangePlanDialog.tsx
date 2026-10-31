// frontend/src/features/notes/ChangePlanDialog.tsx
// "Make these changes": Claude turns an Ask Claude conversation into a change
// plan (create / edit / archive notes). The user reviews each operation, can
// ask for a revised plan, and applies the ones they keep.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import type {
  ApplyNoteChangesResult,
  AskNotesMessage,
  NoteChangeOp,
  NoteChangePlanResponse,
} from '@chatorama/chatalog-shared';
import MarkdownBody from '../../components/MarkdownBody';
import { useApplyNoteChangesMutation, useProposeNoteChangesMutation } from './notesApi';
import { lineDiff, type DiffLine } from './lineDiff';

export type ChangePlanDialogProps = {
  open: boolean;
  subjectId?: string;
  topicId: string;
  notes: { id: string; title: string }[];
  // The conversation to act on; ends with Claude's answer
  messages: AskNotesMessage[];
  onClose: () => void;
  onApplied: (result: ApplyNoteChangesResult, summary: string) => void;
};

const OP_CHIP: Record<NoteChangeOp['type'], { label: string; color: 'success' | 'info' | 'default' }> = {
  create: { label: 'New', color: 'success' },
  edit: { label: 'Edit', color: 'info' },
  archive: { label: 'Archive', color: 'default' },
};

// Long runs of unchanged lines collapse to a placeholder, keeping some context.
const CONTEXT_LINES = 2;

function DiffView({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => lineDiff(before, after), [before, after]);
  const rows: (DiffLine | { kind: 'gap'; count: number })[] = [];
  for (let i = 0; i < lines.length; ) {
    if (lines[i].kind !== 'same') {
      rows.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].kind === 'same') j++;
    const run = lines.slice(i, j);
    const keepStart = i === 0 ? 0 : CONTEXT_LINES;
    const keepEnd = j === lines.length ? 0 : CONTEXT_LINES;
    if (run.length > keepStart + keepEnd + 1) {
      rows.push(...run.slice(0, keepStart));
      rows.push({ kind: 'gap', count: run.length - keepStart - keepEnd });
      rows.push(...run.slice(run.length - keepEnd));
    } else {
      rows.push(...run);
    }
    i = j;
  }

  return (
    <Box sx={{ fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {rows.map((row, i) =>
        row.kind === 'gap' ? (
          <Box key={i} sx={{ color: 'text.secondary', fontStyle: 'italic', py: 0.25 }}>
            … {row.count} unchanged {row.count === 1 ? 'line' : 'lines'} …
          </Box>
        ) : (
          <Box
            key={i}
            sx={{
              px: 0.75,
              bgcolor: (theme) =>
                row.kind === 'added'
                  ? alpha(theme.palette.success.main, 0.15)
                  : row.kind === 'removed'
                    ? alpha(theme.palette.error.main, 0.12)
                    : undefined,
              color: row.kind === 'same' ? 'text.secondary' : 'text.primary',
              opacity: row.kind === 'same' ? 0.8 : 1,
              textDecoration: row.kind === 'removed' ? 'line-through' : undefined,
            }}
          >
            {row.kind === 'added' ? '+ ' : row.kind === 'removed' ? '− ' : '  '}
            {row.text || ' '}
          </Box>
        ),
      )}
    </Box>
  );
}

export default function ChangePlanDialog({
  open,
  subjectId,
  topicId,
  notes,
  messages,
  onClose,
  onApplied,
}: ChangePlanDialogProps) {
  const [response, setResponse] = useState<NoteChangePlanResponse | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editView, setEditView] = useState<Record<number, 'changes' | 'preview'>>({});
  const [revision, setRevision] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<{ abort: () => void } | null>(null);

  const [proposeNoteChanges, { isLoading: isPlanning }] = useProposeNoteChangesMutation();
  const [applyNoteChanges, { isLoading: isApplying }] = useApplyNoteChangesMutation();

  const noteIds = useMemo(() => notes.map((n) => n.id), [notes]);
  const titleById = useMemo(() => new Map(notes.map((n) => [n.id, n.title || 'Untitled'])), [notes]);

  const requestPlan = useCallback(
    async (revisionText?: string) => {
      setError(null);
      const request = proposeNoteChanges({
        topicId,
        noteIds,
        messages,
        currentPlan: revisionText ? response?.plan : undefined,
        revision: revisionText,
      });
      requestRef.current = request;
      try {
        const result = await request.unwrap();
        setResponse(result);
        setChecked(new Set(result.plan.ops.map((_, i) => i)));
        setExpanded(new Set());
        setEditView({});
        setRevision('');
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError(err?.data?.message ?? err?.message ?? 'Couldn’t get a change plan');
        if (revisionText) setRevision(revisionText);
      } finally {
        if (requestRef.current === request) requestRef.current = null;
      }
    },
    [proposeNoteChanges, topicId, noteIds, messages, response],
  );

  // Ask for a plan whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setResponse(null);
    setChecked(new Set());
    setRevision('');
    setError(null);
    requestPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const ops = response?.plan.ops ?? [];
  const currentById = useMemo(
    () => new Map((response?.currentNotes ?? []).map((n) => [n.id, n])),
    [response],
  );
  const newTitleByRef = useMemo(
    () => new Map(ops.flatMap((o) => (o.type === 'create' ? [[o.ref, o.title] as const] : []))),
    [ops],
  );
  const checkedRefs = new Set(
    ops.flatMap((o, i) => (o.type === 'create' && checked.has(i) ? [o.ref] : [])),
  );

  // Titles as they'll be after the plan: a note renamed by a kept edit shows its new title.
  const targetTitle = (target?: string) => {
    if (!target) return undefined;
    if (target.startsWith('new:')) return newTitleByRef.get(target.slice(4));
    const rename = ops.find(
      (o, i): o is Extract<NoteChangeOp, { type: 'edit' }> =>
        o.type === 'edit' && o.noteId === target && !!o.title && checked.has(i),
    );
    return rename?.title ?? titleById.get(target);
  };

  const toggle = (set: Set<number>, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  };

  const handleCancel = () => {
    requestRef.current?.abort();
    onClose();
  };

  const handleApply = async () => {
    if (!response) return;
    const kept = ops.filter((_, i) => checked.has(i));
    if (!kept.length) return;
    try {
      const result = await applyNoteChanges({
        topicId,
        subjectId,
        noteIds,
        summary: response.plan.summary,
        ops: kept,
      }).unwrap();
      onApplied(result, response.plan.summary);
    } catch (err: any) {
      setError(err?.data?.message ?? err?.message ?? 'Couldn’t apply the changes');
    }
  };

  const describe = (op: NoteChangeOp) => {
    if (op.type === 'create') return <>New note “{op.title}”</>;
    if (op.type === 'archive') {
      const into = targetTitle(op.mergedInto);
      return (
        <>
          Archive “{titleById.get(op.noteId)}”{into && <> — merged into “{into}”</>}
        </>
      );
    }
    const oldTitle = titleById.get(op.noteId);
    if (op.title && op.title !== oldTitle) {
      return (
        <>
          {op.markdown ? 'Edit and rename' : 'Rename'} “{oldTitle}” → “{op.title}”
        </>
      );
    }
    return <>Edit “{oldTitle}”</>;
  };

  const hasDetails = (op: NoteChangeOp) => op.type === 'create' || (op.type === 'edit' && !!op.markdown);

  const busy = isPlanning || isApplying;

  return (
    <Dialog open={open} onClose={busy ? undefined : handleCancel} fullWidth maxWidth="md" PaperProps={{ sx: { height: '90vh' } }}>
      <DialogTitle>Make these changes</DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0 }}>
        {error && (
          <Alert
            severity="error"
            onClose={() => setError(null)}
            action={
              !response && !isPlanning ? (
                <Button color="inherit" size="small" onClick={() => requestPlan()}>
                  Try again
                </Button>
              ) : undefined
            }
          >
            {error}
          </Alert>
        )}

        {isPlanning ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Claude is drafting the changes. This can take a minute when notes are rewritten.
            </Typography>
          </Box>
        ) : response ? (
          <>
            <Typography variant="body2">{response.plan.summary}</Typography>
            {response.warnings.length > 0 && (
              <Alert severity="warning">
                Some proposed changes were left out:
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {response.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </Box>
              </Alert>
            )}

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {ops.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No changes to make. Ask for a revised plan below, or close this and continue the conversation.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {ops.map((op, i) => {
                    const chip = OP_CHIP[op.type];
                    const isOpen = expanded.has(i);
                    const view = editView[i] ?? 'changes';
                    const mergeTargetDropped =
                      op.type === 'archive' &&
                      op.mergedInto?.startsWith('new:') &&
                      !checkedRefs.has(op.mergedInto.slice(4));
                    return (
                      <Paper key={i} variant="outlined" sx={{ p: 1.5, opacity: checked.has(i) ? 1 : 0.6 }}>
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                          <Checkbox
                            size="small"
                            checked={checked.has(i)}
                            onChange={() => setChecked((prev) => toggle(prev, i))}
                            sx={{ p: 0.5 }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                              <Chip size="small" label={chip.label} color={chip.color} />
                              <Typography variant="body2" fontWeight={600}>
                                {describe(op)}
                              </Typography>
                            </Stack>
                            {op.reason && (
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                {op.reason}
                              </Typography>
                            )}
                            {mergeTargetDropped && (
                              <Typography variant="caption" color="warning.main">
                                The note it merges into won’t be created, so it will be archived without a link.
                              </Typography>
                            )}
                            {hasDetails(op) && (
                              <Button
                                size="small"
                                sx={{ mt: 0.5, px: 0 }}
                                onClick={() => setExpanded((prev) => toggle(prev, i))}
                              >
                                {isOpen ? 'Hide details' : op.type === 'create' ? 'Show note' : 'Show changes'}
                              </Button>
                            )}
                            {isOpen && op.type === 'create' && (
                              <Box sx={{ mt: 1, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 360, overflowY: 'auto' }}>
                                <MarkdownBody markdown={op.markdown} enableToc={false} />
                              </Box>
                            )}
                            {isOpen && op.type === 'edit' && op.markdown && (
                              <Box sx={{ mt: 1 }}>
                                <ToggleButtonGroup
                                  size="small"
                                  exclusive
                                  value={view}
                                  onChange={(_e, v) => v && setEditView((prev) => ({ ...prev, [i]: v }))}
                                  sx={{ mb: 1 }}
                                >
                                  <ToggleButton value="changes">Changes</ToggleButton>
                                  <ToggleButton value="preview">Preview</ToggleButton>
                                </ToggleButtonGroup>
                                <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 360, overflowY: 'auto' }}>
                                  {view === 'changes' ? (
                                    <DiffView before={currentById.get(op.noteId)?.markdown ?? ''} after={op.markdown} />
                                  ) : (
                                    <MarkdownBody markdown={op.markdown} enableToc={false} />
                                  )}
                                </Box>
                              </Box>
                            )}
                          </Box>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Box>

            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Ask for a different plan, e.g. keep note 3 and just shorten it"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && revision.trim()) {
                    e.preventDefault();
                    requestPlan(revision.trim());
                  }
                }}
              />
              <Button
                variant="outlined"
                endIcon={<SendIcon />}
                disabled={!revision.trim() || busy}
                onClick={() => requestPlan(revision.trim())}
              >
                Revise
              </Button>
            </Stack>
          </>
        ) : null}
      </DialogContent>

      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 1 }}>
          Notes are archived, never deleted, and you can undo the whole set from the topic page.
        </Typography>
        <Button onClick={handleCancel} disabled={isApplying}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleApply} disabled={busy || checked.size === 0}>
          {isApplying ? 'Applying…' : `Apply ${checked.size} ${checked.size === 1 ? 'change' : 'changes'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
