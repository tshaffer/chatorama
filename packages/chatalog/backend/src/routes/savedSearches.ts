import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { SavedSearchModel } from '../models/SavedSearch';
import type {
  CreateSavedSearchRequest,
  CreateSavedSearchResponse,
  DeleteSavedSearchResponse,
  ListSavedSearchesResponse,
  SavedSearch,
} from '@chatorama/chatalog-shared';

const router = Router();

function toSavedSearch(doc: any): SavedSearch {
  return {
    id: String(doc._id),
    name: String(doc.name ?? ''),
    query: doc.query ?? {},
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

// GET /api/v1/saved-searches
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const docs = await SavedSearchModel.find()
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();

    const response: ListSavedSearchesResponse = {
      items: (docs ?? []).map((d) => toSavedSearch(d)),
    };

    return res.json(response);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/saved-searches
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as CreateSavedSearchRequest;
    const name = String(body.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (name.length > 80) {
      return res.status(400).json({ error: 'name must be 80 characters or fewer' });
    }

    const query = body.query;
    if (!query || typeof query !== 'object') {
      return res.status(400).json({ error: 'query is required' });
    }

    const created = await SavedSearchModel.create({ name, query });
    const response: CreateSavedSearchResponse = toSavedSearch(created);
    return res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/saved-searches/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deleted = await SavedSearchModel.findByIdAndDelete(id).exec();
    if (!deleted) return res.status(404).json({ error: 'saved search not found' });
    const response: DeleteSavedSearchResponse = { ok: true };
    return res.json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
