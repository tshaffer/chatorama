// Usage:
//   cd backend
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//     npx ts-node scripts/duplicateTurnsReport.ts
//   npx ts-node scripts/generateTurnDedupPlan.ts

import * as fs from 'fs';
import * as path from 'path';

interface DuplicateTurnOccurrence {
  noteId: string;
  title?: string;
  topicId?: string;
  subjectId?: string;
  createdAt?: string;
  containerSignature?: string;
  containerSignatureWithSubject?: string;
}

interface DuplicateTurnReportEntry {
  pairHash: string;
  promptPreview?: string;
  responsePreview?: string;
  occurrences: DuplicateTurnOccurrence[];
}

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

type ManualReason = 'sameContainerDifferentSubject' | 'differentContainers';

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

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

function pickCanonical(occurrences: DuplicateTurnOccurrence[]): DuplicateTurnOccurrence {
  const withDates = occurrences.map((occ) => ({
    occ,
    date: occ.createdAt ? new Date(occ.createdAt) : null,
  }));
  const sorted = withDates.sort((a, b) => {
    if (a.date && b.date) return a.date.getTime() - b.date.getTime();
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });
  return sorted[0].occ;
}

async function main() {
  const duplicateReportPath = path.join(__dirname, 'duplicateTurnsReport.json');
  const planOutputPath = path.join(__dirname, 'turnDedupPlan.json');

  if (!fs.existsSync(duplicateReportPath)) {
    throw new Error(`Missing duplicate report at ${duplicateReportPath}. Run duplicateTurnsReport.ts first.`);
  }

  const report: DuplicateTurnReportEntry[] = JSON.parse(
    fs.readFileSync(duplicateReportPath, 'utf8'),
  );

  const plan: TurnDedupPlan = {};
  let totalAutoResolvedGroups = 0;
  let totalManualGroups = 0;

  for (const entry of report) {
    const autoResolvedGroups: AutoResolvedGroup[] = [];
    const manualGroups: ManualGroup[] = [];
    const usedNoteIds = new Set<string>();

    // Case 1: exact clones (same containerSignatureWithSubject)
    const byContainerWithSubject = groupBy(
      entry.occurrences,
      (occ) => String(occ.containerSignatureWithSubject || ''),
    );

    Object.values(byContainerWithSubject).forEach((occurrences) => {
      if (occurrences.length <= 1) return;
      const canonical = pickCanonical(occurrences);
      const autoDeleteNoteIds = occurrences
        .map((o) => o.noteId)
        .filter((id) => id !== canonical.noteId);

      autoResolvedGroups.push({
        containerSignatureWithSubject: String(occurrences[0].containerSignatureWithSubject || ''),
        canonicalNoteId: canonical.noteId,
        autoDeleteNoteIds,
      });

      // Mark only the duplicates as "used", not the canonical
      autoDeleteNoteIds.forEach((id) => usedNoteIds.add(id));
    });

    // Remaining occurrences after auto-resolve
    const remainingAfterAuto = entry.occurrences.filter((o) => !usedNoteIds.has(o.noteId));

    // Case 2: same containerSignature but different containerSignatureWithSubject
    const byContainer = groupBy(remainingAfterAuto, (occ) => String(occ.containerSignature || ''));
    Object.values(byContainer).forEach((occurrences) => {
      if (occurrences.length <= 1) return;
      const distinctWithSubject = new Set(
        occurrences.map((o) => String(o.containerSignatureWithSubject || '')),
      );
      if (distinctWithSubject.size <= 1) return;

      manualGroups.push({
        reason: 'sameContainerDifferentSubject',
        decisionRequired: true,
        keepNoteId: null,
        deleteNoteIds: [],
        options: occurrences.map((o) => ({
          noteId: o.noteId,
          title: o.title,
          topicId: o.topicId,
          subjectId: o.subjectId,
          containerSignature: o.containerSignature,
          containerSignatureWithSubject: o.containerSignatureWithSubject,
        })),
      });

      occurrences.forEach((o) => usedNoteIds.add(o.noteId));
    });

    // Remaining occurrences after case 2
    const remainingAfterManualSameContainer = entry.occurrences.filter(
      (o) => !usedNoteIds.has(o.noteId),
    );

    // Case 3: different containers
    if (remainingAfterManualSameContainer.length > 1) {
      manualGroups.push({
        reason: 'differentContainers',
        decisionRequired: true,
        keepNoteId: null,
        deleteNoteIds: [],
        options: remainingAfterManualSameContainer.map((o) => ({
          noteId: o.noteId,
          title: o.title,
          topicId: o.topicId,
          subjectId: o.subjectId,
          containerSignature: o.containerSignature,
          containerSignatureWithSubject: o.containerSignatureWithSubject,
        })),
      });
    }

    plan[entry.pairHash] = {
      pairHash: entry.pairHash,
      autoResolvedGroups,
      manualGroups,
    };

    totalAutoResolvedGroups += autoResolvedGroups.length;
    totalManualGroups += manualGroups.length;
  }

  fs.writeFileSync(planOutputPath, JSON.stringify(plan, null, 2), 'utf8');
  console.log(`Wrote turn dedup plan to ${planOutputPath}`);
  console.log(`Total pairHashes in plan: ${Object.keys(plan).length}`);
  console.log(`Total autoResolvedGroups: ${totalAutoResolvedGroups}`);
  console.log(`Total manualGroups: ${totalManualGroups}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
