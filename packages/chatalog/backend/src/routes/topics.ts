// packages/chatalog/backend/src/routes/topics.ts
import { Router } from 'express';
import { getTopicNoteCount, listTopics } from '../controllers/topicsController';
import { mergeNotesInTopic } from '../controllers/notesController';
import { saveConsolidatedNote, streamConsolidateDraft } from '../controllers/consolidateController';

const topicsRouter = Router();

// GET /api/v1/topics
topicsRouter.get('/', listTopics);
topicsRouter.get('/:topicId/note-count', getTopicNoteCount);
topicsRouter.post('/:topicId/merge-notes', mergeNotesInTopic);
topicsRouter.post('/:topicId/consolidate/draft', streamConsolidateDraft);
topicsRouter.post('/:topicId/consolidate/save', saveConsolidatedNote);

export default topicsRouter;
