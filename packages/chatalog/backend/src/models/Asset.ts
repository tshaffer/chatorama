import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export type AssetType = 'image';

export interface AssetDoc extends Document {
  _id: Types.ObjectId;
  type: AssetType;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storage: { provider: 'local'; path: string };
  imageMeta?: { width: number; height: number };
  createdAt: Date;
  updatedAt: Date;
}

const AssetSchema = new Schema<AssetDoc>(
  {
    type: { type: String, enum: ['image'], required: true },
    mimeType: { type: String, required: true },
    byteSize: { type: Number, required: true },
    sha256: { type: String, required: true, unique: true, index: true },
    storage: {
      provider: { type: String, enum: ['local'], required: true },
      path: { type: String, required: true },
    },
    imageMeta: {
      width: { type: Number },
      height: { type: Number },
    },
  },
  { timestamps: true }
);

applyToJSON(AssetSchema);

export const AssetModel = mongoose.model<AssetDoc>('Asset', AssetSchema);
