import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import { AssetModel } from '../models/Asset';
import { saveImageToLocal, savePdfToLocal, getLocalAssetPath } from '../services/assetStorage';

const assetsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

assetsRouter.post('/images', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file is required' });
    if (!file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ error: 'file must be an image' });
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const existing = await AssetModel.findOne({ sha256 }).exec();
    if (existing) {
      return res.json({ asset: existing.toJSON() });
    }

    const saved = await saveImageToLocal(file.buffer, file.mimetype);

    try {
      const created = await AssetModel.create({
        type: 'image',
        mimeType: file.mimetype,
        byteSize: saved.byteSize,
        sha256: saved.sha256,
        storage: { provider: 'local', path: saved.path },
        imageMeta:
          saved.width && saved.height
            ? { width: saved.width, height: saved.height }
            : undefined,
      });
      return res.status(201).json({ asset: created.toJSON() });
    } catch (err: any) {
      if (err?.code === 11000) {
        const dup = await AssetModel.findOne({ sha256: saved.sha256 }).exec();
        if (dup) return res.json({ asset: dup.toJSON() });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

assetsRouter.post('/pdfs', pdfUpload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file is required' });

    const isPdfMime = file.mimetype === 'application/pdf';
    const hasPdfExtension = file.originalname?.toLowerCase().endsWith('.pdf');
    if (!isPdfMime || !hasPdfExtension) {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const existing = await AssetModel.findOne({ sha256 }).exec();
    if (existing) {
      return res.json({ asset: existing.toJSON() });
    }

    const saved = await savePdfToLocal(file.buffer);

    try {
      const created = await AssetModel.create({
        type: 'pdf',
        mimeType: 'application/pdf',
        byteSize: saved.size,
        sha256,
        storage: { provider: 'local', path: saved.path },
      });
      return res.status(201).json({ asset: created.toJSON() });
    } catch (err: any) {
      if (err?.code === 11000) {
        const dup = await AssetModel.findOne({ sha256 }).exec();
        if (dup) return res.json({ asset: dup.toJSON() });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

assetsRouter.get('/:assetId/content', async (req, res, next) => {
  try {
    const { assetId } = req.params;
    const asset = await AssetModel.findById(assetId).exec();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const absolutePath = getLocalAssetPath(asset.storage.path);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Asset file missing' });
    }

    res.setHeader('Content-Type', asset.mimeType);
    return res.sendFile(absolutePath);
  } catch (err) {
    next(err);
  }
});

export default assetsRouter;
