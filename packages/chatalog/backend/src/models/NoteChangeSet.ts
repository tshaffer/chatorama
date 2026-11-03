import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

// A set of note changes applied from an Ask Claude change plan, with enough
// of the previous state to undo it later.
export interface NoteChangeSnapshot {
  noteId: string;
  title: string;
  slug: string;
  markdown: string;
  archived: boolean;
  archivedAt?: Date;
  consolidatedIntoNoteId?: string;
  // What the change set wrote, to detect edits made since
  afterTitle: string;
  afterMarkdown: string;
  afterArchived: boolean;
}

export interface NoteChangeSetDoc extends Document {
  _id: Types.ObjectId;
  // The topic it was made from; absent for changes made across topics
  topicId?: string;
  topicIds: string[];
  summary: string;
  sourceNoteIds: string[];
  createdNoteIds: string[];
  before: NoteChangeSnapshot[];
  undoneAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SnapshotSchema = new Schema<NoteChangeSnapshot>(
  {
    noteId: { type: String, required: true },
    title: { type: String, default: '' },
    slug: { type: String, default: '' },
    markdown: { type: String, default: '' },
    archived: { type: Boolean, default: false },
    archivedAt: { type: Date },
    consolidatedIntoNoteId: { type: String },
    afterTitle: { type: String, default: '' },
    afterMarkdown: { type: String, default: '' },
    afterArchived: { type: Boolean, default: false },
  },
  { _id: false },
);

const NoteChangeSetSchema = new Schema<NoteChangeSetDoc>(
  {
    topicId: { type: String, index: true },
    topicIds: { type: [String], default: [], index: true },
    summary: { type: String, default: '' },
    sourceNoteIds: { type: [String], default: [] },
    createdNoteIds: { type: [String], default: [] },
    before: { type: [SnapshotSchema], default: [] },
    undoneAt: { type: Date },
  },
  { timestamps: true },
);

applyToJSON(NoteChangeSetSchema);

export const NoteChangeSetModel = mongoose.model<NoteChangeSetDoc>('NoteChangeSet', NoteChangeSetSchema);
