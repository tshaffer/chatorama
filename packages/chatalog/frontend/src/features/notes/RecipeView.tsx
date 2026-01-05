import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Note, RecipeIngredient } from '@chatorama/chatalog-shared';
import { useUpdateNoteMutation } from './notesApi';
import CookedHistoryPanel from './CookedHistoryPanel';

type Props = {
  note: Note;
};

export default function RecipeView({ note }: Props) {
  const [updateNote, { isLoading: isSaving }] = useUpdateNoteMutation();
  const [activeTab, setActiveTab] = useState(0);
  const [editedDraft, setEditedDraft] = useState<RecipeIngredient[] | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);

  const ingredients = note.recipe?.ingredientsRaw ?? [];
  const steps = note.recipe?.stepsRaw ?? [];

  const hasRecipe = ingredients.length > 0 && steps.length > 0;
  if (!hasRecipe) return null;

  const formatMinutes = (min?: number): string | null => {
    if (min == null || Number.isNaN(min)) return null;
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} hr ${m} min` : `${h} hr`;
  };

  const prep = formatMinutes(note.recipe?.prepTimeMinutes);
  const cook = formatMinutes(note.recipe?.cookTimeMinutes);
  const total = formatMinutes(note.recipe?.totalTimeMinutes);
  const hasAnyTime = Boolean(prep || cook || total);

  const originalIngredients = useMemo(() => {
    if (note.recipe?.ingredients?.length) {
      return note.recipe.ingredients;
    }
    return (note.recipe?.ingredientsRaw ?? []).map((raw) => ({ raw }));
  }, [note.recipe?.ingredients, note.recipe?.ingredientsRaw]);

  useEffect(() => {
    if (note.recipe?.ingredientsEdited?.length) {
      setEditedDraft(note.recipe.ingredientsEdited.map((ing) => ({ ...ing })));
    } else {
      setEditedDraft(null);
    }
  }, [note.id, note.recipe?.ingredientsEdited]);

  const handleStartEditing = async () => {
    const init = originalIngredients.map((ing) => ({ ...ing }));
    setEditedDraft(init);
    await updateNote({
      noteId: note.id,
      patch: {
        recipe: {
          ...note.recipe,
          ingredientsEdited: init,
          ingredientsEditedRaw: init.map((ing) => ing.raw ?? ''),
        },
      },
    }).unwrap();
  };

  const handleSaveEdited = async () => {
    if (!editedDraft) return;
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
  };

  const diffRows = useMemo(() => {
    if (!editedDraft) return [];
    const rows: Array<
      | { kind: 'unchanged'; original: string; edited: string }
      | { kind: 'modified'; original: string; edited: string }
      | { kind: 'added'; edited: string }
      | { kind: 'removed'; original: string }
    > = [];
    const max = Math.max(originalIngredients.length, editedDraft.length);
    for (let i = 0; i < max; i += 1) {
      const o = originalIngredients[i]?.raw?.trim();
      const e = editedDraft[i]?.raw?.trim();
      if (o && e) {
        rows.push(
          o === e
            ? { kind: 'unchanged', original: o, edited: e }
            : { kind: 'modified', original: o, edited: e },
        );
      } else if (o && !e) {
        rows.push({ kind: 'removed', original: o });
      } else if (!o && e) {
        rows.push({ kind: 'added', edited: e });
      }
    }
    return rows;
  }, [editedDraft, originalIngredients]);

  return (
    <Stack spacing={2}>
      {note.recipe?.sourceUrl && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Source
          </Typography>
          <Link href={note.recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
            {note.recipe.sourceUrl}
          </Link>
        </Box>
      )}

      {hasAnyTime && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Times
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            {prep && <Typography variant="body2">Prep: {prep}</Typography>}
            {cook && <Typography variant="body2">Cook: {cook}</Typography>}
            {total && <Typography variant="body2">Total: {total}</Typography>}
          </Stack>
        </Box>
      )}

      <Accordion defaultExpanded={false}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Cooked history</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <CookedHistoryPanel note={note} />
        </AccordionDetails>
      </Accordion>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Ingredients
        </Typography>
        <Tabs value={activeTab} onChange={(_e, v) => setActiveTab(v)} sx={{ mb: 1 }}>
          <Tab label="Original" />
          <Tab label="Edited" />
          <Tab label="Diff" />
        </Tabs>

        {activeTab === 0 && (
          <>
            {originalIngredients.length ? (
              <List dense disablePadding>
                {originalIngredients.map((ing, idx) => (
                  <ListItem key={`${ing.raw}-${idx}`} disableGutters>
                    <ListItemText primary={ing.raw} />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No ingredients found.
              </Typography>
            )}
          </>
        )}

        {activeTab === 1 && (
          <>
            {!editedDraft ? (
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  No edited ingredients yet.
                </Typography>
                <Button size="small" variant="outlined" onClick={handleStartEditing}>
                  Start editing
                </Button>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {editedDraft.length ? (
                  editedDraft.map((ing, idx) => (
                    <Stack key={`edited-${idx}`} direction="row" spacing={1} alignItems="center">
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
                        aria-label="Delete ingredient"
                        onClick={() => {
                          const next = editedDraft.filter((_, i) => i !== idx);
                          setEditedDraft(next);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No ingredients in the edited list.
                  </Typography>
                )}

                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setEditedDraft([...editedDraft, { raw: '' }])}
                  >
                    Add ingredient
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleSaveEdited}
                    disabled={isSaving}
                  >
                    Save changes
                  </Button>
                </Stack>
              </Stack>
            )}
          </>
        )}

        {activeTab === 2 && (
          <>
            {!editedDraft ? (
              <Typography variant="body2" color="text.secondary">
                No edits yet.
              </Typography>
            ) : (
              <Stack spacing={1}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showUnchanged}
                      onChange={(e) => setShowUnchanged(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Show unchanged"
                />
                <List dense disablePadding>
                  {diffRows
                    .filter((row) => (showUnchanged ? true : row.kind !== 'unchanged'))
                    .map((row, idx) => {
                      if (row.kind === 'added') {
                        return (
                          <ListItem key={`diff-${idx}`} disableGutters>
                            <ListItemText primary={`+ Added: ${row.edited}`} />
                          </ListItem>
                        );
                      }
                      if (row.kind === 'removed') {
                        return (
                          <ListItem key={`diff-${idx}`} disableGutters>
                            <ListItemText primary={`- Removed: ${row.original}`} />
                          </ListItem>
                        );
                      }
                      if (row.kind === 'modified') {
                        return (
                          <ListItem key={`diff-${idx}`} disableGutters>
                            <ListItemText
                              primary={`~ Modified: ${row.original} → ${row.edited}`}
                            />
                          </ListItem>
                        );
                      }
                      return (
                        <ListItem key={`diff-${idx}`} disableGutters>
                          <ListItemText primary={row.original} />
                        </ListItem>
                      );
                    })}
                </List>
              </Stack>
            )}
          </>
        )}
      </Box>

    </Stack>
  );
}
