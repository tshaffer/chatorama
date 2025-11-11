import { useState, useMemo } from 'react';
import {
  Accordion, AccordionSummary, AccordionDetails,
  Stack, Typography, List, ListItem, ListItemText,
  ListItemSecondaryAction, CircularProgress, Tooltip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { useGetTopicsForSubjectQuery } from '../../features/subjects/subjectsApi';
import CreateTopicButton from './CreateTopicButton';
import DeleteSubjectAction from './DeleteSubjectAction';
import DeleteTopicAction from './DeleteTopicAction';
import { skipToken } from '@reduxjs/toolkit/query';

type SubjectLite = { id: string; name?: string };

export default function SubjectAccordion({ subject }: { subject: SubjectLite }) {
  const [expanded, setExpanded] = useState(false);
  const arg = expanded ? subject.id : skipToken;
  const { data: topics, isLoading, isFetching, error } = useGetTopicsForSubjectQuery(arg);

  return (
    <Accordion expanded={expanded} onChange={(_, e) => setExpanded(e)}>
      {/* --- SUMMARY: NO interactive buttons in here --- */}
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
          <Typography variant="subtitle1">{subject.name}</Typography>
          {/* keep lightweight, non-interactive indicator only */}
          {expanded && isFetching && <CircularProgress size={16} />}
        </Stack>
      </AccordionSummary>

      {/* --- DETAILS: put your action buttons here --- */}
      <AccordionDetails>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">Topics</Typography>
          <Stack direction="row" spacing={1}>
            <CreateTopicButton subjectId={subject.id} />
            <DeleteSubjectAction subjectId={subject.id} subjectName={subject.name ?? 'Subject'} />
          </Stack>
        </Stack>

        {/* topic list below stays the same */}
        {isLoading ? (
          <Stack alignItems="center" py={2}><CircularProgress /></Stack>
        ) : error ? (
          <Typography color="error" sx={{ p: 1 }}>Failed to load topics.</Typography>
        ) : !topics?.length ? (
          <List dense disablePadding>
            <ListItem>
              <ListItemText
                primary="No topics in this subject yet"
                primaryTypographyProps={{ color: 'text.secondary' }}
              />
            </ListItem>
          </List>
        ) : (
          <List dense disablePadding>
            {topics.map((t) => (
              <ListItem key={t.id} divider>
                <ListItemText primary={t.name} />
                <ListItemSecondaryAction>
                  <DeleteTopicAction
                    subjectId={subject.id}
                    topicId={t.id!}
                    topicName={t.name ?? 'Topic'}
                  />
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
