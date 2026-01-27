import crypto from 'crypto';
import { isValidObjectId } from 'mongoose';
import { slugifyStandard } from '@chatorama/chatalog-shared';
import { NoteModel } from '../models/Note';
import { AssetModel } from '../models/Asset';
import { NoteAssetModel } from '../models/NoteAsset';
import { dedupeSlug } from '../utilities';
import { embedText } from '../ai/embed';
import { hashEmbeddingText } from '../ai/embeddingText';
import { deleteLocalFile, savePdfToLocal } from './assetStorage';

const MAX_GOOGLE_DOC_TEXT_CHARS = 300_000;

export type GoogleDocArtifactSource = {
  driveFileId: string;
  driveUrl?: string;
  driveModifiedTime: string;
  driveName?: string;
};

export type UpsertGoogleDocArtifactsInput = {
  noteId?: string;
  source: GoogleDocArtifactSource;
  textPlain: string;
  viewerPdfBase64?: string;
  viewerPdfFilename?: string;
};

export type UpsertGoogleDocArtifactsResult = {
  noteId: string;
  status: 'created' | 'updated';
  embedded: true;
  viewerStored: boolean;
};

function normalizeTextPlain(text: string): string {
  return text.slice(0, MAX_GOOGLE_DOC_TEXT_CHARS).trim();
}

function parseDriveModifiedTime(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('source.driveModifiedTime must be a valid ISO timestamp');
  }
  return parsed;
}

function decodeBase64(input: string): Buffer {
  const trimmed = input.trim();
  const commaIdx = trimmed.indexOf('base64,');
  const payload = commaIdx >= 0 ? trimmed.slice(commaIdx + 7) : trimmed;
  return Buffer.from(payload, 'base64');
}

async function removeViewerAttachments(noteId: string): Promise<void> {
  const existing = await NoteAssetModel.find({ noteId, role: 'viewer' }).exec();
  for (const rel of existing) {
    await NoteAssetModel.deleteOne({ _id: rel._id }).exec();
    const remaining = await NoteAssetModel.countDocuments({ assetId: rel.assetId }).exec();
    if (remaining === 0) {
      const asset = await AssetModel.findById(rel.assetId).exec();
      if (asset) {
        await AssetModel.deleteOne({ _id: asset.id }).exec();
        await deleteLocalFile(asset.storage.path);
      }
    }
  }
}

async function persistViewerPdf(
  noteId: string,
  pdfBase64: string,
  filename?: string,
): Promise<boolean> {
  const buffer = decodeBase64(pdfBase64);
  if (!buffer.length) return false;

  await removeViewerAttachments(noteId);

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  let asset = await AssetModel.findOne({ sha256 }).exec();
  if (!asset) {
    const saved = await savePdfToLocal(buffer);
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

  if (!asset) return false;

  await NoteAssetModel.create({
    noteId,
    assetId: asset._id,
    order: 0,
    role: 'viewer',
    sourceType: 'googleDoc',
    mimeType: asset.mimeType,
    filename: filename?.trim() || undefined,
    storageKey: asset.storage?.path,
    sizeBytes: asset.byteSize,
  });

  return true;
}

function mergeGoogleDocSource(existing: any[] | undefined, next: any) {
  const rest = Array.isArray(existing)
    ? existing.filter((s) => s?.type !== 'googleDoc')
    : [];
  return [...rest, next];
}

export async function upsertGoogleDocFromArtifacts(
  input: UpsertGoogleDocArtifactsInput,
): Promise<UpsertGoogleDocArtifactsResult> {
  const source = input.source ?? ({} as GoogleDocArtifactSource);
  if (!source.driveFileId) throw new Error('source.driveFileId is required');
  if (!source.driveModifiedTime) throw new Error('source.driveModifiedTime is required');

  const textPlain = normalizeTextPlain(String(input.textPlain ?? ''));
  if (!textPlain) throw new Error('textPlain is required');

  const driveModifiedTimeAtImport = parseDriveModifiedTime(source.driveModifiedTime);
  const now = new Date();
  const textHash = crypto.createHash('sha256').update(textPlain).digest('hex');
  const textChars = textPlain.length;

  let status: UpsertGoogleDocArtifactsResult['status'] = 'created';
  let noteId = input.noteId;
  let titleForEmbedding: string;
  let sources: any[] = [];

  const googleSource = {
    type: 'googleDoc',
    driveFileId: source.driveFileId,
    driveUrl: source.driveUrl,
    importedAt: now,
    driveModifiedTimeAtImport,
    driveNameAtImport: source.driveName,
  };

  if (noteId) {
    if (!isValidObjectId(noteId)) throw new Error('noteId is invalid');
    const existing = await NoteModel.findById(noteId).lean().exec();
    if (!existing) throw new Error('noteId not found');
    status = 'updated';
    sources = mergeGoogleDocSource(existing.sources as any, googleSource);
    titleForEmbedding = existing.title || source.driveName || 'Untitled';
  } else {
    const title = source.driveName?.trim() || 'Untitled';
    const slug = await dedupeSlug(slugifyStandard(title || 'untitled'), undefined);
    titleForEmbedding = title;
    sources = mergeGoogleDocSource(undefined, googleSource);

    const embeddingText = `${titleForEmbedding}\n\n${textPlain}`.trim();
    const { vector, model } = await embedText(embeddingText, {
      model: 'text-embedding-3-small',
    });

    const created = await NoteModel.create({
      title,
      slug,
      markdown: '',
      summary: undefined,
      tags: [],
      links: [],
      backlinks: [],
      relations: [],
      sources,
      docKind: 'note',
      sourceType: 'googleDoc',
      importedAt: now,
      derived: {
        googleDoc: {
          textPlain,
          textHash,
          textChars,
          exportedAt: now,
        },
      },
      embedding: vector,
      embeddingModel: model,
      embeddingTextHash: hashEmbeddingText(embeddingText),
      embeddingUpdatedAt: now,
    });
    noteId = created._id.toString();
  }

  if (status === 'updated') {
    const embeddingText = `${titleForEmbedding}\n\n${textPlain}`.trim();
    const { vector, model } = await embedText(embeddingText, {
      model: 'text-embedding-3-small',
    });

    await NoteModel.updateOne(
      { _id: noteId },
      {
        $set: {
          sourceType: 'googleDoc',
          sources,
          derived: {
            googleDoc: {
              textPlain,
              textHash,
              textChars,
              exportedAt: now,
            },
          },
          embedding: vector,
          embeddingModel: model,
          embeddingTextHash: hashEmbeddingText(embeddingText),
          embeddingUpdatedAt: now,
        },
      },
    ).exec();
  }

  let viewerStored = false;
  if (input.viewerPdfBase64 && noteId) {
    viewerStored = await persistViewerPdf(noteId, input.viewerPdfBase64, input.viewerPdfFilename);
  }

  return {
    noteId: noteId!,
    status,
    embedded: true,
    viewerStored,
  };
}
