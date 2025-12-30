import { useMemo } from 'react';
import {
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

  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (note.recipe?.totalTimeMinutes) {
      parts.push(`${note.recipe.totalTimeMinutes} min`);
    }
    if (note.recipe?.yield) {
      parts.push(note.recipe.yield);
    }
    return parts.join(' • ');
  }, [note.recipe?.totalTimeMinutes, note.recipe?.yield]);

  return (
    <Stack spacing={2}>
      {(metaLine || note.recipe?.author) && (
        <Typography variant="body2" color="text.secondary">
          {metaLine}
          {metaLine && note.recipe?.author ? ' • ' : ''}
          {note.recipe?.author}
        </Typography>
      )}

    </Stack>
  );
}
