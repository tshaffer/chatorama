// Canonical shared types for Chatalog (MVP)

// Hierarchy
export interface Subject {
  id: string;
  name: string;
  slug: string;
  createdAt?: string; // ISO
  updatedAt?: string; // ISO
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
}

// -------- Note relations (generic) --------

export type NoteRelationTargetType = 'note' | 'topic' | 'subject';

export type NoteRelationKind =
  | 'also-about'      // generic association
  | 'see-also'        // cross-reference
  | 'supports'        // evidence / argument
  | 'contrasts-with'  // comparison / disagreement
  | 'warning'         // risk / negative effect
  | 'background';     // background reading

export interface NoteRelation {
  targetType: NoteRelationTargetType;
  targetId: string;      // id of note/topic/subject, depending on targetType
  kind: NoteRelationKind;
}

// -------- Recipes --------

export type RecipeIngredient = {
  raw: string;
  deleted?: boolean;
  name?: string;
  amount?: number;
  unit?: string;
  modifier?: string;
  notes?: string;
};

export type RecipeNutrition = {
  calories?: string | number;
  unsaturatedFatContent?: string | number;
  carbohydrateContent?: string | number;
  cholesterolContent?: string | number;
  fatContent?: string | number;
  fiberContent?: string | number;
  proteinContent?: string | number;
  saturatedFatContent?: string | number;
  sodiumContent?: string | number;
  sugarContent?: string | number;
  transFatContent?: string | number;
};

export type RecipeMeta = {
  sourceUrl: string;
  author?: string;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  yield?: string;
  description?: string;
  cuisine?: string;
  category?: string[];
  keywords?: string[];
  ratingValue?: number;
  ratingCount?: number;
  nutrition?: RecipeNutrition;
  ingredientsRaw?: string[];
  ingredientTokens?: string[];
  stepsRaw?: string[];
  ingredients?: RecipeIngredient[];
  ingredientsEditedRaw?: string[];
  ingredientsEdited?: RecipeIngredient[];
  search?: RecipeSearch;
};

export type RecipeSearch = {
  lastCookedAt?: string;
  cookedCount: number;
  avgCookedRating?: number;
  cookedNotesText?: string;
};

export type CookedEvent = {
  id: string;
  cookedAt: string; // ISO
  rating?: number; // 1..5
  notes?: string;
};

// shared Note type
export interface Note {
  id: string;
  subjectId?: string;
  topicId?: string;
  importBatchId?: string;

  title: string;
  slug: string;
  markdown: string;          // canonical content
  summary?: string;          // AI or manual
  tags: string[];
  status?: string;           // new status field

  // Linking (MVP: store ids; can grow later)
  links: string[];           // noteIds this note links to
  backlinks: string[];       // noteIds that link here

  docKind: 'note' | 'recipe';

  // Networked relationships (generic)
  relations?: NoteRelation[];

  recipe?: RecipeMeta;
  cookedHistory?: CookedEvent[];

  sources?: { url?: string; type?: 'chatworthy' | 'clip' | 'manual' }[];

  // Chatworthy provenance
  chatworthyNoteId?: string;
  chatworthyChatId?: string;
  chatworthyChatTitle?: string;
  chatworthyFileName?: string;
  chatworthyTurnIndex?: number;
  chatworthyTotalTurns?: number;
  chatId?: string;

  // Legacy/source metadata
  sourceType?: string;
  sourceChatId?: string;
  pdfAssetId?: string | null;
  pdfSummaryMarkdown?: string;
  derived?: {
    pdf?: {
      extractedText?: string;
      pageCount?: number;
      extractedAt?: string;
    };
  };

  createdAt: string;         // ISO
  updatedAt: string;         // ISO
  contentUpdatedAt?: string; // ISO
  importedAt?: string;       // ISO
}

// Lightweight list item for UIs
export interface NotePreview {
  id: string;
  title: string;
  summary?: string;
  status?: string;           // new status field
  tags: string[];
  updatedAt: string;         // ISO
  contentUpdatedAt?: string; // ISO

  importBatchId?: string;
  subjectId?: string;
  topicId?: string;
  createdAt?: string;
  importedAt?: string;
  sources?: { url?: string; type?: 'chatworthy' | 'clip' | 'manual' }[];
  chatworthyNoteId?: string;
  chatworthyChatId?: string;
  chatworthyChatTitle?: string;
  chatworthyFileName?: string;
  chatworthyTurnIndex?: number;
  chatworthyTotalTurns?: number;
  sourceType?: string;
  sourceChatId?: string;

