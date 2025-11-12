import { useState } from 'react';
import {
  Box, Stack, List, ListItemButton, ListItemSecondaryAction,
  IconButton, TextField, Button, Tooltip, Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import { useNavigate, useLocation } from 'react-router-dom';
import InlineEditableName from '../../components/InlineEditableName';
import ConfirmIconButton from '../../components/ConfirmIconButton';
import { useGetSubjectsQuery, useCreateSubjectMutation, useDeleteSubjectMutation, useRenameSubjectMutation } from 'src/features/subjects/subjectsApi';

export default function SubjectList() {
  const { data: subjects } = useGetSubjectsQuery();
  const [createSubject, { isLoading: creating }] = useCreateSubjectMutation();
  const [deleteSubject] = useDeleteSubjectMutation();
  const [renameSubject] = useRenameSubjectMutation();
  const [newName, setNewName] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const created = await createSubject({ name }).unwrap();
    setNewName('');
    // Optional: navigate to the newly created subject
    navigate(`/s/${created.id}-${slugify(created.name)}`);
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <TextField
          size="small"
          placeholder="New subject"
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
        {(subjects ?? []).map((s) => {
          const href = `/s/${s.id}-${slugify(s.name)}`;
          const selected = pathname.startsWith(`/s/${s.id}-`);
          return (
            <ListItemButton
              key={s.id}
              selected={selected}
              onClick={() => navigate(href)}
            >
              <InlineEditableName
                value={s.name}
                startEditingOn="doubleClick"
                onSave={async (name) => {
                  await renameSubject({ subjectId: s.id, name /*, preserveSlug: true*/ }).unwrap();
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
                  title="Delete subject?"
                  message="This will delete the subject and all its topics/notes."
                  tooltip="Delete subject"
                  icon={<DeleteIcon />}
                  onConfirm={async () => {
                    await deleteSubject({ subjectId: s.id }).unwrap();
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

// simple slug helper to match your existing pattern
function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
