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
    const reComposite =
      new RegExp(
        String.raw`^(?:\uFEFF)?\s*#\s*${sub}\s*[–—\-:]\s*${top}\s*\r?\n+`,
        'i'
      );
    out = out.replace(reComposite, '');
  }

  for (const t of candidates) {
    const esc = escapeRe(t.trim());
    const re =
      new RegExp(
        String.raw`^(?:\uFEFF)?\s*#\s*${esc}\s*\r?\n+`,
        'i'
      );
    const next = out.replace(re, '');
    if (next !== out) { out = next; break; }
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
};

/**
 * Parse a Chatworthy “Pure MD” file:
 * - Front matter keys are produced by the shared exporter.
 * - Body (gm.content) is the entire Markdown after front matter, beginning at H1.
 */
function parseChatworthyFile(buf: Buffer, fileName: string): ParsedMd {
  const raw = buf.toString('utf8');
  const gm = matter(raw);
  const fm = gm.data as Record<string, any>;

  const titleFromH1 = gm.content.match(/^#\s+(.+)\s*$/m)?.[1]?.trim();
  const fmTitle = typeof fm.title === 'string' ? fm.title.trim() : undefined;
  const fmChatTitle = typeof fm.chatTitle === 'string' ? fm.chatTitle.trim() : undefined;
  const subject = typeof fm.subject === 'string' ? fm.subject : undefined;
  const topic = typeof fm.topic === 'string' ? fm.topic : undefined;

  const title =
    fmTitle ||
    fmChatTitle ||
    titleFromH1 ||
    fileName.replace(/\.(md|markdown)$/i, '');

  // Use the cleaned body (including duplicate-title stripping)
  const markdown = stripForChatalog(gm.content, {
    subject,
    topic,
    chatTitle: fmChatTitle,
    fmTitle,
  }).trim();

  const tags = toArrayTags(fm.tags);
  const summary = typeof fm.summary === 'string' ? fm.summary : undefined;
  const provenanceUrl = typeof fm.pageUrl === 'string' ? fm.pageUrl : undefined;

  return {
    title,
    markdown,
    tags,
    summary,
    provenanceUrl,
    subjectName: subject,
    topicName: topic,
  };
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

async function persistParsedMd(p: ParsedMd): Promise<{ id: string; title: string }> {
  const { subjectId, topicId } = await ensureSubjectTopic(p.subjectName, p.topicName);

  const baseSlug = slugify(p.title || 'untitled');
  const slug = await dedupeNoteSlug(topicId, baseSlug);

  const doc: NoteDoc = await NoteModel.create({
    subjectId: subjectId ?? '',
    topicId: topicId ?? '',
    title: p.title || 'Untitled',
    slug,
    markdown: p.markdown,
    summary: p.summary,
    tags: p.tags,
    links: [],
    backlinks: [],
    sources: p.provenanceUrl
      ? [{ type: 'chatworthy', url: p.provenanceUrl }]
      : [{ type: 'chatworthy' }],
  });

  return { id: doc.id, title: doc.title };
}

// ---------------- main importers ----------------

async function importOneMarkdown(buf: Buffer, fileName: string): Promise<{ id: string; title: string }> {
  const parsed = parseChatworthyFile(buf, fileName);
  return persistParsedMd(parsed);
}

// POST /api/v1/imports/chatworthy
router.post('/chatworthy', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const results: Array<{ file: string; noteId: string; title: string }> = [];

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
          const note = await importOneMarkdown(buf, path);
          results.push({ file: path, noteId: note.id, title: note.title });
        } else {
          entry.autodrain();
        }
      }
    } else if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      const note = await importOneMarkdown(req.file.buffer, req.file.originalname);
      results.push({ file: req.file.originalname, noteId: note.id, title: note.title });
    } else {
      return res.status(400).json({ message: 'Unsupported file type. Use .md or .zip.' });
    }

    res.json({ imported: results.length, results });
  } catch (err) {
    next(err);
  }
});

export default router;
