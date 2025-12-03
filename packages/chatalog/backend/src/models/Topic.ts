// models/Topic.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';
import { slugifyStandard } from '@chatorama/chatalog-shared';

export interface TopicDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  subjectId?: string;
  slug?: string;
  order?: number;
  createdAt: Date;
  updatedAt: Date;

  $locals: { preserveSlug?: boolean };
}

const TopicSchema = new Schema<TopicDoc>(
  {
    name: { type: String, required: true, trim: true },
    subjectId: { type: String, index: true, trim: true },
    slug: { type: String, index: true, trim: true },
    // lower numbers appear earlier within a subject
    order: { type: Number, index: true },
  },
  { timestamps: true }
);

// Ensure a slug exists; regenerate on name change unless $locals.preserveSlug
TopicSchema.pre('validate', function (next) {
  // New docs: respect provided slug (deduped upstream). If missing, generate.
  if (this.isNew) {
    if (!this.slug || this.slug.trim() === '') {
      this.slug = slugifyStandard(this.name || '');
    }
  } else {
    // Existing docs: update slug only when name changes and preserveSlug is not set
    if (this.isModified('name') && !this.$locals?.preserveSlug) {
      this.slug = slugifyStandard(this.name || '');
    }
  }
  next();
});

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
