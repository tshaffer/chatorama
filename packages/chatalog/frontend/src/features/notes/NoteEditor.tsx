// frontend/src/features/notes/NoteEditor.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetNoteQuery,
  useUpdateNoteMutation,
  useGetAllNotesForRelationsQuery,
  useGetTopicNotesWithRelationsQuery, // ⬅️ NEW
} from './notesApi';
import type {
  Note,
  NoteRelation,
  NoteRelationKind,
  NoteRelationTargetType,
  Subject,
  Topic,
  NotePreview,
} from '@chatorama/chatalog-shared';
import {
  Box,
  Stack,
  TextField,
  Typography,
  Chip,
  Snackbar,
  Alert,
  Divider,
  Button,
  Tooltip,
  IconButton,
  MenuItem,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DoneIcon from '@mui/icons-material/Done';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';     // ⬅️ NEW
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'; // ⬅️ NEW

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import 'highlight.js/styles/github.css';
import '../../styles/markdown.css';

import { useGetSubjectsQuery } from '../subjects/subjectsApi';
import { useGetAllTopicsQuery } from '../topics/topicsApi';

// ---------------- helpers ----------------

function stripFrontMatter(md: string | undefined): string {
  if (!md) return '';

  // 1) Strip YAML front matter at the very top
  let s = md.replace(
    /^\uFEFF?---\s*\r?\n[\s\S]*?[\r\n]---\s*(?:\r?\n|$)/,
    '',
  );

  // 2) Strip any chatalog-meta HTML comment blocks anywhere in the doc
  s = s.replace(
    /<!--\s*chatalog-meta[\s\S]*?-->\s*\r?\n?/g,
    '',
  );

  return s;
}

function normalizeTurns(md: string): string {
  const startRE = /(^|\n)\s*:::\s*turns\b[^\n\r]*\r?\n/i;
  const endRE1 = /(^|\n)\s*:::\s*end[-\s]*turns\b[^\n\r]*\r?\n/i;
  const endRE2 = /(^|\n)\s*:::\s*(?:\r?\n|$)/i;

  let i = 0;
  let out = '';

  while (i < md.length) {
    startRE.lastIndex = i;
    const startMatch = startRE.exec(md);
    if (!startMatch) {
      out += md.slice(i);
      break;
    }

    const beforeBlock = md.slice(i, startMatch.index);
    const bodyStart = startMatch.index + startMatch[0].length;

    endRE1.lastIndex = bodyStart;
    endRE2.lastIndex = bodyStart;
    const end1 = endRE1.exec(md);
    const end2 = endRE2.exec(md);

    const endMatch = end1 || end2;
    const bodyEnd = endMatch ? endMatch.index : md.length;
    const afterMarker = endMatch ? endMatch.index + endMatch[0].length : bodyEnd;
    const body = md.slice(bodyStart, bodyEnd);

    if (process.env.NODE_ENV === 'development') {
      const head = body.slice(0, 240);
      console.log('[turns body head]', JSON.stringify(head));
      console.log(
        '[turns body codepoints]',
        Array.from(head).map((c) => c.codePointAt(0)!.toString(16)).join(' '),
      );
    }

    const turns = scanYamlTurns(body);

    out += beforeBlock;
    if (!turns.length) {
      console.warn('[turns] parse yielded 0 items; preserving raw block');
      out += md.slice(startMatch.index, afterMarker);
    } else {
      const rep: string[] = [];
      turns.forEach((t, idx) => {
        if (idx > 0) rep.push('\n* * *\n');
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
    if (s[i] === '-') {
      i++;
      while (i < len && /\s/.test(s[i])) i++;
    }

    if (matchAt(s, i, 'role:')) {
      i += 5;
      while (i < len && /\s/.test(s[i])) i++;
      const start = i;
      while (i < len && isWord(s[i])) i++;
      role = s.slice(start, i).toLowerCase();
      continue;
    }

    if (matchAt(s, i, 'text:')) {
      i += 5;
      while (i < len && /\s/.test(s[i])) i++;
      if (s[i] !== '"') {
        while (i < len && s[i] !== '\n') i++;
        continue;
      }
      i++; // opening "

      let buf = '';
      let escaped = false;
      for (; i < len; i++) {
        const ch = s[i];
        if (escaped) {
          buf += ch;
          escaped = false;
        } else if (ch === '\\') {
          buf += ch;
          escaped = true;
        } else if (ch === '"') {
          i++;
          break;
        } else {
          buf += ch;
        }
      }

      const text = unescapeEscapes(buf);
      turns.push({ role: role ?? 'assistant', text });
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
  return s
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function unescapeEscapes(s: string): string {
  return s
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

// Extract leading 24-hex ObjectId from "<id>" or "<id>-<slug>"
function takeObjectId(s?: string) {
  const m = s?.match(/^[a-f0-9]{24}/i);
  return m ? m[0] : undefined;
}

// Slug helper for subject/topic links
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ---------------- relations helpers ----------------

const ALL_TARGET_TYPES: NoteRelationTargetType[] = ['note', 'topic', 'subject'];

const TARGET_TYPE_LABEL: Record<NoteRelationTargetType, string> = {
  note: 'Note',
  topic: 'Topic',
  subject: 'Subject',
};

const ALL_RELATION_KINDS: NoteRelationKind[] = [
  'also-about',
  'see-also',
  'supports',
  'contrasts-with',
  'warning',
  'background',
];

type TopicOption = { id: string; label: string; subjectId?: string; topicName?: string };
type SubjectOption = { id: string; label: string };
type NoteOption = { id: string; label: string; subjectId?: string; topicId?: string };

// ---------------- component ----------------

type Props = { enableBeforeUnloadGuard?: boolean; debounceMs?: number };

export default function NoteEditor({
  enableBeforeUnloadGuard = true,
  debounceMs = 1000,
}: Props) {
  const { noteId } = useParams<{ noteId?: string }>();
  const navigate = useNavigate();
  const resolvedNoteId = useMemo(() => takeObjectId(noteId), [noteId]);

  const {
    data: note,
    isLoading,
    isError,
    error,
  } = useGetNoteQuery(resolvedNoteId ?? skipToken, {
    refetchOnMountOrArgChange: true,
  });

  const [updateNote, { isLoading: isSaving }] = useUpdateNoteMutation();

  // Data for pickers
  const { data: subjects = [] } = useGetSubjectsQuery();
  const { data: topics = [] } = useGetAllTopicsQuery();
  const { data: notesForPicker = [] } = useGetAllNotesForRelationsQuery();

  const subjectOptions: SubjectOption[] = useMemo(
    () =>
      (subjects as Subject[])
        .map((s) => ({ id: s.id, label: s.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [subjects],
  );

  const topicOptions: TopicOption[] = useMemo(() => {
    const subjectNameById = new Map<string, string>();
    (subjects as Subject[]).forEach((s) => {
      subjectNameById.set(s.id, s.name);
    });

    const opts: TopicOption[] = (topics as Topic[]).map((t) => ({
      id: t.id,
      label: `${subjectNameById.get(t.subjectId) ?? 'Unknown subject'} / ${t.name}`,
      subjectId: t.subjectId,
      topicName: t.name,
    }));

    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [subjects, topics]);

  const noteOptions: NoteOption[] = useMemo(() => {
    const opts: NoteOption[] = (notesForPicker as NotePreview[]).map((n) => ({
      id: n.id,
      label: n.title || 'Untitled',
      subjectId: (n as any).subjectId,
      topicId: (n as any).topicId,
    }));
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [notesForPicker]);

  // Helper for topic-notes args
  const topicNotesArgs =
    note && (note as Note).subjectId && (note as Note).topicId
      ? {
        subjectId: (note as Note).subjectId!, // non-null: guarded above
        topicId: (note as Note).topicId!,     // non-null: guarded above
      }
      : skipToken;
  const { data: topicNotes } = useGetTopicNotesWithRelationsQuery(topicNotesArgs);

  const { prevNote, nextNote } = useMemo(() => {
    if (!topicNotes || !note) {
      return { prevNote: undefined, nextNote: undefined };
    }

    // topicNotes is a TopicNotesWithRelations; use its notes array
    const list = topicNotes.notes ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      return { prevNote: undefined, nextNote: undefined };
    }

    const idx = list.findIndex((n) => n.id === (note as Note).id);
    if (idx === -1) return { prevNote: undefined, nextNote: undefined };

    return {
      prevNote: idx > 0 ? list[idx - 1] : undefined,
      nextNote: idx < list.length - 1 ? list[idx + 1] : undefined,
    };
  }, [topicNotes, note]);

  const goToNote = (target: any | undefined) => {
    if (!target) return;
    const slug = slugify(target.title || 'note');
    navigate(`/n/${target.id}-${slug}`);
  };

  // Preview-first UX: start with editor hidden
  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [relations, setRelations] = useState<NoteRelation[] | undefined>(
    undefined,
  );
  const [noteStatus, setNoteStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    sev: 'success' | 'error';
  }>({ open: false, msg: '', sev: 'success' });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInitNoteIdRef = useRef<string | undefined>(undefined);

  // Load note -> form (initialize once per note id)
  useEffect(() => {
    if (!note || !resolvedNoteId) return;
    if (lastInitNoteIdRef.current === resolvedNoteId) return;
    lastInitNoteIdRef.current = resolvedNoteId;

    setTitle(note.title ?? '');
    setMarkdown(note.markdown ?? '');
    setRelations(note.relations ?? []);
    setNoteStatus((note as Note).status ?? '');
    setDirty(false);
  }, [resolvedNoteId, note]);

  // Debounced autosave
  useEffect(() => {
    if (!note) return;
    if (!dirty) return;
    if (!resolvedNoteId) return; // 👈 narrow here

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const trimmedStatus = noteStatus.trim();
        await updateNote({
          noteId: resolvedNoteId, // now typed as string
          patch: {
            title,
            markdown,
            relations,
            // 🔹 NEW: send undefined when empty so it clears cleanly
            status: trimmedStatus || undefined,
          },
        }).unwrap();
        setSnack({ open: true, msg: 'Saved', sev: 'success' });
        setDirty(false);
      } catch {
        setSnack({ open: true, msg: 'Save failed', sev: 'error' });
      }
    }, debounceMs);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, title, markdown, relations, resolvedNoteId, debounceMs, updateNote, note]);

  // Cmd/Ctrl+S
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (!note || !resolvedNoteId) return; // 👈 narrow here too
        if (saveTimer.current) clearTimeout(saveTimer.current);
        try {
          const trimmedStatus = noteStatus.trim();
          await updateNote({
            noteId: resolvedNoteId,
            patch: {
              title,
              markdown,
              relations,
              status: trimmedStatus || undefined, // 🔹 NEW
            },
          }).unwrap();
          setSnack({ open: true, msg: 'Saved', sev: 'success' });
          setDirty(false);
        } catch {
          setSnack({ open: true, msg: 'Save failed', sev: 'error' });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [note, resolvedNoteId, title, markdown, relations, noteStatus, updateNote]);

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

  // Ancestors: subject & topic for this note
  const noteSubject = useMemo(
    () =>
      (subjects as Subject[]).find(
        (s) => s.id === (note as Note | undefined)?.subjectId,
      ),
    [subjects, note],
  );

  const noteTopic = useMemo(
    () =>
      (topics as Topic[]).find(
        (t) => t.id === (note as Note | undefined)?.topicId,
      ),
    [topics, note],
  );

  if (isError) {
    return (
      <Box p={2}>
        <Typography color="error">Failed to load note.</Typography>
        <Typography variant="body2">
          {String(
            (error as any)?.data ?? (error as any)?.message ?? error,
          )}
        </Typography>
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
  const previewBody = normalizeTurns(
    body.replace(/^#\s*Transcript\s*\r?\n?/, ''),
  );

  // --- relations UI handlers ---

  const handleAddRelation = () => {
    // Pick a default target type based on what's actually available
    const defaultTargetType: NoteRelationTargetType =
      topicOptions.length > 0
        ? 'topic'
        : subjectOptions.length > 0
          ? 'subject'
          : 'note';

    setRelations((prev) => {
      const next: NoteRelation[] = prev ? [...prev] : [];
      next.push({
        targetType: defaultTargetType,
        targetId: '',
        kind: 'also-about',
      });
      return next;
    });
    // don't set dirty yet; wait until user actually edits a field
  };

  const handleChangeRelation = (
    index: number,
    field: keyof NoteRelation,
    value: any,
  ) => {
    setRelations((prev) => {
      const base: NoteRelation[] = prev ? [...prev] : [];
      if (!base[index]) return base;
      base[index] = { ...base[index], [field]: value };
      return base;
    });
    setDirty(true);
  };

  const handleRemoveRelation = (index: number) => {
    setRelations((prev) => {
      if (!prev) return prev;
      const base = [...prev];
      base.splice(index, 1);
      return base;
    });
    setDirty(true);
  };

  const handleOpenRelationTarget = (rel: NoteRelation) => {

    if (!rel.targetId) return;

    if (rel.targetType === 'note') {
      // Try to navigate via subject/topic context if we know it
      const target = noteOptions.find((n) => n.id === rel.targetId);

      if (target && target.subjectId && target.topicId) {
        const subj = (subjects as Subject[]).find((s) => s.id === target.subjectId);
        const topic = (topics as Topic[]).find((t) => t.id === target.topicId);

        if (subj && topic) {
          const subjSlug = slugify(subj.name);
          const topicSlug = slugify(topic.name);
          const noteSlug = slugify(target.label || 'note');

          navigate(
            `/s/${subj.id}-${subjSlug}/t/${topic.id}-${topicSlug}/n/${target.id}-${noteSlug}`,
          );
          return;
        }
      }

      // Fallback: just use the bare note route
      navigate(`/n/${rel.targetId}`);
      return;
    }

    if (rel.targetType === 'subject') {
      const subj = (subjects as Subject[]).find((s) => s.id === rel.targetId);
      if (!subj) return;
      const slug = slugify(subj.name);
      navigate(`/s/${subj.id}-${slug}`);
      return;
    }

    if (rel.targetType === 'topic') {
      const allTopics = topics as Topic[];
      const topic = allTopics.find((t) => t.id === rel.targetId);
      if (!topic) return;
      const subj = (subjects as Subject[]).find((s) => s.id === topic.subjectId);
      if (!subj) return;

      const subjSlug = slugify(subj.name);
      const topicSlug = slugify(topic.name);
      navigate(`/s/${subj.id}-${subjSlug}/t/${topic.id}-${topicSlug}`);
    }
  };

  const describeRelationTarget = (rel: NoteRelation): string => {
    if (!rel.targetId) return '(no target selected)';

    if (rel.targetType === 'note') {
      const n = noteOptions.find((x) => x.id === rel.targetId);
      return n ? `Note: ${n.label}` : `Note: ${rel.targetId}`;
    }

    if (rel.targetType === 'subject') {
      const s = subjectOptions.find((x) => x.id === rel.targetId);
      return s ? `Subject: ${s.label}` : `Subject: ${rel.targetId}`;
    }

    // topic
    const t = topicOptions.find((x) => x.id === rel.targetId);
    return t ? `Topic: ${t.label}` : `Topic: ${rel.targetId}`;
  };

  return (
    <Box
      p={2}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      {/* Top bar: title (in preview) + status + Edit/Done + Prev/Next */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">
          {editing ? 'Edit Note' : 'Note'}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {/* Prev/Next only in preview mode */}
          {!editing && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip
                title={
                  prevNote
                    ? `Previous: ${prevNote.title || 'Untitled'}`
                    : 'No previous note'
                }
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={() => goToNote(prevNote)}
                    disabled={!prevNote}
                    aria-label="Previous note in topic"
                  >
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip
                title={
                  nextNote
                    ? `Next: ${nextNote.title || 'Untitled'}`
                    : 'No next note'
                }
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={() => goToNote(nextNote)}
                    disabled={!nextNote}
                    aria-label="Next note in topic"
                  >
                    <ArrowForwardIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          )}

          <Chip
            size="small"
            label={status}
            color={
              status === 'Saved'
                ? 'success'
                : status === 'Saving...'
                  ? 'warning'
                  : dirty
                    ? 'warning'
                    : 'default'
            }
            variant="outlined"
          />
          <Tooltip title={editing ? 'Finish editing' : 'Edit'}>
            <span>
              <Button
                size="small"
                variant={editing ? 'contained' : 'outlined'}
                color={editing ? 'primary' : 'inherit'}
                startIcon={editing ? <DoneIcon /> : <EditIcon />}
                onClick={() => setEditing((e) => !e)}
                disabled={isLoading || isSaving}
              >
                {editing ? 'Done' : 'Edit'}
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Editor (hidden when not editing) */}
      {editing && (
        <>
          {/* Relations editor */}
          <Box sx={{ mt: 2 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle2">
                Relations
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={handleAddRelation}
              >
                Add relation
              </Button>
            </Stack>

            {relations && relations.length > 0 ? (
              <Stack spacing={1}>
                {relations.map((rel, idx) => {
                  const topicId = rel.targetType === 'topic' ? rel.targetId : '';
                  const knownTopic = topicOptions.find((t) => t.id === topicId);

                  const subjectId = rel.targetType === 'subject' ? rel.targetId : '';
                  const knownSubject = subjectOptions.find(
                    (s) => s.id === subjectId,
                  );

                  const noteIdVal = rel.targetType === 'note' ? rel.targetId : '';
                  const knownNote = noteOptions.find(
                    (n) => n.id === noteIdVal,
                  );

                  return (
                    <Stack
                      key={idx}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                    >
                      {/* Target type */}
                      <TextField
                        select
                        size="small"
                        label="Target type"
                        value={rel.targetType}
                        onChange={(e) =>
                          handleChangeRelation(
                            idx,
                            'targetType',
                            e.target.value as NoteRelationTargetType,
                          )
                        }
                        sx={{ width: 140 }}
                      >
                        {ALL_TARGET_TYPES.map((t) => (
                          <MenuItem
                            key={t}
                            value={t}
                            disabled={
                              (t === 'topic' && topicOptions.length === 0) ||
                              (t === 'subject' && subjectOptions.length === 0) ||
                              (t === 'note' && noteOptions.length === 0)
                            }
                          >
                            {TARGET_TYPE_LABEL[t]}
                          </MenuItem>
                        ))}
                      </TextField>

                      {/* Target selector */}
                      {rel.targetType === 'topic' ? (
                        topicOptions.length > 0 ? (
                          knownTopic ? (
                            <TextField
                              select
                              size="small"
                              label="Topic"
                              value={topicId}
                              onChange={(e) =>
                                handleChangeRelation(idx, 'targetId', e.target.value)
                              }
                              sx={{ flex: 1 }}
                            >
                              {topicOptions.map((opt) => (
                                <MenuItem key={opt.id} value={opt.id}>
                                  {opt.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          ) : topicId ? (
                            // ID present but not known in options → show read-only
                            <TextField
                              size="small"
                              label="Topic"
                              value={topicId}
                              disabled
                              helperText="Unknown topic (id not in list)"
                              sx={{ flex: 1 }}
                            />
                          ) : (
                            // No target yet; allow picking from list
                            <TextField
                              select
                              size="small"
                              label="Topic"
                              value=""
                              onChange={(e) =>
                                handleChangeRelation(idx, 'targetId', e.target.value)
                              }
                              sx={{ flex: 1 }}
                            >
                              {topicOptions.map((opt) => (
                                <MenuItem key={opt.id} value={opt.id}>
                                  {opt.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          )
                        ) : (
                          <TextField
                            size="small"
                            label="Topic"
                            value={topicId}
                            disabled
                            helperText="Topic list not available"
                            sx={{ flex: 1 }}
                          />
                        )
                      ) : rel.targetType === 'subject' ? (
                        subjectOptions.length > 0 ? (
                          knownSubject ? (
                            <TextField
                              select
                              size="small"
                              label="Subject"
                              value={subjectId}
                              onChange={(e) =>
                                handleChangeRelation(idx, 'targetId', e.target.value)
                              }
                              sx={{ flex: 1 }}
                            >
                              {subjectOptions.map((opt) => (
                                <MenuItem key={opt.id} value={opt.id}>
                                  {opt.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          ) : subjectId ? (
                            <TextField
                              size="small"
                              label="Subject"
                              value={subjectId}
                              disabled
                              helperText="Unknown subject (id not in list)"
                              sx={{ flex: 1 }}
                            />
                          ) : (
                            <TextField
                              select
                              size="small"
                              label="Subject"
                              value=""
                              onChange={(e) =>
                                handleChangeRelation(idx, 'targetId', e.target.value)
                              }
                              sx={{ flex: 1 }}
                            >
                              {subjectOptions.map((opt) => (
                                <MenuItem key={opt.id} value={opt.id}>
                                  {opt.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          )
                        ) : (
                          <TextField
                            size="small"
                            label="Subject"
                            value={subjectId}
                            disabled
                            helperText="Subject list not available"
                            sx={{ flex: 1 }}
                          />
                        )
                      ) : noteOptions.length > 0 ? (
                        knownNote ? (
                          <TextField
                            select
                            size="small"
                            label="Note"
                            value={noteIdVal}
                            onChange={(e) =>
                              handleChangeRelation(idx, 'targetId', e.target.value)
                            }
                            sx={{ flex: 1 }}
                          >
                            {noteOptions.map((opt) => (
                              <MenuItem key={opt.id} value={opt.id}>
                                {opt.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        ) : noteIdVal ? (
                          <TextField
                            size="small"
                            label="Note"
                            value={noteIdVal}
                            disabled
                            helperText="Unknown note (id not in list)"
                            sx={{ flex: 1 }}
                          />
                        ) : (
                          <TextField
                            select
                            size="small"
                            label="Note"
                            value=""
                            onChange={(e) =>
                              handleChangeRelation(idx, 'targetId', e.target.value)
                            }
                            sx={{ flex: 1 }}
                          >
                            {noteOptions.map((opt) => (
                              <MenuItem key={opt.id} value={opt.id}>
                                {opt.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        )
                      ) : (
                        <TextField
                          size="small"
                          label="Note"
                          value={noteIdVal}
                          disabled
                          helperText="Note list not available"
                          sx={{ flex: 1 }}
                        />
                      )}

                      {/* Kind */}
                      <TextField
                        select
                        size="small"
                        label="Kind"
                        value={rel.kind}
                        onChange={(e) =>
                          handleChangeRelation(
                            idx,
                            'kind',
                            e.target.value as NoteRelationKind,
                          )
                        }
                        sx={{ width: 180 }}
                      >
                        {ALL_RELATION_KINDS.map((k) => (
                          <MenuItem key={k} value={k}>
                            {k}
                          </MenuItem>
                        ))}
                      </TextField>

                      {/* Open target */}
                      <Tooltip title="Open target">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenRelationTarget(rel)}
                            aria-label="Open related item"
                            disabled={!rel.targetId}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>

                      {/* Remove relation */}
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveRelation(idx)}
                        aria-label="Remove relation"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  );
                })}
              </Stack>
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontStyle: 'italic' }}
              >
                No relations yet. Use &quot;Add relation&quot; to link this note
                to topics, other notes, or subjects.
              </Typography>
            )}
          </Box>

          <TextField
            label="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            size="small"
            fullWidth
          />

          {/* 🔹 NEW: short freeform status/meta text */}
          <TextField
            label="Status (optional)"
            value={noteStatus}
            onChange={(e) => {
              setNoteStatus(e.target.value);
              setDirty(true);
            }}
            size="small"
            fullWidth
            margin="dense"
            helperText="Short note about follow-ups or changes for this note."
          />

          <TextField
            label="Markdown"
            value={markdown}
            onChange={(e) => {
              setMarkdown(e.target.value);
              setDirty(true);
            }}
            fullWidth
            multiline
            minRows={10}
            placeholder="Write in Markdown…"
            sx={{ flex: 1, overflow: 'auto' }}
          />

          <Divider />
        </>
      )}

      {/* Preview */}
      {!editing && <Divider />}
      <Typography variant="subtitle2" color="text.secondary">
        Preview
      </Typography>
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        <Typography variant="h5" sx={{ mb: 0.5 }}>
          {title || 'Untitled'}
        </Typography>

        {/* 🔹 NEW: show status if present */}
        {noteStatus.trim() && (
          <Chip
            size="small"
            variant="outlined"
            color="info"
            label={noteStatus}
            sx={{
              mb: 1,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          />
        )}

        {/* Context & relations (read-only, always visible in preview) */}
        {(noteSubject || noteTopic || (relations && relations.length > 0)) && (
          <Box
            sx={{
              mb: 2,
              p: 1,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper',
            }}
          >
            {noteSubject || noteTopic ? (
              <Box sx={{ mb: relations && relations.length > 0 ? 1.5 : 0 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
                >
                  Context
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  {noteSubject && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Subject: ${noteSubject.name}`}
                      onClick={() => {
                        const slug = slugify(noteSubject.name);
                        navigate(`/s/${noteSubject.id}-${slug}`);
                      }}
                    />
                  )}
                  {noteTopic && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Topic: ${noteTopic.name}`}
                      onClick={() => {
                        const subj = noteSubject;
                        if (!subj) return;
                        const subjSlug = slugify(subj.name);
                        const topicSlug = slugify(noteTopic.name);
                        navigate(`/s/${subj.id}-${subjSlug}/t/${noteTopic.id}-${topicSlug}`);
                      }}
                    />
                  )}
                </Stack>
              </Box>
            ) : null}

            {relations && relations.length > 0 && (
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
                >
                  Relations
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {relations.map((rel, idx) => (
                    <Stack
                      key={idx}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                    >
                      <Typography variant="body2">
                        {describeRelationTarget(rel)}{' '}
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                        >
                          ({rel.kind})
                        </Typography>
                      </Typography>
                      <Tooltip title="Open related item">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenRelationTarget(rel)}
                            aria-label="Open related item"
                            disabled={!rel.targetId}
                          >
                            <OpenInNewIcon fontSize="inherit" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        )}

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
        <Alert severity={snack.sev} variant="filled">
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
