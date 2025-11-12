import { useEffect, useRef, useState } from 'react';
import { TextField, Typography } from '@mui/material';

type Props = {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  as?: 'text' | 'button'; // renders display as text or clickable
  sx?: any;
  startEditingOn?: 'click' | 'doubleClick';
  // Optional: if parent is also clickable, pass true so we stop propagation while editing
  stopPropagation?: boolean;
};

export default function InlineEditableName({
  value,
  onSave,
  as = 'text',
  sx,
  startEditingOn = 'doubleClick',
  stopPropagation = true,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    // external changes (e.g., optimistic update rollback)
    if (!editing) setDraft(value);
  }, [value, editing]);

  const begin = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    setEditing(true);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      await onSave(trimmed);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commonHandlers =
    startEditingOn === 'click'
      ? { onClick: begin }
      : { onDoubleClick: begin };

  if (editing) {
    return (
      <TextField
        inputRef={inputRef}
        size="small"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') cancel();
        }}
        onClick={(e) => stopPropagation && e.stopPropagation()}
        sx={{ ...sx, minWidth: 200 }}
      />
    );
  }

  return (
    <Typography
      variant="body1"
      sx={{ ...sx, cursor: startEditingOn === 'click' ? 'text' : 'default' }}
      // prevent parent Card's single-click navigation from arming
      onClick={(e) => stopPropagation && e.stopPropagation()}
      {...commonHandlers}
    >
      {value}
    </Typography>
  );
}
