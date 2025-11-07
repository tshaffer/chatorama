import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import NoteEditor from '../features/notes/NoteEditor';

export default function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();

  if (!noteId) {
    return (
      <Box p={2}>
        <Typography variant="h6">No note selected</Typography>
        <Typography variant="body2">Choose a note from the list.</Typography>
      </Box>
    );
  }

  return <NoteEditor noteId={noteId} debounceMs={1000} enableBeforeUnloadGuard />;
}
