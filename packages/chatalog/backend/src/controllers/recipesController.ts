import type { Request, Response, NextFunction } from 'express';
import { NoteModel } from '../models/Note';

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

function normalizeIngredientLine(raw: string) {
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

export async function normalizeRecipeIngredients(req: Request, res: Response, next: NextFunction) {
  try {
    const { noteId } = req.params;

    const note = await NoteModel.findById(noteId).exec();
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const recipe: any = (note as any).recipe;
    const rawLines: string[] = recipe?.ingredientsRaw ?? [];

    if (!recipe?.sourceUrl) {
      return res.status(400).json({ error: 'Note has no recipe.sourceUrl' });
    }

    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      return res.status(400).json({ error: 'No recipe.ingredientsRaw to normalize' });
    }

    recipe.ingredients = rawLines
      .map(normalizeIngredientLine)
      .filter((x) => x.raw && String(x.raw).trim().length > 0);

    (note as any).recipe = recipe;

    await note.save();
    return res.json(note.toJSON());
  } catch (err) {
    next(err);
  }
}

export async function addCookedEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { noteId } = req.params;
    const { cookedAt, rating, notes } = req.body ?? {};

    const note = await NoteModel.findById(noteId).exec();
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const dt = cookedAt ? new Date(cookedAt) : new Date();
    if (Number.isNaN(dt.getTime())) return res.status(400).json({ error: 'Invalid cookedAt' });

    const r = rating == null ? undefined : Number(rating);

    if (r != null && (!Number.isFinite(r) || r < 1 || r > 5)) {
      return res.status(400).json({ error: 'rating must be 1..5' });
    }

    (note as any).cookedHistory = Array.isArray((note as any).cookedHistory)
      ? (note as any).cookedHistory
      : [];

    (note as any).cookedHistory.push({ cookedAt: dt, rating: r, notes });

    (note as any).cookedHistory.sort((a: any, b: any) => {
      const ta = new Date(a.cookedAt).getTime();
      const tb = new Date(b.cookedAt).getTime();
      return tb - ta;
    });

    await note.save();
    return res.json(note.toJSON());
  } catch (err) {
    next(err);
  }
}

function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function searchRecipesByIngredients(req: Request, res: Response, next: NextFunction) {
  try {
    const query = String(req.query.query ?? '').trim();
    const mode = String(req.query.mode ?? 'any');
    if (!query) return res.status(400).json({ error: 'query is required' });

    const toks = tokenizeQuery(query);
    if (toks.length === 0) return res.status(400).json({ error: 'query has no tokens' });

    const clauses = toks.map((t) => ({
      'recipe.ingredients.name': { $regex: new RegExp(`\\b${t}\\b`, 'i') },
    }));

    const filter =
      mode === 'all'
        ? { recipe: { $exists: true }, $and: clauses }
        : { recipe: { $exists: true }, $or: clauses };

    const docs = await NoteModel.find(filter)
      .sort({ updatedAt: -1 })
      .limit(100)
      .exec();

    return res.json(docs.map((doc) => doc.toJSON()));
  } catch (err) {
    next(err);
  }
}
