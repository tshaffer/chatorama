import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import type { RecipeMeta } from '@chatorama/chatalog-shared';

type Props = {
  open: boolean;
  onClose: () => void;
  recipe?: RecipeMeta;
};

type RowProps = { label: string; value: React.ReactNode };

function Row({ label, value }: RowProps) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

function hasAnyNutrition(recipe?: RecipeMeta) {
  const n = recipe?.nutrition;
  if (!n) return false;
  return Object.values(n).some((v) => v != null && String(v).trim() !== '');
}

export default function RecipePropertiesDialog({ open, onClose, recipe }: Props) {
  const nutrition = recipe?.nutrition;
  const hasNutrition = hasAnyNutrition(recipe);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Recipe Properties</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {recipe?.sourceUrl && (
            <>
              <Row
                label="Source"
                value={
                  <Link href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {recipe.sourceUrl}
                  </Link>
                }
              />
              <Divider />
            </>
          )}

          {(recipe?.author || recipe?.yield) && (
            <>
              <Stack spacing={1.5}>
                {recipe?.author && <Row label="Author" value={recipe.author} />}
                {recipe?.yield && <Row label="Yield" value={recipe.yield} />}
              </Stack>
              <Divider />
            </>
          )}

          {(recipe?.cuisine || recipe?.category?.length || recipe?.keywords?.length) && (
            <>
              <Stack spacing={1.5}>
                {recipe?.cuisine && <Row label="Cuisine" value={recipe.cuisine} />}
                {recipe?.category?.length ? (
                  <Row label="Category" value={recipe.category.join(', ')} />
                ) : null}
                {recipe?.keywords?.length ? (
                  <Row label="Keywords" value={recipe.keywords.join(', ')} />
                ) : null}
              </Stack>
              <Divider />
            </>
          )}

          {(recipe?.ratingValue != null || recipe?.ratingCount != null) && (
            <>
              <Stack spacing={1.5}>
                {recipe?.ratingValue != null && (
                  <Row label="Rating" value={recipe.ratingValue} />
                )}
                {recipe?.ratingCount != null && (
                  <Row label="Rating count" value={recipe.ratingCount} />
                )}
              </Stack>
              <Divider />
            </>
          )}

          {hasNutrition && (
            <>
              <Stack spacing={1.5}>
                <Typography variant="subtitle2">Nutrition</Typography>
                {nutrition?.calories && <Row label="Calories" value={nutrition.calories} />}
                {nutrition?.proteinContent && (
                  <Row label="Protein" value={nutrition.proteinContent} />
                )}
                {nutrition?.carbohydrateContent && (
                  <Row label="Carbohydrates" value={nutrition.carbohydrateContent} />
                )}
                {nutrition?.fatContent && <Row label="Fat" value={nutrition.fatContent} />}
                {nutrition?.fiberContent && (
                  <Row label="Fiber" value={nutrition.fiberContent} />
                )}
                {nutrition?.sugarContent && (
                  <Row label="Sugar" value={nutrition.sugarContent} />
                )}
                {nutrition?.sodiumContent && (
                  <Row label="Sodium" value={nutrition.sodiumContent} />
                )}
                {nutrition?.cholesterolContent && (
                  <Row label="Cholesterol" value={nutrition.cholesterolContent} />
                )}
                {nutrition?.saturatedFatContent && (
                  <Row label="Saturated fat" value={nutrition.saturatedFatContent} />
                )}
                {nutrition?.unsaturatedFatContent && (
                  <Row label="Unsaturated fat" value={nutrition.unsaturatedFatContent} />
                )}
                {nutrition?.transFatContent && (
                  <Row label="Trans fat" value={nutrition.transFatContent} />
                )}
              </Stack>
              <Divider />
            </>
          )}

          {(recipe?.ingredientsRaw?.length || recipe?.stepsRaw?.length || recipe?.ingredients?.length) && (
            <>
              <Stack spacing={1.5}>
                {recipe?.ingredientsRaw?.length != null && (
                  <Row label="Ingredients (raw)" value={recipe.ingredientsRaw.length} />
                )}
                {recipe?.stepsRaw?.length != null && (
                  <Row label="Steps (raw)" value={recipe.stepsRaw.length} />
                )}
                {recipe?.ingredients?.length != null && (
                  <Row label="Ingredients (normalized)" value={recipe.ingredients.length} />
                )}
              </Stack>
              <Divider />
            </>
          )}

          {recipe?.description && (
            <Row
              label="Description"
              value={
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                  {recipe.description}
                </Typography>
              }
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
