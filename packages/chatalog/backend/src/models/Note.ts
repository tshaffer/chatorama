// models/Note.ts
import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';
import { NoteRelation } from '@chatorama/chatalog-shared';

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
  recipe?: {
    sourceUrl: string;
    author?: string;
    cookTimeMinutes?: number;
    totalTimeMinutes?: number;
    yield?: string;
    description?: string;
    cuisine?: string;
    category?: string[];
    keywords?: string[];
    ratingValue?: number;
    ratingCount?: number;
    nutrition?: Record<string, any>;
    ingredientsRaw?: string[];
    stepsRaw?: string[];
    ingredients?: {
      raw: string;
      name?: string;
      amount?: number;
      unit?: string;
      modifier?: string;
      notes?: string;
    }[];
  };
  cookedHistory?: { cookedAt: Date; rating?: number; notes?: string }[];

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

type RecipeIngredient = {
  raw: string;
  name?: string;
  amount?: number;
  unit?: string;
  modifier?: string;
  notes?: string;
};

const RecipeIngredientSchema = new Schema<RecipeIngredient>(
  {
    raw: { type: String, required: true },
    name: String,
    amount: Number,
    unit: String,
    modifier: String,
    notes: String,
  },
  { _id: false }
);

type RecipeMeta = {
  sourceUrl: string;
  author?: string;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  yield?: string;
  description?: string;
  cuisine?: string;
  category?: string[];
  keywords?: string[];
  ratingValue?: number;
  ratingCount?: number;
  nutrition?: Record<string, any>;
  ingredientsRaw?: string[];
  stepsRaw?: string[];
  ingredients?: RecipeIngredient[];
};

const RecipeMetaSchema = new Schema<RecipeMeta>(
  {
    sourceUrl: { type: String, required: true },
    author: String,
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
  },
  { _id: false }
);

type CookedEvent = { cookedAt: Date; rating?: number; notes?: string };

const CookedEventSchema = new Schema<CookedEvent>(
  {
    cookedAt: { type: Date, required: true },
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
NoteSchema.index({ tags: 1 });
NoteSchema.index({ importBatchId: 1, updatedAt: -1 });
NoteSchema.index({ sourceType: 1, updatedAt: -1 });
NoteSchema.index({ chatworthyChatId: 1, updatedAt: -1 });
NoteSchema.index({ importBatchId: 1, createdAt: -1 });

// Recipe lookup / dedupe / search
NoteSchema.index({ 'recipe.sourceUrl': 1 }, { unique: true, sparse: true });
NoteSchema.index({ 'recipe.ingredients.name': 1 });

// Apply global JSON/Object transform: exposes `id`, removes `_id`/`__v`
applyToJSON(NoteSchema);

export const NoteModel = mongoose.model<NoteDoc>('Note', NoteSchema);
