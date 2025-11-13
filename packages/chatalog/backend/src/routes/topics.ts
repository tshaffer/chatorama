// packages/chatalog/backend/src/routes/topics.ts
import { Router } from 'express';
import { listTopics } from '../controllers/topicsController';

const topicsRouter = Router();

// GET /api/v1/topics
topicsRouter.get('/', listTopics);

export default topicsRouter;
