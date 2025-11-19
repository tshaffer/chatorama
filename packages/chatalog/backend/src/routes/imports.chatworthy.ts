// packages/chatalog/backend/src/routes/imports.chatworthy.ts
import { Router } from 'express';
import multer from 'multer';
import matter from 'gray-matter';
import unzipper from 'unzipper';
import { Readable } from 'stream';

import { NoteModel } from '../models/Note';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import type { NoteDoc } from '../models/Note';

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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

type ParsedMd = {
  title: string;
  markdown: string;
  tags: string[];
  summary?: string;
  provenanceUrl?: string;
  subjectName?: string;
  topicName?: string;

  // Chatworthy noteId (ext-...)
  chatworthyNoteId?: string;
};

type TurnSection = {
  index: number;
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
    const idxStr = m[2];
    const index = idxStr ? parseInt(idxStr, 10) : i + 1;

    const start = i === 0 ? 0 : (matches[i].index ?? 0);
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length;

    const slice = body.slice(start, end);
    sections.push({ index, markdown: slice });
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

  const titleFromH1 = gm.content.match(/^#\s+(.+)\s*$/m)?.[1]?.trim();
  const fmTitle = typeof fm.title === 'string' ? fm.title.trim() : undefined;
  const fmChatTitle = typeof fm.chatTitle === 'string' ? fm.chatTitle.trim() : undefined;
  const subject = typeof fm.subject === 'string' ? fm.subject : undefined;
  const topic = typeof fm.topic === 'string' ? fm.topic : undefined;

  const baseTitle =
    fmTitle ||
    fmChatTitle ||
    titleFromH1 ||
    fileName.replace(/\.(md|markdown)$/i, '');

  const tags = toArrayTags(fm.tags);
  const summary = typeof fm.summary === 'string' ? fm.summary : undefined;
  const provenanceUrl = typeof fm.pageUrl === 'string' ? fm.pageUrl : undefined;

  const opts: StripOpts = {
    subject,
    topic,
    chatTitle: fmChatTitle,
    fmTitle,
  };

  const body = gm.content;
  const turnSections = splitIntoTurnSections(body);

  // No anchors → treat entire document as a single note (existing behavior).
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
      },
    ];
  }

  // Multiple turns → produce one ParsedMd per section.
  const notes: ParsedMd[] = [];

  for (const section of turnSections) {
    const cleaned = stripForChatalog(section.markdown, opts).trim();
    if (!cleaned) continue;

    const sectionHeadingMatch = cleaned.match(/^\s*#{2,6}\s+(.+)\s*$/m);
    const sectionHeading = sectionHeadingMatch?.[1]?.trim();

    const noteTitle =
      sectionHeading && sectionHeading.length > 0
        ? sectionHeading
        : `Turn ${section.index}`;

    notes.push({
      title: noteTitle,
      markdown: cleaned,
      tags,
      summary,
      provenanceUrl,
      subjectName: subject,
      topicName: topic,
      chatworthyNoteId,
    });
  }

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
      },
    ];
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
      const slug = await dedupeSubjectSlug(slugify(name));
      subj = await SubjectModel.create({ name, slug });
    }
    subjectId = subj.id;
  }

  if (topicName) {
    const sid = subjectId ?? '';
    const name = topicName.trim();
    let topic = await TopicModel.findOne({ subjectId: sid, name }).exec();
    if (!topic) {
      const slug = await dedupeTopicSlug(sid, slugify(name));
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
  chatworthyNoteId?: string;
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
  chatworthyNoteId?: string;
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
      const notes = await parseOneMarkdownForPreview(req.file.buffer, req.file.originalname);
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

      const baseSlug = slugify(row.title || 'Untitled');
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
        chatworthyNoteId: row.chatworthyNoteId,
      });

      createdNotes.push(doc);
    }

    res.json({
      created: createdNotes.length,
      noteIds: createdNotes.map((n) => n.id),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
