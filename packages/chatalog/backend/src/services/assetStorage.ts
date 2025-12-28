import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import imageSize from 'image-size';

const STORAGE_ROOT = path.resolve(__dirname, '../../storage');
const ASSET_DIR = path.join(STORAGE_ROOT, 'assets');

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'image/svg+xml':
      return '.svg';
    default:
      return '';
  }
}

function resolveStoragePath(storagePath: string): string {
  if (path.isAbsolute(storagePath)) return storagePath;
  return path.resolve(__dirname, '../../', storagePath);
}

export async function saveImageToLocal(buffer: Buffer, mimeType: string) {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const byteSize = buffer.length;
  const ext = extensionForMime(mimeType);

  let width: number | undefined;
  let height: number | undefined;
  try {
    const result = imageSize(buffer);
    width = result.width;
    height = result.height;
  } catch {
    // Ignore dimension errors; not all image types are supported
  }

  const filename = `${sha256}${ext}`;
  await fs.mkdir(ASSET_DIR, { recursive: true });
  const absolutePath = path.join(ASSET_DIR, filename);
  await fs.writeFile(absolutePath, buffer);

  return {
    sha256,
    byteSize,
    path: path.join('storage', 'assets', filename),
    width,
    height,
    ext,
  };
}

export async function deleteLocalFile(storagePath: string) {
  const absolutePath = resolveStoragePath(storagePath);
  await fs.rm(absolutePath, { force: true });
}

export function getLocalAssetPath(storagePath: string) {
  return resolveStoragePath(storagePath);
}
