import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { List, ListItemButton, ListSubheader, Typography, Divider } from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query';
import { useGetSubjectsQuery, useGetTopicsForSubjectQuery } from '../features/subjects/subjectsApi';
import type { Topic } from '@shared/types';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const takeObjectId = (slug?: string) => slug?.match(/^[a-f0-9]{24}/i)?.[0];
const safeId = (o: { id?: string } | undefined) => o?.id ?? '';

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
              onClick={() => {
                // eslint-disable-next-line no-console
                navigate(href);
              }}
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
            >
              <Typography variant="body2">{t.name}</Typography>
            </ListItemButton>
          );
        })}
      </List>
    </nav>
  );
}
