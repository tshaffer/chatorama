import { useEffect, useMemo, useRef, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetNoteQuery, useUpdateNoteMutation } from './notesApi';
import type { Note } from '@shared/types';
import {
  Box,
  Stack,
  TextField,
  Typography,
  Chip,
  Snackbar,
  Alert,
  Divider,
} from '@mui/material';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import 'highlight.js/styles/github.css';
import '../../styles/markdown.css';

// ---------------- helpers ----------------

function stripFrontMatter(md: string | undefined): string {
  if (!md) return '';
  return md.replace(/^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '');
}

function normalizeTurns(md: string): string {
  const startRE = /(^|\n)\s*:::\s*turns\b[^\n\r]*\r?\n/i;
  const endRE1 = /(^|\n)\s*:::\s*end[-\s]*turns\b[^\n\r]*\r?\n/i;
  const endRE2 = /(^|\n)\s*:::\s*(?:\r?\n|$)/i;

  let i = 0;
  let out = '';

  while (i < md.length) {
    // find start marker
    startRE.lastIndex = i;
    const startMatch = startRE.exec(md);
    if (!startMatch) {
      out += md.slice(i);
      break;
    }

    const beforeBlock = md.slice(i, startMatch.index);
    const blockStart = startMatch.index; // at first ':' of ':::turns'
    const bodyStart = startMatch.index + startMatch[0].length; // char after newline of marker

    // find end marker (prefer explicit end-turns)
    endRE1.lastIndex = bodyStart;
    endRE2.lastIndex = bodyStart;
    const end1 = endRE1.exec(md);
    const end2 = endRE2.exec(md);

    const endMatch = end1 || end2;
    const bodyEnd = endMatch ? endMatch.index : md.length;
    const afterMarker = endMatch ? endMatch.index + endMatch[0].length : bodyEnd;
    const body = md.slice(bodyStart, bodyEnd);

    // ---- DEBUG
    if (process.env.NODE_ENV === 'development') {
      const head = body.slice(0, 240);
      console.log('[turns body head]', JSON.stringify(head));
      console.log('[turns body codepoints]', Array.from(head).map(c => c.codePointAt(0)!.toString(16)).join(' '));
    }

    const turns = scanYamlTurns(body);

    out += beforeBlock; // keep text before the block
    if (!turns.length) {
      console.warn('[turns] parse yielded 0 items; preserving raw block');
      out += md.slice(blockStart, afterMarker);
    } else {
      // Build replacement markdown with separators between turns
      const rep: string[] = [];
      turns.forEach((t, idx) => {
        if (idx > 0) rep.push('\n* * *\n'); // ← separator between turns

        if ((t.role || '').toLowerCase() === 'user') {
          rep.push('**Prompt**', '', toBlockquote(t.text), '');
        } else {
          rep.push('**Response**', '', t.text, '');
        }
      });

      out += '\n' + rep.join('\n').trim() + '\n';
    }

    i = afterMarker;
  }

  return out;
}

type Turn = { role: string; text: string };

function scanYamlTurns(block: string): Turn[] {
  const s = block;
  const len = s.length;
  let i = 0;
  const turns: Turn[] = [];
  let role: string | null = null;

  const isWord = (c: string) => /[A-Za-z0-9_-]/.test(c);

  while (i < len) {
    while (i < len && /\s/.test(s[i])) i++;
    if (s[i] === '-') { i++; while (i < len && /\s/.test(s[i])) i++; }

    if (matchAt(s, i, 'role:')) {
      i += 5; while (i < len && /\s/.test(s[i])) i++;
      const start = i; while (i < len && isWord(s[i])) i++;
      role = s.slice(start, i).toLowerCase();
      continue;
    }

    if (matchAt(s, i, 'text:')) {
      i += 5; while (i < len && /\s/.test(s[i])) i++;
      if (s[i] !== '"') { while (i < len && s[i] !== '\n') i++; continue; }
      i++; // opening "

      let buf = ''; let escaped = false;
      for (; i < len; i++) {
        const ch = s[i];
        if (escaped) { buf += ch; escaped = false; }
        else if (ch === '\\') { buf += ch; escaped = true; }
        else if (ch === '"') { i++; break; }
        else { buf += ch; }
      }

      const text = unescapeEscapes(buf);
      turns.push({ role: (role ?? 'assistant'), text });
      role = null;
      continue;
    }

    while (i < len && s[i] !== '\n') i++;
    if (i < len && s[i] === '\n') i++;
  }

  return turns;
}

