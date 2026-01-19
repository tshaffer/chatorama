import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Note } from '@chatorama/chatalog-shared';
import { useAddCookedEventMutation } from './notesApi';

type Props = {
  note: Note;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

export default function CookedHistoryPanel({ note }: Props) {
  const [addCookedEvent, { isLoading }] = useAddCookedEventMutation();
  const [open, setOpen] = useState(false);
  const [dateValue, setDateValue] = useState(() => new Date().toISOString().slice(0, 10));
  const [rating, setRating] = useState('');
  const [notes, setNotes] = useState('');

  const history = useMemo(() => note.cookedHistory ?? [], [note.cookedHistory]);

  const handleSave = async () => {
    const cookedAt = dateValue ? new Date(dateValue).toISOString() : undefined;
    const ratingNum = rating ? Number(rating) : undefined;

    await addCookedEvent({
      noteId: note.id,
      cookedAt,
      rating: ratingNum,
      notes: notes.trim() || undefined,
    }).unwrap();

    setOpen(false);
    setRating('');
    setNotes('');
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Button size="small" variant="outlined" onClick={() => setOpen(true)}>
          Cooked this
        </Button>
      </Stack>

      {!history.length ? (
        <Typography variant="body2" color="text.secondary">
          No cook history yet.
        </Typography>
      ) : (
        <List dense disablePadding>
            {history.map((evt, idx) => (
              <ListItem key={evt.id ?? `${evt.cookedAt}-${idx}`} disableGutters>
              <ListItemText
                primary={`${formatDate(evt.cookedAt)}${evt.rating ? ` • ${evt.rating}/5` : ''}`}
                secondary={evt.notes}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cooked this</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Date"
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              select
              label="Rating"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            >
              <MenuItem value="">No rating</MenuItem>
              {[1, 2, 3, 4, 5].map((n) => (
                <MenuItem key={n} value={String(n)}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={isLoading}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
