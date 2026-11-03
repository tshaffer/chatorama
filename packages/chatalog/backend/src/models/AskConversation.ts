import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

// An Ask Claude conversation, saved after each answer so it can be continued later.
export interface AskConversationTurnDoc {
  question: string;
  answer: string;
  stopped?: boolean;
  sources: { id: string; title: string; subjectId?: string; topicId?: string; location?: string }[];
  activity?: string[];
  savedNoteId?: string;
  answeredAt: Date;
}

export interface AskConversationDoc extends Document {
  _id: Types.ObjectId;
  // Absent for conversations across all notes
  topicId?: string;
  title: string;
  noteIds: string[];
  turns: AskConversationTurnDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const SourceSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: '' },
    subjectId: { type: String },
    topicId: { type: String },
    location: { type: String },
  },
  { _id: false },
);

const TurnSchema = new Schema<AskConversationTurnDoc>(
  {
    question: { type: String, default: '' },
    answer: { type: String, default: '' },
    stopped: { type: Boolean },
    sources: { type: [SourceSchema], default: [] },
    activity: { type: [String], default: undefined },
    savedNoteId: { type: String },
    answeredAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const AskConversationSchema = new Schema<AskConversationDoc>(
  {
    topicId: { type: String, index: true },
    title: { type: String, default: '' },
    noteIds: { type: [String], default: [] },
    turns: { type: [TurnSchema], default: [] },
  },
  { timestamps: true },
);

applyToJSON(AskConversationSchema);

export const AskConversationModel = mongoose.model<AskConversationDoc>(
  'AskConversation',
  AskConversationSchema,
);
