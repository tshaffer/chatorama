import { Router } from 'express';
import {
  listNotes,
  getNote,
  createNote,
  patchNote,
  deleteNote,
} from '../controllers/notesController';

const notesRouter = Router();

// These resolve to /api/v1/notes/... because you'll mount at api.use('/notes', ...)

notesRouter.get('/', listNotes);        // GET    /api/v1/notes
notesRouter.get('/:id', getNote);       // GET    /api/v1/notes/:id
notesRouter.post('/', createNote);      // POST   /api/v1/notes
notesRouter.patch('/:id', patchNote);   // PATCH  /api/v1/notes/:id
notesRouter.delete('/:id', deleteNote); // DELETE /api/v1/notes/:id

export default notesRouter;
``