// packages/chatalog/backend/src/routes/imports.chatworthy.ts
import { Router } from 'express';
import multer from 'multer';
import matter from 'gray-matter';
import unzipper from 'unzipper';
import { Readable } from 'stream';
import fs from 'fs';

import { NoteModel } from '../models/Note';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import type { NoteDoc } from '../models/Note';
import { slugifyStandard } from '@chatorama/chatalog-shared';
import { ImportBatchModel } from '../models/ImportBatch';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ---------------- helpers ----------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCompositeTitle(subject?: string, topic?: string): string | undefined {
  if (!subject || !topic) return undefined;
  return `${subject.trim()} - ${topic.trim()}`;
}

type StripOpts = {
  subject?: string;
  topic?: string;
  chatTitle?: string;
  fmTitle?: string;
};

/** Remove ToC block, anchors, meta rows, and a duplicate first H1 title. */
function stripForChatalog(md: string, opts: StripOpts = {}): string {
  let out = md;

  // 1) Drop the "## Table of Contents" section
  out = out.replace(
    /^\s*##\s*Table of Contents\s*\r?\n(?:\r?\n)?(?:^\d+\.\s+\[.*?\]\(#p-\d+\)\s*\r?\n)+/gmi,
    ''
  );

  // 2) Remove standalone anchor lines like <a id="p-2"></a>
  out = out.replace(/^\s*<a id="p-\d+"><\/a>\s*$(?:\r?\n)?/gmi, '');

  // 3) Remove exporter meta rows
  out = out.replace(/^Source:\s.*$\r?\n?/gmi, '');
  out = out.replace(/^Exported:\s.*$\r?\n?/gmi, '');

  // 3.5) Remove a duplicate top-level H1 that matches our computed title(s).
  const candidates: string[] = [];
  const composite = buildCompositeTitle(opts.subject, opts.topic);
  if (composite) candidates.push(composite);
  if (opts.chatTitle) candidates.push(opts.chatTitle);
  if (opts.fmTitle) candidates.push(opts.fmTitle);

  if (opts.subject && opts.topic) {
    const sub = escapeRe(opts.subject.trim());
    const top = escapeRe(opts.topic.trim());
    const reComposite = new RegExp(
      String.raw`^(?:\uFEFF)?\s*#\s*${sub}\s*[–—\-:]\s*${top}\s*\r?\n+`,
      'i'
    );
    out = out.replace(reComposite, '');
  }

  for (const t of candidates) {
    const esc = escapeRe(t.trim());
    const re = new RegExp(
      String.raw`^(?:\uFEFF)?\s*#\s*${esc}\s*\r?\n+`,
      'i'
    );
    const next = out.replace(re, '');
    if (next !== out) {
      out = next;
      break;
    }
  }

  // 4) Collapse excessive blank lines
  out = out.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();

  return out;
}

async function dedupeSubjectSlug(base: string): Promise<string> {
  const seed = base || 'untitled';
  let slug = seed;
  let i = 2;
  while (await SubjectModel.exists({ slug })) {
    slug = `${seed}-${i++}`;
  }
  return slug;
}

async function dedupeTopicSlug(subjectId: string, base: string): Promise<string> {
  const seed = base || 'untitled';
  let slug = seed;
  let i = 2;
  while (await TopicModel.exists({ subjectId, slug })) {
    slug = `${seed}-${i++}`;
  }
  return slug;
}

async function dedupeNoteSlug(topicId: string | undefined, base: string): Promise<string> {
  const seed = base || 'untitled';
  let slug = seed;
  let i = 2;

  const scope: any = { slug, topicId: topicId ?? '' };
  while (await NoteModel.exists(scope)) {
    slug = `${seed}-${i++}`;
    scope.slug = slug;
  }
  return slug;
}

