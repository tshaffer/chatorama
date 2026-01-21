import { Types } from 'mongoose';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import { slugifyAscentStripping } from '@chatorama/chatalog-shared';

// Find or create a Subject from a free-form label (like ImportResultsDialog)
export async function findOrCreateSubjectByLabel(
  label?: string,
  fallbackId?: Types.ObjectId | string | null
): Promise<Types.ObjectId | string | undefined> {
  if (label && label.trim()) {
    const name = label.trim();

    // try existing subject by name (lean result)
    const existing = await SubjectModel.findOne({ name }).lean();
    if (existing) {
      return existing._id as Types.ObjectId | string;
    }

    // create a new subject (Document)
    const created = await SubjectModel.create({
      name,
      slug: slugifyAscentStripping(name),
      description: '',
    });

    return created._id as Types.ObjectId | string;
  }

  // no label provided: fall back to existing id (if any)
  return (fallbackId ?? undefined) as Types.ObjectId | string | undefined;
}

// Find or create a Topic within a Subject from a free-form label
export async function findOrCreateTopicByLabel(
  label?: string,
  subjectId?: Types.ObjectId | string | null,
  fallbackId?: Types.ObjectId | string | null
): Promise<Types.ObjectId | string | undefined> {
  if (!label || !label.trim()) {
    return (fallbackId ?? undefined) as Types.ObjectId | string | undefined;
  }
  if (!subjectId) {
    // no subject context → we can't safely create a topic
    return (fallbackId ?? undefined) as Types.ObjectId | string | undefined;
  }

  const name = label.trim();

  const existing = await TopicModel.findOne({ name, subjectId }).lean();
  if (existing) {
    return existing._id as Types.ObjectId | string;
  }

  const created = await TopicModel.create({
    name,
    slug: slugifyAscentStripping(name),
    subjectId,
    description: '',
  });

  return created._id as Types.ObjectId | string;
}
