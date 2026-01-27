import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface NoteAssetDoc extends Document {
  _id: Types.ObjectId;
  noteId: string;
  assetId: Types.ObjectId;
  order: number;
  caption?: string;
  role?: 'viewer' | 'source' | 'other';
  sourceType?: string;
  mimeType?: string;
  filename?: string;
  storageKey?: string;
  sizeBytes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const NoteAssetSchema = new Schema<NoteAssetDoc>(
  {
    noteId: { type: String, required: true, index: true },
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    order: { type: Number, default: 0 },
    caption: { type: String },
    role: { type: String, enum: ['viewer', 'source', 'other'] },
    sourceType: { type: String },
    mimeType: { type: String },
    filename: { type: String },
    storageKey: { type: String },
    sizeBytes: { type: Number },
  },
  { timestamps: true }
);

NoteAssetSchema.index({ noteId: 1, assetId: 1 }, { unique: true });

applyToJSON(NoteAssetSchema);

export const NoteAssetModel = mongoose.model<NoteAssetDoc>('NoteAsset', NoteAssetSchema);
