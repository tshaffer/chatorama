// models/Note.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';
import { NoteRelation, RecipeIngredient, RecipeMeta, CookedEvent } from '@chatorama/chatalog-shared';

export interface NoteDoc extends Document {
  _id: Types.ObjectId;
  subjectId?: string;
  topicId?: string;
  title: string;
  slug: string;
  markdown: string;
  summary?: string;
  status?: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  relations?: NoteRelation[];
  sources?: { url?: string; type?: 'chatworthy'|'clip'|'manual' }[];
  recipe?: RecipeMeta;
  cookedHistory?: CookedEvent[];

  // --- Semantic search / embeddings ---
  embedding?: number[];
  embeddingModel?: string;
  embeddingTextHash?: string;
  embeddingUpdatedAt?: Date;
  recipeEmbedding?: number[];
  recipeEmbeddingModel?: string;
  recipeEmbeddingTextHash?: string;
  recipeEmbeddingUpdatedAt?: Date;

  /** Chatworthy provenance */
  chatworthyNoteId?: string;
  chatworthyChatId?: string;
  chatworthyChatTitle?: string;
  chatworthyFileName?: string;
  chatworthyTurnIndex?: number;
  chatworthyTotalTurns?: number;

  // source metadata
  sourceType?: string;
  sourceChatId?: string;

  importBatchId?: string;
  importedAt?: Date;

  order: number;
  createdAt: Date;
  updatedAt: Date;
  contentUpdatedAt?: Date;
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

const RecipeIngredientSchema = new Schema<RecipeIngredient>(
  {
    raw: { type: String, required: true },
    deleted: { type: Boolean, default: false },
    name: String,
    amount: Number,
    unit: String,
    modifier: String,
    notes: String,
  },
  { _id: false }
);

const RecipeMetaSchema = new Schema<RecipeMeta>(
  {
    sourceUrl: { type: String, required: true },
    author: String,
    prepTimeMinutes: Number,
    cookTimeMinutes: Number,
    totalTimeMinutes: Number,
    yield: String,
    description: String,
    cuisine: String,
    category: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    ratingValue: Number,
    ratingCount: Number,
    nutrition: { type: Schema.Types.Mixed },
    ingredientsRaw: { type: [String], default: [] },
    stepsRaw: { type: [String], default: [] },
    ingredients: { type: [RecipeIngredientSchema], default: [] },
    ingredientsEditedRaw: { type: [String], default: undefined },
    ingredientsEdited: { type: [RecipeIngredientSchema], default: undefined },
  },
  { _id: false }
);

const CookedEventSchema = new Schema<CookedEvent>(
  {
    cookedAt: { type: String, required: true },
    rating: Number,
    notes: String,
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
    status:    { type: String },
    tags:      { type: [String], default: [] },
    links:     { type: [String], default: [] },
    backlinks: { type: [String], default: [] },
    sources:   { type: [SourceSchema], default: [] },

    relations: { type: [RelationSchema], default: [] },
    recipe: { type: RecipeMetaSchema, required: false },
    cookedHistory: { type: [CookedEventSchema], default: [] },

    // --- Semantic search / embeddings ---
    // NOTE: Atlas Search vector index is created in Atlas UI (not a MongoDB index).
    embedding: { type: [Number], required: false },
    embeddingModel: { type: String },
    embeddingTextHash: { type: String, index: true },
    embeddingUpdatedAt: { type: Date },
    recipeEmbedding: { type: [Number], required: false },
    recipeEmbeddingModel: { type: String },
    recipeEmbeddingTextHash: { type: String, index: true },
    recipeEmbeddingUpdatedAt: { type: Date },

    // Chatworthy provenance
    chatworthyNoteId:     { type: String, index: true },
    chatworthyChatId:     { type: String, index: true },
    chatworthyChatTitle:  { type: String },
    chatworthyFileName:   { type: String },
    chatworthyTurnIndex:  { type: Number },
    chatworthyTotalTurns: { type: Number },

    sourceType: { type: String },
    sourceChatId: { type: String },

    importBatchId: { type: String, index: true },
    importedAt: { type: Date, default: Date.now },
    contentUpdatedAt: { type: Date, index: true },

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

// Full-text search (v1): title weighted higher than markdown
NoteSchema.index(
  { title: 'text', markdown: 'text' },
  {
    name: 'notes_text_search_v1',
    weights: { title: 10, markdown: 1 },
    default_language: 'english',
  }
);

// Fast stable sort when listing notes by topic
NoteSchema.index({ topicId: 1, order: 1, _id: 1 });

// Optional: fast lookup by Chatworthy noteId (useful for de-dupe / AI-state)
NoteSchema.index({ chatworthyNoteId: 1 });

// Optional: fast lookup by Chatworthy chat + turn
NoteSchema.index({ chatworthyChatId: 1, chatworthyTurnIndex: 1 });

// Search filters
NoteSchema.index({ status: 1, updatedAt: -1 });
NoteSchema.index({ status: 1, contentUpdatedAt: -1 });
NoteSchema.index({ topicId: 1, contentUpdatedAt: -1 });
NoteSchema.index({ tags: 1 });
/**
 * Embedding maintenance helpers:
 * - Find notes that need embeddings (missing or stale) quickly.
 */
NoteSchema.index({ embeddingUpdatedAt: -1 });
NoteSchema.index({ embeddingTextHash: 1, updatedAt: -1 });
NoteSchema.index({ recipeEmbeddingUpdatedAt: -1 });
NoteSchema.index({ recipeEmbeddingTextHash: 1, updatedAt: -1 });
NoteSchema.index({ importBatchId: 1, updatedAt: -1 });
NoteSchema.index({ sourceType: 1, updatedAt: -1 });
NoteSchema.index({ chatworthyChatId: 1, updatedAt: -1 });
NoteSchema.index({ importBatchId: 1, createdAt: -1 });

// Recipe lookup / dedupe / search
NoteSchema.index({ 'recipe.sourceUrl': 1 }, { unique: true, sparse: true });
NoteSchema.index({ 'recipe.ingredients.name': 1 });

const CONTENT_PATH_PREFIXES = [
  'title',
  'markdown',
  'summary',
  'status',
  'tags',
  'recipe',
  'cookedHistory',
];

const SYSTEM_ONLY_PREFIXES = [
  'embedding',
  'embeddingUpdatedAt',
  'embeddingTextHash',
  'recipeEmbedding',
  'recipeEmbeddingUpdatedAt',
  'recipeEmbeddingTextHash',
];

function shouldBumpContentUpdatedAt(modifiedPaths: string[]): boolean {
  if (!modifiedPaths || modifiedPaths.length === 0) return false;

  const hasContentChange = modifiedPaths.some((p) =>
    CONTENT_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}.`)),
  );

  if (hasContentChange) return true;

  const hasSystemOnly = modifiedPaths.every((p) =>
    SYSTEM_ONLY_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}.`)),
  );
  if (hasSystemOnly) return false;

