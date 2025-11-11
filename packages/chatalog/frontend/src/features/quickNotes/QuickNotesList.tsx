import { useMemo, useState } from 'react';
import {
  Box, IconButton, List, ListItem, ListItemText, Stack, Tooltip, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CallSplitIcon from '@mui/icons-material/CallSplit'; // “Convert”
import PushPinIcon from '@mui/icons-material/PushPin';
import { useDeleteQuickNoteMutation, useConvertQuickNoteMutation, useGetQuickNotesQuery } from './quickNotesApi';
import type { QuickNote } from './quickNotesApi';

function snippet(text: string, max = 200) {
  const s = text.replace(/[#>*`_~\-|]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default function QuickNotesList({
  onEdit,
  q,
  subjectId,
  topicId,
}: {
  onEdit: (note: QuickNote) => void;
  q?: string;
  subjectId?: string;
  topicId?: string;
}) {
  const params =
    q || subjectId || topicId
      ? { q, subjectId, topicId, limit: 200 }
      : undefined;

  const { data = [], isLoading, isFetching, error } =
    useGetQuickNotesQuery(params);
  const [deleteQuickNote, { isLoading: deleting }] = useDeleteQuickNoteMutation();
  const [convertQuickNote, { isLoading: converting }] = useConvertQuickNoteMutation();

  const items = useMemo(() =>
    [...data].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)), [data]);

  if (error) {
    return <Typography color="error">Failed to load quick notes.</Typography>;
  }

  return (
    <Box>
      {(isLoading || isFetching) && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
      <List disablePadding>
        {items.map(n => (
          <ListItem
            key={n.id}
            secondaryAction={
              <Stack direction="row" spacing={0.5}>
                {/* Future: pin support */}
                <Tooltip title="Convert to Note">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => convertQuickNote({ id: n.id })}
                      disabled={converting}
                    >
                      <CallSplitIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => onEdit(n)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => deleteQuickNote(n.id)}
                      disabled={deleting}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            }
          >
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} alignItems="center">
                  {/* Placeholder for pin: <PushPinIcon sx={{ fontSize: 16 }} /> */}
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                    {n.title || 'Untitled quick note'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(n.updatedAt).toLocaleString()}
                  </Typography>
                </Stack>
              }
              secondary={
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {snippet(n.markdown)}
                </Typography>
              }
              primaryTypographyProps={{ noWrap: true }}
            />
          </ListItem>
        ))}
        {items.length === 0 && !isLoading && (
          <Box px={2} py={3}><Typography color="text.secondary">No quick notes yet.</Typography></Box>
        )}
      </List>
    </Box>
  );
}
