import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface ImportBatchDoc extends Document {
  _id: Types.ObjectId;
  createdAt: Date;
  importedCount: number;
  remainingCount: number;
  sourceType?: string;
}

const ImportBatchSchema = new Schema<ImportBatchDoc>(
  {
    createdAt: { type: Date, default: Date.now },
    importedCount: { type: Number, required: true },
    remainingCount: { type: Number, required: true },
    sourceType: { type: String },
  },
  { timestamps: false },
);

applyToJSON(ImportBatchSchema);

export const ImportBatchModel = mongoose.model<ImportBatchDoc>('ImportBatch', ImportBatchSchema);
