// models/Subject.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';
import { slugifyStandard } from '@chatorama/chatalog-shared';

export interface SubjectDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  slug?: string;
  order?: number;
  createdAt: Date;
  updatedAt: Date;

  // used by controller to prevent slug regeneration on rename
  $locals: { preserveSlug?: boolean };
}

const SubjectSchema = new Schema<SubjectDoc>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, trim: true },
    // lower numbers appear earlier in UI; optional for legacy rows
    order: { type: Number, index: true },
  },
  { timestamps: true }
);

// Ensure a slug exists; regenerate on name change unless $locals.preserveSlug
SubjectSchema.pre('validate', function (next) {
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

// Unique slug across all subjects, but only when slug is defined
SubjectSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } }
);

// Expose `id`, remove `_id`/`__v`
applyToJSON(SubjectSchema);

export const SubjectModel = mongoose.model<SubjectDoc>('Subject', SubjectSchema);
