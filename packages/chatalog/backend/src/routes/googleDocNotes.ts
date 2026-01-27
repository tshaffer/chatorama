import { Router } from 'express';
import {
  upsertGoogleDocFromArtifacts,
  type UpsertGoogleDocArtifactsInput,
} from '../services/googleDocNotes';

const googleDocNotesRouter = Router();

// POST /api/v1/googleDocNotes/upsertFromArtifacts
googleDocNotesRouter.post('/upsertFromArtifacts', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Partial<UpsertGoogleDocArtifactsInput>;
    const payload: UpsertGoogleDocArtifactsInput = {
      noteId: body.noteId,
      source: body.source as UpsertGoogleDocArtifactsInput['source'],
      textPlain: String(body.textPlain ?? ''),
      viewerPdfBase64: body.viewerPdfBase64,
      viewerPdfFilename: body.viewerPdfFilename,
    };

    const result = await upsertGoogleDocFromArtifacts(payload);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

export default googleDocNotesRouter;
