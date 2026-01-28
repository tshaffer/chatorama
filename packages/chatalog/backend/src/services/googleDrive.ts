import { getValidAccessToken } from './googleAuth';

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const GOOGLE_SLIDES_MIME = 'application/vnd.google-apps.presentation';
const MAX_TEXT_BYTES = 2_000_000;
const MAX_PDF_BYTES = 20_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
const EXPORT_TIMEOUT_MS = Number(process.env.GOOGLE_DRIVE_EXPORT_TIMEOUT_MS || '45000');

function logDebug(message: string) {
  if (process.env.GOOGLE_DRIVE_DEBUG?.trim()) {
    console.log(`[google][drive] ${message}`);
  }
}

export type DriveFileMeta = {
  id: string;
  name: string;
  modifiedTime: string;
  mimeType: string;
};

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readBodyWithLimit(res: Response, limitBytes: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > limitBytes) throw new Error('Export too large');
    return buf;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > limitBytes) throw new Error('Export too large');
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
}

export async function fetchDriveFileMeta(driveFileId: string): Promise<DriveFileMeta> {
  const token = await getValidAccessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${driveFileId}`);
  url.searchParams.set('fields', 'id,name,modifiedTime,mimeType');

  const res = await fetchWithTimeout(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  }, EXPORT_TIMEOUT_MS);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive metadata fetch failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as DriveFileMeta;
  logDebug(`meta ok id=${data.id} name="${data.name}" modified=${data.modifiedTime}`);
  if (![GOOGLE_DOC_MIME, GOOGLE_SHEET_MIME, GOOGLE_SLIDES_MIME].includes(data.mimeType)) {
    throw new Error('Drive file is not a supported Google editor type');
  }
  return data;
}

export async function exportDriveTextPlain(driveFileId: string): Promise<string> {
  const token = await getValidAccessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${driveFileId}/export`);
  url.searchParams.set('mimeType', 'text/plain');

  const res = await fetchWithTimeout(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  }, EXPORT_TIMEOUT_MS);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive text export failed (${res.status}): ${text}`);
  }
  const buf = await readBodyWithLimit(res, MAX_TEXT_BYTES);
  logDebug(`export text ok bytes=${buf.length}`);
  return buf.toString('utf8');
}

export async function exportDrivePdf(driveFileId: string): Promise<Buffer> {
  const token = await getValidAccessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${driveFileId}/export`);
  url.searchParams.set('mimeType', 'application/pdf');

  const res = await fetchWithTimeout(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive PDF export failed (${res.status}): ${text}`);
  }
  const buf = await readBodyWithLimit(res, MAX_PDF_BYTES);
  logDebug(`export pdf ok bytes=${buf.length}`);
  return buf;
}
