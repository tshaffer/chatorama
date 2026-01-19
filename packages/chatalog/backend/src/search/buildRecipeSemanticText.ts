import { computeCookedSearchFields } from '../utils/recipes/computeCookedSearchFields';

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

  const cookedNotesText =
    recipe?.search?.cookedNotesText ??
    computeCookedSearchFields(note?.cookedHistory ?? []).cookedNotesText;
  if (cookedNotesText) {
    lines.push(`Cooked notes:\n${truncateText(cookedNotesText, 1200)}`);
  }

  const text = lines.join('\n').trim();
  return truncateText(text, 4000);
}
