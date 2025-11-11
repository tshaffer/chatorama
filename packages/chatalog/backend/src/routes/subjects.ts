import { Router } from 'express';
import { listSubjects, getSubjectById, renameSubject } from '../controllers/subjectsController';
import { listTopicsForSubjectId, listNotesForSubjectTopicIds, renameTopic, reorderNotesForTopic } from '../controllers/topicsController';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import { deleteSubjectCascade, deleteTopicCascade } from '../models/hooks/cascade';

const subjectsRouter = Router();

// /api/v1/subjects
subjectsRouter.get('/', listSubjects);

// /api/v1/subjects/:subjectId
subjectsRouter.get('/:subjectId', getSubjectById);
subjectsRouter.patch('/:subjectId', renameSubject);

// /api/v1/subjects/:subjectId/topics
subjectsRouter.get('/:subjectId/topics', listTopicsForSubjectId);

// /api/v1/subjects/:subjectId/topics/:topicId/notes
subjectsRouter.get('/:subjectId/topics/:topicId/notes', listNotesForSubjectTopicIds);

// PATCH /api/v1/subjects/:subjectId/topics/:topicId/notes/reorder
subjectsRouter.patch('/:subjectId/topics/:topicId/notes/reorder', reorderNotesForTopic);

// /api/v1/subjects/:subjectId/topics/:topicId
subjectsRouter.patch('/:subjectId/topics/:topicId', renameTopic);

// POST /api/v1/subjects
subjectsRouter.post('/', async (req, res, next) => {
  try {
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });

    const created = await SubjectModel.create({ name });
    // toJSON should map _id -> id already; otherwise send created._id
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/subjects/:subjectId
subjectsRouter.delete('/:subjectId', async (req, res, next) => {
  try {
    const { subjectId } = req.params;
    // cascade: delete topics + notes
    await deleteSubjectCascade(subjectId);
    await SubjectModel.deleteOne({ _id: subjectId });
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------- Topics (nested under a Subject) ----------

// POST /api/v1/subjects/:subjectId/topics
subjectsRouter.post('/:subjectId/topics', async (req, res, next) => {
  try {
    const { subjectId } = req.params;
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });

    // ensure parent exists
    const subject = await SubjectModel.findById(subjectId).lean();
    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const created = await TopicModel.create({ name, subjectId });
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/subjects/:subjectId/topics/:topicId
subjectsRouter.delete('/:subjectId/topics/:topicId', async (req, res, next) => {
  try {
    const { subjectId, topicId } = req.params;

    // optional: verify topic belongs to subject
    const topic = await TopicModel.findOne({ _id: topicId, subjectId }).lean();
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await deleteTopicCascade(topicId);
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default subjectsRouter;
