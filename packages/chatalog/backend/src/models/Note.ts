// models/Note.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';
import { NoteRelation, RecipeIngredient, RecipeMeta, CookedEvent } from '@chatorama/chatalog-shared';

export const NOTE_STATUS_VALUES = ['completed'] as const;
const MAX_GOOGLE_DOC_TEXT_CHARS = 250_000;

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
  sources?: {
    url?: string;
    type?: 'chatworthy' | 'clip' | 'manual' | 'googleDoc';
    driveFileId?: string;
    driveUrl?: string;
    importedAt?: Date;
    driveModifiedTimeAtImport?: Date;
    driveNameAtImport?: string;
  }[];
  docKind: 'note' | 'recipe';
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
  pdfAssetId?: string | null;
  pdfSummaryMarkdown?: string;
  derived?: {
    pdf?: {
      extractedText?: string;
      pageCount?: number;
      extractedAt?: Date;
    };
    googleDoc?: {
      textPlain?: string;
      textHash?: string;
      textChars?: number;
      exportedAt?: Date;
    };
  };

  importBatchId?: string;
  importedAt?: Date;

  order: number;
  createdAt: Date;
  updatedAt: Date;
  contentUpdatedAt?: Date;
}

type Source = {
  url?: string;
  type?: 'chatworthy' | 'clip' | 'manual' | 'googleDoc';
  driveFileId?: string;
  driveUrl?: string;
  importedAt?: Date;
  driveModifiedTimeAtImport?: Date;
  driveNameAtImport?: string;
};

const SourceSchema = new Schema<Source>(
  {
    url: String,
    type: { type: String, enum: ['chatworthy', 'clip', 'manual', 'googleDoc'] },
    driveFileId: String,
    driveUrl: String,
    importedAt: Date,
    driveModifiedTimeAtImport: Date,
    driveNameAtImport: String,
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

const RecipeSearchSchema = new Schema(
  {
    lastCookedAt: { type: String },
    cookedCount: { type: Number, default: 0 },
    avgCookedRating: { type: Number },
    cookedNotesText: { type: String },
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
    ingredientTokens: { type: [String], default: [] },
    ingredients: { type: [RecipeIngredientSchema], default: [] },
    ingredientsEditedRaw: { type: [String], default: undefined },
    ingredientsEdited: { type: [RecipeIngredientSchema], default: undefined },
    search: { type: RecipeSearchSchema, default: () => ({ cookedCount: 0 }) },
  },
  { _id: false }
);

const CookedEventSchema = new Schema<CookedEvent>(
  {
    id: { type: String, required: true },
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
    markdown:  { type: String, required: false, default: '' },
    summary:   { type: String },
    status:    { type: String, enum: NOTE_STATUS_VALUES },
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

    docKind: { type: String, enum: ['note', 'recipe'], index: true },

    // Chatworthy provenance
    chatworthyNoteId:     { type: String },
    chatworthyChatId:     { type: String, index: true },
    chatworthyChatTitle:  { type: String },
    chatworthyFileName:   { type: String },
    chatworthyTurnIndex:  { type: Number },
    chatworthyTotalTurns: { type: Number },

    sourceType: { type: String },
    sourceChatId: { type: String },
    pdfAssetId: { type: String, default: null, index: true },
    pdfSummaryMarkdown: { type: String, default: '' },
    derived: {
      pdf: {
        extractedText: { type: String, default: '' },
        pageCount: { type: Number },
        extractedAt: { type: Date },
      },
      googleDoc: {
        textPlain: { type: String, default: '', maxlength: MAX_GOOGLE_DOC_TEXT_CHARS },
        textHash: { type: String },
        textChars: { type: Number },
        exportedAt: { type: Date },
      },
    },

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

// Full-text search (v4): title highest, tags medium, markdown lowest.
// To rebuild locally:
// - mongosh: db.notes.dropIndex('notes_text_search_v3')
// - mongosh: db.notes.createIndex({ title: 'text', tags: 'text', markdown: 'text' }, { name: 'notes_text_search_v4', weights: { title: 10, tags: 3, markdown: 1 }, default_language: 'english' })
NoteSchema.index(
  {
    title: 'text',
    tags: 'text',
    markdown: 'text',
    pdfSummaryMarkdown: 'text',
    'derived.pdf.extractedText': 'text',
    'derived.googleDoc.textPlain': 'text',
    'recipe.search.cookedNotesText': 'text',
  },
  {
    name: 'notes_text_search_v4',
    weights: {
      title: 10,
      tags: 3,
      pdfSummaryMarkdown: 2,
      'derived.pdf.extractedText': 1,
      'derived.googleDoc.textPlain': 1,
      markdown: 1,
      'recipe.search.cookedNotesText': 2,
    },
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
NoteSchema.index({ 'recipe.ingredientTokens': 1 });
NoteSchema.index({ 'recipe.cuisine': 1 });
NoteSchema.index({ 'recipe.category': 1 });
NoteSchema.index({ 'recipe.keywords': 1 });
NoteSchema.index({ 'recipe.prepTimeMinutes': 1 });
NoteSchema.index({ 'recipe.cookTimeMinutes': 1 });
NoteSchema.index({ 'recipe.totalTimeMinutes': 1 });

const CONTENT_PATH_PREFIXES = [
  'title',
  'markdown',
  'summary',
  'status',
  'tags',
  'recipe',
  'cookedHistory',
  'pdfAssetId',
  'pdfSummaryMarkdown',
  'derived',
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
  doc.docKind = doc.recipe != null ? 'recipe' : 'note';
  return next();
});

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

function syncDocKindInUpdate(this: any) {
  const update = this.getUpdate?.() ?? {};
  const $set = update.$set ?? {};
  const $unset = update.$unset ?? {};

  const setKeys = Object.keys($set);

  const recipeEmbeddingTouched =
    'recipeEmbedding' in $set ||
    'recipeEmbedding' in update;

  const recipeFieldTouched =
    'recipe' in $set ||
    setKeys.some((k) => k === 'recipe' || k.startsWith('recipe.')) ||
    'recipe' in update;

  const recipeUnset =
    'recipe' in $unset ||
    'recipeEmbedding' in $unset;

  if (recipeEmbeddingTouched) {
    $set.docKind = 'recipe';
    update.$set = $set;
  } else if (recipeFieldTouched) {
    const recipeValue = 'recipe' in $set ? $set.recipe : (update as any).recipe;
    $set.docKind = recipeValue == null ? 'note' : 'recipe';
    update.$set = $set;
  } else if (recipeUnset) {
    $set.docKind = 'note';
    update.$set = $set;
  }

  this.setUpdate?.(update);
}

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

NoteSchema.pre('findOneAndUpdate', syncDocKindInUpdate);
NoteSchema.pre('updateOne', syncDocKindInUpdate);
NoteSchema.pre('updateMany', syncDocKindInUpdate);

NoteSchema.pre('findOneAndUpdate', bumpContentUpdatedAtInUpdate);
NoteSchema.pre('updateOne', bumpContentUpdatedAtInUpdate);
NoteSchema.pre('updateMany', bumpContentUpdatedAtInUpdate);

// Apply global JSON/Object transform: exposes `id`, removes `_id`/`__v`
applyToJSON(NoteSchema);

export const NoteModel = mongoose.model<NoteDoc>('Note', NoteSchema);
