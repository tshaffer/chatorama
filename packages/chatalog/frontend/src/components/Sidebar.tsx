import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  List,
  ListItemButton,
  ListSubheader,
  Typography,
  Divider,
  Menu,
  MenuItem,
} from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetSubjectsQuery, useGetTopicsForSubjectQuery } from '../features/subjects/subjectsApi';
import type { Topic } from '@chatorama/chatalog-shared';
import { useRenameEntity } from '../hooks/useRenameEntity';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const takeObjectId = (slug?: string) => slug?.match(/^[a-f0-9]{24}/i)?.[0];
const safeId = (o: { id?: string } | undefined) => o?.id ?? '';

type RenameTarget =
  | { kind: 'subject'; subjectId: string; currentName: string }
  | { kind: 'topic'; subjectId: string; topicId: string; currentName: string };

export default function Sidebar() {
  const { subjectSlug, topicSlug } = useParams();
  const navigate = useNavigate();

  const subjectIdFromRoute = takeObjectId(subjectSlug);
  const topicIdFromRoute = takeObjectId(topicSlug);

  // All subjects
  const { data: subjects = [], isLoading: sLoading } = useGetSubjectsQuery();

  // Selected subject by **id**
  const selectedSubject = useMemo(
    () => subjects.find((s) => safeId(s) === subjectIdFromRoute),
    [subjects, subjectIdFromRoute]
  );

  // Topics for selected subject (guard with skipToken)
  const { data: topics = [], isLoading: tLoading } = useGetTopicsForSubjectQuery(
    selectedSubject ? safeId(selectedSubject) : skipToken
  );

  // ---- Rename: shared context menu state ----
  const { open: openRename, dialog: renameDialog } = useRenameEntity();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuTarget, setMenuTarget] = useState<RenameTarget | null>(null);
  const menuOpen = Boolean(menuAnchor);

  const handleOpenMenu = (e: MouseEvent<HTMLElement>, target: RenameTarget) => {
    e.preventDefault(); // treat as context menu
    setMenuAnchor(e.currentTarget);
    setMenuTarget(target);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuTarget(null);
  };

  const handleRename = () => {
    if (menuTarget) openRename(menuTarget);
    handleCloseMenu();
  };

  return (
    <nav aria-label="Chatalog hierarchy" style={{ borderRight: '1px solid #eee', overflow: 'auto' }}>
      <List subheader={<ListSubheader component="div">Subjects</ListSubheader>} dense>
        {sLoading && <Typography variant="caption" sx={{ px: 2, py: 1 }}>Loading…</Typography>}
        {subjects.map((s) => {
          const id = safeId(s);
          const href = `/s/${id}-${slugify(s.name)}`;
          const isSelected = id === subjectIdFromRoute;
          return (
            <ListItemButton
              key={id || s.name}
              selected={isSelected}
              onClick={() => navigate(href)}
              onContextMenu={(e) =>
                handleOpenMenu(e, { kind: 'subject', subjectId: id, currentName: s.name })
              }
            >
              <Typography variant="body2">{s.name}</Typography>
            </ListItemButton>
          );
        })}
      </List>

      <Divider />

      <List subheader={<ListSubheader component="div">Topics</ListSubheader>} dense>
        {selectedSubject && tLoading && (
          <Typography variant="caption" sx={{ px: 2, py: 1 }}>Loading…</Typography>
        )}
        {topics.map((t: Topic) => {
          const subjId = safeId(selectedSubject);
          const topicHref = `/s/${subjId}-${slugify(selectedSubject!.name)}/t/${safeId(t)}-${slugify(t.name)}`;
          const isSelected = safeId(t) === topicIdFromRoute;
          return (
            <ListItemButton
              key={safeId(t) || t.name}
              selected={isSelected}
              disabled={!selectedSubject}
              onClick={() => navigate(topicHref)}
              onContextMenu={(e) =>
                selectedSubject &&
                handleOpenMenu(e, {
                  kind: 'topic',
                  subjectId: subjId,
                  topicId: safeId(t),
                  currentName: t.name,
                })
              }
            >
              <Typography variant="body2">{t.name}</Typography>
            </ListItemButton>
          );
        })}
      </List>

      {/* Shared context menu for Rename */}
      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={handleRename}>Rename</MenuItem>
      </Menu>

      {/* Rename dialog mounted once */}
      {renameDialog}
    </nav>
  );
}