function toArrayTags(fmTags: unknown): string[] {
  if (!fmTags) return [];
  if (Array.isArray(fmTags)) return fmTags.map(String).map(t => t.trim()).filter(Boolean);
  if (typeof fmTags === 'string') {
    return fmTags.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// ----- Chatworthy parsing types -----

type ParsedMd = {
  title: string;
  markdown: string;
  tags: string[];
  summary?: string;
  provenanceUrl?: string;
  subjectName?: string;
  topicName?: string;

  // Chatworthy provenance
  chatworthyNoteId?: string;
  chatworthyChatId?: string;
  chatworthyChatTitle?: string;
  chatworthyFileName?: string;
  chatworthyTurnIndex?: number;
  chatworthyTotalTurns?: number;
};

type TurnSection = {
  index: number;   // 0-based turn index
  markdown: string;
};

/**
 * Split the full Chatworthy markdown body into per-turn sections
 * based on <a id="p-N"></a> anchors.
 *
 * If no anchors are present, returns [] and the caller can treat the
 * entire document as a single note.
 */
function splitIntoTurnSections(body: string): TurnSection[] {
  const anchorRe = /(^|\r?\n)\s*<a id="p-(\d+)"><\/a>\s*\r?\n/gi;
  const matches = [...body.matchAll(anchorRe)];
  if (!matches.length) return [];

  const sections: TurnSection[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];

    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length;

    const slice = body.slice(start, end);
    sections.push({ index: i, markdown: slice }); // 0-based
  }

  return sections;
}

/**
 * Parse a Chatworthy “Pure MD” file into one or more ParsedMd notes:
 * - Front matter keys are produced by the shared exporter.
 * - If there are no per-turn anchors, returns a single ParsedMd.
 * - If there ARE per-turn anchors, returns one ParsedMd per turn.
 */
function parseChatworthyFile(buf: Buffer, fileName: string): ParsedMd[] {
  const raw = buf.toString('utf8');
  const gm = matter(raw);
  const fm = gm.data as Record<string, any>;

  const chatworthyNoteId =
    typeof fm.noteId === 'string' ? fm.noteId.trim() : undefined;
  const chatworthyChatId =
    typeof fm.chatId === 'string' ? fm.chatId.trim() : undefined;

  const titleFromH1 = gm.content.match(/^#\s+(.+)\s*$/m)?.[1]?.trim();
  const fmTitle = typeof fm.title === 'string' ? fm.title.trim() : undefined;
  const fmChatTitle =
    typeof fm.chatTitle === 'string' ? fm.chatTitle.trim() : undefined;
  const subject =
    typeof fm.subject === 'string' ? fm.subject : undefined;
  const topic = typeof fm.topic === 'string' ? fm.topic : undefined;

  const baseTitle =
    fmTitle ||
    fmChatTitle ||
    titleFromH1 ||
    fileName.replace(/\.(md|markdown)$/i, '');

  const tags = toArrayTags(fm.tags);
  const summary =
    typeof fm.summary === 'string' ? fm.summary : undefined;
  const provenanceUrl =
    typeof fm.pageUrl === 'string' ? fm.pageUrl : undefined;

  const opts: StripOpts = {
    subject,
    topic,
    chatTitle: fmChatTitle,
    fmTitle,
  };

  const body = gm.content;
  const turnSections = splitIntoTurnSections(body);

  // No anchors → treat entire document as a single note
  if (!turnSections.length) {
    const markdown = stripForChatalog(body, opts).trim();
    return [
      {
        title: baseTitle,
        markdown,
        tags,
        summary,
        provenanceUrl,
        subjectName: subject,
        topicName: topic,
        chatworthyNoteId,
        chatworthyChatId,
        chatworthyChatTitle: fmChatTitle,
        chatworthyFileName: fileName,
        // single "turn"
        chatworthyTurnIndex: 1,        // 1-based
        chatworthyTotalTurns: 1,
      },
    ];
  }

  // Multiple turns → produce one ParsedMd per *non-empty* section.
  const notes: ParsedMd[] = [];

  for (const section of turnSections) {
    const cleaned = stripForChatalog(section.markdown, opts).trim();
    if (!cleaned) {
      // Section has no meaningful content after stripping anchors/meta → skip it.
      continue;
    }

    const sectionHeadingMatch = cleaned.match(/^\s*#{2,6}\s+(.+)\s*$/m);
    const sectionHeading = sectionHeadingMatch?.[1]?.trim();

    const turnNumber = section.index + 1; // 1-based for human + storage

    const noteTitle =
      sectionHeading && sectionHeading.length > 0
        ? sectionHeading
        : `Turn ${turnNumber}`;

    notes.push({
      title: noteTitle,
      markdown: cleaned,
      tags,
      summary,
      provenanceUrl,
      subjectName: subject,
      topicName: topic,
      chatworthyNoteId,
      chatworthyChatId,
      chatworthyChatTitle: fmChatTitle,
      chatworthyFileName: fileName,
      chatworthyTurnIndex: turnNumber, // 1-based
      // chatworthyTotalTurns will be patched after we know how many notes survived.
      chatworthyTotalTurns: 0,
    });
  }

  // Everything stripped out (very unlikely, but be defensive)
  if (!notes.length) {
    const markdown = stripForChatalog(body, opts).trim();
    return [
      {
        title: baseTitle,
        markdown,
        tags,
        summary,
        provenanceUrl,
        subjectName: subject,
        topicName: topic,
        chatworthyNoteId,
        chatworthyChatId,
        chatworthyChatTitle: fmChatTitle,
        chatworthyFileName: fileName,
        chatworthyTurnIndex: 1,
        chatworthyTotalTurns: 1,
      },
    ];
  }

  // Now that we know how many notes we kept, set chatworthyTotalTurns consistently.
  const totalTurns = notes.length;
  for (const n of notes) {
    n.chatworthyTotalTurns = totalTurns;
  }

  return notes;
}

/** Ensure Subject/Topic exist and return their ids (string). */
async function ensureSubjectTopic(
  subjectName?: string,
  topicName?: string
): Promise<{ subjectId?: string; topicId?: string }> {
  let subjectId: string | undefined;
  let topicId: string | undefined;

  if (subjectName) {
    const name = subjectName.trim();
    let subj = await SubjectModel.findOne({ name }).exec();
    if (!subj) {
      const slug = await dedupeSubjectSlug(slugifyStandard(name));
      subj = await SubjectModel.create({ name, slug });
    }
    subjectId = subj.id;
  }

  if (topicName) {
    const sid = subjectId ?? '';
    const name = topicName.trim();
    let topic = await TopicModel.findOne({ subjectId: sid, name }).exec();
    if (!topic) {
      const slug = await dedupeTopicSlug(sid, slugifyStandard(name));
      topic = await TopicModel.create({ subjectId: sid, name, slug });
    }
    topicId = topic.id;
  }

  return { subjectId, topicId };
}

// ----- Types for frontend preview + apply -----

type PreviewNoteInfo = {
  file: string;
  importKey: string;
  title: string;
  subjectName?: string;
  topicName?: string;
  body: string;
  tags?: string[];
  summary?: string;
  provenanceUrl?: string;

  // Chatworthy provenance
  chatworthyNoteId?: string;
  chatworthyChatId?: string;
  chatworthyChatTitle?: string;
  chatworthyFileName?: string;
  chatworthyTurnIndex?: number;
  chatworthyTotalTurns?: number;
};

type ApplyImportedNotePayload = {
  importKey: string;
  title: string;
  body: string;
  subjectLabel?: string;
  topicLabel?: string;
  tags?: string[];
  summary?: string;
  provenanceUrl?: string;

  // Chatworthy provenance
  chatworthyNoteId?: string;
  chatworthyChatId?: string;
  chatworthyChatTitle?: string;
  chatworthyFileName?: string;
  chatworthyTurnIndex?: number;
  chatworthyTotalTurns?: number;
};

// ---------------- main importers ----------------

// NOTE: This is now *preview-only*. No DB writes here.
async function parseOneMarkdownForPreview(
  buf: Buffer,
  fileName: string
): Promise<PreviewNoteInfo[]> {
  const parsedNotes = parseChatworthyFile(buf, fileName);
  const previews: PreviewNoteInfo[] = [];

  parsedNotes.forEach((p, idx) => {
    const importKey = `${fileName}::${idx}`;
    previews.push({
      file: fileName,
      importKey,
      title: p.title,
      subjectName: p.subjectName,
      topicName: p.topicName,
      body: p.markdown,
      tags: p.tags,
      summary: p.summary,
      provenanceUrl: p.provenanceUrl,
      chatworthyNoteId: p.chatworthyNoteId,
      chatworthyChatId: p.chatworthyChatId,
      chatworthyChatTitle: p.chatworthyChatTitle,
      chatworthyFileName: p.chatworthyFileName ?? fileName,
      chatworthyTurnIndex: p.chatworthyTurnIndex,
      chatworthyTotalTurns: p.chatworthyTotalTurns,
    });
  });

  return previews;
}

// POST /api/v1/imports/chatworthy
// Now: PREVIEW ONLY. No subjects/topics/notes are created here.
router.post('/chatworthy', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const results: PreviewNoteInfo[] = [];

    const lower = req.file.originalname.toLowerCase();
    if (lower.endsWith('.zip')) {
      const stream = Readable.from(req.file.buffer);
      const dir = await stream.pipe(unzipper.Parse({ forceStream: true }));

      for await (const entry of dir as any) {
        const path: string = entry.path || '';
        if (entry.type === 'File' && path.toLowerCase().endsWith('.md')) {
          const chunks: Buffer[] = [];
          for await (const chunk of entry) chunks.push(chunk);
          const buf = Buffer.concat(chunks);

          const notes = await parseOneMarkdownForPreview(buf, path);
          results.push(...notes);
        } else {
          entry.autodrain();
        }
      }
    } else if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      const notes = await parseOneMarkdownForPreview(
        req.file.buffer,
        req.file.originalname
      );
      results.push(...notes);
    } else {
      return res.status(400).json({ message: 'Unsupported file type. Use .md or .zip.' });
    }

    res.json({ imported: results.length, results });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/imports/chatworthy/apply
// Create Subjects, Topics, and Notes based on the *final* edited rows.
router.post('/chatworthy/apply', async (req, res, next) => {
  try {
    const { rows } = req.body as { rows: ApplyImportedNotePayload[] };
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ message: 'No rows provided' });
    }

    const createdNotes: NoteDoc[] = [];

    for (const row of rows) {
      const subjectName = row.subjectLabel?.trim() || undefined;
      const topicName = row.topicLabel?.trim() || undefined;

      const { subjectId, topicId } = await ensureSubjectTopic(subjectName, topicName);

      const baseSlug = slugifyStandard(row.title || 'Untitled');
      const slug = await dedupeNoteSlug(topicId, baseSlug);

      const doc: NoteDoc = await NoteModel.create({
        subjectId: subjectId ?? '',
        topicId: topicId ?? '',
        title: row.title || 'Untitled',
        slug,
        markdown: row.body,
        summary: row.summary,
        tags: row.tags ?? [],
        links: [],
        backlinks: [],
        sources: row.provenanceUrl
          ? [{ type: 'chatworthy', url: row.provenanceUrl }]
          : [{ type: 'chatworthy' }],

        // Chatworthy provenance
        chatworthyNoteId: row.chatworthyNoteId,
        chatworthyChatId: row.chatworthyChatId,
        chatworthyChatTitle: row.chatworthyChatTitle,
        chatworthyFileName: row.chatworthyFileName,
        chatworthyTurnIndex: row.chatworthyTurnIndex,
        chatworthyTotalTurns: row.chatworthyTotalTurns,
      });

      createdNotes.push(doc);
    }

    let batchId: string | undefined;
    if (createdNotes.length > 0) {
      const batch = await ImportBatchModel.create({
        createdAt: new Date(),
        importedCount: createdNotes.length,
        remainingCount: createdNotes.length,
        sourceType: 'chatworthy',
      });
      batchId = String(batch._id);

      await NoteModel.updateMany(
        { _id: { $in: createdNotes.map((n) => n._id) } },
        { $set: { importBatchId: batchId } },
      );
    }

    res.json({
      created: createdNotes.length,
      noteIds: createdNotes.map((n) => n.id),
      importBatchId: batchId,
    });
  } catch (err) {
    next(err);
  }
});

