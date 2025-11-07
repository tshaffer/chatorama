// models/Note.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface NoteDoc extends Document {
  _id: Types.ObjectId;            // DB primary key (Mongo)
  // Outside of Mongo (API/FE), you'll expose `id` via toJSON transform.
  subjectId?: string;
  topicId?: string;
  title: string;
  slug: string;                   // pretty URL segment; required for now
  markdown: string;
  summary?: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  sources?: { url?: string; type?: 'chatworthy'|'clip'|'manual' }[];
  createdAt: Date;
  updatedAt: Date;
}

type Source = { url?: string; type?: 'chatworthy'|'clip'|'manual' };

const SourceSchema = new Schema<Source>(
  {
    url: String,
    type: { type: String, enum: ['chatworthy', 'clip', 'manual'] },
  },
  { _id: false }
);

const NoteSchema = new Schema<NoteDoc>(
  {
    subjectId: { type: String },
    topicId:   { type: String },
    title:     { type: String, required: true, default: 'Untitled' },
    slug:      { type: String, required: true, index: true },
    markdown:  { type: String, required: true, default: '' },
    summary:   { type: String },
    tags:      { type: [String], default: [] },
    links:     { type: [String], default: [] },
    backlinks: { type: [String], default: [] },
    sources:   { type: [SourceSchema], default: [] },
  },
  { timestamps: true }
);

// ---- Indexes ----
// Ensure each (topicId, slug) pair is unique. If you scope by subject instead,
// change the first key to subjectId. Partial filter keeps the index lean.
NoteSchema.index(
  { topicId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } }
);

// Optional: if you want fast search by title/markdown later
// NoteSchema.index({ title: 'text', markdown: 'text' });

// Apply global JSON/Object transform: exposes `id`, removes `_id`/`__v`
applyToJSON(NoteSchema);

export const NoteModel = mongoose.model<NoteDoc>('Note', NoteSchema);
