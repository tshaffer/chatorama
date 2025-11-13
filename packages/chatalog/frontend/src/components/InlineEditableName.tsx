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

  const begin = () => {
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
        // While editing, block parent click handlers so typing/clicking
        // inside the field never triggers navigation.
        onClick={(e) => stopPropagation && e.stopPropagation()}
        sx={{ ...sx, minWidth: 200 }}
      />
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    if (startEditingOn === 'click') {
      if (stopPropagation) e.stopPropagation();
      begin();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (startEditingOn === 'doubleClick') {
      // We intentionally do NOT stop propagation here so a parent
      // can still see the double-click (to cancel single-click nav).
      begin();
    }
  };

  return (
    <Typography
      variant="body1"
      sx={{ ...sx, cursor: startEditingOn === 'click' ? 'text' : 'default' }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {value}
    </Typography>
  );
}