//
// ---------- NEW: AI classification preview (ai-seed.json + ai-classification.json) ----------
//

// Types copied/trimmed from scripts/apply-ai-classification-batch.ts

type FullClassificationSubject = {
  id: string;
  name: string;
};

type FullClassificationTopic = {
  id: string;
  subjectId: string;
  name: string;
};

type FullClassificationNote = {
  aiNoteKey: string;
  chatworthyNoteId?: string;
  fileName?: string;
  subjectId?: string;     // AI-level subject id
  topicId?: string;       // AI-level topic id
  subjectName?: string;   // optional, for robustness
  topicName?: string;     // optional, for robustness
  suggestedTitle: string;
};

type MinimalClassificationNote = {
  aiNoteKey: string;
  subjectName?: string;
  topicName?: string;
  suggestedTitle: string;
};

type ClassificationRoot = {
  version: number;
  generatedAt?: string;
  subjects?: FullClassificationSubject[];
  topics?: FullClassificationTopic[];
  notes: (FullClassificationNote | MinimalClassificationNote)[];
};

type AiSeedNote = {
  aiNoteKey: string;
  chatworthyNoteId: string;
  fileName: string;
  turnIndex: number;
  chatTitle?: string;
  subjectHint?: string;
  topicHint?: string;
  promptText?: string;
  responseText?: string;
};

