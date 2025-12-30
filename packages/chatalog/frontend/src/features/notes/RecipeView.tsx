import { useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
  Button,
} from '@mui/material';
import type { Note } from '@chatorama/chatalog-shared';
import { FF } from '../../featureFlags';

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

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Ingredients
        </Typography>
        {FF.recipe.ingredientCheckboxes ? (
          <IngredientChecklist ingredients={ingredients} />
        ) : (
          <List dense disablePadding>
            {ingredients.map((ing, idx) => (
              <ListItem key={`${ing}-${idx}`} disableGutters>
                <ListItemText primary={ing} />
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Steps
        </Typography>
        {FF.recipe.stepNavigator ? (
          <StepNavigator steps={steps} />
        ) : (
          <List dense disablePadding>
            {steps.map((s, i) => (
              <ListItem key={`${i}-${s}`} disableGutters>
                <ListItemText primary={`${i + 1}. ${s}`} />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Stack>
  );
}

function IngredientChecklist({ ingredients }: { ingredients: string[] }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  return (
    <List dense disablePadding>
      {ingredients.map((ing, idx) => (
        <ListItem key={`${ing}-${idx}`} disableGutters>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Checkbox
              size="small"
              checked={!!checked[idx]}
              onChange={() =>
                setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }))
              }
            />
          </ListItemIcon>
          <ListItemText primary={ing} />
        </ListItem>
      ))}
    </List>
  );
}

function StepNavigator({ steps }: { steps: string[] }) {
  const [activeStep, setActiveStep] = useState(0);
  const stepCount = steps.length;
  const activeText = steps[activeStep] ?? '';

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2">
        {activeText}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          size="small"
          variant="outlined"
          disabled={activeStep <= 0}
          onClick={() => setActiveStep((v) => Math.max(0, v - 1))}
        >
          Previous
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={activeStep >= stepCount - 1}
          onClick={() => setActiveStep((v) => Math.min(stepCount - 1, v + 1))}
        >
          Next
        </Button>
        <Typography variant="caption" color="text.secondary">
          Step {Math.min(activeStep + 1, stepCount)} of {stepCount}
        </Typography>
      </Stack>
    </Stack>
  );
}
