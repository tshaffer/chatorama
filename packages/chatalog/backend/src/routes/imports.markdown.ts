import { Router } from 'express';
import multer from 'multer';
import matter from 'gray-matter';

import { NoteModel } from '../models/Note';
import { ImportBatchModel } from '../models/ImportBatch';
import { slugifyStandard } from '@chatorama/chatalog-shared';
import { dedupeSlug } from '../utilities';
import {
  findOrCreateSubjectByLabel,
  findOrCreateTopicByLabel,
} from '../utilities/subjectTopicLabels';
import { computeAndPersistEmbeddings } from '../search/embeddingUpdates';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Chars of markdown body used when building the embedding text.
// Matches the maxMarkdownChars default in embeddingText.ts.
export const MARKDOWN_EMBEDDING_CHAR_LIMIT = 8_000;

type Section = { title: string; body: string };

/**
 * Split markdown content into sections at H2 (##) headings.
 * H3+ headings stay within their parent H2 section.
 * Content before the first H2 becomes a preamble section using the
 * document title, provided it is non-empty after stripping the H1 line.
 * If no H2 headings are found, returns the whole content as one section.
 */
function splitIntoSections(content: string, docTitle: string): Section[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const sections: Section[] = [];

  let foundFirstH2 = false;
  let currentTitle = '';
  let currentLines: string[] = [];
  let preambleLines: string[] = [];

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (!foundFirstH2) {
        const preamble = preambleLines.join('\n').trim();
        if (preamble) {
          sections.push({ title: docTitle, body: preamble });
        }
        foundFirstH2 = true;
      } else {
        const body = currentLines.join('\n').trim();
        if (body) sections.push({ title: currentTitle, body });
      }
      currentTitle = line.replace(/^##\s+/, '').trim();
      currentLines = [line];
    } else if (!foundFirstH2) {
      // Skip the H1 document title line; everything else is preamble.
      if (!/^#\s+/.test(line)) {
        preambleLines.push(line);
      }
    } else {
      currentLines.push(line);
    }
  }

  if (foundFirstH2) {
    const body = currentLines.join('\n').trim();
    if (body) sections.push({ title: currentTitle, body });
  } else {
    // No H2 headings — whole content is one section.
    const body = preambleLines.join('\n').trim();
    if (body) sections.push({ title: docTitle, body });
  }

  return sections;
}

// POST /api/v1/imports/markdown/apply
router.post('/markdown/apply', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file is required' });

    const lower = file.originalname.toLowerCase();
    if (!lower.endsWith('.md') && !lower.endsWith('.markdown')) {
      return res.status(400).json({ error: 'Only .md and .markdown files are supported' });
    }

    const mode = (req.body?.mode === 'single' ? 'single' : 'per-section') as
      | 'per-section'
      | 'single';
    const subjectLabelRaw = String(req.body?.subjectLabel ?? '').trim();
    const topicLabelRaw = String(req.body?.topicLabel ?? '').trim();

    if (!subjectLabelRaw || !topicLabelRaw) {
      return res.status(400).json({ error: 'subjectLabel and topicLabel are required' });
    }

    const content = file.buffer.toString('utf8');
    const gm = matter(content);
    const body = gm.content;

    const h1Match = body.match(/^#\s+(.+)$/m);
    const docTitle =
      h1Match?.[1]?.trim() ||
      file.originalname.replace(/\.(md|markdown)$/i, '');

    const sections: Section[] =
      mode === 'single'
        ? [{ title: docTitle, body: body.trim() }]
        : splitIntoSections(body, docTitle);

    if (!sections.length) {
      return res.status(400).json({ error: 'No content found in file' });
    }

    const subjectId = await findOrCreateSubjectByLabel(subjectLabelRaw, undefined);
    const topicId = await findOrCreateTopicByLabel(topicLabelRaw, subjectId, undefined);

    const createdNotes = [];

    for (const section of sections) {
      const title = section.title || docTitle;
      const slug = await dedupeSlug(
        slugifyStandard(title || 'note'),
        topicId?.toString(),
      );

      const note = await NoteModel.create({
        title,
        slug,
        markdown: section.body,
        subjectId,
        topicId,
        summary: undefined,
        tags: [],
        links: [],
        backlinks: [],
        sources: [{ type: 'manual' as const }],
        docKind: 'note',
        sourceType: 'markdown',
        importedAt: new Date(),
      });

      try {
        await computeAndPersistEmbeddings(String(note._id));
      } catch (err) {
        console.error('[embeddings] markdown import failed', note._id, err);
      }

      createdNotes.push(note);
    }

    const batch = await ImportBatchModel.create({
      createdAt: new Date(),
      importedCount: createdNotes.length,
      remainingCount: createdNotes.length,
      sourceType: 'markdown',
    });

    const batchId = String(batch._id);

    await NoteModel.updateMany(
      { _id: { $in: createdNotes.map((n) => n._id) } },
      { $set: { importBatchId: batchId } },
    );

    return res.status(201).json({
      created: createdNotes.length,
      noteIds: createdNotes.map((n) => String(n._id)),
      importBatchId: batchId,
      subjectId: subjectId?.toString(),
      topicId: topicId?.toString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
