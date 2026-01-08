import type { Request, Response, NextFunction } from 'express';
import type { PipelineStage } from 'mongoose';
import { NoteModel } from '../models/Note';
import { normalizeIngredientLine } from '../utils/recipeNormalize';
import {
  buildIngredientFilterForSource,
  buildNoteFilterFromQuery,
  splitAndDedupTokens,
} from '../utils/search/noteFilters';

type RecipeFacetBucket = { value: string; count: number };
type RecipeFacetsResponse = {
  cuisines: RecipeFacetBucket[];
  categories: RecipeFacetBucket[];
  keywords: RecipeFacetBucket[];
};

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

    (note as any).cookedHistory.push({ cookedAt: dt.toISOString(), rating: r, notes });

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

export async function getRecipeFacets(req: Request, res: Response, next: NextFunction) {
  try {
    const includeTokens = splitAndDedupTokens(req.query.includeIngredients);
    const excludeTokens = splitAndDedupTokens(req.query.excludeIngredients);

    let ingredientSource: 'normalized' | 'raw' | null = null;
    if (includeTokens.length || excludeTokens.length) {
      const hasNormalized = await NoteModel.exists({ 'recipe.ingredients.0': { $exists: true } });
      if (hasNormalized) ingredientSource = 'normalized';
      else {
        const hasRaw = await NoteModel.exists({ 'recipe.ingredientsRaw.0': { $exists: true } });
        if (hasRaw) ingredientSource = 'raw';
      }

      if (!ingredientSource) {
        const empty: RecipeFacetsResponse = {
          cuisines: [],
          categories: [],
          keywords: [],
        };
        return res.json(empty);
      }
    }

    const ingredientFilter =
      ingredientSource && (includeTokens.length || excludeTokens.length)
        ? buildIngredientFilterForSource(ingredientSource, includeTokens, excludeTokens)
        : undefined;

    const { combinedFilter } = buildNoteFilterFromQuery(
      { ...req.query, scope: 'recipes' },
      ingredientFilter,
    );

    const pipeline: PipelineStage[] = [
      { $match: combinedFilter },
      {
        $project: {
          cuisineNorm: {
            $toLower: {
              $trim: {
                input: { $ifNull: ['$recipe.cuisine', ''] },
              },
            },
          },
          categoriesNorm: {
            $filter: {
              input: {
                $map: {
                  input: { $ifNull: ['$recipe.category', []] },
                  as: 'c',
                  in: {
                    $toLower: {
                      $trim: {
                        input: { $ifNull: ['$$c', ''] },
                      },
                    },
                  },
                },
              },
              as: 'c',
              cond: { $ne: ['$$c', ''] },
            },
          },
          keywordsNorm: {
            $filter: {
              input: {
                $map: {
                  input: { $ifNull: ['$recipe.keywords', []] },
                  as: 'k',
                  in: {
                    $toLower: {
                      $trim: {
                        input: { $ifNull: ['$$k', ''] },
                      },
                    },
                  },
                },
              },
              as: 'k',
              cond: { $ne: ['$$k', ''] },
            },
          },
        },
      },
      {
        $facet: {
          cuisines: [
            { $match: { cuisineNorm: { $ne: '' } } },
            { $group: { _id: '$cuisineNorm', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 50 },
            { $project: { _id: 0, value: '$_id', count: 1 } },
          ],
          categories: [
            { $unwind: '$categoriesNorm' },
            { $match: { categoriesNorm: { $ne: '' } } },
            { $group: { _id: '$categoriesNorm', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 100 },
            { $project: { _id: 0, value: '$_id', count: 1 } },
          ],
          keywords: [
            { $unwind: '$keywordsNorm' },
            { $match: { keywordsNorm: { $ne: '' } } },
            { $group: { _id: '$keywordsNorm', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 100 },
            { $project: { _id: 0, value: '$_id', count: 1 } },
          ],
        },
      },
    ];

    const [agg] = await NoteModel.aggregate(pipeline).exec();
    const facets = agg ?? { cuisines: [], categories: [], keywords: [] };

    const response: RecipeFacetsResponse = {
      cuisines: facets.cuisines ?? [],
      categories: facets.categories ?? [],
      keywords: facets.keywords ?? [],
    };

    return res.json(response);
  } catch (err) {
    next(err);
  }
}
