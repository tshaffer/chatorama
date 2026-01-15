import type { RecipeIngredient } from '@chatorama/chatalog-shared';

const UNIT_WORDS = new Set([
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'g', 'gram', 'grams', 'kg',
  'ml', 'l', 'liter', 'liters', 'pinch', 'dash', 'clove', 'cloves', 'slice', 'slices',
  'package', 'packages', 'can', 'cans', 'bunch', 'bunches', 'sprig', 'sprigs', 'piece', 'pieces',
  'stick', 'sticks',
]);

const STOP_WORDS = new Set([
  'fresh', 'chopped', 'minced', 'diced', 'sliced', 'ground', 'optional',
  'to', 'taste', 'and', 'or', 'of',
]);

const PHRASE_SYNONYMS: Record<string, string> = {
  'garbanzo bean': 'chickpea',
  'garbanzo beans': 'chickpea',
  'spring onion': 'green onion',
  'spring onions': 'green onion',
  'scallion': 'green onion',
  'scallions': 'green onion',
  'capsicum': 'bell pepper',
  'capsicums': 'bell pepper',
  'aubergine': 'eggplant',
  'courgette': 'zucchini',
};

const WORD_SYNONYMS: Record<string, string> = {
  'garbanzo': 'chickpea',
  'scallion': 'green onion',
  'capsicum': 'bell pepper',
  'aubergine': 'eggplant',
  'courgette': 'zucchini',
  'cilantro': 'coriander',
};

function singularize(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyPhraseSynonyms(phrase: string): string {
  return PHRASE_SYNONYMS[phrase] ?? phrase;
}

function applyWordSynonyms(word: string): string {
  return WORD_SYNONYMS[word] ?? word;
}

export function canonicalizeIngredient(
  text: string,
  opts: { includeSingles?: boolean } = {},
): string[] {
  const includeSingles = opts.includeSingles ?? true;
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const words = normalized
    .split(' ')
    .map((w) => singularize(w))
    .map((w) => applyWordSynonyms(w))
    .filter((w) => w.length > 0 && !UNIT_WORDS.has(w) && !STOP_WORDS.has(w));

  if (!words.length) return [];

  const phraseRaw = words.join(' ');
  const phrase = applyPhraseSynonyms(phraseRaw);
  const tokens = new Set<string>();
  tokens.add(phrase);

  if (includeSingles && words.length > 1) {
    for (const w of words) {
      if (w.length > 2) tokens.add(w);
    }
  }

  return Array.from(tokens);
}

export function buildIngredientTokensFromIngredients(
  ingredients: RecipeIngredient[] | undefined,
  ingredientsRaw: string[] | undefined,
): string[] {
  const tokens = new Set<string>();
  for (const ing of ingredients ?? []) {
    const base = ing?.name || ing?.raw || '';
    canonicalizeIngredient(String(base), { includeSingles: true }).forEach((t) => tokens.add(t));
  }
  for (const raw of ingredientsRaw ?? []) {
    canonicalizeIngredient(String(raw), { includeSingles: true }).forEach((t) => tokens.add(t));
  }
  return Array.from(tokens);
}

export function buildIngredientSearchTokens(query: string): string[] {
  const cleaned = normalizeText(query);
  if (!cleaned) return [];
  const parts = cleaned.split(/,|;|&|\band\b/).map((p) => p.trim()).filter(Boolean);
  const tokens = new Set<string>();
  for (const part of parts.length ? parts : [cleaned]) {
    canonicalizeIngredient(part, { includeSingles: false }).forEach((t) => tokens.add(t));
  }
  return Array.from(tokens);
}

export function canonicalizeFilterTokens(rawTokens: string[]): string[] {
  const tokens = new Set<string>();
  for (const t of rawTokens) {
    canonicalizeIngredient(t, { includeSingles: false }).forEach((v) => tokens.add(v));
  }
  return Array.from(tokens);
}
