// controllers/subjectRelationsController.ts (for example)
import { Request, Response } from 'express';
import { NoteModel } from '../models/Note';
import { TopicModel } from '../models/Topic';
import type {
  NotePreview,
  SubjectRelationsSummary,
  RelatedTopicSummary,
  TopicRelationsSummary,
} from '@chatorama/chatalog-shared';
import { toPreview } from '../utilities';

function dedupeNotePreviews(arr: NotePreview[]): NotePreview[] {
  const seen = new Set<string>();
  const out: NotePreview[] = [];
  for (const n of arr) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

// GET /api/v1/subjects/:subjectId/relations-summary
export async function getSubjectRelationsSummary(req: Request, res: Response) {
  const { subjectId } = req.params;
  if (!subjectId) {
    return res.status(400).json({ message: 'subjectId is required' });
  }

  // 1) Notes that explicitly relate to this subject
  const projection = {
    title: 1,
    summary: 1,
    tags: 1,
    updatedAt: 1,
    relations: 1,
    subjectId: 1,
    topicId: 1,
  };

  const notes = await NoteModel.find(
    {
      'relations.targetType': 'subject',
      'relations.targetId': subjectId,
    },
    projection,
  ).lean();

  const relatedNotes = dedupeNotePreviews(notes.map(toPreview));

  // 2) Aggregate related topics from those notes
  const topicIdToCount = new Map<string, number>();
  for (const n of notes) {
    const tId = (n as any).topicId as string | undefined;
    if (!tId) continue;
    topicIdToCount.set(tId, (topicIdToCount.get(tId) ?? 0) + 1);
  }

  let relatedTopics: RelatedTopicSummary[] = [];
  if (topicIdToCount.size > 0) {
    const topicIds = Array.from(topicIdToCount.keys());
    const topicDocs = await TopicModel.find({ _id: { $in: topicIds } }).lean();

    relatedTopics = topicDocs.map((td: any) => ({
      topic: {
        id: String(td._id),
        name: td.name,
        subjectId: td.subjectId ?? '',
        slug: td.slug ?? '',
        createdAt:
          td.createdAt instanceof Date
            ? td.createdAt.toISOString()
            : td.createdAt,
        updatedAt:
          td.updatedAt instanceof Date
            ? td.updatedAt.toISOString()
            : td.updatedAt,
      },
      noteCount: topicIdToCount.get(String(td._id)) ?? 0,
    }));
  }

  const payload: SubjectRelationsSummary = {
    subjectId,
    relatedNotes,
    relatedTopics,
  };

  res.json(payload);
}

export async function getTopicRelationsSummary(req: Request, res: Response) {
  const { subjectId, topicId } = req.params;
  if (!topicId) {
    return res.status(400).json({ message: 'topicId is required' });
  }

  const projection = {
    title: 1,
    summary: 1,
    tags: 1,
    updatedAt: 1,
    relations: 1,
    subjectId: 1,
    topicId: 1,
  };

  // 1) Notes that explicitly relate to this topic
  const notes = await NoteModel.find(
    {
      'relations.targetType': 'topic',
      'relations.targetId': topicId,
    },
    projection,
  ).lean();

  const relatedNotes = dedupeNotePreviews(notes.map(toPreview));

  // 2) Aggregate “source” topics of those notes (excluding this topic)
  const topicIdToCount = new Map<string, number>();
  for (const n of notes) {
    const tId = (n as any).topicId as string | undefined;
    if (!tId || tId === topicId) continue; // skip this topic; it already has its main list
    topicIdToCount.set(tId, (topicIdToCount.get(tId) ?? 0) + 1);
  }

  let relatedTopics: RelatedTopicSummary[] = [];
  if (topicIdToCount.size > 0) {
    const otherTopicIds = Array.from(topicIdToCount.keys());
    const topicDocs = await TopicModel.find({ _id: { $in: otherTopicIds } }).lean();

    relatedTopics = topicDocs.map((td: any) => ({
      topic: {
        id: String(td._id),
        name: td.name,
        subjectId: td.subjectId ?? '',
        slug: td.slug ?? '',
        createdAt:
          td.createdAt instanceof Date
            ? td.createdAt.toISOString()
            : td.createdAt,
        updatedAt:
          td.updatedAt instanceof Date
            ? td.updatedAt.toISOString()
            : td.updatedAt,
      },
      noteCount: topicIdToCount.get(String(td._id)) ?? 0,
    }));
  }

  const payload: TopicRelationsSummary = {
    subjectId: subjectId ?? '',
    topicId,
    relatedNotes,
    relatedTopics,
  };

  res.json(payload);
}
