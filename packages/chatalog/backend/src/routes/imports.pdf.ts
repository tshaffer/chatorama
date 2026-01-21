import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { AssetModel } from '../models/Asset';
import { NoteModel } from '../models/Note';
import { ImportBatchModel } from '../models/ImportBatch';
import { savePdfToLocal } from '../services/assetStorage';
import { extractPdfText } from '../services/pdfText';
import { slugifyStandard } from '@chatorama/chatalog-shared';
import { dedupeSlug } from '../utilities';
import { findOrCreateSubjectByLabel, findOrCreateTopicByLabel } from '../utilities/subjectTopicLabels';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/pdf', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file is required' });

    const subjectLabelRaw = String(req.body?.subjectLabel ?? '').trim();
    const topicLabelRaw = String(req.body?.topicLabel ?? '').trim();
    if (!subjectLabelRaw || !topicLabelRaw) {
      return res.status(400).json({ error: 'subjectLabel and topicLabel are required' });
    }
    const pdfSummaryMarkdown = String(req.body?.pdfSummaryMarkdown ?? '').trim();
    if (!pdfSummaryMarkdown) {
      return res.status(400).json({ error: 'pdfSummaryMarkdown is required' });
    }

    const isPdfMime = file.mimetype === 'application/pdf';
    const hasPdfExtension = file.originalname?.toLowerCase().endsWith('.pdf');
    if (!isPdfMime || !hasPdfExtension) {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    let asset = await AssetModel.findOne({ sha256 }).exec();

    if (!asset) {
      const saved = await savePdfToLocal(file.buffer);
      try {
        asset = await AssetModel.create({
          type: 'pdf',
          mimeType: 'application/pdf',
          byteSize: saved.size,
          sha256,
          storage: { provider: 'local', path: saved.path },
        });
      } catch (err: any) {
        if (err?.code === 11000) {
          asset = await AssetModel.findOne({ sha256 }).exec();
        } else {
          throw err;
        }
      }
    }

    if (!asset) {
      return res.status(500).json({ error: 'Failed to create asset record' });
    }

    let extractedText = '';
    let extractedPageCount: number | undefined;
    let extractedAt: Date | undefined;
    try {
      const extraction = await extractPdfText(file.buffer);
      extractedText = extraction.text;
      extractedPageCount = extraction.pageCount;
      extractedAt = new Date();
    } catch (err: any) {
      if (err?.message !== 'No extractable text found (scanned PDFs are not supported)') {
        throw err;
      }
    }

    const subjectId = await findOrCreateSubjectByLabel(subjectLabelRaw, undefined);
    const topicId = await findOrCreateTopicByLabel(topicLabelRaw, subjectId, undefined);

    const parsedName = path.parse(file.originalname ?? '');
    const title = parsedName.name || 'Untitled PDF';
    const baseSlug = slugifyStandard(title || 'Untitled');
    const slug = await dedupeSlug(baseSlug || 'note', topicId ? topicId.toString() : undefined);

    const note = await NoteModel.create({
      title,
      slug,
      markdown: '',
      subjectId,
      topicId,
      pdfSummaryMarkdown,
      summary: undefined,
      tags: [],
      links: [],
      backlinks: [],
      sources: [{ type: 'manual' }],
      docKind: 'note',
      sourceType: 'pdf',
      importedAt: new Date(),
      pdfAssetId: asset._id.toString(),
      derived: {
        pdf: {
          extractedText,
          pageCount: extractedPageCount,
          extractedAt,
        },
      },
    });

    const batch = await ImportBatchModel.create({
      createdAt: new Date(),
      importedCount: 1,
      remainingCount: 1,
      sourceType: 'pdf',
    });

    await NoteModel.updateOne(
      { _id: note._id },
      { $set: { importBatchId: batch._id.toString() } }
    );

    return res.status(201).json({
      noteId: note._id.toString(),
      assetId: asset._id.toString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
