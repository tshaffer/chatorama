import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Note, RecipeIngredient } from '@chatorama/chatalog-shared';
import MarkdownBody from '../../components/MarkdownBody';
import CookedHistoryPanel from './CookedHistoryPanel';

type Props = {
  note: Note;
  markdown: string;
  enableImageSizingUi?: boolean;
  onRequestResizeImage?: (args: { src?: string; title?: string; alt?: string }) => void;
};

type IngredientsListMode = 'current' | 'original' | 'diff';

export default function RecipeView({
  note,
  markdown,
  enableImageSizingUi = false,
  onRequestResizeImage,
}: Props) {
  const [ingredientsListMode, setIngredientsListMode] =
    useState<IngredientsListMode>('current');

  const originalIngredients = useMemo<RecipeIngredient[]>(() => {
    if (note.recipe?.ingredients?.length) {
      return note.recipe.ingredients;
    }
    return (note.recipe?.ingredientsRaw ?? []).map((raw) => ({ raw }));
  }, [note.recipe?.ingredients, note.recipe?.ingredientsRaw]);

  const editedIngredients = note.recipe?.ingredientsEdited ?? null;
  const currentIngredients = editedIngredients ?? originalIngredients;
  const steps = note.recipe?.stepsRaw ?? [];

  const normalize = (s?: string) => (s ?? '').trim();
  const currentRows = currentIngredients.map((ing) => normalize(ing.raw)).filter(Boolean);
  const originalRows = originalIngredients.map((ing) => normalize(ing.raw)).filter(Boolean);

  const BulletList = ({ rows }: { rows: string[] }) => (
    <Box sx={{ mt: 1 }}>
      {rows.map((t, i) => (
        <Typography
          key={`${i}-${t}`}
          variant="body2"
          sx={{ pl: 2, textIndent: '-0.9em' }}
        >
          • {t}
        </Typography>
      ))}
    </Box>
  );

  const DiffList = () => (
    <Box sx={{ mt: 1 }}>
      {currentIngredients.map((ing, i) => {
        const left = normalize(ing.raw);
        const orig = normalize(originalIngredients[i]?.raw);
        const hasEdit = editedIngredients != null && left !== orig;
        const right = hasEdit ? orig : '';
        return (
          <Box
            key={`${i}-${left}`}
            sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 2 }}
          >
            <Typography variant="body2" sx={{ pl: 2, textIndent: '-0.9em' }}>
              • {left}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {right ? `• ${right}` : ''}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );

  const ingredientsTokenNode = (
    <Box>
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

      {ingredientsListMode === 'current' && <BulletList rows={currentRows} />}
      {ingredientsListMode === 'original' && <BulletList rows={originalRows} />}
      {ingredientsListMode === 'diff' && <DiffList />}
    </Box>
  );

  const stepsTokenNode = (
    <Box sx={{ mt: 1 }}>
      {steps.map((t, i) => (
        <Typography key={i} variant="body2" sx={{ mb: 0.5 }}>
          {i + 1}. {t}
        </Typography>
      ))}
    </Box>
  );

  return (
    <Stack spacing={2}>
      <MarkdownBody
        markdown={markdown}
        enableImageSizingUi={enableImageSizingUi}
        onRequestResizeImage={onRequestResizeImage}
        recipeTokens={{ ingredients: ingredientsTokenNode, steps: stepsTokenNode }}
      />

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
