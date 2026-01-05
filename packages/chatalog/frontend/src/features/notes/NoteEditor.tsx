import { useEffect, useMemo, useRef, useState, useCallback, type ChangeEvent } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useGetNoteQuery,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  useGetAllNotesForRelationsQuery,
  useGetTopicNotesWithRelationsQuery, // ⬅️ NEW
  useUploadImageMutation,
  useAttachAssetToNoteMutation,
  useNormalizeRecipeIngredientsMutation,
  useSearchRecipesQuery,
} from './notesApi';
import {
  type Note,
  type NoteRelation,
  type NoteRelationKind,
  type NoteRelationTargetType,
  type Subject,
  type Topic,
  type NotePreview,
  slugifyStandard,
} from '@chatorama/chatalog-shared';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DoneIcon from '@mui/icons-material/Done';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';

import MarkdownBody from '../../components/MarkdownBody';
import '../../styles/markdown.css';

import {
  useGetSubjectsQuery,
  useGetSubjectsWithTopicsQuery,
  useCreateSubjectMutation,
  useCreateTopicMutation,
  resolveSubjectAndTopicNames,
} from '../subjects/subjectsApi';
import Autocomplete from '@mui/material/Autocomplete';
import { useGetAllTopicsQuery } from '../topics/topicsApi';
import NotePropertiesDialog from './NotePropertiesDialog';
import RecipeView from './RecipeView';
import CookedHistoryPanel from './CookedHistoryPanel';
import RecipePropertiesDialog from './RecipePropertiesDialog';

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
        Array.from(head)
          .map((c) => c.codePointAt(0)!.toString(16))
          .join(' '),
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
  const [deleteNote, { isLoading: isDeleting }] = useDeleteNoteMutation();
  const [uploadImage] = useUploadImageMutation();
  const [attachAssetToNote] = useAttachAssetToNoteMutation();
  const [normalizeRecipeIngredients, { isLoading: isNormalizing }] =
    useNormalizeRecipeIngredientsMutation();

  // Data for pickers
  const { data: subjects = [] } = useGetSubjectsQuery();
  const { data: subjectsWithTopics = [] } = useGetSubjectsWithTopicsQuery();
  const [createSubject] = useCreateSubjectMutation();
  const [createTopic] = useCreateTopicMutation();
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
      label: `${subjectNameById.get(t.subjectId) ?? 'Unknown subject'} / ${t.name
        }`,
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
        topicId: (note as Note).topicId!, // non-null: guarded above
      }
      : skipToken;
  const { data: topicNotes } = useGetTopicNotesWithRelationsQuery(topicNotesArgs);

  const { prevNote, nextNote } = useMemo(() => {
    if (!topicNotes || !note) {
      return { prevNote: undefined, nextNote: undefined };
    }

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
    const slug = slugifyStandard(target.title || 'note');
    navigate(`/n/${target.id}-${slug}`);
  };

  const goToSubjectOverview = (subjectId?: string) => {
    if (!subjectId) {
      navigate('/notes');
      return;
    }
    const subj = (subjects as Subject[]).find((s) => s.id === subjectId);
    const slug = slugifyStandard(subj?.name || 'subject');
    navigate(`/s/${subjectId}-${slug}`);
  };

  const handleDeleteNote = async () => {
    if (!note || isDeleting) return;
    const noteIdToDelete = (note as Note).id;
    const subjectId = (note as Note).subjectId;
    const topicId = (note as Note).topicId;

    const list = topicNotes?.notes ?? [];
    const idx = list.findIndex((n) => n.id === noteIdToDelete);
    const fallback =
      idx !== -1 ? list[idx + 1] || list[idx - 1] || undefined : undefined;

    const confirmed = window.confirm('Delete this note? This cannot be undone.');
    if (!confirmed) return;

    try {
      await deleteNote({ noteId: noteIdToDelete }).unwrap();
      if (fallback) {
        goToNote(fallback);
      } else if (subjectId && topicId) {
        goToSubjectOverview(subjectId);
      } else {
        navigate('/notes');
      }
    } catch (err) {
      console.error('Failed to delete note', err);
    }
  };

  // Preview-first UX: start with editor hidden
  const [editing, setEditing] = useState(false);

  const [title, setTitle] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [relations, setRelations] = useState<NoteRelation[] | undefined>(
    undefined,
  );
  const [noteStatus, setNoteStatus] = useState(''); // kept for save logic, UI hidden
  const [subjectLabel, setSubjectLabel] = useState('');
  const [topicLabel, setTopicLabel] = useState('');
  const [dirty, setDirty] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [recipePropsOpen, setRecipePropsOpen] = useState(false);
  const [recipeSearchOpen, setRecipeSearchOpen] = useState(false);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
  const [recipeSearchMode, setRecipeSearchMode] = useState<'any' | 'all'>('any');
  const [recipeSearchSubmitted, setRecipeSearchSubmitted] = useState<string | null>(null);
  const [recipeSearchModeSubmitted, setRecipeSearchModeSubmitted] = useState<'any' | 'all'>('any');
  const [resizeOpen, setResizeOpen] = useState(false);
  const [resizeTarget, setResizeTarget] = useState<{
    src?: string;
    title?: string;
    alt?: string;
  } | null>(null);
  const [resizePreset, setResizePreset] = useState<'sm' | 'md' | 'lg' | 'full' | 'custom'>('md');
  const [resizePx, setResizePx] = useState<string>('520');
  const [snack, setSnack] = useState<{
    open: boolean;
    msg: string;
    sev: 'success' | 'error';
  }>({ open: false, msg: '', sev: 'success' });

  const recipeSearchArgs = recipeSearchSubmitted
    ? { query: recipeSearchSubmitted, mode: recipeSearchModeSubmitted }
    : skipToken;
  const { data: recipeSearchResults = [], isFetching: isRecipeSearching } =
    useSearchRecipesQuery(recipeSearchArgs);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInitNoteIdRef = useRef<string | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const markdownInputRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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
      setDirty(true);

      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        const pos = start + snippet.length;
        try {
          ta.setSelectionRange(pos, pos);
        } catch {
          // Ignore selection errors (e.g., input not focused)
        }
      });
    },
    [markdown.length],
  );

  const handleImageFilePicked = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!resolvedNoteId) {
        setSnack({ open: true, msg: 'No note selected', sev: 'error' });
        return;
      }

      try {
        const { asset } = await uploadImage(file).unwrap();
        await attachAssetToNote({ noteId: resolvedNoteId, assetId: asset.id }).unwrap();
        const url = `/api/assets/${asset.id}/content`;
        insertAtCursor(`\n\n![](${url} "w=md")\n\n`);
        setSnack({ open: true, msg: 'Image inserted', sev: 'success' });
      } catch (err) {
        console.error('Insert image failed', err);
        setSnack({ open: true, msg: 'Image insert failed', sev: 'error' });
      }
    },
    [resolvedNoteId, uploadImage, attachAssetToNote, insertAtCursor],
  );

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

  const { subjectName: resolvedSubjectName, topicName: resolvedTopicName } = useMemo(
    () =>
      resolveSubjectAndTopicNames(
        subjectsWithTopics as (Subject & { topics: Topic[] })[] | undefined,
        (note as Note | undefined)?.subjectId,
        (note as Note | undefined)?.topicId,
      ),
    [subjectsWithTopics, note],
  );

  const isRecipeNote =
    !!(note as Note | undefined)?.recipe?.sourceUrl ||
    !!(note as Note | undefined)?.recipe?.ingredientsRaw?.length ||
    !!(note as Note | undefined)?.recipe?.stepsRaw?.length;

  // Subject/topic editing helpers
  const subjectLabelOptions = useMemo(() => {
    const set = new Set<string>();
    (subjectsWithTopics as (Subject & { topics?: Topic[] })[]).forEach((s) => {
      if (s.name?.trim()) set.add(s.name.trim());
    });
    if (subjectLabel.trim()) set.add(subjectLabel.trim());
    return Array.from(set);
  }, [subjectsWithTopics, subjectLabel]);

  const selectedSubjectForEdit = useMemo(() => {
    const trimmed = subjectLabel.trim();
    if (!trimmed) return undefined;
    return (subjectsWithTopics as (Subject & { topics?: Topic[] })[]).find(
      (s) => s.name?.trim() === trimmed,
    );
  }, [subjectsWithTopics, subjectLabel]);

  const topicLabelOptions = useMemo(() => {
    const set = new Set<string>();
    (selectedSubjectForEdit?.topics ?? []).forEach((t) => {
      if (t.name?.trim()) set.add(t.name.trim());
    });
    const trimmedTopic = topicLabel.trim();
    if (trimmedTopic) set.add(trimmedTopic);
    return Array.from(set);
  }, [selectedSubjectForEdit, topicLabel]);

  const resolveSubjectTopicIds = useCallback(async () => {
    let subjectId: string | undefined;
    let topicId: string | undefined;

    const trimmedSubject = subjectLabel.trim();
    const trimmedTopic = topicLabel.trim();

    if (trimmedSubject) {
      const existingSubject = (
        subjectsWithTopics as (Subject & { topics?: Topic[] })[]
      ).find((s) => s.name?.trim() === trimmedSubject);
      if (existingSubject) {
        subjectId = existingSubject.id;
      } else {
        const created = await createSubject({ name: trimmedSubject }).unwrap();
        subjectId = created.id;
      }
    }

    if (trimmedTopic && subjectId) {
      const existingSubject = (
        subjectsWithTopics as (Subject & { topics?: Topic[] })[]
      ).find((s) => s.id === subjectId);
      const existingTopic = existingSubject?.topics?.find(
        (t) => t.name?.trim() === trimmedTopic,
      );
      if (existingTopic) {
        topicId = existingTopic.id;
      } else {
        const createdTopic = await createTopic({
          subjectId,
          name: trimmedTopic,
        }).unwrap();
        topicId = createdTopic.id;
      }
    }

    return { subjectId: subjectId || undefined, topicId: topicId || undefined };
  }, [subjectLabel, topicLabel, subjectsWithTopics, createSubject, createTopic]);

  // Load note -> form (initialize once per note id)
  useEffect(() => {
    if (!note || !resolvedNoteId) return;
    if (lastInitNoteIdRef.current === resolvedNoteId) return;
    lastInitNoteIdRef.current = resolvedNoteId;

    setTitle(note.title ?? '');
    setMarkdown(note.markdown ?? '');
    setRelations(note.relations ?? []);
    setNoteStatus((note as Note).status ?? '');
    setSubjectLabel(noteSubject?.name ?? '');
    setTopicLabel(noteTopic?.name ?? '');
    setDirty(false);
  }, [resolvedNoteId, note, noteSubject?.name, noteTopic?.name]);

  // Debounced autosave
  useEffect(() => {
    if (!note) return;
    if (!dirty) return;
    if (!resolvedNoteId) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const trimmedStatus = noteStatus.trim();
        const { subjectId: resolvedSubjectId, topicId: resolvedTopicId } =
          await resolveSubjectTopicIds();
        await updateNote({
          noteId: resolvedNoteId,
          patch: {
            title,
            markdown,
            relations,
            status: trimmedStatus || undefined,
            subjectId: resolvedSubjectId,
            topicId: resolvedTopicId,
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
  }, [
    dirty,
    title,
    markdown,
    relations,
    resolvedNoteId,
    debounceMs,
    updateNote,
    note,
    noteStatus,
    resolveSubjectTopicIds,
  ]);

  // Cmd/Ctrl+S
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (!note || !resolvedNoteId) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        try {
          const trimmedStatus = noteStatus.trim();
          const { subjectId: resolvedSubjectId, topicId: resolvedTopicId } =
            await resolveSubjectTopicIds();
          await updateNote({
            noteId: resolvedNoteId,
            patch: {
              title,
              markdown,
              relations,
              status: trimmedStatus || undefined,
              subjectId: resolvedSubjectId,
              topicId: resolvedTopicId,
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
  }, [
    note,
    resolvedNoteId,
    title,
    markdown,
    relations,
    noteStatus,
    updateNote,
    resolveSubjectTopicIds,
  ]);

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
      const target = noteOptions.find((n) => n.id === rel.targetId);

      if (target && target.subjectId && target.topicId) {
        const subj = (subjects as Subject[]).find(
          (s) => s.id === target.subjectId,
        );
        const topic = (topics as Topic[]).find(
          (t) => t.id === target.topicId,
        );

        if (subj && topic) {
          const subjSlug = slugifyStandard(subj.name);
          const topicSlug = slugifyStandard(topic.name);
          const noteSlug = slugifyStandard(target.label || 'note');

          navigate(
            `/s/${subj.id}-${subjSlug}/t/${topic.id}-${topicSlug}/n/${target.id}-${noteSlug}`,
          );
          return;
        }
      }

      navigate(`/n/${rel.targetId}`);
      return;
    }

    if (rel.targetType === 'subject') {
      const subj = (subjects as Subject[]).find((s) => s.id === rel.targetId);
      if (!subj) return;
      const slug = slugifyStandard(subj.name);
      navigate(`/s/${subj.id}-${slug}`);
      return;
    }

    if (rel.targetType === 'topic') {
      const allTopics = topics as Topic[];
      const topic = allTopics.find((t) => t.id === rel.targetId);
      if (!topic) return;
      const subj = (subjects as Subject[]).find((s) => s.id === topic.subjectId);
      if (!subj) return;

      const subjSlug = slugifyStandard(subj.name);
      const topicSlug = slugifyStandard(topic.name);
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

    const t = topicOptions.find((x) => x.id === rel.targetId);
    return t ? `Topic: ${t.label}` : `Topic: ${rel.targetId}`;
  };

  // --- shared preview block (used for both modes) ---
  const renderPreviewContent = () => (
    <>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        {title || 'Untitled'}
      </Typography>

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
              <Stack
                direction="row"
                spacing={1}
                sx={{ mt: 0.5, flexWrap: 'wrap' }}
              >
                {noteSubject && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Subject: ${noteSubject.name}`}
                    onClick={() => {
                      const slug = slugifyStandard(noteSubject.name);
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
                      const subjSlug = slugifyStandard(subj.name);
                      const topicSlug = slugifyStandard(noteTopic.name);
                      navigate(
                        `/s/${subj.id}-${subjSlug}/t/${noteTopic.id}-${topicSlug}`,
                      );
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

      {isRecipeNote && note && (
        <Box sx={{ mb: 2 }}>
          <RecipeView note={note as Note} />

          <Accordion defaultExpanded={false} sx={{ mt: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Cooked history</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <CookedHistoryPanel note={note as Note} />
            </AccordionDetails>
          </Accordion>

          <Divider sx={{ mt: 2 }} />
        </Box>
      )}

      <Box sx={{ mt: 1 }}>
        {isRecipeNote && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setRecipePropsOpen(true)}
            >
              Recipe Properties
            </Button>
          </Stack>
        )}
        <MarkdownBody
          markdown={previewBody}
          enableImageSizingUi={editing}
          onRequestResizeImage={handleRequestResizeImage}
        />
      </Box>
    </>
  );

  if (isRecipeNote) {
    console.log(note);
    // debugger;
  }

  return (
    <Box
      p={2}
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageFilePicked}
      />
      {/* Top bar: label + save status + Edit/Done + Prev/Next + Delete */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ flexShrink: 0 }}
      >
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

          <Tooltip title="Jump to top">
            <span>
              <IconButton
                size="small"
                onClick={scrollToTop}
                aria-label="Jump to top"
              >
                <VerticalAlignTopIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

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
          {editing && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isSaving}
            >
              Insert Image...
            </Button>
          )}
          {!editing && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setRecipeSearchOpen(true)}
            >
              Recipe Search
            </Button>
          )}
          <Tooltip title="View note properties">
            <span>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setPropertiesOpen(true)}
                disabled={isLoading}
              >
                Properties
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Delete this note">
            <span>
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<DeleteIcon />}
                onClick={handleDeleteNote}
                disabled={isLoading || isSaving || isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Meta row: Title (50%) / Subject (25%) / Topic (25%) */}
      {editing && (
        <Stack
          direction="row"
          spacing={2}
          sx={{ flexShrink: 0, minWidth: 0 }}
        >
          <TextField
            label="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            size="small"
            sx={{ flex: 2, minWidth: 0 }}
          />

          <Autocomplete
            freeSolo
            options={subjectLabelOptions}
            value={subjectLabel}
            sx={{ flex: 1, minWidth: 0 }}
            onInputChange={(_e, v) => {
              setSubjectLabel(v ?? '');
              setTopicLabel('');
              setDirty(true);
            }}
            onChange={(_e, v) => {
              setSubjectLabel(v ?? '');
              setTopicLabel('');
              setDirty(true);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Subject"
                size="small"
                fullWidth
              />
            )}
          />

          <Autocomplete
            freeSolo
            options={topicLabelOptions}
            value={topicLabel}
            sx={{ flex: 1, minWidth: 0 }}
            onInputChange={(_e, v) => {
              setTopicLabel(v ?? '');
              setDirty(true);
            }}
            onChange={(_e, v) => {
              setTopicLabel(v ?? '');
              setDirty(true);
            }}
            disabled={!subjectLabel.trim()}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Topic"
                size="small"
                fullWidth
              />
            )}
          />
        </Stack>
      )}

      {/* Main body: edit mode vs preview-only mode */}
      {editing ? (
        <Box
          ref={scrollContainerRef}
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            mt: 1,
          }}
        >
          {/* Relations editor */}
          <Box sx={{ mt: 1 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle2">Relations</Typography>
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

                  const subjectId =
                    rel.targetType === 'subject' ? rel.targetId : '';
                  const knownSubject = subjectOptions.find(
                    (s) => s.id === subjectId,
                  );

                  const noteIdVal =
                    rel.targetType === 'note' ? rel.targetId : '';
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
                                handleChangeRelation(
                                  idx,
                                  'targetId',
                                  e.target.value,
                                )
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
                            <TextField
                              size="small"
                              label="Topic"
                              value={topicId}
                              disabled
                              helperText="Unknown topic (id not in list)"
                              sx={{ flex: 1 }}
                            />
                          ) : (
                            <TextField
                              select
                              size="small"
                              label="Topic"
                              value=""
                              onChange={(e) =>
                                handleChangeRelation(
                                  idx,
                                  'targetId',
                                  e.target.value,
                                )
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
                                handleChangeRelation(
                                  idx,
                                  'targetId',
                                  e.target.value,
                                )
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
                                handleChangeRelation(
                                  idx,
                                  'targetId',
                                  e.target.value,
                                )
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
                              handleChangeRelation(
                                idx,
                                'targetId',
                                e.target.value,
                              )
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
                              handleChangeRelation(
                                idx,
                                'targetId',
                                e.target.value,
                              )
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

          <Divider sx={{ my: 2 }} />

          {/* Markdown editor */}
          <TextField
            label="Markdown"
            value={markdown}
            onChange={(e) => {
              setMarkdown(e.target.value);
              setDirty(true);
            }}
            inputRef={markdownInputRef}
            fullWidth
            multiline
            minRows={10}
            placeholder="Write in Markdown…"
          />

          <Divider sx={{ my: 2 }} />

          {/* Preview (within scrollable body) */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Preview
          </Typography>
          {renderPreviewContent()}
        </Box>
      ) : (
        <Box
          ref={scrollContainerRef}
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            p: 1,
          }}
        >
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Preview
          </Typography>
          {renderPreviewContent()}
        </Box>
      )}

      <Dialog
        open={recipeSearchOpen}
        onClose={() => setRecipeSearchOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Recipe Search</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Ingredients"
              value={recipeSearchQuery}
              onChange={(e) => setRecipeSearchQuery(e.target.value)}
              placeholder="shrimp garlic"
              fullWidth
            />
            <FormControl fullWidth size="small">
              <InputLabel id="recipe-search-mode">Mode</InputLabel>
              <Select
                labelId="recipe-search-mode"
                label="Mode"
                value={recipeSearchMode}
                onChange={(e) => setRecipeSearchMode(e.target.value as 'any' | 'all')}
              >
                <MenuItem value="any">Any</MenuItem>
                <MenuItem value="all">All</MenuItem>
              </Select>
            </FormControl>

            {recipeSearchSubmitted && (
              <>
                <Typography variant="caption" color="text.secondary">
                  {isRecipeSearching ? 'Searching…' : `${recipeSearchResults.length} results`}
                </Typography>
                <List dense disablePadding>
                  {recipeSearchResults.map((result) => (
                    <ListItemButton
                      key={result.id}
                      onClick={() => {
                        goToNote(result);
                        setRecipeSearchOpen(false);
                      }}
                    >
                      <ListItemText primary={result.title || 'Untitled'} />
                    </ListItemButton>
                  ))}
                </List>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecipeSearchOpen(false)}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              const trimmed = recipeSearchQuery.trim();
              if (!trimmed) return;
              setRecipeSearchSubmitted(trimmed);
              setRecipeSearchModeSubmitted(recipeSearchMode);
            }}
          >
            Search
          </Button>
        </DialogActions>
      </Dialog>

      <RecipePropertiesDialog
        open={recipePropsOpen}
        onClose={() => setRecipePropsOpen(false)}
        recipe={(note as Note | undefined)?.recipe}
      />

      <NotePropertiesDialog
        open={propertiesOpen}
        onClose={() => setPropertiesOpen(false)}
        note={note as Note | undefined}
        subjectName={resolvedSubjectName || noteSubject?.name}
        topicName={resolvedTopicName || noteTopic?.name}
      />

      <Dialog open={resizeOpen} onClose={() => setResizeOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Image size</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="img-size-preset">Width</InputLabel>
              <Select
                labelId="img-size-preset"
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
              Tip: click the image again to adjust later. Sizes are stored in markdown as title tokens (e.g. &quot;w=md&quot;).
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

              setMarkdown((prev) => upsertImageTitle(prev, src, `w=${wToken}`));
              setDirty(true);
              setResizeOpen(false);
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>

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
