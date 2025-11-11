// frontend/src/components/Sidebar.tsx
import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Menu,
  MenuItem,
  Skeleton,
} from '@mui/material';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import FolderIcon from '@mui/icons-material/Folder';
import LabelIcon from '@mui/icons-material/Label';
import { skipToken } from '@reduxjs/toolkit/query';

import { useGetSubjectsQuery, useGetTopicsForSubjectQuery } from '../features/subjects/subjectsApi';
import type { Topic } from '@chatorama/chatalog-shared';
import { useRenameEntity } from '../hooks/useRenameEntity';

// Shared visual building blocks
import { NavRow } from '../components/nav/NavRow';
import { Section } from '../components/nav/Section';

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
      <Box sx={{ p: 1, pt: 0.5, height: '100%', overflow: 'auto' }}>
        {/* Quick Notes */}
        <Section title="Quick Notes">
          <NavRow
            to="/quick-notes"
            icon={<StickyNote2Icon />}
            label="Quick Notes"
            selected={location.pathname.startsWith('/quick-notes')}
          />
        </Section>

        {/* Subjects */}
        <Section title="Subjects" denseDivider>
          {sLoading
            ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={32} sx={{ my: 0.5 }} />
            ))
            : subjects.map((s) => {
              const id = safeId(s);
              const href = `/s/${id}-${slugify(s.name)}`;
              const isSelected = id === subjectIdFromRoute;
              return (
                <NavRow
                  key={id || s.name}
                  to={href}
                  icon={<FolderIcon />}
                  label={s.name}
                  selected={isSelected}
                  onContextMenu={(e) =>
                    handleOpenMenu(e, { kind: 'subject', subjectId: id, currentName: s.name })
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(href);
                  }}
                />);
            })}
        </Section>

        {/* Topics */}
        <Section title="Topics">
          {selectedSubject ? (
            tLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" height={28} sx={{ my: 0.5 }} />
              ))
            ) : topics.length ? (
              topics.map((t: Topic) => {
                const subjId = safeId(selectedSubject);
                const topicHref = `/s/${subjId}-${slugify(selectedSubject!.name)}/t/${safeId(t)}-${slugify(t.name)}`;
                const isSelected = safeId(t) === topicIdFromRoute;

                return (
                  <NavRow
                    key={safeId(t) || t.name}
                    to={topicHref}
                    icon={<LabelIcon />}
                    label={t.name}
                    selected={isSelected}
                    onContextMenu={(e) =>
                      handleOpenMenu(e, {
                        kind: 'topic',
                        subjectId: subjId,
                        topicId: safeId(t),
                        currentName: t.name,
                      })
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(topicHref);
                    }}
                  />
                );
              })
            ) : (
              <Box sx={{ px: 1.25, py: 0.5, color: 'text.secondary', fontSize: 13 }}>
                No topics yet
              </Box>
            )
          ) : (
            <Box sx={{ px: 1.25, py: 0.5, color: 'text.secondary', fontSize: 13 }}>
              Pick a subject to see topics
            </Box>
          )}
        </Section>
      </Box>

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
