// backend/src/routes/index.ts
import { Router, Express, Request, Response } from 'express';
import notesRouter from './notes';
import subjectsRouter from './subjects';
import importsChatworthyRouter from './imports.chatworthy';
import importsBaselineRouter from './imports.baseline';
import importsPdfRouter from './imports.pdf';
import quicknotesRouter from './quicknotes';
import notesMoveRouter from './notes.move';
import topicsRouter from './topics';
import importBatchesRouter from './importBatches';
import chatRegistryRouter from './chatRegistry';
import assetsRouter from './assets';
import noteAssetsRouter from './noteAssets';
import quickNoteAssetsRouter from './quickNoteAssets';
import recipesRouter from './recipes';
import { searchRouter } from './search';
import savedSearchesRouter from './savedSearches';

export function createRoutes(app: Express) {
  const api = Router();

  api.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, api: 'v1' });
  });

  // Notes CRUD
  api.use('/notes', notesRouter);
  api.use('/assets', assetsRouter);
  api.use('/noteAssets', noteAssetsRouter);
  api.use('/search', searchRouter);

  // Subjects + nested Topics + topic-notes list
  api.use('/subjects', subjectsRouter);

  api.use('/topics', topicsRouter);

  // Chatworthy imports
  api.use('/imports', importsChatworthyRouter);
  api.use('/imports/baseline', importsBaselineRouter);
  api.use('/imports', importsPdfRouter);
  api.use('/import-batches', importBatchesRouter);

  // QuickNotes CRUD
  api.use('/quicknotes', quicknotesRouter);
  api.use('/quickNoteAssets', quickNoteAssetsRouter);
  api.use('/recipes', recipesRouter);
  api.use('/saved-searches', savedSearchesRouter);
  api.use('/chat-registry', chatRegistryRouter);

  app.use('/api/v1', notesMoveRouter);

  app.use('/api/assets', assetsRouter);
  app.use('/api/noteAssets', noteAssetsRouter);
  app.use('/api/quickNoteAssets', quickNoteAssetsRouter);
  app.use('/api/v1', api);
}
