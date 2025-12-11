// Usage:
//   cd backend
//   npx ts-node scripts/validateTurnDedupPlan.ts
//   npx ts-node scripts/applyTurnDedupPlan.ts           # DRY RUN
//   npx ts-node scripts/applyTurnDedupPlan.ts --apply   # LIVE

import mongoose, { Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { NoteModel } from '../src/models/Note';
import { TurnFingerprintModel } from '../src/models/TurnFingerprintModel';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../src/utils/textHash';

type ManualReason = 'sameContainerDifferentSubject' | 'differentContainers';

interface AutoResolvedGroup {
  containerSignatureWithSubject: string;
  canonicalNoteId: string;
  autoDeleteNoteIds: string[];
}

interface ManualGroupOption {
  noteId: string;
  title?: string;
  topicId?: string;
  subjectId?: string;
  containerSignature?: string;
  containerSignatureWithSubject?: string;
}

interface ManualGroup {
  reason: ManualReason;
  decisionRequired: true;
  keepNoteId: string | null;
  deleteNoteIds: string[];
  options: ManualGroupOption[];
}

interface TurnDedupPlanEntry {
  pairHash: string;
  autoResolvedGroups: AutoResolvedGroup[];
  manualGroups: ManualGroup[];
}

type TurnDedupPlan = Record<string, TurnDedupPlanEntry>;

type DeleteMap = Map<string, Set<string>>;

function buildMarkdownFromTurns(turns: ReturnType<typeof extractPromptResponseTurns>): string {
  return turns
    .map(
      (turn) =>
        `## Prompt\n${turn.prompt || ''}\n\n## Response\n${turn.response || ''}`,
    )
    .join('\n\n');
}

function addDeleteTarget(deleteMap: DeleteMap, pairHash: string, noteId: string) {
  if (!deleteMap.has(pairHash)) deleteMap.set(pairHash, new Set<string>());
  deleteMap.get(pairHash)!.add(noteId);
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  const dryRun = !process.argv.includes('--apply') && !process.argv.includes('--write');

  console.log(
    dryRun
      ? 'Running applyTurnDedupPlan in DRY RUN mode (no DB writes).'
      : 'Running applyTurnDedupPlan in LIVE mode (DB WILL be modified).',
  );

  await mongoose.connect(uri);
  console.log('Connected to Mongo');

  const planPath = path.join(__dirname, 'turnDedupPlan.json');
  if (!fs.existsSync(planPath)) {
    throw new Error(`Missing plan file at ${planPath}. Run generateTurnDedupPlan.ts first.`);
  }

  const plan: TurnDedupPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

  const deleteMap: DeleteMap = new Map();

  for (const [pairHash, entry] of Object.entries(plan)) {
    // Auto-resolved groups
    entry.autoResolvedGroups.forEach((group) => {
      group.autoDeleteNoteIds.forEach((noteId) => addDeleteTarget(deleteMap, pairHash, noteId));
    });

    // Manual groups
    entry.manualGroups.forEach((group) => {
      if (group.keepNoteId === null) {
        console.warn(
          `PAIR ${pairHash}: manualGroup(${group.reason}) has keepNoteId=null; skipping this group.`,
        );
        return;
      }

      group.deleteNoteIds.forEach((noteId) => addDeleteTarget(deleteMap, pairHash, noteId));
    });
  }

  const pairHashesProcessed = deleteMap.size;
  let deletionTargets = 0;
  let notesUpdated = 0;
  let notesDeleted = 0;
  let fingerprintsDeleted = 0;

  for (const [pairHash, noteIds] of deleteMap.entries()) {
    for (const noteId of noteIds) {
      deletionTargets += 1;

      let note;
      try {
        note = await NoteModel.findById(noteId);
      } catch (err) {
        console.warn(`PAIR ${pairHash}, NOTE ${noteId}: error fetching note: ${(err as Error).message}`);
      }

      if (!note) {
        console.warn(`PAIR ${pairHash}, NOTE ${noteId}: note not found; proceeding to fingerprint cleanup.`);
      }

      const turns = extractPromptResponseTurns(note?.markdown || '');
      const turnsToKeep = [];
      const turnsToRemove = [];

      for (const turn of turns) {
        const h = hashPromptResponsePair(turn.prompt, turn.response);
        if (h === pairHash) {
          turnsToRemove.push(turn);
        } else {
          turnsToKeep.push(turn);
        }
      }

      if (!turnsToRemove.length) {
        console.warn(
          `PAIR ${pairHash}, NOTE ${noteId}: no matching turn found; fingerprint may be stale.`,
        );
      }

      if (note) {
        if (turnsToRemove.length) {
          if (turnsToKeep.length === 0) {
            if (dryRun) {
              console.log(`DRY RUN: would delete note ${noteId} after removing all turns for pairHash ${pairHash}.`);
            } else {
              await NoteModel.deleteOne({ _id: note._id });
              notesDeleted += 1;
              console.log(`Deleted note ${noteId} after removing all turns for pairHash ${pairHash}.`);
            }
          } else {
            const newMarkdown = buildMarkdownFromTurns(turnsToKeep);
            if (dryRun) {
              console.log(`DRY RUN: would update note ${noteId} to remove turn for pairHash ${pairHash}.`);
            } else {
              note.markdown = newMarkdown;
              await note.save();
              notesUpdated += 1;
              console.log(`Updated note ${noteId} to remove turn for pairHash ${pairHash}.`);
            }
          }
        }
      }

      // Fingerprint cleanup
      try {
        const noteObjectId = new Types.ObjectId(noteId);
        if (dryRun) {
          console.log(
            `DRY RUN: would delete TurnFingerprints for pairHash ${pairHash} and noteId ${noteId}.`,
          );
        } else {
          const res = await TurnFingerprintModel.deleteMany({ pairHash, noteId: noteObjectId }).exec();
          fingerprintsDeleted += res.deletedCount ?? 0;
          console.log(
            `Deleted ${res.deletedCount ?? 0} TurnFingerprint(s) for pairHash ${pairHash} and noteId ${noteId}.`,
          );
        }
      } catch (err) {
        console.warn(
          `PAIR ${pairHash}, NOTE ${noteId}: error deleting fingerprints: ${(err as Error).message}`,
        );
      }
    }
  }

  console.log('---- Summary ----');
  console.log(`PairHashes processed: ${pairHashesProcessed}`);
  console.log(`Deletion targets (pairHash, noteId): ${deletionTargets}`);
  console.log(`Notes updated: ${notesUpdated}`);
  console.log(`Notes deleted: ${notesDeleted}`);
  console.log(`TurnFingerprints deleted: ${fingerprintsDeleted}`);
  if (dryRun) {
    console.log('DRY RUN mode: no database changes were made.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect();
  process.exit(1);
});
