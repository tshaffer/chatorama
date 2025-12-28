import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface NoteAssetDoc extends Document {
  _id: Types.ObjectId;
  noteId: string;
  assetId: Types.ObjectId;
  caption?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NoteAssetSchema = new Schema<NoteAssetDoc>(
  {
    noteId: { type: String, required: true, index: true },
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    caption: { type: String },
  },
  { timestamps: true }
);

NoteAssetSchema.index({ noteId: 1, assetId: 1 }, { unique: true });

applyToJSON(NoteAssetSchema);

export const NoteAssetModel = mongoose.model<NoteAssetDoc>('NoteAsset', NoteAssetSchema);
