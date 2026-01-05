import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Link,
  List,
  ListItem,
  ListItemText,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Note, RecipeIngredient } from '@chatorama/chatalog-shared';
import CookedHistoryPanel from './CookedHistoryPanel';

type Props = {
  note: Note;
};

type IngredientsListMode = 'current' | 'original' | 'diff';

export default function RecipeView({ note }: Props) {
  const [ingredientsListMode, setIngredientsListMode] =
    useState<IngredientsListMode>('current');

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

  const originalIngredients = useMemo<RecipeIngredient[]>(() => {
    if (note.recipe?.ingredients?.length) {
      return note.recipe.ingredients;
    }
    return (note.recipe?.ingredientsRaw ?? []).map((raw) => ({ raw }));
  }, [note.recipe?.ingredients, note.recipe?.ingredientsRaw]);

  const editedIngredients = note.recipe?.ingredientsEdited ?? null;
  const currentIngredients = editedIngredients ?? originalIngredients;

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

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          Ingredients
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={ingredientsListMode}
          onChange={(_e, v) => v && setIngredientsListMode(v)}
          sx={{ mb: 1 }}
        >
          <ToggleButton value="current">Current</ToggleButton>
          <ToggleButton value="original">Original</ToggleButton>
          <ToggleButton value="diff">Diff</ToggleButton>
        </ToggleButtonGroup>

        {ingredientsListMode === 'current' && (
          <>
            {currentIngredients.length ? (
              <List dense disablePadding>
                {currentIngredients.map((ing, idx) => (
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

        {ingredientsListMode === 'original' && (
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

        {ingredientsListMode === 'diff' && (
          <>
            {currentIngredients.length ? (
              <List dense disablePadding>
                {currentIngredients.map((ing, idx) => {
                  const left = (ing.raw ?? '').trim();
                  const orig = (originalIngredients[idx]?.raw ?? '').trim();
                  const hasEdit = editedIngredients != null && orig !== left;
                  const right = hasEdit ? orig : '';
                  return (
                    <ListItem key={`${idx}-${left}`} disableGutters>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          columnGap: 2,
                          width: '100%',
                        }}
                      >
                        <Typography variant="body2">{left}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {right}
                        </Typography>
                      </Box>
                    </ListItem>
                  );
                })}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No ingredients found.
              </Typography>
            )}
          </>
        )}
      </Box>

      <Accordion defaultExpanded={false}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Cooked history</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <CookedHistoryPanel note={note} />
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