type AiSeedRoot = {
  version: number;
  generatedAt?: string;
  notes: AiSeedNote[];
};

type NormalizedClassificationNote = {
  aiNoteKey: string;
  subjectName: string;
  topicName: string;
  suggestedTitle: string;
  chatworthyNoteId?: string;
  fileName?: string;
};

/**
 * Normalize various classification shapes so that each note has subjectName + topicName.
 */
function normalizeClassification(
  classification: ClassificationRoot
): NormalizedClassificationNote[] {
  if (!classification.notes || !Array.isArray(classification.notes)) {
    throw new Error('Classification JSON must have a "notes" array');
  }

  const subjById = new Map<string, FullClassificationSubject>();
  const topicById = new Map<string, FullClassificationTopic>();

  if (Array.isArray(classification.subjects)) {
    for (const s of classification.subjects) {
      subjById.set(s.id, s);
    }
  }

  if (Array.isArray(classification.topics)) {
    for (const t of classification.topics) {
      topicById.set(t.id, t);
    }
  }

  const normalized: NormalizedClassificationNote[] = [];

  for (const raw of classification.notes) {
    const n = raw as FullClassificationNote & MinimalClassificationNote;

    let subjectName = n.subjectName;
    let topicName = n.topicName;

    if (!subjectName && n.subjectId && subjById.size > 0) {
      const s = subjById.get(n.subjectId);
      if (s) subjectName = s.name;
    }

    if (!topicName && n.topicId && topicById.size > 0) {
      const t = topicById.get(n.topicId);
      if (t) topicName = t.name;
    }

    if (!subjectName) {
      console.warn(
        `  WARNING: note aiNoteKey="${n.aiNoteKey}" has no subjectName/subjectId. Using "Uncategorized".`
      );
      subjectName = 'Uncategorized';
    }
    if (!topicName) {
      console.warn(
        `  WARNING: note aiNoteKey="${n.aiNoteKey}" has no topicName/topicId. Using "Miscellaneous".`
      );
      topicName = 'Miscellaneous';
    }

    normalized.push({
      aiNoteKey: n.aiNoteKey,
      subjectName,
      topicName,
      suggestedTitle: n.suggestedTitle,
      chatworthyNoteId: (n as any).chatworthyNoteId,
      fileName: (n as any).fileName,
    });
  }

  return normalized;
}

