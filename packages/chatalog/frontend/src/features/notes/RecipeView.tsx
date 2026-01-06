import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Note, RecipeIngredient } from '@chatorama/chatalog-shared';
import MarkdownBody from '../../components/MarkdownBody';
import CookedHistoryPanel from './CookedHistoryPanel';
import { computeIngredientDiffGroups } from './ingredientsDiff';

type Props = {
  note: Note;
  markdown: string;
  enableImageSizingUi?: boolean;
  onRequestResizeImage?: (args: { src?: string; title?: string; alt?: string }) => void;
};

type IngredientsListMode = 'current' | 'original' | 'diff';
type DiffStyle = 'groupedChanges' | 'twoColumnAll' | 'twoColumnOnlyChanged';

export default function RecipeView({
  note,
  markdown,
  enableImageSizingUi = false,
  onRequestResizeImage,
}: Props) {
  const [ingredientsListMode, setIngredientsListMode] =
    useState<IngredientsListMode>('current');
  const [diffStyle] = useState<DiffStyle>('groupedChanges');

  const originalIngredients = useMemo<RecipeIngredient[]>(() => {
    if (note.recipe?.ingredients?.length) {
      return note.recipe.ingredients;
    }
    return (note.recipe?.ingredientsRaw ?? []).map((raw) => ({ raw }));
  }, [note.recipe?.ingredients, note.recipe?.ingredientsRaw]);

  const editedIngredients = note.recipe?.ingredientsEdited ?? null;
  const currentIngredients = editedIngredients ?? originalIngredients;
  const steps = note.recipe?.stepsRaw ?? [];
  const diff = computeIngredientDiffGroups({
    original: originalIngredients,
    edited: editedIngredients,
  });

  const normalize = (s?: string) => (s ?? '').trim();
  const currentRows = (currentIngredients ?? [])
    .filter((ing) => !ing.deleted)
    .map((ing) => normalize(ing.raw))
    .filter(Boolean);
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

  const BulletRow = ({
    text,
    color,
  }: {
    text: string;
    color?: 'text.primary' | 'text.secondary';
  }) => (
    <Typography
      variant="body2"
      color={color ?? 'text.primary'}
      sx={{ pl: 2, textIndent: '-0.9em' }}
    >
      • {text}
    </Typography>
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
      {ingredientsListMode === 'diff' && diffStyle === 'groupedChanges' && (
        <Box sx={{ mt: 1 }}>
          {!editedIngredients ? (
            <Typography variant="body2" color="text.secondary">
              No ingredient edits yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2">Modified</Typography>
                  <Chip size="small" label={diff.modified.length} />
                </Stack>
                {!diff.modified.length ? (
                  <Typography variant="body2" color="text.secondary">
                    None
                  </Typography>
                ) : (
                  <Stack spacing={0.75}>
                    {diff.modified.map((m) => (
                      <Box key={`mod-${m.index}`}>
                        <BulletRow text={`${m.original} -> ${m.current}`} />
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>

              <Divider />

              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2">Deleted</Typography>
                  <Chip size="small" label={diff.deleted.length} />
                </Stack>
                {!diff.deleted.length ? (
                  <Typography variant="body2" color="text.secondary">
                    None
                  </Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {diff.deleted.map((d) => (
                      <Box key={`del-${d.index}`}>
                        <BulletRow text={d.original} color="text.secondary" />
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>

              <Divider />

              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2">Added</Typography>
                  <Chip size="small" label={diff.added.length} />
                </Stack>
                {!diff.added.length ? (
                  <Typography variant="body2" color="text.secondary">
                    None
                  </Typography>
                ) : (
                  <Stack spacing={0.25}>
                    {diff.added.map((a) => (
                      <Box key={`add-${a.index}`}>
                        <BulletRow text={a.current} />
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          )}
        </Box>
      )}
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
