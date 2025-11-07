import { Router } from 'express';
import { listSubjects, getSubjectById } from '../controllers/subjectsController';
import { listTopicsForSubjectId, listNotesForSubjectTopicIds } from '../controllers/topicsController';

const subjectsRouter = Router();

// /api/v1/subjects
subjectsRouter.get('/', listSubjects);

// /api/v1/subjects/:subjectId
subjectsRouter.get('/:subjectId', getSubjectById);

// /api/v1/subjects/:subjectId/topics
subjectsRouter.get('/:subjectId/topics', listTopicsForSubjectId);

// /api/v1/subjects/:subjectId/topics/:topicId/notes   (ID-based previews)
subjectsRouter.get('/:subjectId/topics/:topicId/notes', listNotesForSubjectTopicIds);

export default subjectsRouter;
