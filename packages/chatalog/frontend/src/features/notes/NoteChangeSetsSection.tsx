// frontend/src/features/notes/NoteChangeSetsSection.tsx
// Collapsed-by-default list of change sets applied in this topic from Ask
// Claude's "Make these changes", each of which can be undone.
import { useState } from 'react';
import { Alert, Box, Button, List, ListItem, ListItemText } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { NoteChangeSetSummary } from '@chatorama/chatalog-shared';
import { useGetNoteChangeSetsQuery, useUndoNoteChangesMutation } from './notesApi';

type Props = {
  topicId: string;
  subjectId?: string;
};

export function describeCounts(s: Pick<NoteChangeSetSummary, 'createdCount' | 'editedCount' | 'archivedCount'>) {
  const parts = [
    s.createdCount && `${s.createdCount} created`,
    s.editedCount && `${s.editedCount} edited`,
    s.archivedCount && `${s.archivedCount} archived`,
  ].filter(Boolean);
  return parts.join(', ');
}

export default function NoteChangeSetsSection({ topicId, subjectId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: sets = [] } = useGetNoteChangeSetsQuery(topicId);
  const [undoNoteChanges, { isLoading }] = useUndoNoteChangesMutation();

  if (!sets.length) return null;

  const handleUndo = async (changeSetId: string) => {
    setError(null);
    try {
      await undoNoteChanges({ topicId, subjectId, changeSetId }).unwrap();
    } catch (err: any) {
      setError(err?.data?.message ?? err?.message ?? 'Undo failed');
    }
  };

  return (
    <Box sx={{ mt: 1 }}>
      <Button
        size="small"
        color="inherit"
        sx={{ color: 'text.secondary' }}
        startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Hide' : 'Show'} changes made with Claude ({sets.length})
      </Button>
      {expanded && (
        <>
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ my: 1 }}>
              {error}
            </Alert>
          )}
          <List dense>
            {sets.map((s) => (
              <ListItem
                key={s.id}
                secondaryAction={
                  <Button size="small" disabled={isLoading} onClick={() => handleUndo(s.id)}>
                    Undo
                  </Button>
                }
                sx={{ pr: 10 }}
              >
                <ListItemText
                  primary={s.summary || 'Changes'}
                  secondary={`${new Date(s.createdAt).toLocaleString()} · ${describeCounts(s)}`}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}
    </Box>
  );
}
