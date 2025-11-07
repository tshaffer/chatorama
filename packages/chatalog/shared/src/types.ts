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

// Notes (MVP)
export interface Note {
  id: string;
  subjectId?: string;
  topicId?: string;

  title: string;
  slug: string;
  markdown: string;          // canonical content
  summary?: string;          // AI or manual
  tags: string[];

  // Linking (MVP: store ids; can grow later)
  links: string[];           // noteIds this note links to
  backlinks: string[];       // noteIds that link here

  // Provenance (optional for now)
  sources?: { url?: string; type?: 'chatworthy'|'clip'|'manual' }[];

  createdAt: string;         // ISO
  updatedAt: string;         // ISO
}

// Lightweight list item for UIs
export interface NotePreview {
  id: string;
  title: string;
  summary?: string;
  tags: string[];
  updatedAt: string;         // ISO
}
