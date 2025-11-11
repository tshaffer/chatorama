import type { Types } from 'mongoose';
import { NoteModel } from '../Note';
import { TopicModel } from '../Topic';

export async function deleteTopicCascade(topicId: Types.ObjectId | string) {
  await NoteModel.deleteMany({ topicId });
  await TopicModel.deleteOne({ _id: topicId });
}

export async function deleteSubjectCascade(subjectId: Types.ObjectId | string) {
  const topics = await TopicModel.find({ subjectId }, { _id: 1 }).lean();
  const topicIds = topics.map(t => t._id);
  if (topicIds.length) {
    await NoteModel.deleteMany({ topicId: { $in: topicIds } });
    await TopicModel.deleteMany({ subjectId });
  }
}
