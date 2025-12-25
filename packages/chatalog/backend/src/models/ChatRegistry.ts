import mongoose, { Schema, Document } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export type ChatRegistryStatus = 'UNREVIEWED' | 'REVIEWED' | 'ARCHIVED';

export interface ChatRegistryDoc extends Document {
  chatId: string;
  chatTitle?: string;
  projectName?: string;
  subject?: string;
  topic?: string;
  pageUrl?: string;
  lastExportedAt?: Date;
  status: ChatRegistryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ChatRegistrySchema = new Schema<ChatRegistryDoc>(
  {
    chatId: { type: String, required: true, unique: true, index: true },
    chatTitle: { type: String },
    projectName: { type: String },
    subject: { type: String },
    topic: { type: String },
    pageUrl: { type: String },
    lastExportedAt: { type: Date },
    status: { type: String, enum: ['UNREVIEWED', 'REVIEWED', 'ARCHIVED'], default: 'UNREVIEWED' },
  },
  { timestamps: true }
);

applyToJSON(ChatRegistrySchema);

export const ChatRegistryModel = mongoose.model<ChatRegistryDoc>('ChatRegistry', ChatRegistrySchema);

export default ChatRegistryModel;
