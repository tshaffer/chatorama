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
  onSubjectSelected?: () => void;
  onTopicSelected?: () => void;
  disableBorder?: boolean;
};

/**
 * Navigation-only tree for Subjects & Topics.
 * - Left pane in TopicNotesPage (and potentially NotePage later).
 * - Does NOT handle create/delete/rename (that still lives on /subjects).
 */
export default function SubjectTopicTree({
  width = 260,
  onSubjectSelected,
  onTopicSelected,
  disableBorder = false,
}: SubjectTopicTreeProps) {
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
    <CallbacksContext.Provider value={{ onSubjectSelected, onTopicSelected }}>
      <Box
        id="subject-topic-tree"
        sx={{
          width,
          flexShrink: 0,
          borderRight: disableBorder ? 'none' : (theme) => `1px solid ${theme.palette.divider}`,
          pr: disableBorder ? 0 : 1.5,
          mr: disableBorder ? 0 : 1.5,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          // ⬇️ let the *parent* (left panel) control height & scrolling
          // maxHeight: '100%',
          // overflowY: 'auto',
        }}
      >
        <Typography
          variant="subtitle2"
          color="text.secondary"
          sx={{
            mb: 1,
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: (theme) => theme.zIndex.appBar - 1,
            bgcolor: 'background.paper',
            pt: 1,
          }}
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
    </CallbacksContext.Provider>
  );
}

// --- Subject + Topic nodes ---

type SubjectNodeProps = {
  subject: Subject;
};

function SubjectNode({ subject }: SubjectNodeProps) {
  const { data: topics = [] } = useGetTopicsForSubjectQuery(subject.id);
  const navigate = useNavigate();
  const { onSubjectSelected } = React.useContext(CallbacksContext) || {};

  const subjectSlug = useMemo(
    () => `${subject.id}-${slugify(subject.name)}`,
    [subject.id, subject.name],
  );

  const handleSubjectClick = (event: React.MouseEvent) => {
    // Don’t let this click toggle expand/collapse
    event.stopPropagation();
    event.preventDefault();
    navigate(`/s/${subjectSlug}`);
    onSubjectSelected?.();
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
  const { onTopicSelected } = React.useContext(CallbacksContext) || {};

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
    onTopicSelected?.();
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

// Lightweight context to avoid prop-drilling into nodes
const CallbacksContext = React.createContext<{
  onSubjectSelected?: () => void;
  onTopicSelected?: () => void;
}>({});
