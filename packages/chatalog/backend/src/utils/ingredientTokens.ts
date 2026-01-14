import type { RecipeIngredient } from '@chatorama/chatalog-shared';

const UNIT_WORDS = new Set([
  'tsp', 'teaspoon', 'teaspoons',
  'tbsp', 'tablespoon', 'tablespoons',
  'oz', 'ounce', 'ounces',
  'lb', 'lbs', 'pound', 'pounds',
  'g', 'gram', 'grams',
  'kg', 'kilogram', 'kilograms',
  'ml', 'milliliter', 'milliliters',
  'l', 'liter', 'liters',
  'cup', 'cups',
  'pint', 'pints',
  'quart', 'quarts',
  'gallon', 'gallons',
  'pinch', 'dash',
]);

const STOP_WORDS = new Set([
  'for', 'and', 'or', 'with', 'to', 'of', 'in', 'on',
  'more', 'needed', 'taste', 'serving', 'serve', 'plus',
  'about', 'such', 'as', 'see', 'tip', 'if', 'very', 'into', 'from',
  'fresh', 'freshly', 'finely', 'roughly', 'coarsely',
  'chopped', 'minced', 'diced', 'sliced',
  'optional', 'removed', 'peeled', 'pitted', 'seeded', 'broken', 'grated', 'microplane',
  'large', 'small', 'medium', 'warm', 'hot', 'cold', 'dry', 'wet',
  'all', 'purpose',
]);

const DESCRIPTOR_WORDS = new Set([
  'dried', 'ground', 'smoked', 'fresh', 'freshly',
  'finely', 'roughly', 'coarsely',
  'boneless', 'skinless',
  'low', 'reduced', 'nonfat', 'fatfree',
  'extra', 'virgin',
  'coarse', 'fine',
]);

const BRAND_WORDS = new Set([
  'diamond', 'crystal',
  'kikkoman', 'heinz', 'colman', 'tabasco',
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
  'clov': 'clove',
  'leav': 'leaf',
  'ounc': 'ounce',
  'piec': 'piece',
};

function singularize(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

const FRACTION_CHARS = /[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g;
const SEPARATOR_CHARS = /[,:;()[\]{}|/]/g;

function stripParentheticalsAndNotes(raw: string): string {
  if (!raw) return '';
  let s = raw;

  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/,\s*(such as|like)\s+.*$/i, ' ');
  s = s.replace(/,\s*see\s+(tip|note).*$/i, ' ');

  return s.replace(/\s+/g, ' ').trim();
}

function normalizeIngredientText(text: string): string {
  return text
    .toLowerCase()
    // Safety: never invent negated words like "unsmoked"
    .replace(/\bunsmoked\b/g, 'smoked')
    .replace(/\b1\/2\b|\b1\/4\b|\b3\/4\b|\b1\/3\b|\b2\/3\b/g, ' ')
    .replace(FRACTION_CHARS, ' ')
    .replace(SEPARATOR_CHARS, ' ')
    .replace(/([a-z])\-([a-z])/g, '$1 $2')
    .replace(/[–—]/g, ' ')
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\bunsmoked\b/g, 'smoked')
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
  const stripped = stripParentheticalsAndNotes(text);
  const normalized = normalizeIngredientText(stripped);
  if (!normalized) return [];

  const words = normalized
    .split(' ')
    .map((w) => singularize(w))
    .map((w) => applyWordSynonyms(w))
    .map((w) => w.replace(/'/g, ''))
    .filter((w) => w.length >= 2 && !UNIT_WORDS.has(w) && !STOP_WORDS.has(w));

  if (!words.length) return [];

  const tokens = new Set<string>();

  const wordsNoBrand = words.filter((w) => !BRAND_WORDS.has(w));
  const contentWords = wordsNoBrand.filter((w) => !DESCRIPTOR_WORDS.has(w));
  const finalWords = wordsNoBrand;

  const singlesSource =
    includeSingles || finalWords.length === 1
      ? (contentWords.length ? contentWords : finalWords)
      : [];
  const singles = singlesSource.slice(0, 10);
  for (const w of singles) tokens.add(w);

  const isGoodPhrase = (phraseWords: string[]) => {
    return phraseWords.some(
      (w) =>
        !DESCRIPTOR_WORDS.has(w) &&
        !STOP_WORDS.has(w) &&
        !UNIT_WORDS.has(w) &&
        !BRAND_WORDS.has(w),
    );
  };

  const phraseTokens: string[] = [];
  for (let i = 0; i < finalWords.length - 1 && phraseTokens.length < 10; i += 1) {
    const w1 = finalWords[i];
    const w2 = finalWords[i + 1];
    if (!isGoodPhrase([w1, w2])) continue;
    const phrase = applyPhraseSynonyms(`${w1} ${w2}`);
    phraseTokens.push(phrase);
  }
  for (let i = 0; i < finalWords.length - 2 && phraseTokens.length < 10; i += 1) {
    const w1 = finalWords[i];
    const w2 = finalWords[i + 1];
    const w3 = finalWords[i + 2];
    if (!isGoodPhrase([w1, w2, w3])) continue;
    const phrase = applyPhraseSynonyms(`${w1} ${w2} ${w3}`);
    phraseTokens.push(phrase);
  }
  for (const p of phraseTokens) tokens.add(p);

  if (contentWords.length) {
    for (const t of Array.from(tokens)) {
      if (!t.includes(' ') && DESCRIPTOR_WORDS.has(t)) tokens.delete(t);
    }
  }

  if (!singles.length && !phraseTokens.length) {
    const phrase = applyPhraseSynonyms(finalWords.join(' '));
    tokens.add(phrase);
  }

  return Array.from(tokens).sort((a, b) => a.localeCompare(b));
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
  const cleaned = String(query ?? '').trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/,|;|&|\band\b/gi)
    .map((p) => p.trim())
    .filter(Boolean);
  const tokens = new Set<string>();
  for (const part of parts.length ? parts : [cleaned]) {
    canonicalizeIngredient(part, { includeSingles: false }).forEach((t) => tokens.add(t));
  }
  return Array.from(tokens).sort((a, b) => a.localeCompare(b));
}

export function canonicalizeFilterTokens(rawTokens: string[]): string[] {
  const tokens = new Set<string>();
  for (const t of rawTokens) {
    canonicalizeIngredient(t, { includeSingles: false }).forEach((v) => tokens.add(v));
  }
  return Array.from(tokens).sort((a, b) => a.localeCompare(b));
}

// Backfill reminder:
// Recompute recipe.ingredientTokens from recipe.ingredientsRaw/ingredientsEditedRaw
// in batches, updating only notes with recipe data.
