import {
  Box,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import type { Note } from '@chatorama/chatalog-shared';

type Props = {
  note: Note;
};

export default function RecipeView({ note }: Props) {
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

    </Stack>
  );
}
