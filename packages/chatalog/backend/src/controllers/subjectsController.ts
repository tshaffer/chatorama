import { Request, Response } from 'express';
import { SubjectModel } from '../models/Subject';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}


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

/**
 * PATCH /api/v1/subjects/:subjectId
 * Body: { name: string }
 * Query: preserveSlug=1 to keep existing slug (default: regenerate to match name)
 */
export async function renameSubject(req: Request, res: Response) {
  try {
    const { subjectId } = req.params;
    const { name } = req.body as { name?: string };
    const preserveSlug = req.query.preserveSlug === '1';

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    const subject = await SubjectModel.findById(subjectId).orFail();
    subject.name = name.trim();

    if (!preserveSlug) {
      subject.slug = slugify(subject.name);
    }

    await subject.save(); // respects your unique indexes
    return res.json(subject.toJSON());
  } catch (err: any) {
    if (err?.name === 'DocumentNotFoundError') {
      return res.status(404).json({ message: 'Subject not found.' });
    }
    if (err?.code === 11000) {
      // duplicate key (name unique, or slug unique)
      return res.status(409).json({ message: 'A subject with that name/slug already exists.' });
    }
    console.error('renameSubject error', err);
    return res.status(500).json({ message: 'Internal error.' });
  }
}
