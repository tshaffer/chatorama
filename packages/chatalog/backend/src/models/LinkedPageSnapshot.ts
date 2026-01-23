// models/LinkedPageSnapshot.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export const LINKED_SNAPSHOT_VECTOR_INDEX_NAME = 'linked_snapshot_vector_index';
export const LINKED_SNAPSHOT_VECTOR_PATH = 'embedding';
// Atlas vector index (manual):
// - Collection: linkedpagesnapshots
// - Field path: embedding
// - Dimensions: must match the embedding model output

export interface LinkedPageSnapshotDoc extends Document {
  _id: Types.ObjectId;
  noteId: Types.ObjectId;
  url: string;
  title?: string;
  excerpt?: string;
  extractedText: string;
  contentHash: string;
  fetchedAt: Date;
  status: 'ok' | 'error' | 'blocked' | 'timeout';
  error?: string;
  textChars: number;

  embedding?: number[];
  embeddingModel?: string;
  embeddingTextHash?: string;
  embeddingUpdatedAt?: Date;
}

const LinkedPageSnapshotSchema = new Schema<LinkedPageSnapshotDoc>(
  {
    noteId: { type: Schema.Types.ObjectId, ref: 'Note', required: true, index: true },
    url: { type: String, required: true },
    title: { type: String },
    excerpt: { type: String },
    extractedText: { type: String, required: true },
    contentHash: { type: String, required: true },
    fetchedAt: { type: Date, required: true },
    status: { type: String, enum: ['ok', 'error', 'blocked', 'timeout'], required: true },
    error: { type: String },
    textChars: { type: Number, required: true },

    // --- Semantic search / embeddings ---
    // NOTE: Atlas Search vector index is created in Atlas UI (not a MongoDB index).
    embedding: { type: [Number], required: false },
    embeddingModel: { type: String },
    embeddingTextHash: { type: String, index: true },
    embeddingUpdatedAt: { type: Date },
  },
  { timestamps: false }
);

LinkedPageSnapshotSchema.index({ noteId: 1, url: 1 }, { unique: true });

LinkedPageSnapshotSchema.index(
  {
    title: 'text',
    excerpt: 'text',
    extractedText: 'text',
  },
  {
    name: 'linked_snapshot_text_v1',
    weights: {
      title: 5,
      excerpt: 2,
      extractedText: 1,
    },
    default_language: 'english',
  }
);

applyToJSON(LinkedPageSnapshotSchema);

export const LinkedPageSnapshotModel = mongoose.model<LinkedPageSnapshotDoc>(
  'LinkedPageSnapshot',
  LinkedPageSnapshotSchema
);
