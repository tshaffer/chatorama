import { isValidObjectId, Types } from 'mongoose';
import { NotePreview } from "@chatorama/chatalog-shared";
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import { NoteModel } from '../models/Note';

export function toPreview(doc: any): NotePreview {
  return {
    id: String(doc._id ?? doc.id),
    title: doc.title ?? 'Untitled',
    summary: doc.summary,
    status: doc.status,
    tags: doc.tags ?? [],
    updatedAt: (doc.updatedAt instanceof Date
      ? doc.updatedAt.toISOString()
      : doc.updatedAt ?? new Date().toISOString()),
  };
}

export function toObjectId(id?: string) {
  if (!id) return undefined;
  if (!isValidObjectId(id)) throw new Error('Invalid ObjectId');
  return new Types.ObjectId(id);
}

export async function ensureSubjectTopicExist(subjectId?: string, topicId?: string) {
  if (subjectId) {
    const sub = await SubjectModel.findById(subjectId).select('_id').lean();
    if (!sub) throw new Error('subjectId not found');
  }
  if (topicId) {
    const top = await TopicModel.findById(topicId).select('_id').lean();
    if (!top) throw new Error('topicId not found');
  }
}

export async function dedupeSlug(baseSlug: string, topicId?: string): Promise<string> {
  let slug = baseSlug || 'note';
  let i = 2;

  for (; ;) {
    const filter: any = { slug };
    if (topicId) {
      filter.topicId = topicId;
    } else {
      // No topic: ensure we only clash with notes that also have no topic
      filter.topicId = { $exists: false };
    }

    const exists = await NoteModel.findOne(filter).select('_id').lean();
    if (!exists) return slug;

    slug = `${baseSlug}-${i++}`;
  }
}

