// Usage:
// MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//   npx ts-node scripts/duplicateTurnsReport.ts

import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import * as fs from 'fs';
import path from 'path';
import { NoteModel } from '../src/models/Note';
import { TurnFingerprintModel } from '../src/models/TurnFingerprintModel';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../src/utils/textHash';

interface DuplicateTurnOccurrence {
  noteId: string;
  title?: string;
  topicId?: string;
  subjectId?: string;
  createdAt?: string;
  containerSignature: string;
  containerSignatureWithSubject: string;
}

interface DuplicateTurnReportEntry {
  pairHash: string;
  promptPreview?: string;
  responsePreview?: string;
  occurrences: DuplicateTurnOccurrence[];
}

interface DuplicateAggregate {
  _id: string;
  noteIds: Types.ObjectId[];
  noteCount: number;
}

function makePreview(text: string, maxLength = 160): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to Mongo');

  const duplicates = await TurnFingerprintModel.aggregate<DuplicateAggregate>([
    {
      $group: {
        _id: { pairHash: '$pairHash', noteId: '$noteId' },
      },
    },
    {
      $group: {
        _id: '$_id.pairHash',
        noteIds: { $addToSet: '$_id.noteId' },
        noteCount: { $sum: 1 },
      },
    },
    {
      $match: { noteCount: { $gt: 1 } },
    },
  ]).exec();

  if (!duplicates.length) {
    console.log('No duplicate turn pairHashes found.');
    const outPath = path.join(__dirname, 'duplicateTurnsReport.json');
    fs.writeFileSync(outPath, JSON.stringify([], null, 2), 'utf8');
    await mongoose.disconnect();
    console.log(`Wrote empty report to ${outPath}`);
    return;
  }

  const allNoteIds = new Set<string>();
  duplicates.forEach((d) => {
    d.noteIds.forEach((id) => allNoteIds.add(id.toString()));
  });

  const notes = await NoteModel.find({ _id: { $in: Array.from(allNoteIds) } })
    .lean()
    .exec();

  const noteById = new Map<string, (typeof notes)[number]>();
  notes.forEach((note) => {
    noteById.set(note._id.toString(), note);
  });

  const report: DuplicateTurnReportEntry[] = [];

  for (const duplicate of duplicates) {
    const occurrences: DuplicateTurnOccurrence[] = [];
    duplicate.noteIds.forEach((id) => {
      const note = noteById.get(id.toString());
      if (!note) {
        console.warn(`Note ${id.toString()} not found for pairHash ${duplicate._id}`);
        return;
      }

      const signatureInput = `${String((note as any).topicId || '')}|||${note.title || ''}|||${note.markdown || ''}`;
      const containerSignature = crypto.createHash('sha256').update(signatureInput).digest('hex');
      const subjectIdStr = String((note as any).subjectId || '');
      const topicIdStr = String((note as any).topicId || '');
      const titleStr = note.title || '';
      const markdownStr = note.markdown || '';
      const signatureWithSubjectInput = `${subjectIdStr}|||${topicIdStr}|||${titleStr}|||${markdownStr}`;
      const containerSignatureWithSubject = crypto
        .createHash('sha256')
        .update(signatureWithSubjectInput)
        .digest('hex');

      occurrences.push({
        noteId: note._id.toString(),
        title: note.title,
        topicId: (note as any).topicId?.toString?.() ?? (note as any).topicId,
        subjectId: (note as any).subjectId,
        createdAt: note.createdAt ? new Date(note.createdAt).toISOString() : undefined,
        containerSignature,
        containerSignatureWithSubject,
      });
    });

    let promptPreview: string | undefined;
    let responsePreview: string | undefined;

    for (const id of duplicate.noteIds) {
      const note = noteById.get(id.toString());
      if (!note) continue;

      const turns = extractPromptResponseTurns(note.markdown || '');
      for (const turn of turns) {
        const h = hashPromptResponsePair(turn.prompt, turn.response);
        if (h === duplicate._id) {
          promptPreview = makePreview(turn.prompt);
          responsePreview = makePreview(turn.response);
          break;
        }
      }

      if (promptPreview || responsePreview) break;
    }

    if (!promptPreview && !responsePreview) {
      console.warn(`Could not locate prompt/response text for pairHash ${duplicate._id}`);
    }

    report.push({
      pairHash: duplicate._id,
      promptPreview,
      responsePreview,
      occurrences,
    });
  }

  const outPath = path.join(__dirname, 'duplicateTurnsReport.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Wrote duplicate turns report to ${outPath}`);
  console.log(`Total duplicate pairHashes: ${report.length}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect();
  process.exit(1);
});
