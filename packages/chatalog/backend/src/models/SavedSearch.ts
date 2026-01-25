import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface SavedSearchDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  query: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const SavedSearchSchema = new Schema<SavedSearchDoc>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    query: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);


applyToJSON(SavedSearchSchema);

export const SavedSearchModel = mongoose.model<SavedSearchDoc>(
  'SavedSearch',
  SavedSearchSchema
);
