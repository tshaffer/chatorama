type RecipeIngredientLike = { name?: string | null } | string | null | undefined;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForCompare(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function collectIngredientNames(
  ingredients: RecipeIngredientLike[] | undefined,
  ingredientsRaw: string[] | undefined,
): string[] {
  const names: string[] = [];

  for (const item of ingredients ?? []) {
    if (!item) continue;
    if (typeof item === 'string') {
      if (normalizeWhitespace(item)) names.push(normalizeWhitespace(item));
      continue;
    }
    const name = normalizeWhitespace(String((item as any).name ?? ''));
    if (name) names.push(name);
  }

  for (const item of ingredientsRaw ?? []) {
    const name = normalizeWhitespace(String(item ?? ''));
    if (name) names.push(name);
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const name of names) {
    const key = normalizeForCompare(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(name);
  }

  return deduped;
}

export function buildRecipeSemanticText(recipeDoc: any): string {
  const title = normalizeWhitespace(String(recipeDoc?.title ?? ''));
  const description = normalizeWhitespace(String(recipeDoc?.recipe?.description ?? ''));
  const ingredients = collectIngredientNames(
    recipeDoc?.recipe?.ingredients ?? [],
    recipeDoc?.recipe?.ingredientsRaw ?? [],
  );

  const parts: string[] = [];
  if (title) parts.push(`Title: ${title}`);
  if (description) parts.push(`Description: ${description}`);
  if (ingredients.length) parts.push(`Ingredients: ${ingredients.join(', ')}`);

  return parts.join('\n').trim();
}
