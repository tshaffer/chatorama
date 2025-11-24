import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Button,
  Typography,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

export type ReorderItem = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: ReorderItem[];
  title: string;
  emptyMessage: string;
  helperText?: string;
  onSave: (orderedIds: string[]) => void | Promise<void>;
  loading?: boolean;
};

export default function ReorderItemsDialog({
  open,
  onClose,
  items: initialItems,
  title,
  emptyMessage,
  helperText,
  onSave,
  loading,
}: Props) {
  const [items, setItems] = useState<ReorderItem[]>(initialItems);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // 👇 Track previous value of `open` to detect closed -> open
  const prevOpenRef = useRef(open);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    // only reset when dialog just opened
    if (!wasOpen && open) {
      setItems(initialItems);
      setDragIndex(null);
    }
    prevOpenRef.current = open;
  }, [open, initialItems]);

  const handleDragStart =
    (index: number) =>
    (event: React.DragEvent<HTMLLIElement>): void => {
      if (loading) return;
      setDragIndex(index);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    };

  const handleDragOver =
    (index: number) =>
    (event: React.DragEvent<HTMLLIElement>): void => {
      if (loading) return;
      event.preventDefault();

      setItems((prev) => {
        if (dragIndex === null || dragIndex === index) return prev;
        const updated = [...prev];
        const [removed] = updated.splice(dragIndex, 1);
        updated.splice(index, 0, removed);
        setDragIndex(index);
        return updated;
      });
    };

  const handleDragEnd = (): void => {
    setDragIndex(null);
  };

  const handleSave = async () => {
    const orderedIds = items.map((item) => item.id);
    await onSave(orderedIds);
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {items.length === 0 ? (
          <Typography color="text.secondary">{emptyMessage}</Typography>
        ) : (
          <>
            {helperText && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {helperText}
              </Typography>
            )}
            <List dense>
              {items.map((item, index) => (
                <ListItem
                  key={item.id}
                  component="li"
                  draggable={!loading}
                  onDragStart={handleDragStart(index)}
                  onDragOver={handleDragOver(index)}
                  onDragEnd={handleDragEnd}
                  sx={{
                    cursor: loading ? 'default' : 'grab',
                    opacity: dragIndex === index ? 0.5 : 1,
                    userSelect: 'none',
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <DragIndicatorIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={item.name} />
                </ListItem>
              ))}
            </List>
          </>
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
