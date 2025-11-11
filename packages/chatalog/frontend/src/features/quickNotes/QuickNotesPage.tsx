import { useState } from 'react';
import { Box, Stack, TextField, Button, Typography } from '@mui/material';
import QuickNotesList from './QuickNotesList';
import QuickNoteEditDialog from './QuickNoteEditDialog';
import type { QuickNote } from './quickNotesApi';
import QuickCaptureDialog from './QuickCaptureDialog'; // the one you already have

export default function QuickNotesPage() {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<QuickNote | undefined>(undefined);

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          placeholder="Search quick notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ minWidth: 280 }}
        />
        <Button variant="contained" onClick={() => setCreating(true)}>
          New Quick Note
        </Button>
      </Stack>

      <Box flex={1} overflow="auto">
        <QuickNotesList onEdit={setEditing} q={q || undefined} />
      </Box>

      <QuickCaptureDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => setCreating(false)}
      />

      <QuickNoteEditDialog
        open={!!editing}
        onClose={() => setEditing(undefined)}
        note={editing}
      />
    </Stack>
  );
}
