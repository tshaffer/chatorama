// packages/chatalog/frontend/src/features/notes/ReorderableNotesList.tsx
import React, { useMemo, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  ListItemIcon,
  Checkbox,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

type NoteLite = { id?: string; _id?: string; title?: string; order?: number };
type Props = {
  topicId: string;
  notes: NoteLite[];                             // already sorted by order on first render
  onReordered: (noteIdsInOrder: string[]) => void;
  onOpenNote?: (noteId: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (noteId: string) => void;
};

export default function ReorderableNotesList({
  topicId,
  notes,
  onReordered,
  onOpenNote,
  selectedIds,
  onToggleSelect,
}: Props) {
  const [items, setItems] = useState(() =>
    [...notes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );

  // If the incoming notes list changes (e.g., after refetch), resync local ordering state.
  React.useEffect(() => {
    setItems([...notes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  }, [notes]);

  // Only start drag after small pointer move; and only from the handle (listeners attached to handle)
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

    onReordered(newItems.map(n => String(n.id ?? n._id)));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <List dense disablePadding>
          {items.map(n => {
            const id = String(n.id ?? n._id);
            const title = n.title || '(Untitled)';
            const selected = selectedIds.has(id);
            return (
              <SortableNoteRow
                key={id}
                id={id}
                title={title}
                selected={selected}
                onToggleSelect={() => onToggleSelect(id)}
                onOpen={() => onOpenNote?.(id)}
              />
            );
          })}
        </List>
      </SortableContext>
    </DndContext>
  );
}

function SortableNoteRow({
  id,
  title,
  selected,
  onToggleSelect,
  onOpen,
}: {
  id: string;
  title: string;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    background: isDragging ? 'var(--mui-palette-action-hover)' : undefined,
  };

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      disablePadding
      secondaryAction={
        // Drag by handle only
        <IconButton edge="end" size="small" {...listeners} {...attributes} aria-label="drag-handle">
          <DragIndicatorIcon />
        </IconButton>
      }
    >
      {/* Row click should OPEN the note, not toggle selection */}
      <ListItemButton
        selected={selected}
        onClick={onOpen}           // ← open preview on row click
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <Checkbox
            edge="start"
            tabIndex={-1}
            disableRipple
            checked={selected}
            // Don’t let checkbox clicks bubble and trigger onOpen
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect()}
          />
        </ListItemIcon>
        <ListItemText primary={title} />
      </ListItemButton>
    </ListItem>
  );
}