/**
 * Build markdown content for a note from its seed record.
 * Mirrors buildMarkdownFromSeed in the script.
 */
function buildMarkdownFromSeed(seed: AiSeedNote, title: string): string {
  const lines: string[] = [];

  const safeTitle = title || seed.chatTitle || 'Untitled';
  lines.push(`# ${safeTitle}`, '');

  if (seed.chatTitle) {
    lines.push(`_Chat title_: ${seed.chatTitle}`, '');
  }
  if (seed.fileName) {
    lines.push(`_Source file_: ${seed.fileName}`, '');
  }

  if (seed.promptText && seed.promptText.trim().length > 0) {
    lines.push('## Prompt', '');
    lines.push(seed.promptText.trim(), '');
  }

  if (seed.responseText && seed.responseText.trim().length > 0) {
    lines.push('## Response', '');
    lines.push(seed.responseText.trim(), '');
  }

  const markdown = lines.join('\n').trim();
  return markdown.length > 0 ? markdown : `# ${safeTitle}\n`;
}

// POST /api/v1/imports/ai-classification/preview
router.post('/ai-classification/preview', async (req, res, next) => {
  try {
    // NEW: paths come from environment variables instead of request body
    const aiSeedPath = process.env.AI_SEED_JSON_PATH;
    const aiClassificationPath = process.env.AI_CLASSIFICATION_JSON_PATH;

    if (!aiSeedPath || !aiClassificationPath) {
      return res.status(500).json({
        message:
          'AI_SEED_JSON_PATH and AI_CLASSIFICATION_JSON_PATH environment variables must be set on the backend.',
      });
    }

    // Optionally log for debugging
    console.log(
      'AI classification preview using:',
      '\n  aiSeedPath=',
      aiSeedPath,
      '\n  aiClassificationPath=',
      aiClassificationPath
    );

    // Read JSON files
    const classificationRaw = fs.readFileSync(aiClassificationPath, 'utf8');
    const classification: ClassificationRoot = JSON.parse(classificationRaw);

    const seedRaw = fs.readFileSync(aiSeedPath, 'utf8');
    const seed: AiSeedRoot = JSON.parse(seedRaw);

    const seedByKey = new Map<string, AiSeedNote>();
    for (const n of seed.notes) {
      seedByKey.set(n.aiNoteKey, n);
    }

    const normalizedNotes = normalizeClassification(classification);

    const results: PreviewNoteInfo[] = [];

    for (const n of normalizedNotes) {
      const seedNote = seedByKey.get(n.aiNoteKey);
      if (!seedNote) {
        console.warn(
          `AI preview: No seed note found for aiNoteKey="${n.aiNoteKey}". Skipping.`
        );
        continue;
      }

      const markdown = buildMarkdownFromSeed(seedNote, n.suggestedTitle);

      results.push({
        file: seedNote.fileName,
        importKey: n.aiNoteKey,
        title:
          (n.suggestedTitle && n.suggestedTitle.trim()) ||
          seedNote.chatTitle ||
          'Untitled',
        subjectName: n.subjectName,
        topicName: n.topicName,
        body: markdown,
        tags: [],
        summary: undefined,
        provenanceUrl: undefined,
        chatworthyNoteId: seedNote.chatworthyNoteId,
        chatworthyChatId: undefined,
        chatworthyChatTitle: seedNote.chatTitle,
        chatworthyFileName: seedNote.fileName,
        chatworthyTurnIndex: seedNote.turnIndex,
        chatworthyTotalTurns: undefined,
      });
    }

    res.json({
      imported: results.length,
      results,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
