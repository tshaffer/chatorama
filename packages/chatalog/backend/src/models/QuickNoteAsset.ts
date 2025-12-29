import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface QuickNoteAssetDoc extends Document {
  _id: Types.ObjectId;
  quickNoteId: Types.ObjectId;
  assetId: Types.ObjectId;
  order: number;
  caption?: string;
  createdAt: Date;
  updatedAt: Date;
}

const QuickNoteAssetSchema = new Schema<QuickNoteAssetDoc>(
  {
    quickNoteId: { type: Schema.Types.ObjectId, ref: 'QuickNote', required: true, index: true },
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    order: { type: Number, default: 0 },
    caption: { type: String },
  },
  { timestamps: true }
);

QuickNoteAssetSchema.index({ quickNoteId: 1, assetId: 1 }, { unique: true });

applyToJSON(QuickNoteAssetSchema);

export const QuickNoteAssetModel = mongoose.model<QuickNoteAssetDoc>(
  'QuickNoteAsset',
  QuickNoteAssetSchema,
);
