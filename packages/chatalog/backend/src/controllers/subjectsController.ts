import { Request, Response } from 'express';
import { SubjectModel } from '../models/Subject';

export async function listSubjects(_req: Request, res: Response) {
  const docs = await SubjectModel.find().sort({ name: 1 }).exec();
  res.json(docs.map(d => d.toJSON())); // uses your toJSON plugin (adds id, strips __v/_id)
}

export async function getSubjectById(req: Request, res: Response) {
  const { subjectId } = req.params;
  const doc = await SubjectModel.findById(subjectId).exec();
  if (!doc) return res.status(404).json({ message: 'Subject not found' });
  res.json(doc.toJSON());
}
