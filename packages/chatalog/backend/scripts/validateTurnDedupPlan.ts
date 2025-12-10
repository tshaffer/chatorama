// Usage:
//   cd backend
//   npx ts-node scripts/validateTurnDedupPlan.ts
//
// This script validates turnDedupPlan.json for internal consistency.
// It does NOT touch the database.

import * as fs from 'fs';
import * as path from 'path';

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

function main() {
  const planPath = path.join(__dirname, 'turnDedupPlan.json');

  if (!fs.existsSync(planPath)) {
    throw new Error(`Missing turn dedup plan at ${planPath}. Run generateTurnDedupPlan.ts first.`);
  }

  const raw = fs.readFileSync(planPath, 'utf8');
  const plan: TurnDedupPlan = JSON.parse(raw);

  // noteId -> set of pairHashes where it's kept
  const noteKeeps = new Map<string, Set<string>>();
  // noteId -> set of pairHashes where it's deleted (auto or manual)
  const noteDeletes = new Map<string, Set<string>>();
  // noteId -> set of pairHashes where it's canonical in autoResolvedGroups
  const noteCanonical = new Map<string, Set<string>>();

  const problems: string[] = [];

  let totalEntries = 0;
  let totalManualGroups = 0;
  let totalAutoGroups = 0;

  for (const [pairHash, entry] of Object.entries(plan)) {
    totalEntries += 1;
    const { autoResolvedGroups, manualGroups } = entry;
    totalAutoGroups += autoResolvedGroups.length;
    totalManualGroups += manualGroups.length;

    // Track all noteIds that this pairHash knows about
    const allNoteIdsForPair = new Set<string>();
    const deleteNoteIdsForPair = new Set<string>();

    // --- Auto groups: record canonical & deletes, sanity check they don't overlap
    for (const group of autoResolvedGroups) {
      const { canonicalNoteId, autoDeleteNoteIds } = group;

      // canonical record
      addToMultiMap(noteCanonical, canonicalNoteId, pairHash);
      allNoteIdsForPair.add(canonicalNoteId);

      // auto-delete record
      for (const id of autoDeleteNoteIds) {
        addToMultiMap(noteDeletes, id, pairHash);
        deleteNoteIdsForPair.add(id);
        allNoteIdsForPair.add(id);
      }

      // Sanity check: canonical should never be auto-deleted in its own group
      if (autoDeleteNoteIds.includes(canonicalNoteId)) {
        problems.push(
          `PAIR ${pairHash}: canonicalNoteId ${canonicalNoteId} appears in autoDeleteNoteIds of its own autoResolvedGroup`,
        );
      }
    }

    // --- Manual groups: validate internal structure + global keep/delete maps
    for (const group of manualGroups) {
      const { reason, keepNoteId, deleteNoteIds, options } = group;

      // Build a quick lookup for options
      const optionIds = new Set(options.map((o) => o.noteId));

      // 1) keepNoteId must be null or in options
      if (keepNoteId !== null && !optionIds.has(keepNoteId)) {
        problems.push(
          `PAIR ${pairHash}: manualGroup(${reason}) keepNoteId=${keepNoteId} is not in options`,
        );
      }

      // 2) deleteNoteIds must be a subset of options
      for (const id of deleteNoteIds) {
        if (!optionIds.has(id)) {
          problems.push(
            `PAIR ${pairHash}: manualGroup(${reason}) deleteNoteId=${id} is not in options`,
          );
        }
      }

      // 3) keepNoteId must not also be in deleteNoteIds
      if (keepNoteId !== null && deleteNoteIds.includes(keepNoteId)) {
        problems.push(
          `PAIR ${pairHash}: manualGroup(${reason}) noteId=${keepNoteId} is both kept and deleted within the same group`,
        );
      }

      // Record all options into "all noteIds for this pair"
      for (const opt of options) {
        allNoteIdsForPair.add(opt.noteId);
      }

      // Record keeps/deletes in global maps
      if (keepNoteId !== null) {
        addToMultiMap(noteKeeps, keepNoteId, pairHash);
      }

      for (const id of deleteNoteIds) {
        addToMultiMap(noteDeletes, id, pairHash);
        deleteNoteIdsForPair.add(id);
      }
    }

    // --- Per-pairHash: ensure at least one surviving note
    const survivors = [...allNoteIdsForPair].filter((id) => !deleteNoteIdsForPair.has(id));
    if (allNoteIdsForPair.size > 0 && survivors.length === 0) {
      problems.push(
        `PAIR ${pairHash}: all noteIds for this turn are marked for deletion (no survivor)`,
      );
    }
  }

  // --- Global consistency: no note kept somewhere and deleted elsewhere
  for (const [noteId, keptInPairs] of noteKeeps.entries()) {
    const deletedInPairs = noteDeletes.get(noteId);
    if (deletedInPairs && deletedInPairs.size > 0) {
      problems.push(
        `NOTE ${noteId}: marked KEEP in pairHashes [${[...keptInPairs].join(
          ', ',
        )}] but also DELETE in pairHashes [${[...deletedInPairs].join(', ')}]`,
      );
    }
  }

  // (Optional: we could also warn if a note is canonical in some pairHashes but
  // deleted in others; this is not strictly an error, but it may be surprising.)
  for (const [noteId, canonicalInPairs] of noteCanonical.entries()) {
    const deletedInPairs = noteDeletes.get(noteId);
    if (deletedInPairs && deletedInPairs.size > 0) {
      problems.push(
        `NOTE ${noteId}: canonical in pairHashes [${[...canonicalInPairs].join(
          ', ',
        )}] but also DELETE in pairHashes [${[...deletedInPairs].join(
          ', ',
        )}] (manual delete overrides canonical, but verify this is intended)`,
      );
    }
  }

  // --- Summary output
  console.log(`Validated turn dedup plan at ${planPath}`);
  console.log(`Total pairHashes in plan: ${totalEntries}`);
  console.log(`Total autoResolvedGroups: ${totalAutoGroups}`);
  console.log(`Total manualGroups: ${totalManualGroups}`);
  console.log(`Total distinct notes kept somewhere: ${noteKeeps.size}`);
  console.log(`Total distinct notes deleted somewhere: ${noteDeletes.size}`);

  if (problems.length === 0) {
    console.log('No consistency problems found ✅');
  } else {
    console.log(`Found ${problems.length} potential problem(s):`);
    for (const p of problems) {
      console.log(`  - ${p}`);
    }
    process.exitCode = 1;
  }
}

function addToMultiMap(map: Map<string, Set<string>>, key: string, value: string) {
  const existing = map.get(key);
  if (existing) {
    existing.add(value);
  } else {
    map.set(key, new Set([value]));
  }
}

main();
