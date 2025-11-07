// routes/imports.chatworthy.ts
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

// --- helpers ---

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function dedupeSubjectSlug(base: string): Promise<string> {
  let slug = base || 'untitled';
  let i = 2;
  while (await SubjectModel.exists({ slug })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

async function dedupeTopicSlug(subjectId: string, base: string): Promise<string> {
  let slug = base || 'untitled';
  let i = 2;
  const scope: any = { subjectId, slug };
  while (await TopicModel.exists(scope)) {
    slug = `${base}-${i++}`;
    scope.slug = slug;
  }
  return slug;
}
async function dedupeNoteSlug(topicId: string | undefined, base: string): Promise<string> {
  let slug = base || 'untitled';
  let i = 2;
  const scope: any = { slug, ...(topicId ? { topicId } : { topicId: '' }) };
  while (await NoteModel.exists(scope)) {
    slug = `${base}-${i++}`;
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

function parseChatworthyFile(buf: Buffer, fileName: string): ParsedMd {
  const raw = buf.toString('utf8');
  const gm = matter(raw);
  const fm = gm.data as Record<string, any>;

  const titleFromH1 = gm.content.match(/^#\s+(.+)\s*$/m)?.[1]?.trim();
  const title =
    (typeof fm.title === 'string' && fm.title.trim()) ||
    (typeof fm.chatTitle === 'string' && fm.chatTitle.trim()) ||
    titleFromH1 ||
    fileName.replace(/\.(md|markdown)$/i, '');

  // Store content WITHOUT front matter (fits your Note.markdown)
  const markdown = gm.content.trim();

  const tags = toArrayTags(fm.tags);
  const summary = typeof fm.summary === 'string' ? fm.summary : undefined;
  const provenanceUrl = typeof fm.pageUrl === 'string' ? fm.pageUrl : undefined;

  return {
    title,
    markdown,
    tags,
    summary,
    provenanceUrl,
    subjectName: typeof fm.subject === 'string' ? fm.subject : undefined,
    topicName: typeof fm.topic === 'string' ? fm.topic : undefined,
  };
}

/** Find or create Subject/Topic by name; return their string ids */
async function ensureSubjectTopic(
  subjectName?: string,
  topicName?: string
): Promise<{ subjectId?: string; topicId?: string }> {
  let subjectId: string | undefined;
  let topicId: string | undefined;

  if (subjectName) {
    const name = subjectName.trim();

    // Find first to know if we need to create (so we can compute a slug)
    let subj = await SubjectModel.findOne({ name }).exec();
    if (!subj) {
      const base = slugify(name);
      const slug = await dedupeSubjectSlug(base);
      subj = await SubjectModel.create({ name, slug });
    }
    subjectId = subj.id; // string
  }

  if (topicName) {
    const name = topicName.trim();
    const sid = subjectId ?? '';

    let topic = await TopicModel.findOne({ name, subjectId: sid }).exec();
    if (!topic) {
      const base = slugify(name);
      const slug = await dedupeTopicSlug(sid, base);
      topic = await TopicModel.create({ name, subjectId: sid, slug });
    }
    topicId = topic.id; // string
  }

  return { subjectId, topicId };
}
async function persistParsedMd(p: ParsedMd): Promise<{ id: string; title: string }> {
  const { subjectId, topicId } = await ensureSubjectTopic(p.subjectName, p.topicName);

  const baseSlug = slugify(p.title || 'untitled');
  const slug = await dedupeNoteSlug(topicId ?? '', baseSlug);

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

  // Use id consistently (your toJSON plugin and Mongoose virtual both provide it)
  return { id: doc.id, title: doc.title };
}

// --- main importers ---

async function importOneMarkdown(buf: Buffer, fileName: string): Promise<{ id: string; title: string }> {
  const parsed = parseChatworthyFile(buf, fileName);
  return persistParsedMd(parsed);
}

// POST /api/v1/imports/chatworthy  (mounted under /imports)
router.post('/chatworthy', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const results: Array<{ file: string; noteId: string; title: string }> = [];

    if (req.file.originalname.toLowerCase().endsWith('.zip')) {
      const s = Readable.from(req.file.buffer);
      const dir = await s.pipe(unzipper.Parse({ forceStream: true }));

      for await (const entry of dir as any) {
        const fileName: string = entry.path || '';
        if (entry.type === 'File' && fileName.toLowerCase().endsWith('.md')) {
          const chunks: Buffer[] = [];
          for await (const chunk of entry) chunks.push(chunk);
          const buf = Buffer.concat(chunks);
          const note = await importOneMarkdown(buf, fileName);
          results.push({ file: fileName, noteId: note.id, title: note.title });
        } else {
          entry.autodrain();
        }
      }
    } else if (req.file.originalname.toLowerCase().endsWith('.md')) {
      const { id, title } = await importOneMarkdown(req.file.buffer, req.file.originalname);
      results.push({ file: req.file.originalname, noteId: id, title });
    } else {
      return res.status(400).json({ message: 'Unsupported file type. Use .md or .zip.' });
    }

    res.json({ imported: results.length, results });
  } catch (err) {
    next(err);
  }
});

export default router;
