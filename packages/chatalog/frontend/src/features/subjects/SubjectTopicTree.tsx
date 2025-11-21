import * as React from 'react';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Typography, Skeleton } from '@mui/material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';

import type { Subject, Topic } from '@chatorama/chatalog-shared';
import {
  useGetSubjectsQuery,
  useGetTopicsForSubjectQuery,
} from './subjectsApi';

// --- helpers ---

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const takeObjectId = (slug?: string) => slug?.match(/^[a-f0-9]{24}/i)?.[0];

const subjectItemId = (subjectId: string) => `subject:${subjectId}`;
const topicItemId = (topicId: string) => `topic:${topicId}`;

type SubjectTopicTreeProps = {
  width?: number | string;
};

/**
 * Navigation-only tree for Subjects & Topics.
 * - Left pane in TopicNotesPage (and potentially NotePage later).
 * - Does NOT handle create/delete/rename (that still lives on /subjects).
 */
export default function SubjectTopicTree({ width = 260 }: SubjectTopicTreeProps) {
  const { subjectSlug, topicSlug } = useParams<{
    subjectSlug?: string;
    topicSlug?: string;
  }>();

  const selectedSubjectId = useMemo(
    () => takeObjectId(subjectSlug),
    [subjectSlug],
  );
  const selectedTopicId = useMemo(
    () => takeObjectId(topicSlug),
    [topicSlug],
  );

  const selectedItemId = useMemo(() => {
    if (selectedTopicId) return topicItemId(selectedTopicId);
    if (selectedSubjectId) return subjectItemId(selectedSubjectId);
    return '';
  }, [selectedSubjectId, selectedTopicId]);

  const { data: subjects = [], isLoading } = useGetSubjectsQuery();

  const [expanded, setExpanded] = React.useState<string[]>(() =>
    selectedSubjectId ? [subjectItemId(selectedSubjectId)] : [],
  );

  return (
    <Box
      id="subject-topic-tree"
      sx={{
        width,
        flexShrink: 0,
        borderRight: (theme) => `1px solid ${theme.palette.divider}`,
        pr: 1.5,
        mr: 1.5,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        maxHeight: '100%',   // 👈 constrained by TopicNotesPage height
        overflowY: 'auto',   // 👈 left pane scrolls inside this column
      }}
    >
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{ mb: 1, flexShrink: 0 }}
      >
        Subjects &amp; Topics
      </Typography>

      {isLoading ? (
        <Box sx={{ mt: 1 }}>
          <Skeleton variant="text" height={24} />
          <Skeleton variant="text" height={24} />
          <Skeleton variant="text" height={24} />
        </Box>
      ) : subjects.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No subjects yet. Use the <strong>Subjects</strong> page to create some.
        </Typography>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            // 👈 no overflow here; outer Box already scrolls
          }}
        >
          <SimpleTreeView
            expandedItems={expanded}
            onExpandedItemsChange={(_event, itemIds) => {
              setExpanded(itemIds);
            }}
            selectedItems={selectedItemId}
          >
            {subjects.map((s) => (
              <SubjectNode key={s.id} subject={s} />
            ))}
          </SimpleTreeView>
        </Box>
      )}
    </Box>
  );
}

// --- Subject + Topic nodes ---

type SubjectNodeProps = {
  subject: Subject;
};

function SubjectNode({ subject }: SubjectNodeProps) {
  const { data: topics = [] } = useGetTopicsForSubjectQuery(subject.id);
  const navigate = useNavigate();

  const subjectSlug = useMemo(
    () => `${subject.id}-${slugify(subject.name)}`,
    [subject.id, subject.name],
  );

  const handleSubjectClick = (event: React.MouseEvent) => {
    // Don’t let this click toggle expand/collapse
    event.stopPropagation();
    event.preventDefault();
    navigate(`/s/${subjectSlug}`);
  };

  return (
    <TreeItem
      itemId={subjectItemId(subject.id)}
      label={
        <Box
          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          onClick={handleSubjectClick}
        >
          {subject.name}
        </Box>
      }
    >
      {topics.map((t: Topic) => (
        <TopicNode
          key={t.id}
          subject={subject}
          topic={t}
        />
      ))}
    </TreeItem>
  );
}

type TopicNodeProps = {
  subject: Subject;
  topic: Topic;
};

function TopicNode({ subject, topic }: TopicNodeProps) {
  const navigate = useNavigate();

  const subjectSlugPart = useMemo(
    () => `${subject.id}-${slugify(subject.name)}`,
    [subject.id, subject.name],
  );
  const topicSlugPart = useMemo(
    () => `${topic.id}-${slugify(topic.name)}`,
    [topic.id, topic.name],
  );

  const handleTopicClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    navigate(`/s/${subjectSlugPart}/t/${topicSlugPart}`);
  };

  return (
    <TreeItem
      itemId={topicItemId(topic.id)}
      label={
        <Box
          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          onClick={handleTopicClick}
        >
          {topic.name}
        </Box>
      }
    />
  );
}
