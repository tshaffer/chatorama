// src/features/subjects/ReorderSubjectsDialog.tsx
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Stack,
  Button,
  Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

export type ReorderItem = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Current subjects, in current order */
  subjects: ReorderItem[];
  /** Called with the new ordering of subject ids when user clicks Save */
  onSave: (orderedIds: string[]) => void | Promise<void>;
  loading?: boolean;
};

export default function ReorderSubjectsDialog({
  open,
  onClose,
  subjects,
  onSave,
  loading,
}: Props) {
  const [items, setItems] = useState<ReorderItem[]>(subjects);

  useEffect(() => {
    if (open) {
      setItems(subjects);
    }
  }, [open, subjects]);

  const moveItem = (index: number, delta: -1 | 1) => {
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= items.length) return;
    const copy = [...items];
    const [removed] = copy.splice(index, 1);
    copy.splice(newIndex, 0, removed);
    setItems(copy);
  };

  const handleSave = async () => {
    const orderedIds = items.map((s) => s.id);
    await onSave(orderedIds);
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reorder subjects</DialogTitle>
      <DialogContent dividers>
        {items.length === 0 ? (
          <Typography color="text.secondary">No subjects to reorder.</Typography>
        ) : (
          <List dense>
            {items.map((s, index) => (
              <ListItem
                key={s.id}
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0 || loading}
                      aria-label="Move up"
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => moveItem(index, 1)}
                      disabled={index === items.length - 1 || loading}
                      aria-label="Move down"
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                }
              >
                <ListItemText primary={s.name} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || items.length === 0}
        >
          Save order
        </Button>
      </DialogActions>
    </Dialog>
  );
}