  return false;
}

NoteSchema.pre('save', function (next) {
  const doc = this as any;

  if (doc.isNew) {
    doc.contentUpdatedAt = doc.contentUpdatedAt ?? doc.createdAt ?? new Date();
    return next();
  }

  const modified = doc.modifiedPaths?.() ?? [];
  if (shouldBumpContentUpdatedAt(modified)) {
    doc.contentUpdatedAt = new Date();
  }

  return next();
});

function bumpContentUpdatedAtInUpdate(this: any) {
  const update = this.getUpdate?.() ?? {};
  const $set = update.$set ?? {};
  const $unset = update.$unset ?? {};
  const $push = update.$push ?? {};
  const $pull = update.$pull ?? {};
  const $addToSet = update.$addToSet ?? {};
  const $inc = update.$inc ?? {};

  const touched = new Set<string>();

  const collectKeys = (obj: any) => {
    if (!obj) return;
    for (const k of Object.keys(obj)) touched.add(k);
  };

  collectKeys(update);
  collectKeys($set);
  collectKeys($unset);
  collectKeys($push);
  collectKeys($pull);
  collectKeys($addToSet);
  collectKeys($inc);

  const touchedArr = Array.from(touched);

  if (shouldBumpContentUpdatedAt(touchedArr)) {
    update.$set = { ...(update.$set ?? {}), contentUpdatedAt: new Date() };
    this.setUpdate(update);
  }
}

NoteSchema.pre('findOneAndUpdate', bumpContentUpdatedAtInUpdate);
NoteSchema.pre('updateOne', bumpContentUpdatedAtInUpdate);
NoteSchema.pre('updateMany', bumpContentUpdatedAtInUpdate);

// Apply global JSON/Object transform: exposes `id`, removes `_id`/`__v`
applyToJSON(NoteSchema);

export const NoteModel = mongoose.model<NoteDoc>('Note', NoteSchema);
