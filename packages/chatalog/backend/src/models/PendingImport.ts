import mongoose, { Schema, Document, Types } from 'mongoose';

// A chat export sent from Chatworthy, waiting for Chatalog to open it for
// review. Nothing here is a note yet, so it's removed automatically.
export interface PendingImportDoc extends Document {
  _id: Types.ObjectId;
  fileName: string;
  markdown: string;
  createdAt: Date;
}

const PendingImportSchema = new Schema<PendingImportDoc>({
  fileName: { type: String, required: true },
  markdown: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 },
});

export const PendingImportModel = mongoose.model<PendingImportDoc>('PendingImport', PendingImportSchema);
