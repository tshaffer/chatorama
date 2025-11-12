import { useState } from 'react';
import {
  Box, Stack, List, ListItemButton, ListItemSecondaryAction,
  IconButton, TextField, Button, Tooltip, Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import InlineEditableName from '../../components/InlineEditableName';
import ConfirmIconButton from '../../components/ConfirmIconButton';
import { useGetTopicsForSubjectQuery, useCreateTopicMutation, useDeleteTopicMutation, useRenameTopicMutation } from 'src/features/subjects/subjectsApi';

export default function TopicList() {
  const { subjectIdSlug } = useParams(); // e.g. "6910...-chatalog"
  const subjectId = (subjectIdSlug || '').split('-')[0];
  const { data: topics } = useGetTopicsForSubjectQuery(subjectId, { skip: !subjectId });
  const [createTopic, { isLoading: creating }] = useCreateTopicMutation();
  const [deleteTopic] = useDeleteTopicMutation();
  const [renameTopic] = useRenameTopicMutation();
  const [newName, setNewName] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !subjectId) return;
    const t = await createTopic({ subjectId, name }).unwrap();
    setNewName('');
    // Optional: navigate to the new topic
    navigate(`/s/${subjectIdSlug}/t/${t.id}-${slugify(t.name)}`);
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <TextField
          size="small"
          placeholder="New topic"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
        >
          Add
        </Button>
      </Stack>

      <Divider sx={{ mb: 1 }} />

      <List dense>
        {(topics ?? []).map((t) => {
          const href = `/s/${subjectIdSlug}/t/${t.id}-${slugify(t.name)}`;
          const selected = pathname.startsWith(`/s/${subjectIdSlug}/t/${t.id}-`);
          return (
            <ListItemButton
              key={t.id}
              selected={selected}
              onClick={() => navigate(href)}
            >
              <InlineEditableName
                value={t.name}
                startEditingOn="doubleClick"
                onSave={async (name) => {
                  await renameTopic({
                    subjectId, topicId: t.id, name /*, preserveSlug: true*/
                  }).unwrap();
                }}
              />
              <ListItemSecondaryAction>
                <Tooltip title="Rename (double-click name)">
                  <span>
                    <IconButton size="small" disabled>
                      <DriveFileRenameOutlineIcon />
                    </IconButton>
                  </span>
                </Tooltip>

                <ConfirmIconButton
                  title="Delete topic?"
                  message="This will delete the topic and all its notes."
                  tooltip="Delete topic"
                  icon={<DeleteIcon />}
                  onConfirm={async () => {
                    await deleteTopic({ subjectId, topicId: t.id }).unwrap();
                  }}
                />
              </ListItemSecondaryAction>
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