  // Include relations for smarter UIs (optional; may or may not be populated)
  relations?: NoteRelation[];
}

export interface TopicNotesWithRelations {
  /** Notes actually in the current subject/topic */
  notes: NotePreview[];

  /** Notes pulled in via topic relations (targetType: 'topic') */
  relatedTopicNotes: NotePreview[];

  /** Notes pulled in via subject relations (targetType: 'subject') */
  relatedSubjectNotes: NotePreview[];

  /** Notes pulled in via direct note relations (targetType: 'note') */
  relatedDirectNotes: NotePreview[];
}

// -------- Assets --------

export type AssetType = 'image' | 'pdf';

export type Asset = {
  id: string;
  type: AssetType;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storage: { provider: 'local'; path: string };
  imageMeta?: { width: number; height: number };
  createdAt: string;
  updatedAt: string;
};

export type NoteAsset = {
  id: string;
  noteId: string;
  assetId: string;
  caption?: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteAssetWithAsset = NoteAsset & { asset: Asset };

// ADD near your Subject/Topic interfaces
export interface RenameSubjectRequest {
  name: string; // new name
}

export interface RenameTopicRequest {
  name: string; // new name
}

// packages/chatalog/shared/src/types.ts (or wherever you keep shared types)
export type ReorderNotesRequest = {
  noteIdsInOrder: string[];
};

// Add near other API payloads
export interface MoveNotesPayload {
  noteIds: string[];
  dest: { subjectId: string; topicId: string };
}

export interface MoveNotesResult {
  movedCount: number;
  // optional: for optimistic updates & cache surgery
  source?: { subjectId: string; topicId: string };
  dest: { subjectId: string; topicId: string; assignedOrders?: Record<string, number> };
}

export interface ImportBatch {
  id: string;
  createdAt: string; // ISO
  importedCount: number;
  remainingCount: number;
  sourceType?: string;
}

export interface MergeNotesRequest {
  topicId: string;
  primaryNoteId: string;
  noteIdsInOrder: string[];
  title?: string;
}

export interface MergeNotesResult {
  mergedNoteId: string;
  deletedNoteIds: string[];
}

// ---- Import duplicate detection ----
export type DuplicateStatus = 'none' | 'partial' | 'full';
export type TurnAction = 'useImported' | 'useExisting';
export type DuplicateDecision = 'keepAsNew' | 'replace';

export interface TurnConflict {
  turnIndex: number;
  fingerprintId: string;
  existingNoteId: string;
  existingSubjectId?: string;
  existingTopicId?: string;
  existingSubjectName?: string;
  existingTopicName?: string;
  existingNoteTitle?: string;
}

export interface CleanupNeededItem {
  existingNoteId: string;
  existingNoteTitle: string;
  existingSubjectName?: string;
  existingTopicName?: string;
}

export interface ApplyNoteImportCommand {
  importedNoteId: string;
  include: boolean;
  duplicateDecision?: DuplicateDecision;
  turnActions?: Record<number, TurnAction>;
}

export interface ApplyImportRequest {
  importBatchId?: string;
  rows: any[]; // legacy payload (per-note content)
  notes: ApplyNoteImportCommand[];
}

export interface ApplyImportResponse {
  cleanupNeeded: CleanupNeededItem[];
  created?: number;
  noteIds?: string[];
  importBatchId?: string;
}

// --- Subject-level relations summary ---

export interface RelatedTopicSummary {
  topic: Topic;
  noteCount: number;
}

export interface SubjectRelationsSummary {
  subjectId: string;
  /**
   * Notes anywhere whose relations include
   *   { targetType: 'subject', targetId: subjectId }
   */
  relatedNotes: NotePreview[];
  /**
   * Topics that appear in those notes (via note.topicId),
   * with a count of how many notes in each topic reference this subject.
   */
  relatedTopics: RelatedTopicSummary[];
}

export interface TopicRelationsSummary {
  subjectId: string;
  topicId: string;

  /**
   * Notes anywhere whose relations include
   *   { targetType: 'topic', targetId: topicId }
   */
  relatedNotes: NotePreview[];

  /**
   * Other topics that those notes live in (excluding this topic),
   * with a count of how many notes from each topic reference this topic.
   */
  relatedTopics: RelatedTopicSummary[];
}
