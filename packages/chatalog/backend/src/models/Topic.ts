// models/Topic.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface TopicDoc extends Document {
  _id: Types.ObjectId;   // Mongo-only; API/FE will see `id`
  name: string;
  subjectId?: string;    // string form of ObjectId; FE/DTO-friendly
  slug?: string;         // pretty URL segment; optional
  createdAt: Date;
  updatedAt: Date;
}

const TopicSchema = new Schema<TopicDoc>(
  {
    name: { type: String, required: true, trim: true },
    subjectId: { type: String, index: true, trim: true },
    slug: { type: String, index: true, trim: true },
  },
  { timestamps: true }
);

// Prevent duplicate topic names under the same subject
TopicSchema.index({ subjectId: 1, name: 1 }, { unique: true });

// Ensure slug is unique within a subject (allows same slug under different subjects)
TopicSchema.index(
  { subjectId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } }
);

// Expose `id`, remove `_id`/`__v`
applyToJSON(TopicSchema);

export const TopicModel = mongoose.model<TopicDoc>('Topic', TopicSchema);
