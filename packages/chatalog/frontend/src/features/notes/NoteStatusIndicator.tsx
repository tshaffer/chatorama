// frontend/src/features/notes/NoteStatusIndicator.tsx
import React from 'react';
import { Tooltip, Typography } from '@mui/material';

type NoteStatusCategory = 'unset' | 'completed' | 'other';

type Props = {
  status?: string | null;
  /**
   * Future-friendly visibility flags.
   * For now they default to true; later you can wire these
   * to user settings.
   */
  showUnset?: boolean;
  showCompleted?: boolean;
  showOther?: boolean;
  size?: 'small' | 'medium';
};

function categorizeStatus(raw?: string | null): NoteStatusCategory {
  const s = raw?.trim();
  if (!s) return 'unset';
  if (s.toLowerCase() === 'completed') return 'completed';
  return 'other';
}

/**
 * Tiny inline glyph that visualizes the note's `status` string.
 *
 * Categories:
 * - unset      → "?" (text.disabled), tooltip "Status not set"
 * - completed  → "✓" (success.main), tooltip = status or "Completed"
 * - other      → "•" (text.secondary), tooltip = status or "Status set"
 */
export function NoteStatusIndicator({
  status,
  showUnset = true,
  showCompleted = true,
  showOther = true,
  size = 'small',
}: Props) {
  const category = categorizeStatus(status);

  if (
    (category === 'unset' && !showUnset) ||
    (category === 'completed' && !showCompleted) ||
    (category === 'other' && !showOther)
  ) {
    return null;
  }

  let char = '?';
  let color: string = 'text.disabled';
  let tooltip = '';

  switch (category) {
    case 'completed':
      char = '✓';
      color = 'success.main';
      tooltip = status?.trim() || 'Completed';
      break;
    case 'other':
      char = '•';
      color = 'text.secondary';
      tooltip = status?.trim() || 'Status set';
      break;
    case 'unset':
    default:
      char = '?';
      color = 'text.disabled';
      tooltip = 'Status not set';
      break;
  }

  const fontSize = size === 'small' ? '0.75rem' : '0.875rem';

  return (
    <Tooltip title={tooltip}>
      <Typography
        component="span"
        sx={{
          ml: 0.75,                 // ~6px
          fontSize,
          lineHeight: 1,
          verticalAlign: 'middle',
          color,
          opacity: category === 'unset' ? 0.7 : 1,
        }}
      >
        {char}
      </Typography>
    </Tooltip>
  );
}
