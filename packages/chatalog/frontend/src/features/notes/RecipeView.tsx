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
  Table,
  TableBody,
  TableCell,
  TableRow,
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

type IngredientsViewMode = 'edited' | 'original' | 'diff';

export default function RecipeView({ note }: Props) {
  const [ingredientsViewMode, setIngredientsViewMode] = useState<IngredientsViewMode>('edited');

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
  const effectiveEdited = editedIngredients ?? originalIngredients;

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
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle2">Ingredients</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={ingredientsViewMode}
            onChange={(_e, v) => v && setIngredientsViewMode(v)}
          >
            <ToggleButton value="edited">Edited</ToggleButton>
            <ToggleButton value="original">Original</ToggleButton>
            <ToggleButton value="diff">Diff</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {ingredientsViewMode === 'original' && (
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

        {ingredientsViewMode === 'edited' && (
          <>
            {effectiveEdited.length ? (
              <List dense disablePadding>
                {effectiveEdited.map((ing, idx) => {
                  const originalRaw = (originalIngredients[idx]?.raw ?? '').trim();
                  const editedRaw = (ing.raw ?? '').trim();
                  const isChanged = editedIngredients != null && originalRaw !== editedRaw;
                  return (
                    <ListItem key={`${ing.raw}-${idx}`} disableGutters>
                      <ListItemText
                        primary={
                          <Typography variant="body2" sx={{ fontWeight: isChanged ? 700 : 400 }}>
                            {ing.raw}
                          </Typography>
                        }
                      />
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

        {ingredientsViewMode === 'diff' && (
          <>
            {editedIngredients == null ? (
              <Typography variant="body2" color="text.secondary">
                No edits yet.
              </Typography>
            ) : effectiveEdited.length ? (
              <Table size="small">
                <TableBody>
                  {effectiveEdited.map((ing, idx) => {
                    const editedRaw = (ing.raw ?? '').trim();
                    const originalRaw = (originalIngredients[idx]?.raw ?? '').trim();
                    const changed = originalRaw !== editedRaw;
                    return (
                      <TableRow key={`${idx}-${editedRaw}`}>
                        <TableCell sx={{ fontWeight: changed ? 700 : 400 }}>
                          {editedRaw}
                        </TableCell>
                        <TableCell sx={{ opacity: changed ? 1 : 0.4 }}>
                          {changed ? originalRaw : ''}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
