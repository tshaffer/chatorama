import { Router } from 'express';
import { NoteModel } from '../models/Note';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import { slugifyStandard } from '@chatorama/chatalog-shared';
import {
  addCookedEvent,
  normalizeRecipeIngredients,
  searchRecipesByIngredients,
} from '../controllers/recipesController';

type ImportRecipeRequest = {
  pageUrl: string;
  recipeJsonLd: any;
};

const recipesRouter = Router();

// POST /api/v1/recipes/:noteId/normalize
recipesRouter.post('/:noteId/normalize', normalizeRecipeIngredients);

// POST /api/v1/recipes/:noteId/cooked
recipesRouter.post('/:noteId/cooked', addCookedEvent);

// GET /api/v1/recipes/search?query=...&mode=any|all
recipesRouter.get('/search', searchRecipesByIngredients);

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [x];
}

function isRecipeNode(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  const t = (node['@type'] ?? node['type']) as any;
  if (!t) return false;

  if (typeof t === 'string') return t.toLowerCase() === 'recipe';
  if (Array.isArray(t)) return t.some((v) => typeof v === 'string' && v.toLowerCase() === 'recipe');

  return false;
}

function findRecipeNode(input: any): any | null {
  if (!input) return null;
  if (isRecipeNode(input)) return input;

  const candidates: unknown[] = [];
  const pushCandidate = (x: unknown) => {
    if (!x) return;
    candidates.push(x);
  };

  if (Array.isArray(input)) {
    for (const item of input) pushCandidate(item);
  } else if (typeof input === 'object') {
    const obj: any = input;
    pushCandidate(obj);
    if (obj['@graph']) {
      for (const g of asArray(obj['@graph'])) pushCandidate(g);
    }
    if (obj['mainEntity']) pushCandidate(obj['mainEntity']);
  }

  const flattened: unknown[] = [];
  for (const c of candidates) {
    if (Array.isArray(c)) flattened.push(...c);
    else flattened.push(c);
  }

  for (const node of flattened) {
    if (isRecipeNode(node)) return node;
  }

  return null;
}

function normalizeStringArray(value: any): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string') as string[];
}

function normalizeInstructions(value: any): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value];

  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        out.push(item);
        continue;
      }
      if (item && typeof item === 'object') {
        const text = (item as any).text;
        if (typeof text === 'string') {
          out.push(text);
          continue;
        }
        if ((item as any).itemListElement) {
          out.push(...normalizeInstructions((item as any).itemListElement));
        }
      }
    }
    return out;
  }

  if (value && typeof value === 'object') {
    const text = (value as any).text;
    if (typeof text === 'string') return [text];
    if ((value as any).itemListElement) return normalizeInstructions((value as any).itemListElement);
  }

  return [];
}

async function getOrCreateSubject(name: string) {
  const existing = await SubjectModel.findOne({ name }).exec();
  if (existing) return existing;
  try {
    return await SubjectModel.create({ name });
  } catch (err: any) {
    if (err?.code === 11000) {
      const dup = await SubjectModel.findOne({ name }).exec();
      if (dup) return dup;
    }
    throw err;
  }
}

async function getOrCreateTopic(name: string, subjectId: string) {
  const existing = await TopicModel.findOne({ name, subjectId }).exec();
  if (existing) return existing;
  try {
    return await TopicModel.create({ name, subjectId });
  } catch (err: any) {
    if (err?.code === 11000) {
      const dup = await TopicModel.findOne({ name, subjectId }).exec();
      if (dup) return dup;
    }
    throw err;
  }
}

async function dedupeSlug(topicId: string, base: string): Promise<string> {
  let slug = base || 'recipe';
  let i = 2;
  while (await NoteModel.exists({ topicId, slug })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

recipesRouter.post('/import', async (req, res, next) => {
  try {
    const { pageUrl, recipeJsonLd } = req.body as ImportRecipeRequest;
    if (!pageUrl || typeof pageUrl !== 'string' || !isValidUrl(pageUrl)) {
      return res.status(400).json({ error: 'BAD_REQUEST', details: 'pageUrl is required' });
    }

    const recipe = findRecipeNode(recipeJsonLd);
    if (!recipe) {
      return res.status(400).json({ error: 'BAD_REQUEST', details: 'recipeJsonLd missing Recipe node' });
    }

    const existing = await NoteModel.findOne({ 'sources.url': pageUrl }).select('_id').lean();
    if (existing?._id) {
      return res.status(409).json({
        error: 'DUPLICATE_RECIPE',
        existingNoteId: existing._id.toString(),
      });
    }

    const subject = await getOrCreateSubject('Recipes');
    const topic = await getOrCreateTopic('Uncategorized', subject.id.toString());

    const title =
      (recipe as any).name ||
      (recipe as any)?.mainEntityOfPage?.name ||
      (recipe as any)?.headline ||
      'Untitled recipe';

    const ingredients = normalizeStringArray((recipe as any).recipeIngredient || (recipe as any).ingredients);
    const steps = normalizeInstructions((recipe as any).recipeInstructions || (recipe as any).instructions);

    const markdownLines: string[] = [`# ${title}`, '', `Source: ${pageUrl}`, '', '## Ingredients'];
    if (ingredients.length) {
      ingredients.forEach((ing) => markdownLines.push(`- ${ing}`));
    } else {
      markdownLines.push('- (not found)');
    }

    markdownLines.push('', '## Steps');
    if (steps.length) {
      steps.forEach((step, idx) => markdownLines.push(`${idx + 1}. ${step}`));
    } else {
      markdownLines.push('1. (not found)');
    }

    const baseSlug = slugifyStandard(String(title || 'recipe')) || 'recipe';
    const slug = await dedupeSlug(topic.id.toString(), baseSlug);

    try {
      const created = await NoteModel.create({
        subjectId: subject.id.toString(),
        topicId: topic.id.toString(),
        title,
        slug,
        markdown: markdownLines.join('\n'),
        recipe: {
          sourceUrl: pageUrl,
          ingredientsRaw: ingredients,
          stepsRaw: steps,
        },
        sources: [{ url: pageUrl, type: 'clip' }],
        importedAt: new Date(),
      });

      return res.status(200).json({ ok: true, noteId: created._id.toString() });
    } catch (err: any) {
      if (err?.code === 11000) {
        return res.status(409).json({ error: 'DUPLICATE_RECIPE' });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

export default recipesRouter;
