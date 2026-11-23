import { Alert, Button } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import {
  isSubjectArchived,
  useGetSubjectsQuery,
  useSetSubjectArchivedMutation,
} from '../features/subjects/subjectsApi';

/**
 * Shown on a subject's, topic's, or note's page when the subject is archived.
 * Links still open archived content; this says why it isn't in the tree.
 */
export default function ArchivedSubjectBanner({
  subjectId,
  sx,
}: {
  subjectId?: string;
  sx?: SxProps<Theme>;
}) {
  const { data: subjects } = useGetSubjectsQuery();
  const [setSubjectArchived, { isLoading }] = useSetSubjectArchivedMutation();
  const subject = subjectId ? subjects?.find((s) => s.id === subjectId) : undefined;
  if (!subject || !isSubjectArchived(subject)) return null;

  return (
    <Alert
      severity="info"
      sx={sx}
      action={
        <Button
          color="inherit"
          size="small"
          disabled={isLoading}
          onClick={() => setSubjectArchived({ subjectId: subject.id, archived: false })}
        >
          Unarchive
        </Button>
      }
    >
      Subject “{subject.name}” is archived. It’s hidden from Subjects &amp; Topics and the subject
      pickers, and nothing new can be added to it.
    </Alert>
  );
}
