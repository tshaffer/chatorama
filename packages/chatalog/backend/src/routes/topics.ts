// packages/chatalog/backend/src/routes/topics.ts
import { Router } from 'express';
import { listTopics } from '../controllers/topicsController';
import { mergeNotesInTopic } from '../controllers/notesController';

const topicsRouter = Router();

// GET /api/v1/topics
topicsRouter.get('/', listTopics);
topicsRouter.post('/:topicId/merge-notes', mergeNotesInTopic);

export default topicsRouter;
