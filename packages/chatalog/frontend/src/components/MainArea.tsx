import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, List, ListItemButton, ListItemText, Typography, Chip, Stack } from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query'; // ← NEW

import NoteEditor from '../features/notes/NoteEditor';
import { useGetNoteQuery } from '../features/notes/notesApi';
import { usePersistentState } from '../hooks/usePersistentState';
import ResizeHandle from './ResizeHandle';
import {
  useGetNotePreviewsForTopicQuery,
} from '../features/subjects/subjectsApi';

const MIN_LIST = 260;
const MAX_LIST = 720;
const DEFAULT_LIST = 420;

const safeId = (o: { id?: string } | undefined) => o?.id ?? '';
  
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Extract leading 24-hex ObjectId from "<id>" or "<id>-<slug>"
function takeObjectId(slug?: string) {
  const m = slug?.match(/^[a-f0-9]{24}/i);
  return m ? m[0] : undefined;
}

export default function MainArea() {
  // Route params: subjectSlug and topicSlug are ID-first ("<id>-<slug>")
  const { subjectSlug, topicSlug, noteId: noteIdParam, noteSlug } = useParams<{
    subjectSlug?: string;
    topicSlug?: string;
    noteId?: string;   // "<id>" or "<id>-<slug>"
    noteSlug?: string; // present only when route used :noteId-:noteSlug
  }>();
  const navigate = useNavigate();

  const subjectId = takeObjectId(subjectSlug);
  const topicId = takeObjectId(topicSlug);

  // --- Note previews for topic (ID-based) ---
  const { data: previews = [] } = useGetNotePreviewsForTopicQuery(
    { subjectId: subjectId ?? '', topicId: topicId ?? '' },
    { skip: !subjectId || !topicId }
  );

  // --- Note detail (ID-only for editor) ---
  const noteIdOnly = useMemo(() => (noteIdParam ?? '').split('-')[0], [noteIdParam]);

  // Fetch note as well so we can canonicalize the URL slug (RTKQ will de-dupe with NoteEditor)
  const { data: note } = useGetNoteQuery(noteIdOnly ? noteIdOnly : skipToken); // ← CHANGED

  // Canonicalize note slug if needed (we keep the current subject/topic segments)
if (note && subjectSlug && topicSlug) {
  const expectedSlug = slugify(note.title);
  const currentSlug = noteSlug ?? '';
  if (expectedSlug !== currentSlug) {
    const next = `/s/${subjectSlug}/t/${topicSlug}/n/${safeId(note)}-${expectedSlug}`;
    if (next !== location.pathname) {
      queueMicrotask(() => navigate(next, { replace: true }));
    }
  }
}

  const [noteListWidth, setNoteListWidth] = usePersistentState<number>(
    'ui.noteListWidth',
    DEFAULT_LIST
  );

  const goToNote = (id: string, title: string) => {
    if (!subjectSlug || !topicSlug) return;
    const s = slugify(title);
    navigate(`/s/${subjectSlug}/t/${topicSlug}/n/${id}-${s}`);
  };

  const hasTopic = Boolean(topicId);

  return (
    <Box display="grid" gridTemplateColumns={`${noteListWidth}px 6px 1fr`} height="100%" overflow="hidden">
      {/* Left: Note list */}
      <Box overflow="auto" p={2}>
        <Typography variant="overline" color="text.secondary">
          {hasTopic ? 'Notes' : 'Select a Topic to see Notes'}
        </Typography>
        {hasTopic && (
          <List dense>
            {previews.map((n) => {
              const nid = safeId(n);
              return (
                <ListItemButton
                  key={nid}
                  selected={noteIdOnly === nid}
                  onClick={() => goToNote(nid, n.title)}
                >
                  <ListItemText
                    primary={n.title}
                    secondary={n.summary}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  {n.tags?.length ? (
                    <Stack direction="row" gap={0.5}>
                      {n.tags.slice(0, 2).map((tag) => (
                        <Chip key={tag} size="small" label={tag} />
                      ))}
                    </Stack>
                  ) : null}
                </ListItemButton>
              );
            })}            {previews.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, ml: 1 }}>
                No notes in this topic yet.
              </Typography>
            )}
          </List>
        )}
      </Box>

      {/* Center handle */}
      <ResizeHandle
        aria-label="Resize note list"
        onDrag={(dx) => setNoteListWidth((w) => Math.min(MAX_LIST, Math.max(MIN_LIST, w + dx)))}
      />

      {/* Right: Note detail (editable) */}
      <Box overflow="auto" p={3}>
        {!noteIdOnly && hasTopic && (
          <Typography variant="body2" color="text.secondary">
            Choose a note from the list.
          </Typography>
        )}
        {!hasTopic && !noteIdOnly && (
          <Typography variant="body2" color="text.secondary">
            Pick a subject and topic to begin.
          </Typography>
        )}
        {noteIdOnly && <NoteEditor noteId={noteIdOnly} debounceMs={1000} enableBeforeUnloadGuard />}
      </Box>
    </Box>
  );
}
