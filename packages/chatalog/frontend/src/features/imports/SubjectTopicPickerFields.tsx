import { useMemo, useEffect } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import { TextField, Stack } from '@mui/material';
import { useGetSubjectsWithTopicsQuery } from '../subjects/subjectsApi';
import type { Subject, Topic } from '@chatorama/chatalog-shared';
import { sortStringsCI } from '../../utils/sort';

type Props = {
  subjectLabel: string;
  topicLabel: string;
  onSubjectLabelChange: (value: string) => void;
  onTopicLabelChange: (value: string) => void;
  onResolvedIds?: (subjectId?: string, topicId?: string) => void;
};

export default function SubjectTopicPickerFields({
  subjectLabel,
  topicLabel,
  onSubjectLabelChange,
  onTopicLabelChange,
  onResolvedIds,
}: Props) {
  const { data: subjects = [] } = useGetSubjectsWithTopicsQuery();

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    subjects
      .map((s: Subject) => s.name?.trim())
      .filter(Boolean)
      .forEach((name) => set.add(name as string));
    return sortStringsCI(Array.from(set));
  }, [subjects]);

  const selectedSubject = useMemo(() => {
    const trimmed = subjectLabel.trim();
    if (!trimmed) return undefined;

    return subjects.find(
      (s: Subject) => s.name?.trim() === trimmed
    ) as (Subject & { topics?: Topic[] }) | undefined;
  }, [subjects, subjectLabel]);

  const topicOptions = useMemo(() => {
    const set = new Set<string>();

    if (selectedSubject) {
      (selectedSubject.topics ?? []).forEach((t: Topic) => {
        const name = t.name?.trim();
        if (name) set.add(name);
      });
    }

    const trimmedTopic = topicLabel.trim();
    if (trimmedTopic && !set.has(trimmedTopic)) {
      set.add(trimmedTopic);
    }

    return sortStringsCI(Array.from(set));
  }, [selectedSubject, topicLabel]);

  const resolvedSubjectId = selectedSubject?.id;
  const resolvedTopicId = selectedSubject?.topics?.find(
    (t) => t.name?.trim() === topicLabel.trim()
  )?.id;

  useEffect(() => {
    if (onResolvedIds) onResolvedIds(resolvedSubjectId, resolvedTopicId);
  }, [onResolvedIds, resolvedSubjectId, resolvedTopicId]);

  return (
    <Stack spacing={2}>
      <Autocomplete
        freeSolo
        options={subjectOptions}
        value={subjectLabel}
        onChange={(_e, newValue) => onSubjectLabelChange(newValue ?? '')}
        onInputChange={(_e, newInputValue) => onSubjectLabelChange(newInputValue ?? '')}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Subject label"
            placeholder="Subject label"
            size="small"
          />
        )}
      />

      <Autocomplete
        freeSolo
        options={topicOptions}
        value={topicLabel}
        onChange={(_e, newValue) => onTopicLabelChange(newValue ?? '')}
        onInputChange={(_e, newInputValue) => onTopicLabelChange(newInputValue ?? '')}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Topic label"
            placeholder="Topic label"
            size="small"
          />
        )}
      />
    </Stack>
  );
}
