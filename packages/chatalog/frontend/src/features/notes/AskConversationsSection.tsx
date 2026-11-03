// frontend/src/features/notes/AskConversationsSection.tsx
// Collapsed-by-default list of saved Ask Claude conversations in this topic
// (or, with topicId null, across all notes), each of which can be continued,
// renamed, or deleted.
import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { AskConversationSummary } from '@chatorama/chatalog-shared';
import {
  useDeleteAskConversationMutation,
  useGetAskConversationsQuery,
  useUpdateAskConversationMutation,
} from './notesApi';

type Props = {
  topicId: string | null;
  onContinue: (conversationId: string) => void;
};

function describe(c: AskConversationSummary) {
  return [
    new Date(c.updatedAt).toLocaleString(),
    `${c.questionCount} ${c.questionCount === 1 ? 'question' : 'questions'}`,
    `${c.noteCount} ${c.noteCount === 1 ? 'note' : 'notes'}`,
  ].join(' · ');
}

export default function AskConversationsSection({ topicId, onContinue }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<AskConversationSummary | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [deleting, setDeleting] = useState<AskConversationSummary | null>(null);
  const titleInput = useRef<HTMLInputElement | null>(null);
  const { data: conversations = [] } = useGetAskConversationsQuery(topicId);
  const [updateConversation, { isLoading: isRenaming }] = useUpdateAskConversationMutation();
  const [deleteConversation, { isLoading: isDeleting }] = useDeleteAskConversationMutation();

  if (!conversations.length) return null;

  const handleRename = async () => {
    if (!renaming || !newTitle.trim()) return;
    setError(null);
    try {
      await updateConversation({ topicId: topicId ?? undefined, conversationId: renaming.id, title: newTitle }).unwrap();
      setRenaming(null);
    } catch (err: any) {
      setError(err?.data?.message ?? err?.message ?? 'Rename failed');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setError(null);
    try {
      await deleteConversation({ topicId: topicId ?? undefined, conversationId: deleting.id }).unwrap();
      setDeleting(null);
    } catch (err: any) {
      setDeleting(null);
      setError(err?.data?.message ?? err?.message ?? 'Delete failed');
    }
  };

  return (
    <Box sx={{ mt: 1 }}>
      <Button
        size="small"
        color="inherit"
        sx={{ color: 'text.secondary' }}
        startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Hide' : 'Show'} conversations with Claude ({conversations.length})
      </Button>
      {expanded && (
        <>
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ my: 1 }}>
              {error}
            </Alert>
          )}
          <List dense>
            {conversations.map((c) => (
              <ListItem
                key={c.id}
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" variant="outlined" onClick={() => onContinue(c.id)}>
                      Continue
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setNewTitle(c.title);
                        setRenaming(c);
                      }}
                    >
                      Rename
                    </Button>
                    <Button size="small" color="error" onClick={() => setDeleting(c)}>
                      Delete
                    </Button>
                  </Stack>
                }
                sx={{ pr: 32 }}
              >
                <ListItemText
                  primary={c.title}
                  secondary={describe(c)}
                  primaryTypographyProps={{ sx: { overflowWrap: 'anywhere' } }}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}

      <Dialog
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        fullWidth
        maxWidth="sm"
        // Select the old title once the dialog is open, so typing replaces it
        TransitionProps={{ onEntered: () => titleInput.current?.select() }}
      >
        <DialogTitle>Rename conversation</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Title"
            value={newTitle}
            inputRef={titleInput}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRename();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenaming(null)} disabled={isRenaming}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleRename} disabled={isRenaming || !newTitle.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete this conversation?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{deleting?.title}” will be deleted permanently. Notes saved from it aren’t affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button color="error" onClick={handleDelete} disabled={isDeleting}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
