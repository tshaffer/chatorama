import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { QuickNoteAssetModel } from '../models/QuickNoteAsset';
import { AssetModel } from '../models/Asset';
import { QuickNoteModel } from '../models/QuickNote';

const quickNoteAssetsRouter = Router();

quickNoteAssetsRouter.get('/', async (req, res, next) => {
  try {
    const { quickNoteId } = req.query as { quickNoteId?: string };
    if (!quickNoteId) {
      return res.status(400).json({ error: 'quickNoteId is required' });
    }
    if (!isValidObjectId(quickNoteId)) {
      return res.status(400).json({ error: 'Invalid quickNoteId' });
    }

    const assets = await QuickNoteAssetModel.find({ quickNoteId })
      .sort({ order: 1, _id: 1 })
      .populate('assetId')
      .exec();

    const payload = assets.map((doc) => {
      const json = doc.toJSON() as any;
      const asset = (doc.assetId as any)?.toJSON?.() ?? doc.assetId;
      return {
        id: json.id,
        quickNoteId: json.quickNoteId?.toString?.() ?? json.quickNoteId,
        assetId: asset?.id ?? json.assetId?.toString?.() ?? json.assetId,
        order: json.order ?? 0,
        caption: json.caption,
        asset: asset
          ? {
              id: asset.id,
              mimeType: asset.mimeType,
              byteSize: asset.byteSize,
              imageMeta: asset.imageMeta,
              createdAt: asset.createdAt,
              url: `/api/assets/${asset.id}/content`,
            }
          : undefined,
      };
    });

    return res.json(payload);
  } catch (err) {
    next(err);
  }
});

quickNoteAssetsRouter.post('/', async (req, res, next) => {
  try {
    const { quickNoteId, assetId, caption, order } = req.body ?? {};
    if (!quickNoteId || !isValidObjectId(quickNoteId)) {
      return res.status(400).json({ error: 'quickNoteId is required' });
    }
    if (!assetId || !isValidObjectId(assetId)) {
      return res.status(400).json({ error: 'assetId is required' });
    }

    const quick = await QuickNoteModel.findById(quickNoteId).lean();
    if (!quick) return res.status(404).json({ error: 'QuickNote not found' });

    const asset = await AssetModel.findById(assetId).exec();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    try {
      const created = await QuickNoteAssetModel.create({
        quickNoteId,
        assetId,
        caption,
        order: typeof order === 'number' ? order : 0,
      });
      const populated = await created.populate('assetId');
      const assetJson = (populated.assetId as any)?.toJSON?.() ?? populated.assetId;
      const payload: any = {
        ...populated.toJSON(),
        assetId: asset.id,
        asset: {
          id: assetJson.id,
          mimeType: assetJson.mimeType,
          byteSize: assetJson.byteSize,
          imageMeta: assetJson.imageMeta,
          createdAt: assetJson.createdAt,
          url: `/api/assets/${assetJson.id}/content`,
        },
      };
      return res.status(201).json(payload);
    } catch (err: any) {
      if (err?.code === 11000) {
        const existing = await QuickNoteAssetModel.findOne({ quickNoteId, assetId })
          .populate('assetId')
          .exec();
        if (existing) {
          const assetJson =
            (existing.assetId as any)?.toJSON?.() ?? existing.assetId;
          const payload: any = {
            ...existing.toJSON(),
            assetId: asset.id,
            asset: {
              id: assetJson.id,
              mimeType: assetJson.mimeType,
              byteSize: assetJson.byteSize,
              imageMeta: assetJson.imageMeta,
              createdAt: assetJson.createdAt,
              url: `/api/assets/${assetJson.id}/content`,
            },
          };
          return res.json(payload);
        }
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

quickNoteAssetsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const { caption, order } = req.body ?? {};
    const updates: Record<string, any> = {};
    if (typeof caption === 'string') updates.caption = caption;
    if (typeof order === 'number') updates.order = order;

    const updated = await QuickNoteAssetModel.findByIdAndUpdate(id, updates, { new: true })
      .populate('assetId')
      .exec();

    if (!updated) return res.status(404).json({ error: 'QuickNoteAsset not found' });

    const assetJson = (updated.assetId as any)?.toJSON?.() ?? updated.assetId;
    const payload: any = {
      ...updated.toJSON(),
      assetId: assetJson?.id ?? updated.assetId,
      asset: assetJson
        ? {
            id: assetJson.id,
            mimeType: assetJson.mimeType,
            byteSize: assetJson.byteSize,
            imageMeta: assetJson.imageMeta,
            createdAt: assetJson.createdAt,
            url: `/api/assets/${assetJson.id}/content`,
          }
        : undefined,
    };

    return res.json(payload);
  } catch (err) {
    next(err);
  }
});

quickNoteAssetsRouter.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const deleted = await QuickNoteAssetModel.findByIdAndDelete(id).exec();
    if (!deleted) return res.status(404).json({ error: 'QuickNoteAsset not found' });

    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default quickNoteAssetsRouter;
