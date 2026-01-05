import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import ReplayIcon from '@mui/icons-material/Replay';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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

  const deletedOriginals = useMemo(() => {
    const out: { index: number; ingredient: RecipeIngredient }[] = [];
    for (let i = 0; i < originalIngredients.length; i += 1) {
      if (!editedDraft[i]) out.push({ index: i, ingredient: originalIngredients[i] });
    }
    return out;
  }, [editedDraft, originalIngredients]);

  const handleSave = async () => {
    const cleaned = editedDraft
      .map((ing) => ({
        ...ing,
        raw: (ing.raw ?? '').trim(),
      }))
      .filter((ing) => ing.raw);

    await updateNote({
      noteId: note.id,
      patch: {
        recipe: {
          ...note.recipe,
          ingredientsEdited: cleaned,
          ingredientsEditedRaw: cleaned.map((ing) => ing.raw ?? ''),
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
              const originalRaw = (originalIngredients[idx]?.raw ?? '').trim();
              const editedRaw = (ing.raw ?? '').trim();
              const canReset = Boolean(originalIngredients[idx]) && originalRaw !== editedRaw;

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
                  <IconButton
                    size="small"
                    aria-label="Reset ingredient"
                    disabled={!canReset}
                    onClick={() => {
                      if (!originalIngredients[idx]) return;
                      const next = [...editedDraft];
                      next[idx] = { ...originalIngredients[idx] };
                      setEditedDraft(next);
                    }}
                  >
                    <ReplayIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Delete ingredient"
                    onClick={() => {
                      const next = editedDraft.filter((_, i) => i !== idx);
                      setEditedDraft(next);
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

          {deletedOriginals.length ? (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">
                  Deleted originals ({deletedOriginals.length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  {deletedOriginals.map(({ index, ingredient }) => (
                    <Stack
                      key={`deleted-${index}`}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                    >
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {ingredient.raw}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const next = [...editedDraft];
                          while (next.length < index) {
                            next.push({ raw: '' });
                          }
                          next.splice(index, 0, { ...ingredient });
                          setEditedDraft(next);
                        }}
                      >
                        Restore
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ) : null}
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
