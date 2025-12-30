import type { Request, Response, NextFunction } from 'express';
import { NoteModel } from '../models/Note';
import { normalizeIngredientLine } from '../utils/recipeNormalize';

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
