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

// shared Note type
export interface Note {
  id: string;
  subjectId?: string;
  topicId?: string;

  title: string;
  slug: string;
  markdown: string;          // canonical content
  summary?: string;          // AI or manual
  tags: string[];
  status?: string;           // new status field

  // Linking (MVP: store ids; can grow later)
  links: string[];           // noteIds this note links to
  backlinks: string[];       // noteIds that link here

  // Networked relationships (generic)
  relations?: NoteRelation[];

  sources?: { url?: string; type?: 'chatworthy' | 'clip' | 'manual' }[];

  chatworthyNoteId?: string;
  chatId?: string;

  createdAt: string;         // ISO
  updatedAt: string;         // ISO
}

// Lightweight list item for UIs
export interface NotePreview {
  id: string;
  title: string;
  summary?: string;
  status?: string;           // new status field
  tags: string[];
  updatedAt: string;         // ISO

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
