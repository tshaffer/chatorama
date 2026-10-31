// packages/chatalog/backend/src/routes/topics.ts
import { Router } from 'express';
import { getTopicNoteCount, listTopics } from '../controllers/topicsController';
import { mergeNotesInTopic } from '../controllers/notesController';
import { saveConsolidatedNote, streamConsolidateDraft } from '../controllers/consolidateController';
import { saveAskNotesAnswer, streamAskNotes } from '../controllers/askNotesController';

const topicsRouter = Router();

// GET /api/v1/topics
topicsRouter.get('/', listTopics);
topicsRouter.get('/:topicId/note-count', getTopicNoteCount);
topicsRouter.post('/:topicId/merge-notes', mergeNotesInTopic);
topicsRouter.post('/:topicId/consolidate/draft', streamConsolidateDraft);
topicsRouter.post('/:topicId/consolidate/save', saveConsolidatedNote);
topicsRouter.post('/:topicId/ask-notes', streamAskNotes);
topicsRouter.post('/:topicId/ask-notes/save', saveAskNotesAnswer);

export default topicsRouter;
