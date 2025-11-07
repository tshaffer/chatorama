// backend/src/routes/index.ts
import { Router, Express, Request, Response } from 'express';
import notesRouter from './notes';
import subjectsRouter from './subjects';
import importsChatworthyRouter from './imports.chatworthy';

export function createRoutes(app: Express) {
  const api = Router();

  api.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, api: 'v1' });
  });

  // Notes CRUD
  api.use('/notes', notesRouter);

  // Subjects + nested Topics + topic-notes list
  api.use('/subjects', subjectsRouter);

  // Chatworthy imports
  api.use('/imports', importsChatworthyRouter);

  app.use('/api/v1', api);
}
