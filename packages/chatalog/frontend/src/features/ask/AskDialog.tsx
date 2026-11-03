// The top bar's Ask: Ask Claude about all notes. Claude searches the notes
// itself; the conversation works like Ask Claude on a topic page, and changes
// it plans can span topics. Applied changes are recorded in the conversation,
// which stays open and can undo them.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Snackbar } from '@mui/material';
import AskNotesDialog from '../notes/AskNotesDialog';

interface AskDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AskDialog({ open, onClose }: AskDialogProps) {
  const navigate = useNavigate();
  // A saved conversation being continued, if any
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ noteId: string; title: string } | null>(null);
  const [changesApplied, setChangesApplied] = useState<string | null>(null);

  // Each time Ask opens, it starts a new conversation.
  useEffect(() => {
    if (open) setConversationId(null);
  }, [open]);

  return (
    <>
      <AskNotesDialog
        open={open}
        conversationId={conversationId}
        onContinueConversation={setConversationId}
        onClose={onClose}
        onSaved={(noteId, title) => setSaved({ noteId, title })}
        onChangesApplied={(result) => {
          const count = result.createdNoteIds.length + result.editedNoteIds.length + result.archivedNoteIds.length;
          setChangesApplied(`Applied ${count} ${count === 1 ? 'change' : 'changes'}`);
        }}
      />

      <Snackbar
        open={Boolean(saved)}
        autoHideDuration={8000}
        onClose={(_e, reason) => reason !== 'clickaway' && setSaved(null)}
        message={saved ? `Saved “${saved.title}”` : ''}
        action={
          saved ? (
            <Button
              color="secondary"
              size="small"
              onClick={() => {
                const { noteId } = saved;
                setSaved(null);
                onClose();
                navigate(`/n/${noteId}`);
              }}
            >
              Open
            </Button>
          ) : undefined
        }
      />

      <Snackbar
        open={Boolean(changesApplied)}
        autoHideDuration={6000}
        onClose={(_e, reason) => reason !== 'clickaway' && setChangesApplied(null)}
        message={changesApplied}
      />
    </>
  );
}
