// src/features/subjects/ReorderTopicsDialog.tsx
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
import type { ReorderItem } from './ReorderSubjectsDialog';

type Props = {
  open: boolean;
  onClose: () => void;
  subjectName: string;
  /** Topics for this subject, in current order */
  topics: ReorderItem[];
  /** Called with the new ordering of topic ids when user clicks Save */
  onSave: (orderedTopicIds: string[]) => void | Promise<void>;
  loading?: boolean;
};

export default function ReorderTopicsDialog({
  open,
  onClose,
  subjectName,
  topics,
  onSave,
  loading,
}: Props) {
  const [items, setItems] = useState<ReorderItem[]>(topics);

  useEffect(() => {
    if (open) {
      setItems(topics);
    }
  }, [open, topics]);

  const moveItem = (index: number, delta: -1 | 1) => {
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= items.length) return;
    const copy = [...items];
    const [removed] = copy.splice(index, 1);
    copy.splice(newIndex, 0, removed);
    setItems(copy);
  };

  const handleSave = async () => {
    const orderedIds = items.map((t) => t.id);
    await onSave(orderedIds);
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reorder topics in “{subjectName}”</DialogTitle>
      <DialogContent dividers>
        {items.length === 0 ? (
          <Typography color="text.secondary">No topics to reorder.</Typography>
        ) : (
          <List dense>
            {items.map((t, index) => (
              <ListItem
                key={t.id}
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
                <ListItemText primary={t.name} />
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
