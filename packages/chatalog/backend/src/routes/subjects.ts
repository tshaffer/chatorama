import { Router } from 'express';
import { listSubjects, getSubjectById, renameSubject } from '../controllers/subjectsController';
import { listTopicsForSubjectId, listNotesForSubjectTopicIds, renameTopic } from '../controllers/topicsController';

const subjectsRouter = Router();

// /api/v1/subjects
subjectsRouter.get('/', listSubjects);

// /api/v1/subjects/:subjectId
subjectsRouter.get('/:subjectId', getSubjectById);
subjectsRouter.patch('/:subjectId', renameSubject); // <-- ADD

// /api/v1/subjects/:subjectId/topics
subjectsRouter.get('/:subjectId/topics', listTopicsForSubjectId);

// /api/v1/subjects/:subjectId/topics/:topicId/notes
subjectsRouter.get('/:subjectId/topics/:topicId/notes', listNotesForSubjectTopicIds);

// /api/v1/subjects/:subjectId/topics/:topicId
subjectsRouter.patch('/:subjectId/topics/:topicId', renameTopic); // <-- ADD

export default subjectsRouter;
