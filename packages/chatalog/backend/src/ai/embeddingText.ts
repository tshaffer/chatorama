import crypto from 'crypto';

/**
 * Options to control what gets included in the embedding text.
 * Keep defaults conservative and stable to reduce unnecessary re-embeddings.
 */
type BuildEmbeddingTextOptions = {
  includeMarkdown?: boolean;   // default true
  maxMarkdownChars?: number;   // default 8000
  includeSummary?: boolean;    // default true
  includeTags?: boolean;       // default true
  includeRecipe?: boolean;     // default true (lightweight recipe hints)
};

/**
 * Minimal shape we need from your Note model.
 * (Avoid importing NoteDoc from mongoose models into utilities to keep layers clean.)
 */
export type NoteEmbeddingSource = {
  title?: string;
  summary?: string;
  markdown?: string;
  tags?: string[];
  sourceType?: string;
  sources?: { type?: string }[];
  derived?: { googleDoc?: { textPlain?: string } };
  recipe?: {
    sourceUrl?: string;
    author?: string;
    description?: string;
    cuisine?: string;
    category?: string[];
    keywords?: string[];
    ingredientsRaw?: string[];
    stepsRaw?: string[];
    ingredients?: { raw: string; name?: string }[];
  };
};

function normalizeForEmbedding(s: string): string {
  return (s ?? '')
    .replace(/\r\n/g, '\n')         // CRLF -> LF
    .replace(/[ \t]+\n/g, '\n')     // trim trailing spaces/tabs per line
    .replace(/\n{3,}/g, '\n\n')     // collapse huge blank gaps
    .trim();
}

function truncate(s: string, maxChars: number): string {
  if (!s) return '';
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
}

/**
 * Build a stable, reasonably informative text representation of a Note.
 * This is what you embed and later compare via hash to see if it changed.
 */
function buildEmbeddingText(
  note: NoteEmbeddingSource,
  opts: BuildEmbeddingTextOptions = {}
): string {
  const {
    includeMarkdown = true,
    maxMarkdownChars = 8000,
    includeSummary = true,
    includeTags = true,
    includeRecipe = true,
  } = opts;

  const parts: string[] = [];

  const title = normalizeForEmbedding(note.title ?? '');
  if (title) parts.push(`Title: ${title}`);

  if (includeSummary) {
    const summary = normalizeForEmbedding(note.summary ?? '');
    if (summary) parts.push(`Summary: ${summary}`);
  }

  if (includeTags) {
    const tags = (note.tags ?? []).map((t) => normalizeForEmbedding(String(t))).filter(Boolean);
    if (tags.length) parts.push(`Tags: ${tags.join(', ')}`);
  }

  if (includeRecipe && note.recipe) {
    const r = note.recipe;

    // Keep this light; the recipe markdown (if present) is usually in note.markdown anyway.
    const recipeBits: string[] = [];

    if (r.cuisine) recipeBits.push(`Cuisine: ${normalizeForEmbedding(r.cuisine)}`);
    if (r.category?.length) recipeBits.push(`Category: ${r.category.map(normalizeForEmbedding).filter(Boolean).join(', ')}`);
    if (r.keywords?.length) recipeBits.push(`Keywords: ${r.keywords.map(normalizeForEmbedding).filter(Boolean).join(', ')}`);
    if (r.author) recipeBits.push(`Author: ${normalizeForEmbedding(r.author)}`);
    if (r.description) recipeBits.push(`Description: ${normalizeForEmbedding(r.description)}`);

    // Ingredients names can help semantic retrieval, but keep it short-ish.
    const ingredientNames =
      (r.ingredients ?? [])
        .map((i) => i.name || '')
        .map(normalizeForEmbedding)
        .filter(Boolean);

    if (ingredientNames.length) {
      const uniq = Array.from(new Set(ingredientNames)).slice(0, 40);
      recipeBits.push(`Ingredients: ${uniq.join(', ')}`);
    }

    if (recipeBits.length) parts.push(`Recipe: ${recipeBits.join(' | ')}`);
  }

  if (includeMarkdown) {
    const md = normalizeForEmbedding(note.markdown ?? '');
    if (md) parts.push(`Body:\n${truncate(md, maxMarkdownChars)}`);
  }

  // Join with double newlines for readability and stability.
  return parts.join('\n\n').trim();
}

const MAX_NOTE_EMBEDDING_CHARS = 12_000;
const GOOGLE_DOC_EMBEDDING_DELIM = '\n\n---\n\n';

function isGoogleDocNote(note: NoteEmbeddingSource): boolean {
  return (
    note.sourceType === 'googleDoc' ||
    (note.sources ?? []).some((s) => s?.type === 'googleDoc')
  );
}

function buildGoogleDocEmbeddingText(note: NoteEmbeddingSource): string {
  const annotations = normalizeForEmbedding(note.markdown ?? '');
  const imported = normalizeForEmbedding(note.derived?.googleDoc?.textPlain ?? '');
  const hasAnnotations = annotations.length > 0;
  const hasImported = imported.length > 0;

  if (!hasAnnotations && !hasImported) return '';
  if (!hasAnnotations) return truncate(imported, MAX_NOTE_EMBEDDING_CHARS);
  if (!hasImported) return truncate(annotations, MAX_NOTE_EMBEDDING_CHARS);

  if (annotations.length >= MAX_NOTE_EMBEDDING_CHARS) {
    // Never truncate annotations; drop imported if budget is exhausted.
    return annotations;
  }

  const remaining =
    MAX_NOTE_EMBEDDING_CHARS - annotations.length - GOOGLE_DOC_EMBEDDING_DELIM.length;
  if (remaining <= 0) return annotations;

  const importedTrimmed = truncate(imported, remaining);
  return `${annotations}${GOOGLE_DOC_EMBEDDING_DELIM}${importedTrimmed}`.trim();
}

export function buildNoteEmbeddingInput(
  note: NoteEmbeddingSource,
  opts: BuildEmbeddingTextOptions = {}
): { text: string; hash: string } {
  const text = isGoogleDocNote(note)
    ? buildGoogleDocEmbeddingText(note)
    : buildEmbeddingText(note, opts);
  const hash = hashEmbeddingText(text);
  return { text, hash };
}

/**
 * Hash the embedding text. If hash matches stored value, embedding is up-to-date.
 */
export function hashEmbeddingText(text: string): string {
  const normalized = normalizeForEmbedding(text);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Convenience helper: compute both text + hash together.
 */
export function computeEmbeddingTextAndHash(
  note: NoteEmbeddingSource,
  opts: BuildEmbeddingTextOptions = {}
): { text: string; hash: string } {
  const text = buildEmbeddingText(note, opts);
  const hash = hashEmbeddingText(text);
  return { text, hash };
}
