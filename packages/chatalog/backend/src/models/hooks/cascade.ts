import type { Types } from 'mongoose';
import { NoteModel } from '../Note';
import { TopicModel } from '../Topic';
import { AskConversationModel } from '../AskConversation';
import { NoteChangeSetModel } from '../NoteChangeSet';

// Records that belong to a topic but aren't notes
async function deleteTopicRecords(topicIds: string[]) {
  await AskConversationModel.deleteMany({ topicId: { $in: topicIds } });
  await NoteChangeSetModel.deleteMany({ topicId: { $in: topicIds } });
}

export async function deleteTopicCascade(topicId: Types.ObjectId | string) {
  await NoteModel.deleteMany({ topicId });
  await deleteTopicRecords([String(topicId)]);
  await TopicModel.deleteOne({ _id: topicId });
}

export async function deleteSubjectCascade(subjectId: Types.ObjectId | string) {
  const topics = await TopicModel.find({ subjectId }, { _id: 1 }).lean();
  const topicIds = topics.map(t => t._id);
  if (topicIds.length) {
    await NoteModel.deleteMany({ topicId: { $in: topicIds } });
    await deleteTopicRecords(topicIds.map(String));
    await TopicModel.deleteMany({ subjectId });
  }
}
