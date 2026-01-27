import crypto from 'crypto';
import { GoogleAuthTokenModel } from '../models/GoogleAuthToken';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

type OAuthTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return v.trim();
}

function deriveKey(): Buffer {
  const secret = requireEnv('GOOGLE_TOKEN_ENCRYPTION_KEY');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plain: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decrypt(payload: string): string {
  const key = deriveKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

export function buildGoogleAuthUrl(state: string, redirectUri?: string): string {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const resolvedRedirectUri = redirectUri || process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!resolvedRedirectUri) {
    throw new Error('Missing GOOGLE_REDIRECT_URI');
  }
  const scopeRaw =
    process.env.GOOGLE_OAUTH_SCOPES?.trim() ||
    'https://www.googleapis.com/auth/drive.readonly';
  const scopes = scopeRaw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: resolvedRedirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function startOAuthFlow(): Promise<string> {
  const state = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  await GoogleAuthTokenModel.updateOne(
    { provider: 'google' },
    { $set: { oauthState: state, oauthStateExpiresAt: expiresAt } },
    { upsert: true }
  ).exec();
  return state;
}

export async function completeOAuthFlow(
  code: string,
  state: string | undefined,
  redirectUri?: string
): Promise<void> {
  if (!code) throw new Error('Missing OAuth code');
  const doc = await GoogleAuthTokenModel.findOne({ provider: 'google' }).exec();
  if (!doc?.oauthState || !doc.oauthStateExpiresAt) {
    throw new Error('OAuth state not initialized');
  }
  if (!state || state !== doc.oauthState) {
    throw new Error('OAuth state mismatch');
  }
  if (doc.oauthStateExpiresAt.getTime() < Date.now()) {
    throw new Error('OAuth state expired');
  }

  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
  const resolvedRedirectUri = redirectUri || process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!resolvedRedirectUri) {
    throw new Error('Missing GOOGLE_REDIRECT_URI');
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: resolvedRedirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token exchange failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as OAuthTokenResponse;
  if (!data.access_token) throw new Error('OAuth token exchange missing access_token');

  const expiryDate = new Date(Date.now() + data.expires_in * 1000);

  const setPayload: Record<string, any> = {
    accessTokenEnc: encrypt(data.access_token),
    expiryDate,
    scopes: data.scope,
    oauthState: undefined,
    oauthStateExpiresAt: undefined,
  };
  if (data.refresh_token) {
    setPayload.refreshTokenEnc = encrypt(data.refresh_token);
  }

  await GoogleAuthTokenModel.updateOne(
    { provider: 'google' },
    { $set: setPayload },
    { upsert: true }
  ).exec();
}

async function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as OAuthTokenResponse;
}

export async function getValidAccessToken(): Promise<string> {
  const doc = await GoogleAuthTokenModel.findOne({ provider: 'google' }).lean().exec();
  if (!doc?.accessTokenEnc || !doc?.expiryDate) {
    throw new Error('Google OAuth tokens not configured');
  }

  const expiry = doc.expiryDate instanceof Date ? doc.expiryDate.getTime() : new Date(doc.expiryDate).getTime();
  if (expiry - Date.now() > TOKEN_EXPIRY_BUFFER_MS) {
    return decrypt(doc.accessTokenEnc);
  }

  if (!doc.refreshTokenEnc) {
    throw new Error('Google OAuth refresh token is missing');
  }

  const refreshToken = decrypt(doc.refreshTokenEnc);
  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed.access_token) throw new Error('OAuth refresh missing access_token');
  const expiryDate = new Date(Date.now() + refreshed.expires_in * 1000);

  await GoogleAuthTokenModel.updateOne(
    { provider: 'google' },
    {
      $set: {
        accessTokenEnc: encrypt(refreshed.access_token),
        expiryDate,
        scopes: refreshed.scope ?? doc.scopes,
      },
    }
  ).exec();

  return refreshed.access_token;
}
