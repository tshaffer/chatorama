// packages/chatalog/backend/src/routes/topics.ts
import { Router } from 'express';
import { getTopicNoteCount, listTopics } from '../controllers/topicsController';
import { mergeNotesInTopic } from '../controllers/notesController';
import { saveConsolidatedNote, streamConsolidateDraft } from '../controllers/consolidateController';
import { saveAskNotesAnswer, streamAskNotes } from '../controllers/askNotesController';
import {
  applyNoteChanges,
  listNoteChangeSets,
  proposeNoteChanges,
  undoNoteChangeSet,
} from '../controllers/noteChangesController';

const topicsRouter = Router();

// GET /api/v1/topics
topicsRouter.get('/', listTopics);
topicsRouter.get('/:topicId/note-count', getTopicNoteCount);
topicsRouter.post('/:topicId/merge-notes', mergeNotesInTopic);
topicsRouter.post('/:topicId/consolidate/draft', streamConsolidateDraft);
topicsRouter.post('/:topicId/consolidate/save', saveConsolidatedNote);
topicsRouter.post('/:topicId/ask-notes', streamAskNotes);
topicsRouter.post('/:topicId/ask-notes/save', saveAskNotesAnswer);
topicsRouter.post('/:topicId/ask-notes/plan', proposeNoteChanges);
topicsRouter.get('/:topicId/note-changes', listNoteChangeSets);
topicsRouter.post('/:topicId/note-changes/apply', applyNoteChanges);
topicsRouter.post('/:topicId/note-changes/:changeSetId/undo', undoNoteChangeSet);

export default topicsRouter;