function matchAt(s: string, i: number, lit: string): boolean {
  for (let k = 0; k < lit.length; k++) if (s[i + k] !== lit[k]) return false;
  return true;
}

function toBlockquote(s: string): string {
  return s.split('\n').map(line => `> ${line}`).join('\n');
}

function unescapeEscapes(s: string): string {
  return s
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

// ---------------- component ----------------

type Props = { noteId?: string; enableBeforeUnloadGuard?: boolean; debounceMs?: number };

export default function NoteEditor({ noteId, enableBeforeUnloadGuard = true, debounceMs = 1000 }: Props) {
  const { data: note, isLoading, isError, error } = useGetNoteQuery(noteId ? noteId : skipToken);
  const [updateNote, { isLoading: isSaving }] = useUpdateNoteMutation();

  if (!noteId) {
    return <Box p={2}><Typography variant="body2" color="text.secondary">No note selected.</Typography></Box>;
  }

  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [dirty, setDirty] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNoteRef = useRef<Note | undefined>(undefined);

  // Load note -> form
  const noteKey = note?.id;
  useEffect(() => {
    if (!note) return;
    latestNoteRef.current = note;
    setTitle(note.title ?? '');
    setMarkdown(note.markdown ?? '');
    setDirty(false);
  }, [noteKey]);

  // Debounced autosave
  useEffect(() => {
    if (!note) return;
    if (!dirty) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await updateNote({ noteId, patch: { title, markdown } }).unwrap();
        setSnack({ open: true, msg: 'Saved', sev: 'success' });
        setDirty(false);
      } catch {
        setSnack({ open: true, msg: 'Save failed', sev: 'error' });
      }
    }, debounceMs);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, title, markdown, noteId, debounceMs, updateNote, note]);

  // Cmd/Ctrl+S
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (!note) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        try {
          await updateNote({ noteId, patch: { title, markdown } }).unwrap();
          setSnack({ open: true, msg: 'Saved', sev: 'success' });
          setDirty(false);
        } catch {
          setSnack({ open: true, msg: 'Save failed', sev: 'error' });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [note, noteId, title, markdown, updateNote]);

  // Before-unload dirty guard (optional)
  useEffect(() => {
    if (!enableBeforeUnloadGuard) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, enableBeforeUnloadGuard]);

  const status = useMemo(() => {
    if (isLoading) return 'Loading...';
    if (isSaving) return 'Saving...';
    if (dirty) return 'Unsaved changes';
    return 'Saved';
  }, [isLoading, isSaving, dirty]);

  if (isError) {
    return (
      <Box p={2}>
        <Typography color="error">Failed to load note.</Typography>
        <Typography variant="body2">{String((error as any)?.data ?? (error as any)?.message ?? error)}</Typography>
      </Box>
    );
  }
  if (isLoading || !note) {
    return (
      <Box p={2}>
        <Typography>Loading…</Typography>
      </Box>
    );
  }

  const body = stripFrontMatter(markdown ?? '');
  console.log('[has :::turns (manual)]', /:::\s*turns/i.test(body));
  const previewBody = normalizeTurns(body.replace(/^#\s*Transcript\s*\r?\n?/, ''));

  console.log('[counts]', {
    prompts: (previewBody.match(/\*\*Prompt\*\*/g) || []).length,
    responses: (previewBody.match(/\*\*Response\*\*/g) || []).length,
  });

  console.log('[normalizeTurns OUTPUT]\\n', previewBody);

  return (
    <Box p={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">Edit Note</Typography>
        <Chip
          size="small"
          label={status}
          color={status === 'Saved' ? 'success' : status === 'Saving...' ? 'warning' : dirty ? 'warning' : 'default'}
          variant="outlined"
        />
      </Stack>

      <TextField
        label="Title"
        value={title}
        onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
        size="small"
        fullWidth
      />

      {/* Editor */}
      <TextField
        label="Markdown"
        value={markdown}
        onChange={(e) => { setMarkdown(e.target.value); setDirty(true); }}
        fullWidth
        multiline
        minRows={10}
        placeholder="Write in Markdown…"
        sx={{ flex: 1, overflow: 'auto' }}
      />

      {/* Live Preview */}
      <Divider />
      <Typography variant="subtitle2" color="text.secondary">Preview</Typography>
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>{title || 'Untitled'}</Typography>
        <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
          <div className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeHighlight]}
            >
              {previewBody}
            </ReactMarkdown>
          </div>
        </Box>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={2000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snack.sev} variant="filled">{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
