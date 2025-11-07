// models/Subject.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface SubjectDoc extends Document {
  _id: Types.ObjectId;   // Mongo-only; API/FE will see `id` from toJSON
  name: string;
  slug?: string;         // pretty URL segment; optional
  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema = new Schema<SubjectDoc>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, index: true, trim: true },
  },
  { timestamps: true }
);

// Unique slug across all subjects, but only when slug is defined
SubjectSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } }
);

// Expose `id`, remove `_id`/`__v`
applyToJSON(SubjectSchema);

export const SubjectModel = mongoose.model<SubjectDoc>('Subject', SubjectSchema);
