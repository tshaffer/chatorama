type RecipeIngredientLike = { name?: string | null } | string | null | undefined;

function asArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanOneLine(s: unknown): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushSection(lines: string[], label: string, value: string | string[]) {
  if (Array.isArray(value)) {
    const v = value.map((x) => cleanOneLine(x)).filter(Boolean);
    if (v.length) lines.push(`${label}: ${v.join(', ')}`);
    return;
  }
  const v = cleanOneLine(value);
  if (v) lines.push(`${label}: ${v}`);
}

function truncateTokens(tokens: string[], maxTokens: number): string[] {
  if (tokens.length <= maxTokens) return tokens;
  return tokens.slice(0, maxTokens);
}

function truncateText(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars).trim();
}

function normalizeForCompare(value: string): string {
  return cleanOneLine(value).toLowerCase();
}

function collectIngredientNames(
  ingredients: RecipeIngredientLike[] | undefined,
  ingredientsRaw: string[] | undefined,
): string[] {
  const names: string[] = [];

  for (const item of ingredients ?? []) {
    if (!item) continue;
    if (typeof item === 'string') {
      if (cleanOneLine(item)) names.push(cleanOneLine(item));
      continue;
    }
    const name = cleanOneLine(String((item as any).name ?? ''));
    if (name) names.push(name);
  }

  for (const item of ingredientsRaw ?? []) {
    const name = cleanOneLine(String(item ?? ''));
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

export function buildRecipeSemanticText(note: any): string {
  const title = cleanOneLine(note?.title);
  const recipe = note?.recipe;
  if (!recipe && !title) return '';

  const lines: string[] = [];

  if (title) lines.push(`Title: ${title}`);

  pushSection(lines, 'Description', recipe?.description);
  pushSection(lines, 'Cuisine', recipe?.cuisine);
  pushSection(lines, 'Category', asArray(recipe?.category));
  pushSection(lines, 'Keywords', asArray(recipe?.keywords));
  pushSection(lines, 'Yield', recipe?.yield);

  const prep = recipe?.prepTimeMinutes;
  const cook = recipe?.cookTimeMinutes;
  const total = recipe?.totalTimeMinutes;
  const timeParts: string[] = [];
  if (Number.isFinite(prep)) timeParts.push(`prep ${prep}m`);
  if (Number.isFinite(cook)) timeParts.push(`cook ${cook}m`);
  if (Number.isFinite(total)) timeParts.push(`total ${total}m`);
  if (timeParts.length) lines.push(`Time: ${timeParts.join(', ')}`);

  const normalizedNames: string[] = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients
        .map((ing: any) => cleanOneLine(ing?.name))
        .filter(Boolean)
    : [];

  const rawIngredients: string[] = Array.isArray(recipe?.ingredientsRaw)
    ? recipe.ingredientsRaw.map((x: any) => cleanOneLine(x)).filter(Boolean)
    : [];

  const ingredientsList = normalizedNames.length ? normalizedNames : rawIngredients;
  if (ingredientsList.length) {
    const bounded = truncateTokens(ingredientsList, 120);
    lines.push(`Ingredients: ${bounded.join(', ')}`);
  }

  const steps: string[] = Array.isArray(recipe?.stepsRaw)
    ? recipe.stepsRaw.map((x: any) => cleanOneLine(x)).filter(Boolean)
    : [];

  if (steps.length) {
    const maxSteps = 8;
    const picked = steps.slice(0, maxSteps).map((s, idx) => `${idx + 1}. ${s}`);
    const stepsBlock = truncateText(picked.join('\n'), 1200);
    lines.push(`Steps:\n${stepsBlock}`);
  }

  const text = lines.join('\n').trim();
  return truncateText(text, 4000);
}
