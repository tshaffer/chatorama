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
  Stack,
  Menu,
  MenuItem,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useSelector } from 'react-redux';
import { NoteStatusIndicator } from './NoteStatusIndicator';
import { selectNoteStatusVisibility } from '../settings/settingsSlice';

type NoteLite = {
  id?: string;
  _id?: string;
  title?: string;
  order?: number;
  status?: string;
};

type Props = {
  topicId: string;
  notes: NoteLite[];
  onReordered: (noteIdsInOrder: string[]) => void;
  onOpenNote?: (noteId: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (noteId: string) => void;
  onShowProperties?: (noteId: string) => void;
};

export default function ReorderableNotesList({
  notes,
  onReordered,
  onOpenNote,
  selectedIds,
  onToggleSelect,
  onShowProperties,
}: Props) {
  const [items, setItems] = useState(() =>
    [...notes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );

  const noteStatusVisibility = useSelector(selectNoteStatusVisibility);

  React.useEffect(() => {
    setItems([...notes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  }, [notes]);

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
            const status = (n as any).status as string | undefined;

            return (
              <SortableNoteRow
                key={id}
                id={id}
                title={title}
                status={status}
                selected={selected}
                onToggleSelect={() => onToggleSelect(id)}
                onOpen={() => onOpenNote?.(id)}
                noteStatusVisibility={noteStatusVisibility}
                onShowProperties={() => onShowProperties?.(id)}
              />
            );
          })}
        </List>
      </SortableContext>
    </DndContext>
  );
}

type RowProps = {
  id: string;
  title: string;
  status?: string;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen?: () => void;
  noteStatusVisibility: ReturnType<typeof selectNoteStatusVisibility>;
  onShowProperties?: () => void;
};

function SortableNoteRow({
  id,
  title,
  status,
  selected,
  onToggleSelect,
  onOpen,
  noteStatusVisibility,
  onShowProperties,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

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
        <Stack direction="row" spacing={0.5} alignItems="center">
          <IconButton
            edge="end"
            size="small"
            aria-label="note actions"
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(e.currentTarget);
            }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <IconButton edge="end" size="small" {...listeners} {...attributes} aria-label="drag-handle">
            <DragIndicatorIcon />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          >
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                onShowProperties?.();
              }}
            >
              Properties
            </MenuItem>
          </Menu>
        </Stack>
      }
    >
      <ListItemButton
        selected={selected}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('a')) return;
          onOpen?.();
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <Checkbox
            edge="start"
            tabIndex={-1}
            disableRipple
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect()}
          />
        </ListItemIcon>
        <ListItemText
          primary={
            <span>
              {title}
              <NoteStatusIndicator
                status={status}
                {...noteStatusVisibility}
              />
            </span>
          }
        />
      </ListItemButton>
    </ListItem>
  );
}
