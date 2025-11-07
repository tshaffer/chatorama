import { Request, Response } from 'express';
import { TopicModel } from '../models/Topic';
import { NoteModel } from '../models/Note';

export async function listTopicsForSubjectId(req: Request, res: Response) {
  const { subjectId } = req.params;
  const docs = await TopicModel.find({ subjectId }).sort({ name: 1 }).exec();
  res.json(docs.map(d => d.toJSON()));
}

// notes list for a topic (previews), ID-based
export async function listNotesForSubjectTopicIds(req: Request, res: Response) {
  const { subjectId, topicId } = req.params;
  // (optional) verify the topic belongs to subjectId

  const docs = await NoteModel.find(
    { topicId },
    { title: 1, summary: 1, tags: 1, updatedAt: 1 }
  )
    .sort({ updatedAt: -1 })
    .exec();

  res.json(docs.map(d => d.toJSON()));
}
