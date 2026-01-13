function parseQuantity(s: string): number | undefined {
  const trimmed = s.trim();
  if (!trimmed) return undefined;

  const parts = trimmed.split(' ');
  const fracToNum = (f: string) => {
    const m = f.match(/^(\d+)\/(\d+)$/);
    if (!m) return undefined;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return undefined;
    return a / b;
  };

  if (parts.length === 2) {
    const whole = Number(parts[0]);
    const frac = fracToNum(parts[1]);
    if (Number.isFinite(whole) && frac != null) return whole + frac;
  }

  const asNum = Number(trimmed);
  if (Number.isFinite(asNum)) return asNum;

  const frac = fracToNum(trimmed);
  if (frac != null) return frac;

  return undefined;
}

const UNIT_WORDS = new Set([
  'tsp', 'teaspoon', 'teaspoons',
  'tbsp', 'tablespoon', 'tablespoons',
  'cup', 'cups',
  'oz', 'ounce', 'ounces',
  'lb', 'lbs', 'pound', 'pounds',
  'g', 'gram', 'grams',
  'kg', 'kilogram', 'kilograms',
  'ml', 'l',
  'clove', 'cloves',
  'can', 'cans',
  'pinch', 'pinches',
  'slice', 'slices',
]);

const RECIPE_INGREDIENTS_TOKEN = '{{RECIPE_INGREDIENTS}}';
const RECIPE_STEPS_TOKEN = '{{RECIPE_STEPS}}';

export function normalizeIngredientLine(raw: string) {
  let line = raw.trim();
  if (!line) return { raw };

  const [main, ...rest] = line.split(',');
  const notes = rest.join(',').trim() || undefined;

  const tokens = main.trim().split(/\s+/);
  if (tokens.length === 0) return { raw };

  let qty: number | undefined;
  let qtyTokenCount = 0;

  const two = tokens.slice(0, 2).join(' ');
  const twoQty = parseQuantity(two);
  if (twoQty != null) {
    qty = twoQty;
    qtyTokenCount = 2;
  } else {
    const oneQty = parseQuantity(tokens[0]);
    if (oneQty != null) {
      qty = oneQty;
      qtyTokenCount = 1;
    }
  }

  let idx = qtyTokenCount;
  let unit: string | undefined;

  if (idx < tokens.length) {
    const cand = tokens[idx].toLowerCase();
    if (UNIT_WORDS.has(cand)) {
      unit = cand;
      idx += 1;
    }
  }

  const remainder = tokens.slice(idx).join(' ').trim();

  let name = remainder;
  let modifier: string | undefined;

  const paren = remainder.match(/^(.*)\((.*)\)\s*$/);
  if (paren) {
    name = paren[1].trim();
    modifier = paren[2].trim() || undefined;
  }

  const cleanedName = name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  return {
    raw,
    name: cleanedName || undefined,
    amount: qty,
    unit,
    modifier,
    notes,
  };
}

export function buildRecipeMarkdown(opts: {
  title: string;
  sourceUrl: string;
  description?: string;
}): string {
  const { title, sourceUrl, description } = opts;
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**Source:** ${sourceUrl}`);

  if (description) {
    lines.push('');
    lines.push(description.trim());
  }

  lines.push('');
  lines.push('## Ingredients');
  lines.push('');
  lines.push(RECIPE_INGREDIENTS_TOKEN);
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  lines.push(RECIPE_STEPS_TOKEN);
  lines.push('');

  return lines.join('\n');
}
