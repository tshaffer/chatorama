// models/Subject.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export interface SubjectDoc extends Document {
  _id: Types.ObjectId;
  name: string;
  slug?: string;
  createdAt: Date;
  updatedAt: Date;

  // used by controller to prevent slug regeneration on rename
  $locals: { preserveSlug?: boolean };
}

const SubjectSchema = new Schema<SubjectDoc>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, index: true, trim: true },
  },
  { timestamps: true }
);

// Ensure a slug exists; regenerate on name change unless $locals.preserveSlug
SubjectSchema.pre('validate', function (next) {
  if (!this.slug || this.slug.trim() === '') {
    this.slug = slugify(this.name || '');
  } else if (this.isModified('name') && !this.$locals?.preserveSlug) {
    this.slug = slugify(this.name || '');
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
