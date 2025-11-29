// backend/src/routes/index.ts
import { Router, Express, Request, Response } from 'express';
import notesRouter from './notes';
import subjectsRouter from './subjects';
import importsChatworthyRouter from './imports.chatworthy';
import quicknotesRouter from './quicknotes';
import notesMoveRouter from './notes.move';
import topicsRouter from './topics';
import importBatchesRouter from './importBatches';

export function createRoutes(app: Express) {
  const api = Router();

  api.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, api: 'v1' });
  });

  // Notes CRUD
  api.use('/notes', notesRouter);

  // Subjects + nested Topics + topic-notes list
  api.use('/subjects', subjectsRouter);

  api.use('/topics', topicsRouter);

  // Chatworthy imports
  api.use('/imports', importsChatworthyRouter);
  api.use('/import-batches', importBatchesRouter);

  // QuickNotes CRUD
  api.use('/quicknotes', quicknotesRouter);

  app.use('/api/v1', notesMoveRouter);
  
  app.use('/api/v1', api);
}
