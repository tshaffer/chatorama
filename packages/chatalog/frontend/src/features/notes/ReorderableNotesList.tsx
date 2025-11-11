// packages/chatalog/frontend/src/features/notes/ReorderableNotesList.tsx
import React, { useMemo, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { List, ListItem, ListItemButton, ListItemText, IconButton, ListItemIcon } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

type NoteLite = { id?: string; _id?: string; title?: string; order?: number };
type Props = {
  topicId: string;
  notes: NoteLite[];                 // already sorted by order on first render
  onReordered: (noteIdsInOrder: string[]) => void; // callback to persist
  onNoteClick?: (noteId: string) => void;
};

export default function ReorderableNotesList({ topicId, notes, onReordered, onNoteClick }: Props) {
  const [items, setItems] = useState(() =>
    [...notes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const ids = useMemo(
    () => items.map(n => (n.id ?? n._id) as string),
    [items]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    const newItems = arrayMove(items, oldIndex, newIndex).map((n, idx) => ({ ...n, order: idx }));
    setItems(newItems);

    // Persist
    onReordered(newItems.map(n => String(n.id ?? n._id)));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <List dense disablePadding>
          {items.map(n => (
            <SortableNoteRow
              key={String(n.id ?? n._id)}
              id={String(n.id ?? n._id)}
              title={n.title || '(Untitled)'}
              onClick={() => onNoteClick?.(String(n.id ?? n._id))}
            />
          ))}
        </List>
      </SortableContext>
    </DndContext>
  );
}

function SortableNoteRow({ id, title, onClick }: { id: string; title: string; onClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    background: isDragging ? 'var(--mui-palette-action-hover)' : undefined,
  };

  return (
    <ListItem ref={setNodeRef} style={style} disablePadding secondaryAction={
      <IconButton edge="end" size="small" {...listeners} {...attributes} aria-label="drag-handle">
        <DragIndicatorIcon />
      </IconButton>
    }>
      <ListItemButton onClick={onClick}>
        <ListItemIcon sx={{ minWidth: 32 }}>
          <DragIndicatorIcon fontSize="small" sx={{ opacity: 0.4 }} />
        </ListItemIcon>
        <ListItemText primary={title} />
      </ListItemButton>
    </ListItem>
  );
}
