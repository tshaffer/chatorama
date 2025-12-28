import { Router } from 'express';
import { NoteAssetModel } from '../models/NoteAsset';
import { AssetModel } from '../models/Asset';
import { deleteLocalFile } from '../services/assetStorage';

const noteAssetsRouter = Router();

noteAssetsRouter.delete('/:noteAssetId', async (req, res, next) => {
  try {
    const { noteAssetId } = req.params;
    const noteAsset = await NoteAssetModel.findById(noteAssetId).exec();
    if (!noteAsset) return res.status(404).json({ error: 'NoteAsset not found' });

    await NoteAssetModel.deleteOne({ _id: noteAssetId }).exec();

    const remaining = await NoteAssetModel.countDocuments({ assetId: noteAsset.assetId }).exec();
    if (remaining === 0) {
      const asset = await AssetModel.findById(noteAsset.assetId).exec();
      if (asset) {
        await AssetModel.deleteOne({ _id: asset.id }).exec();
        await deleteLocalFile(asset.storage.path);
      }
    }

    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default noteAssetsRouter;
