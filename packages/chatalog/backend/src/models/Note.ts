// models/Note.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export type NoteRelationTargetType = 'note' | 'topic' | 'subject';

export type NoteRelationKind =
  | 'also-about'
  | 'see-also'
  | 'supports'
  | 'contrasts-with'
  | 'warning'
  | 'background';

export interface NoteRelation {
  targetType: NoteRelationTargetType;
  targetId: string;
  kind: NoteRelationKind;
}

export interface NoteDoc extends Document {
  _id: Types.ObjectId;
  subjectId?: string;
  topicId?: string;
  title: string;
  slug: string;
  markdown: string;
  summary?: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  relations?: NoteRelation[];
  sources?: { url?: string; type?: 'chatworthy'|'clip'|'manual' }[];

  /** Chatworthy provenance */
  chatworthyNoteId?: string;
  chatworthyChatId?: string;
  chatworthyChatTitle?: string;
  chatworthyFileName?: string;
  chatworthyTurnIndex?: number;
  chatworthyTotalTurns?: number;

  order: number;
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

const RelationSchema = new Schema<NoteRelation>(
  {
    targetType: {
      type: String,
      enum: ['note', 'topic', 'subject'],
      required: true,
    },
    targetId: {
      type: String,
      required: true,
    },
    kind: {
      type: String,
      enum: ['also-about', 'see-also', 'supports', 'contrasts-with', 'warning', 'background'],
      required: true,
    },
  },
  { _id: false }
);

const NoteSchema = new Schema<NoteDoc>(
  {
    subjectId: { type: String },
    topicId:   { type: String, index: true },
    title:     { type: String, required: true, default: 'Untitled' },
    slug:      { type: String, required: true, index: true },
    markdown:  { type: String, required: true, default: '' },
    summary:   { type: String },
    tags:      { type: [String], default: [] },
    links:     { type: [String], default: [] },
    backlinks: { type: [String], default: [] },
    sources:   { type: [SourceSchema], default: [] },

    relations: { type: [RelationSchema], default: [] },

    // Chatworthy provenance
    chatworthyNoteId:     { type: String, index: true },
    chatworthyChatId:     { type: String, index: true },
    chatworthyChatTitle:  { type: String },
    chatworthyFileName:   { type: String },
    chatworthyTurnIndex:  { type: Number },
    chatworthyTotalTurns: { type: Number },

    order:     { type: Number, required: true, default: 0, index: true },
  },
  { timestamps: true }
);

// ---- Indexes ----
// Keep slugs unique per topic (or change to subjectId if you scope differently)
NoteSchema.index(
  { topicId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } }
);

// Fast stable sort when listing notes by topic
NoteSchema.index({ topicId: 1, order: 1, _id: 1 });

// Optional: fast lookup by Chatworthy noteId (useful for de-dupe / AI-state)
NoteSchema.index({ chatworthyNoteId: 1 });

// Optional: fast lookup by Chatworthy chat + turn
NoteSchema.index({ chatworthyChatId: 1, chatworthyTurnIndex: 1 });

// Apply global JSON/Object transform: exposes `id`, removes `_id`/`__v`
applyToJSON(NoteSchema);

export const NoteModel = mongoose.model<NoteDoc>('Note', NoteSchema);
