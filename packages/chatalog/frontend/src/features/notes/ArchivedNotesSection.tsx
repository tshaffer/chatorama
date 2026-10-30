// frontend/src/features/notes/ArchivedNotesSection.tsx
// Collapsed-by-default list of a topic's archived notes, shown under the note list.
import { useState } from 'react';
import { Box, Button, Chip, List, ListItem, ListItemButton, ListItemText } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { NotePreview } from '@chatorama/chatalog-shared';
import { useSetNotesArchivedMutation } from './notesApi';

type Props = {
  notes: NotePreview[];
  onOpenNote: (noteId: string) => void;
};

export default function ArchivedNotesSection({ notes, onOpenNote }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [setNotesArchived, { isLoading }] = useSetNotesArchivedMutation();

  if (!notes.length) return null;

  return (
    <Box sx={{ mt: 1 }}>
      <Button
        size="small"
        color="inherit"
        sx={{ color: 'text.secondary' }}
        startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Hide' : 'Show'} archived ({notes.length})
      </Button>
      {expanded && (
        <List dense sx={{ opacity: 0.7 }}>
          {notes.map((n) => (
            <ListItem
              key={n.id}
              disablePadding
              secondaryAction={
                <Button
                  size="small"
                  disabled={isLoading}
                  onClick={() => setNotesArchived({ noteIds: [n.id], archived: false })}
                >
                  Unarchive
                </Button>
              }
            >
              <ListItemButton onClick={() => onOpenNote(n.id)} sx={{ pr: 14 }}>
                <ListItemText
                  primary={
                    <span>
                      {n.title || 'Untitled'}
                      <Chip size="small" label="Archived" variant="outlined" sx={{ ml: 1 }} />
                    </span>
                  }
                  secondary={
                    n.archivedAt ? `Archived ${new Date(n.archivedAt).toLocaleDateString()}` : undefined
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
