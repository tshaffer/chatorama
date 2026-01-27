import { Router } from 'express';
import { buildGoogleAuthUrl, completeOAuthFlow, startOAuthFlow } from '../services/googleAuth';
import { GoogleAuthTokenModel } from '../models/GoogleAuthToken';

const googleRouter = Router();

// GET /api/v1/google/oauth/start
googleRouter.get('/oauth/start', async (_req, res, next) => {
  try {
    const state = await startOAuthFlow();
    const baseUrl = `${_req.protocol}://${_req.get('host')}`;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI?.trim() || `${baseUrl}/api/v1/google/oauth/callback`;
    const url = buildGoogleAuthUrl(state, redirectUri);
    return res.redirect(url);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/google/oauth/callback
googleRouter.get('/oauth/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code ?? '');
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI?.trim() || `${baseUrl}/api/v1/google/oauth/callback`;
    await completeOAuthFlow(code, state, redirectUri);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/google/oauth/status
googleRouter.get('/oauth/status', async (_req, res, next) => {
  try {
    const doc = await GoogleAuthTokenModel.findOne({ provider: 'google' })
      .select({ accessTokenEnc: 1, refreshTokenEnc: 1 })
      .lean()
      .exec();
    const connected = Boolean(doc?.accessTokenEnc);
    const hasRefreshToken = Boolean(doc?.refreshTokenEnc);
    return res.json({ connected, hasRefreshToken });
  } catch (err) {
    next(err);
  }
});

export default googleRouter;
