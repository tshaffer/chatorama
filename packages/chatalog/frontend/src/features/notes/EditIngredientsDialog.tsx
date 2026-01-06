import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Note, RecipeIngredient } from '@chatorama/chatalog-shared';
import { useUpdateNoteMutation } from './notesApi';

type Props = {
  open: boolean;
  onClose: () => void;
  note: Note;
};

export default function EditIngredientsDialog({ open, onClose, note }: Props) {
  const [updateNote, { isLoading }] = useUpdateNoteMutation();
  const [editedDraft, setEditedDraft] = useState<RecipeIngredient[]>([]);

  const norm = (s?: string) => (s ?? '').trim();

  const originalIngredients = useMemo<RecipeIngredient[]>(() => {
    if (note.recipe?.ingredients?.length) {
      return note.recipe.ingredients;
    }
    return (note.recipe?.ingredientsRaw ?? []).map((raw) => ({ raw }));
  }, [note.recipe?.ingredients, note.recipe?.ingredientsRaw]);

  useEffect(() => {
    if (!open) return;
    if (note.recipe?.ingredientsEdited?.length) {
      setEditedDraft(note.recipe.ingredientsEdited.map((ing) => ({ ...ing })));
    } else {
      setEditedDraft(originalIngredients.map((ing) => ({ ...ing })));
    }
  }, [open, note.recipe?.ingredientsEdited, originalIngredients]);

  const handleSave = async () => {
    await updateNote({
      noteId: note.id,
      patch: {
        recipe: {
          ...note.recipe,
          ingredientsEdited: editedDraft.map((ing) => ({
            ...ing,
            raw: norm(ing.raw),
          })),
          ingredientsEditedRaw: editedDraft.map((ing) => norm(ing.raw)),
        },
      },
    }).unwrap();

    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit ingredients</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {editedDraft.length ? (
            editedDraft.map((ing, idx) => {
              const origRaw = norm(originalIngredients[idx]?.raw);
              const curRaw = norm(ing.raw);
              const isOriginalRow = idx < originalIngredients.length;
              const isDeletedOriginal = isOriginalRow && curRaw === '';
              const isChangedOriginal = isOriginalRow && curRaw !== '' && curRaw !== origRaw;

              return (
                <Stack key={`edit-row-${idx}`} direction="row" spacing={1} alignItems="center">
                  <TextField
                    label={`Ingredient ${idx + 1}`}
                    value={ing.raw ?? ''}
                    onChange={(e) => {
                      const next = [...editedDraft];
                      next[idx] = { ...next[idx], raw: e.target.value };
                      setEditedDraft(next);
                    }}
                    fullWidth
                    size="small"
                  />
                  {isDeletedOriginal ? (
                    <Button
                      size="small"
                      onClick={() => {
                        if (!originalIngredients[idx]) return;
                        const next = [...editedDraft];
                        next[idx] = { ...originalIngredients[idx] };
                        setEditedDraft(next);
                      }}
                    >
                      Restore
                    </Button>
                  ) : isChangedOriginal ? (
                    <Button
                      size="small"
                      onClick={() => {
                        if (!originalIngredients[idx]) return;
                        const next = [...editedDraft];
                        next[idx] = { ...originalIngredients[idx] };
                        setEditedDraft(next);
                      }}
                    >
                      Reset
                    </Button>
                  ) : null}
                  <IconButton
                    size="small"
                    aria-label="Delete ingredient"
                    onClick={() => {
                      setEditedDraft((prev) => {
                        const next = [...prev];
                        if (idx < originalIngredients.length) {
                          next[idx] = { raw: '' };
                          return next;
                        }
                        next.splice(idx, 1);
                        return next;
                      });
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              );
            })
          ) : (
            <Typography variant="body2" color="text.secondary">
              No ingredients in the edited list.
            </Typography>
          )}

          <Box>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setEditedDraft([...editedDraft, { raw: '' }])}
            >
              Add ingredient
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={isLoading}>
          Save changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
