// routes/notes.ts
import { Router } from 'express';
import {
  listNotes,
  getNote,
  createNote,
  patchNote,
  deleteNote,
  listNotesByTopicWithRelations, // make sure this is imported
} from '../controllers/notesController';

const notesRouter = Router();

// These resolve to /api/v1/notes/... because you'll mount at api.use('/notes', ...)

// IMPORTANT: specific routes BEFORE the param route
notesRouter.get('/by-topic-with-relations',
  listNotesByTopicWithRelations);                   // GET    /api/v1/notes/by-topic-with-relations
notesRouter.get('/', listNotes);                    // GET    /api/v1/notes
notesRouter.get('/:id', getNote);                   // GET    /api/v1/notes/:id
notesRouter.post('/', createNote);                  // POST   /api/v1/notes
notesRouter.patch('/:id', patchNote);               // PATCH  /api/v1/notes/:id
notesRouter.delete('/:id', deleteNote);             // DELETE /api/v1/notes/:id

export default notesRouter;
