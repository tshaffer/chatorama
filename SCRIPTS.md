# Chatalog Scripts Reference (SCRIPTS.md)

_Generated from attached scripts archive on 2025-12-26 (America/Los_Angeles)._

This document describes what each script does and how to run it. Commands assume you are in the **Chatalog backend** package unless noted.

## Quick prerequisites

- **Node/TS runner:** most `.ts` scripts are intended to be run with `tsx` (or `ts-node`).
- **Mongo connection:** many scripts require `MONGO_URI` (see `env.example`).
- **Safety:** several scripts support `--dryRun` / `--apply` patterns. When in doubt, run the dry-run variant first.

## Environment variables (from env.example)

- `MONGO_URI`
- `CONVERSATIONS_JSON_PATH`
- `AI_SEED_JSON_PATH`
- `AI_CLASSIFICATION_JSON_PATH`

## NPM scripts (package.json)

From the attached `package.json`:

- `npm run dev` → `concurrently -k -n server,typecheck -c auto "tsx watch src/server.ts" "tsc --noEmit --watch"`
- `npm run build` → `tsc -p tsconfig.build.json`
- `npm run start` → `node dist/server.js`
- `npm run typecheck` → `tsc --noEmit`
- `npm run seed` → `tsx scripts/seedFromData.ts`
- `npm run seed:reset` → `RESET_DB=1 tsx scripts/seedFromData.ts`
- `npm run audit:downloads` → `tsx src/scripts/auditChatworthyDownloads.ts`
- `npm run audit:aberrant` → `tsx src/scripts/detectAberrantTurnBlocks.ts --out audit-aberrant-exports.json`
- `npm run import:baseline` → `tsx scripts/importChatRegistriesFromConversations.ts`
- `npm run unreviewed:html` → `tsx scripts/generateUnreviewedChatsHtml.ts`

## Script index

| Category | Script | What it does | Typical invocation |
|---|---|---|---|
| Audits & Reports | `auditChatworthyDownloads.ts` | Audit Chatworthy download/export folder(s) and produce coverage/consistency reports vs DB and/or registries. | `tsx auditChatworthyDownloads.ts` |
| Audits & Reports | `check-chatworthy-files-against-db.ts` | Compare Chatworthy-exported markdown files against the database to find missing/extra/duplicate imports. | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" \` |
| Audits & Reports | `detectAberrantTurnBlocks.ts` | Detect malformed or unexpected turn blocks in Chatworthy markdown exports (writes an audit JSON). | `npx tsx src/scripts/detectAberrantTurnBlocks.ts` |
| Audits & Reports | `diff-audit-strict.js` | Strict diff between two audit outputs (or two export snapshots), highlighting mismatches. | `console.error("Usage: node diff-audit-strict.js <old.json> <new.json>");` |
| Audits & Reports | `fix-chatworthy-total-turns.ts` | Fix or backfill 'totalTurns' metadata for Chatworthy-imported chats/notes. | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" \` |
| Backup & Restore | `backup-chatalog-auto.sh` | backup chatalog auto | `#   MONGO_URI='mongodb+srv://...'` |
| Backup & Restore | `backup-chatalog.sh` | backup chatalog | `#   MONGO_URI='mongodb+srv://...'` |
| Backup & Restore | `restore-chatalog.sh` | restore chatalog | `#   MONGO_URI='mongodb+srv://...' ./restore-chatalog.sh /path/to/backup/dir` |
| ChatGPT UI helpers | `bulkUnarchiveRunner` | bulkUnarchiveRunner | `(see section)` |
| ChatGPT UI helpers | `stopTamperMonkeyScript` | stopTamperMonkeyScript | `(see section)` |
| ChatGPT UI helpers | `tamperMonkeyScript` | ==UserScript== | `(see section)` |
| ChatGPT UI helpers | `toUseWithTamperMonkey` | toUseWithTamperMonkey | `(see section)` |
| Deduplication | `applyTurnDedupPlan.ts` | Apply a generated turn-deduplication plan (optionally live) to merge/remove duplicate notes and reconcile turn fingerprints. | `npx ts-node scripts/validateTurnDedupPlan.ts` |
| Deduplication | `duplicateTurnsReport.ts` | Report duplicate turns across notes (by turn fingerprint) and output a JSON report. | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" \` |
| Deduplication | `generateTurnDedupPlan.ts` | Analyze notes/turn fingerprints and generate a turn-deduplication plan JSON for later review and application. | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" \` |
| Deduplication | `validateTurnDedupPlan.ts` | Validate a turn-deduplication plan JSON (sanity checks, required manual decisions, etc.). | `npx ts-node scripts/validateTurnDedupPlan.ts` |
| Export | `export-ai-hierarchy.ts` | Export current Subjects/Topics hierarchy into an AI-friendly JSON format for classification reuse. | `MONGO_URI="mongodb://localhost:27017/chatalog" \` |
| Import | `importChatRegistriesFromConversations.ts` | Import chat registries (chat list/metadata) from conversations.json into Chatalog. | `tsx importChatRegistriesFromConversations.ts` |
| Import | `report-chatworthy-import-coverage.ts` | Report how well Chatworthy exports have been imported (missing turn indexes, etc.). | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" \` |
| Misc | `apply-ai-classification-batch.ts` | Apply AI classification output (subject/topic assignments + suggested titles) to the DB incrementally. | `MONGO_URI="mongodb://localhost:27017/chatalog" \` |
| Misc | `compare-turn5.ts` | Compare turn hashing/extraction outputs between versions (v1 vs v2/v5) for a specific note/turn. | `tsx compare-turn5.ts` |
| Misc | `debug-db-turn.js` | Debug helper: load a note + compute/extract a specific turn to compare against stored fingerprints. | `throw new Error('Usage: tsx scripts/debug-db-turn.ts <noteId> [turnIndex]');` |
| Misc | `debug-db-turn.ts` | Debug helper: load a note + compute/extract a specific turn to compare against stored fingerprints. | `tsx debug-db-turn.ts` |
| Misc | `deleteNote.js` | Delete a note and perform cascade cleanup (topic/subject references, related records). | `node deleteNote.js` |
| Misc | `generateUnreviewedChatsHtml.ts` | Generate an HTML page listing unreviewed chats (for easy browsing/triage). | `tsx generateUnreviewedChatsHtml.ts` |
| Ordering & maintenance | `backfill-note-order.js` | Backfill the 'order' field on notes (and/or related entities) for consistent sorting. | `node backfill-note-order.js` |
| Ordering & maintenance | `init-subject-topic-order.ts` | Initialize order fields for subjects/topics for stable UI ordering. | `tsx init-subject-topic-order.ts` |
| Seeding & AI classification | `export-ai-seed-from-chatworthy.ts` | Parse Chatworthy markdown exports into an 'ai-seed' JSON dataset of prompt/response turns. | `npx ts-node scripts/export-ai-seed-from-chatworthy.ts \` |
| Seeding & AI classification | `seed-from-ai-classification.ts` | Seed Subjects/Topics and/or Notes from an AI classification JSON (bootstrap a DB from AI output). | `MONGO_URI="mongodb://localhost:27017/chatalog" \` |
| Seeding & AI classification | `seedFromData.ts` | Seed the database with baseline data (optionally resetting DB). | `tsx seedFromData.ts` |
| Turn fingerprints | `backfill-turnfingerprints-v2.ts` | Backfill turn fingerprints for notes based on prompt/response extraction from markdown. | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" npx ts-node src/scripts/backfill-turnfingerprints-v2.ts` |
| Turn fingerprints | `backfillTurnFingerprints.ts` | Backfill turn fingerprints for notes based on prompt/response extraction from markdown. | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" \` |
| Turn fingerprints | `create-turnfingerprint-indexes.ts` | Create MongoDB indexes related to turn fingerprints (performance/uniqueness constraints). | `tsx create-turnfingerprint-indexes.ts` |
| Turn fingerprints | `deleteOrphanTurnFingerprints.ts` | Delete turn fingerprint documents that no longer have a corresponding note (supports dry-run). | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" \` |
| Turn fingerprints | `orphanTurnFingerprintsReport.ts` | Report turn fingerprint documents that reference missing notes (orphans). | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" \` |
| Turn fingerprints | `rebuildTurnFingerprints.ts` | Recompute/rebuild turn fingerprints from note markdown content (useful after hash algorithm or extraction logic changes). | `MONGO_URI="mongodb://localhost:27017/chatalog_dev" \` |
| Utilities | `extract-chat-urls.mjs` | Utility to extract ChatGPT chat URLs from exports / and/or generate clickable link lists. | `node extract-chat-urls.mjs /path/to/conversations.json > archived_chat_urls.txt` |
| Utilities | `findMarkdownFiles.sh` | Find markdown files under a directory (helper for piping into other scripts). | `bash findMarkdownFiles.sh` |
| Utilities | `make-chat-links.mjs` | Utility to extract ChatGPT chat URLs from exports / and/or generate clickable link lists. | `node make-chat-links.mjs /path/to/conversations.json /path/to/out.html` |

## Conventions used below

- Paths in the usage examples may show `scripts/...` or `src/scripts/...` depending on where you keep them in your repo. Adjust as needed.
- For `.ts` scripts, if you prefer `ts-node`, you can usually swap `tsx <script>` with `npx ts-node <script>`.
- For **mongosh** scripts (`.js` that reference `db` directly), run them using `mongosh` and `load(...)` as shown.

## Audits & Reports

### `auditChatworthyDownloads.ts`

Audit Chatworthy download/export folder(s) and produce coverage/consistency reports vs DB and/or registries.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `Subject`, `Topic`, `TurnFingerprint`

**Typical usage:**

```bash
tsx auditChatworthyDownloads.ts
```

### `check-chatworthy-files-against-db.ts`

Compare Chatworthy-exported markdown files against the database to find missing/extra/duplicate imports.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`

**Usage (from script header):**

```bash
Usage (from packages/chatalog/backend):

  # Full report (table + JSON)
  MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
    npx ts-node scripts/check-chatworthy-files-against-db.ts /path/to/chatworthy/exports

  # BRIEF MODE: only files that are none/partial, with prompt snippets
  MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
    npx ts-node scripts/check-chatworthy-files-against-db.ts /path/to/chatworthy/exports --brief
    npx ts-node scripts/check-chatworthy-files-against-db.ts /Users/tedshaffer/Documents/ChatworthyExports/manual --brief

This script:
  - Scans a directory recursively for .md files
  - For each file, parses Chatworthy front matter + anchors:
chatId (or falls back to noteId)
chatTitle
number of turns in the file
  - Looks in MongoDB for notes that match either:
chatworthyChatId == chatId, or
chatworthyFileName == <basename of the .md file>
  - For each file, reports:
none    → no turns from this chat/file are in DB
partial → some but not all turns from this chat/file are in DB
complete→ all turns in the file are already in DB
  - Always writes JSON to ./data/chatworthy-file-status.json
  - In --brief mode, prints ONLY:
Filenames with status NONE/PARTIAL
For PARTIAL: first 120 chars of each missing turn section
    and writes the same text to ./data/chatworthy-file-status.txt
```

### `detectAberrantTurnBlocks.ts`

Detect malformed or unexpected turn blocks in Chatworthy markdown exports (writes an audit JSON).

**Usage (from script header):**

```bash
Usage (from the same package that has tsx in dev deps):
  npx tsx src/scripts/detectAberrantTurnBlocks.ts
  npx tsx src/scripts/detectAberrantTurnBlocks.ts --out ./audit-aberrant-exports.json
  npx tsx src/scripts/detectAberrantTurnBlocks.ts --limit 200

Notes:
- Uses the same ~/Downloads glob as your audit script.
- Does NOT connect to MongoDB (pure file scan).

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import fg from 'fast-glob';
import matter from 'gray-matter';

type AberrantKind =
  | 'TURNS_BLOCK' // :::turns ... :::end-turns present
  | 'TRANSCRIPT_HEADER' // "# Transcript" present
  | 'TURNS_LIST_ITEMS' // "- role:" lines present
  | 'MIXED'; // more than one signal

type FileFinding = {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  hasFrontMatter: boolean;
  frontMatterKeys: string[];
  signals: {
    hasTranscriptHeader: boolean;
    hasTurnsFence: boolean;
```

**Notable flags (best-effort):** `--limit`, `--out`

### `diff-audit-strict.js`

Strict diff between two audit outputs (or two export snapshots), highlighting mismatches.

**Usage (from script header):**

```bash
if (!oldPath || !newPath) {
  console.error("Usage: node diff-audit-strict.js <old.json> <new.json>");
  process.exit(1);
}

const oldRpt = load(oldPath);
const newRpt = load(newPath);

key by stable identity: filePath (best), fallback to fileName
function keyOf(f) {
  return f.filePath || f.fileName;
}

const oldMap = new Map(oldRpt.files.map(f => [keyOf(f), f]));
const newMap = new Map(newRpt.files.map(f => [keyOf(f), f]));

const changed = [];
for (const [k, oldF] of oldMap.entries()) {
  const newF = newMap.get(k);
  if (!newF) continue;

  if (oldF.inDbStrict === true && newF.inDbStrict === false) {
    changed.push({
      fileName: newF.fileName,
      filePath: newF.filePath,
      chatId: newF.chatId,
      oldCoverage: oldF.strictCoverage,
      newCoverage: newF.strictCoverage,
      oldMatched: oldF.matchedTurnIndices || [],
      newMatched: newF.matchedTurnIndices || [],
      oldTurnCount: oldF.turnCount,
```

### `fix-chatworthy-total-turns.ts`

Fix or backfill 'totalTurns' metadata for Chatworthy-imported chats/notes.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`

**Usage (from script header):**

```bash
Usage (from packages/chatalog/backend):
  MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
  npx ts-node scripts/fix-chatworthy-total-turns.ts

This script:
  - Finds all notes with Chatworthy provenance
  - Groups them by (chatworthyChatId || chatworthyFileName)
  - For each group, computes the max chatworthyTurnIndex
  - Sets chatworthyTotalTurns = that max for all notes in the group


import mongoose from 'mongoose';
import { NoteModel } from '../src/models/Note';

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI environment variable is required');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  const notes = await NoteModel.find({
    $or: [
      { chatworthyChatId: { $ne: null } },
      { chatworthyFileName: { $ne: null } },
    ],
  })
    .select(
```

**Safety notes:**

- Writes to the DB: run on a test DB first if you can.

## Backup & Restore

### `backup-chatalog-auto.sh`

backup chatalog auto

**Usage (from script header):**

```bash
#
# Usage:
#   MONGO_URI='mongodb+srv://...'
#   ./backup-chatalog-auto.sh
#
# Creates snapshot directories:
#   /Users/tedshaffer/Documents/MongoDBBackups/chatorama/backup-<month>-<day>-<n>
# And maintains:
#   /Users/tedshaffer/Documents/MongoDBBackups/chatorama/latest -> backup-...

set -euo pipefail

BASE_DIR="/Users/tedshaffer/Documents/MongoDBBackups/chatorama"
mkdir -p "$BASE_DIR"

month="$(date +%-m)"
day="$(date +%-d)"
prefix="backup-${month}-${day}-"

max_index=-1
shopt -s nullglob
for path in "${BASE_DIR}/${prefix}"*; do
  [[ -d "$path" ]] || continue
  name="${path##*/}"
  suffix="${name#${prefix}}"
  if [[ "$suffix" =~ ^[0-9]+$ ]]; then
    if (( suffix > max_index )); then
      max_index="$suffix"
    fi
  fi
done
```

### `backup-chatalog.sh`

backup chatalog

**Usage (from script header):**

```bash
#
# Usage:
#   MONGO_URI='mongodb+srv://...'
#   ./backup-chatalog.sh /path/to/backup/dir
#
# Outputs:
#   subjects.json, topics.json, quicknotes.json, turnfingerprints.json
#   notes/manifest.json + notes/notes-*.json (chunks of 10)

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <output-directory>"
  exit 1
fi

if [ -z "${MONGO_URI:-}" ]; then
  echo "Error: MONGO_URI environment variable is not set."
  exit 1
fi

OUTPUT_DIR="$1"
mkdir -p "$OUTPUT_DIR"

echo "Using MONGO_URI: $MONGO_URI"
echo "Writing backups to: $OUTPUT_DIR"
echo

# Export these collections as single files (as before)
collections=("subjects" "topics" "quicknotes" "turnfingerprints")
```

**Notable flags (best-effort):** `--out`

### `restore-chatalog.sh`

restore chatalog

**Usage (from script header):**

```bash
#
# Usage:
#   MONGO_URI='mongodb+srv://...' ./restore-chatalog.sh /path/to/backup/dir
#
# Supports:
#   - subjects.json, topics.json, quicknotes.json, turnfingerprints.json (single-file)
#   - notes either as:
#       A) notes/notes-*.json (preferred, chunked NDJSON)
#       B) notes.json (legacy, single file)

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <backup-directory>"
  exit 1
fi

if [ -z "${MONGO_URI:-}" ]; then
  echo "Error: MONGO_URI environment variable is not set."
  echo "Example:"
  echo "  export MONGO_URI='mongodb+srv://pizza:password@cluster0.ihsik.mongodb.net/chatalog_dev?retryWrites=true&w=majority'"
  echo "  $0 /path/to/backup/dir"
  exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: backup directory does not exist: $BACKUP_DIR"
  exit 1
fi
```

## Deduplication

### `applyTurnDedupPlan.ts`

Apply a generated turn-deduplication plan (optionally live) to merge/remove duplicate notes and reconcile turn fingerprints.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `TurnFingerprint`

**Usage (from script header):**

```bash
Usage:
  cd backend
  npx ts-node scripts/validateTurnDedupPlan.ts
  npx ts-node scripts/applyTurnDedupPlan.ts           # DRY RUN
  npx ts-node scripts/applyTurnDedupPlan.ts --apply   # LIVE
  npx ts-node scripts/applyTurnDedupPlan.ts --logfile           # DRY RUN

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
```

**Notable flags (best-effort):** `--apply`, `--logfile`

**Safety notes:**

- Writes to the DB: run on a test DB first if you can.

### `duplicateTurnsReport.ts`

Report duplicate turns across notes (by turn fingerprint) and output a JSON report.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `TurnFingerprint`

**Usage (from script header):**

```bash
Usage:
MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
  npx ts-node scripts/duplicateTurnsReport.ts

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
```

### `generateTurnDedupPlan.ts`

Analyze notes/turn fingerprints and generate a turn-deduplication plan JSON for later review and application.

**Usage (from script header):**

```bash
Usage:
  cd backend
  MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
    npx ts-node scripts/duplicateTurnsReport.ts
  npx ts-node scripts/generateTurnDedupPlan.ts

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
```

### `validateTurnDedupPlan.ts`

Validate a turn-deduplication plan JSON (sanity checks, required manual decisions, etc.).

**Usage (from script header):**

```bash
Usage:
  cd backend
  npx ts-node scripts/validateTurnDedupPlan.ts

This script validates turnDedupPlan.json for internal consistency.
It does NOT touch the database.

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
```

## Export

### `export-ai-hierarchy.ts`

Export current Subjects/Topics hierarchy into an AI-friendly JSON format for classification reuse.

**Env:** `MONGO_URI`

**Touches (likely):** `Subject`, `Topic`

**Usage (from script header):**

```bash
Usage (from packages/chatalog/backend):

  MONGO_URI="mongodb://localhost:27017/chatalog" \
  npx ts-node scripts/export-ai-hierarchy.ts > ./local-data/ai-hierarchy-for-ai.json


import mongoose from 'mongoose';
import { SubjectModel } from '../src/models/Subject';
import { TopicModel } from '../src/models/Topic';

type AiHierarchySubject = {
  id: string;        // Mongo id as string
  name: string;
  slug: string;
};

type AiHierarchyTopic = {
  id: string;        // Mongo id as string
  subjectId: string; // Mongo subject id
  subjectName: string;
  name: string;
  slug: string;
};

type AiHierarchyExport = {
  version: number;
  generatedAt: string;
  subjects: AiHierarchySubject[];
  topics: AiHierarchyTopic[];
};
```

## Import

### `importChatRegistriesFromConversations.ts`

Import chat registries (chat list/metadata) from conversations.json into Chatalog.

**Typical usage:**

```bash
tsx importChatRegistriesFromConversations.ts
```

### `report-chatworthy-import-coverage.ts`

Report how well Chatworthy exports have been imported (missing turn indexes, etc.).

**Env:** `MONGO_URI`

**Touches (likely):** `Note`

**Usage (from script header):**

```bash
Usage (from packages/chatalog/backend):
  MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
  npx ts-node scripts/report-chatworthy-import-coverage.ts

This script:
  - Scans all notes that have Chatworthy provenance
  - Groups them by chat (preferring chatworthyChatId, falling back to chatworthyFileName)
  - Computes per-chat coverage:
importedTurnIndexes
missingTurnIndexes
importedTurnCount
totalTurns (from chatworthyTotalTurns, with fallback)
status: 'complete' | 'partial' | 'unknown'
  - Prints a summary table to stdout
  - Writes JSON to ./data/chatworthy-import-coverage.json


import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { NoteModel } from '../src/models/Note';

type ChatImportStatus = 'complete' | 'partial' | 'unknown';

type ChatImportSummary = {
  chatworthyChatId: string; // may be the real chatId or, if missing, the file name
  chatworthyChatTitle?: string | null;
  chatworthyFileNames: string[];
  importedTurnIndexes: number[];
  missingTurnIndexes: number[];
```

## Misc

### `apply-ai-classification-batch.ts`

Apply AI classification output (subject/topic assignments + suggested titles) to the DB incrementally.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `Subject`, `Topic`

**Usage (from script header):**

```bash
Usage (from packages/chatalog/backend):

  MONGO_URI="mongodb://localhost:27017/chatalog" \
  npx ts-node scripts/apply-ai-classification-batch.ts \
    ./local-data/ai-classification-batch-2.json \
    ./local-data/ai-seed-batch-2.json


import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

import { SubjectModel } from '../src/models/Subject';
import { TopicModel } from '../src/models/Topic';
import { NoteModel } from '../src/models/Note';

---------- Types for "full" classification schema ----------

type FullClassificationSubject = {
  id: string;   // AI-level id, e.g. "S-personal-health-nutrition"
  name: string;
};

type FullClassificationTopic = {
  id: string;        // AI-level id, e.g. "T-on-ride-fuel-bars-vs-fruit"
  subjectId: string; // AI-level subject id
  name: string;
};

type FullClassificationNote = {
```

**Safety notes:**

- Writes to the DB: run on a test DB first if you can.

### `compare-turn5.ts`

Compare turn hashing/extraction outputs between versions (v1 vs v2/v5) for a specific note/turn.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`

**Usage (from script header):**

```bash
if (!noteId || !mdFilePath) {
      throw new Error('Usage: compare-turn5.ts <noteId> <mdFilePath> [turnIndex]');
    }

---- DB turn ----
    const note = await NoteModel.findById(noteId, { title: 1, markdown: 1 }).lean().exec();
    if (!note) throw new Error(`Note not found: ${noteId}`);

    const dbTurns = extractPromptResponseTurns((note as any).markdown ?? '');
    const dbT = dbTurns.find((x) => (x.turnIndex ?? -1) === turnIndex) ?? dbTurns[turnIndex];
    if (!dbT) throw new Error(`DB turn ${turnIndex} not found (turns=${dbTurns.length})`);

    const dbHashV1 = hashPromptResponsePair(dbT.prompt, dbT.response, 1);
    const dbHashV2 = hashPromptResponsePair(dbT.prompt, dbT.response, 2);

---- FILE turn ----
    const raw = await fs.readFile(mdFilePath, 'utf8');
    const gm = matter(raw);
    const fileContent = gm.content ?? raw;

    const fileTurns = extractPromptResponseTurns(fileContent);
    const fileT = fileTurns.find((x) => (x.turnIndex ?? -1) === turnIndex) ?? fileTurns[turnIndex];
    if (!fileT) throw new Error(`FILE turn ${turnIndex} not found (turns=${fileTurns.length})`);

    const fileHashV1 = hashPromptResponsePair(fileT.prompt, fileT.response, 1);
    const fileHashV2 = hashPromptResponsePair(fileT.prompt, fileT.response, 2);

    console.log('NOTE title:', (note as any).title);
    console.log('turnIndex:', turnIndex);
    console.log('DB hash v1:  ', dbHashV1);
    console.log('DB hash v2:  ', dbHashV2);
```

### `debug-db-turn.js`

Debug helper: load a note + compute/extract a specific turn to compare against stored fingerprints.

**Touches (likely):** `Note`

**Usage (from script header):**

```bash
if (!noteId)
                        throw new Error('Usage: tsx scripts/debug-db-turn.ts <noteId> [turnIndex]');
                    turnIndex = Number((_a = process.argv[3]) !== null && _a !== void 0 ? _a : '5');
                    return [4 /*yield*/, Note_1.NoteModel.findById(noteId, { title: 1, markdown: 1 }).lean().exec()];
                case 1:
                    note = _d.sent();
                    if (!note)
                        throw new Error("Note not found: ".concat(noteId));
                    turns = (0, textHash_1.extractPromptResponseTurns)((_b = note.markdown) !== null && _b !== void 0 ? _b : '');
                    t = (_c = turns.find(function (x) { var _a; return ((_a = x.turnIndex) !== null && _a !== void 0 ? _a : -1) === turnIndex; })) !== null && _c !== void 0 ? _c : turns[turnIndex];
                    console.log('NOTE title:', note.title);
                    console.log('DB turns length:', turns.length);
                    console.log('DB turnIndex requested:', turnIndex);
                    console.log('DB extracted turnIndex:', t === null || t === void 0 ? void 0 : t.turnIndex);
                    console.log('DB prompt:', JSON.stringify(t === null || t === void 0 ? void 0 : t.prompt));
                    console.log('DB response:', JSON.stringify(t === null || t === void 0 ? void 0 : t.response));
                    console.log('DB pairHash:', t ? (0, textHash_1.hashPromptResponsePair)(t.prompt, t.response) : null);
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (e) {
    console.error(e);
    process.exit(1);
});
```

### `debug-db-turn.ts`

Debug helper: load a note + compute/extract a specific turn to compare against stored fingerprints.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`

**Usage (from script header):**

```bash
const turnIndex = Number(process.argv[3] ?? '5');
    if (!noteId) throw new Error('Usage: debug-db-turn.ts <noteId> [turnIndex]');

    const note = await NoteModel.findById(noteId, { title: 1, markdown: 1 }).lean().exec();
    if (!note) throw new Error(`Note not found: ${noteId}`);

    const turns = extractPromptResponseTurns((note as any).markdown ?? '');
    const t = turns.find((x) => (x.turnIndex ?? -1) === turnIndex) ?? turns[turnIndex];

    console.log('NOTE title:', (note as any).title);
    console.log('DB turns length:', turns.length);
    console.log('DB turnIndex requested:', turnIndex);
    console.log('DB extracted turnIndex:', t?.turnIndex);
    console.log('DB prompt:', JSON.stringify(t?.prompt));
    console.log('DB response:', JSON.stringify(t?.response));
    const h1 = t ? hashPromptResponsePair(t.prompt, t.response, 1) : null;
    const h2 = t ? hashPromptResponsePair(t.prompt, t.response, 2) : null;
    console.log('DB pairHash v1:', h1);
    console.log('DB pairHash v2:', h2);

    console.log('prompt length:', t?.prompt?.length);
    console.log('response length:', t?.response?.length);

  } finally {
    await db.disconnectFromDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
```

### `deleteNote.js`

Delete a note and perform cascade cleanup (topic/subject references, related records).

**Typical usage:**

```bash
mongosh "<your Mongo URI (or omit if configured)>"
> load("deleteNote.js")
```

**Safety notes:**

- Destructive: make sure you have a backup and/or use any available dry-run mode first.

### `generateUnreviewedChatsHtml.ts`

Generate an HTML page listing unreviewed chats (for easy browsing/triage).

**Touches (likely):** `ChatRegistry`

**Typical usage:**

```bash
tsx generateUnreviewedChatsHtml.ts
```

## Ordering & maintenance

### `backfill-note-order.js`

Backfill the 'order' field on notes (and/or related entities) for consistent sorting.

**Typical usage:**

```bash
mongosh "<your Mongo URI (or omit if configured)>"
> load("backfill-note-order.js")
```

**Safety notes:**

- Writes to the DB: run on a test DB first if you can.

### `init-subject-topic-order.ts`

Initialize order fields for subjects/topics for stable UI ordering.

**Env:** `CHATALOG_MONGO_URI`, `DATABASE_URI`, `MONGO_URI`

**Touches (likely):** `Subject`, `Topic`

**Typical usage:**

```bash
tsx init-subject-topic-order.ts
```

**Safety notes:**

- Writes to the DB: run on a test DB first if you can.

## Seeding & AI classification

### `export-ai-seed-from-chatworthy.ts`

Parse Chatworthy markdown exports into an 'ai-seed' JSON dataset of prompt/response turns.

**Usage (from script header):**

```bash
Usage (example):
  npx ts-node scripts/export-ai-seed-from-chatworthy.ts \
    "/Users/tedshaffer/Documents/ChatworthyExports/v1/**/*.md" \
    > ./data/ai-seed-v2.json

Or, if you prefer to just pass a directory, this script will expand it:
  npx ts-node scripts/export-ai-seed-from-chatworthy.ts \
    "/Users/tedshaffer/Documents/ChatworthyExports/v1" \
    > ./data/ai-seed-v2.json

Assumptions:
- Chatworthy export format as in your example (anchors + **Prompt**/**Response**).
- Each Prompt/Response block is one "turn" -> one ai-seed note entry.
- Front matter contains: noteId, subject, topic, chatTitle, exportedAt, etc.

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { globSync } from 'glob';

type FrontMatter = {
  noteId: string;
  subject?: string;
  topic?: string;
  chatTitle?: string;
  [key: string]: any;
};

type AiSeedNote = {
  aiNoteKey: string;
```

### `seed-from-ai-classification.ts`

Seed Subjects/Topics and/or Notes from an AI classification JSON (bootstrap a DB from AI output).

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `Subject`, `Topic`

**Usage (from script header):**

```bash
Usage (from packages/chatalog/backend):
  MONGO_URI="mongodb://localhost:27017/chatalog" \
  npx ts-node scripts/seed-from-ai-classification.ts \
    ./data/ai-classification-v1.json \
    ./data/ai-seed-v1.json


import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { SubjectModel } from '../src/models/Subject';
import { TopicModel } from '../src/models/Topic';
import { NoteModel } from '../src/models/Note';

---------- Types matching our JSONs ----------

type ClassificationSubject = {
  id: string;
  name: string;
};

type ClassificationTopic = {
  id: string;
  subjectId: string;
  name: string;
};

type ClassificationTopicRelation = {
  sourceTopicId: string;
  targetTopicId: string;
```

### `seedFromData.ts`

Seed the database with baseline data (optionally resetting DB).

**Env:** `MONGO_URI`, `RESET_DB`

**Typical usage:**

```bash
tsx seedFromData.ts
```

## Turn fingerprints

### `backfill-turnfingerprints-v2.ts`

Backfill turn fingerprints for notes based on prompt/response extraction from markdown.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `TurnFingerprint`

**Usage (from script header):**

```bash
Usage:
  MONGO_URI="mongodb://localhost:27017/chatalog_dev" npx ts-node src/scripts/backfill-turnfingerprints-v2.ts
  (or run with your repo’s preferred runner, e.g. pnpm tsx)

Notes:
  - Upserts are keyed by (sourceType, noteId, turnIndex, hashVersion=2)
  - Only uses $setOnInsert to avoid MongoDB update path conflicts and to avoid changing v2 docs after creation.

import { NoteModel } from '../models/Note';
import { TurnFingerprintModel } from '../models/TurnFingerprintModel';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../utils/textHash';

const BATCH_SIZE = 200;

function ensureMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required to run backfill-turnfingerprints-v2.');
    process.exit(1);
  }
  return uri;
}

type Stats = {
  processedNotes: number;
  processedTurns: number;
  ops: number;
};

async function processNotes(notes: any[], stats: Stats): Promise<void> {
```

**Safety notes:**

- Writes to the DB: run on a test DB first if you can.

### `backfillTurnFingerprints.ts`

Backfill turn fingerprints for notes based on prompt/response extraction from markdown.

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `TurnFingerprint`

**Usage (from script header):**

```bash
Usage:
MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
  npx ts-node scripts/backfillTurnFingerprints.ts

import mongoose from 'mongoose';
import { NoteModel } from '../src/models/Note';
import { TurnFingerprintModel } from '../src/models/TurnFingerprintModel';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../src/utils/textHash';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to Mongo');

  const cursor = NoteModel.find({
    markdown: { $exists: true, $ne: '' },
  })
    .lean()
    .cursor();

  let processed = 0;
  for await (const note of cursor as any) {
    processed += 1;
    if (processed % 100 === 0) console.log(`Processed ${processed} notes...`);
```

**Safety notes:**

- Writes to the DB: run on a test DB first if you can.

### `create-turnfingerprint-indexes.ts`

Create MongoDB indexes related to turn fingerprints (performance/uniqueness constraints).

**Env:** `MONGO_URI`

**Touches (likely):** `TurnFingerprint`

**Typical usage:**

```bash
tsx create-turnfingerprint-indexes.ts
```

### `deleteOrphanTurnFingerprints.ts`

Delete turn fingerprint documents that no longer have a corresponding note (supports dry-run).

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `TurnFingerprint`

**Usage (from script header):**

```bash
Usage (dry run):
MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
  npx ts-node scripts/deleteOrphanTurnFingerprints.ts --dry-run

Usage (delete):
MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
  npx ts-node scripts/deleteOrphanTurnFingerprints.ts

Options:
  --dry-run     Do not delete, only report how many would be deleted
  --batch=5000  Batch size for deletions (default 5000)

Output:
  scripts/deleteOrphanTurnFingerprints.result.json

import mongoose from 'mongoose';
import * as fs from 'fs';
import path from 'path';

import { NoteModel } from '../src/models/Note';
import { TurnFingerprintModel } from '../src/models/TurnFingerprintModel';

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const batchArg = argv.find((a) => a.startsWith('--batch='));
  const batchSize = batchArg ? Number(batchArg.split('=')[1]) : 5000;
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid --batch value: ${batchArg}`);
  }
  return { dryRun, batchSize };
```

**Notable flags (best-effort):** `--batch`

**Safety notes:**

- Destructive: make sure you have a backup and/or use any available dry-run mode first.

### `orphanTurnFingerprintsReport.ts`

Report turn fingerprint documents that reference missing notes (orphans).

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `TurnFingerprint`

**Usage (from script header):**

```bash
Usage:
MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
  npx ts-node scripts/orphanTurnFingerprintsReport.ts

Output:
  scripts/orphanTurnFingerprintsReport.json

import mongoose from 'mongoose';
import * as fs from 'fs';
import path from 'path';

import { NoteModel } from '../src/models/Note';
import { TurnFingerprintModel } from '../src/models/TurnFingerprintModel';

type OrphanFingerprint = {
  _id: any;
  noteId: any;
  sourceType?: string;
  chatId?: string;
  turnIndex?: number;
  pairHash?: string;
  createdAt?: Date;
};

type ChatSummary = {
  chatId: string | null;
  orphanCount: number;
  uniqueNoteIds: number;
};
```

### `rebuildTurnFingerprints.ts`

Recompute/rebuild turn fingerprints from note markdown content (useful after hash algorithm or extraction logic changes).

**Env:** `MONGO_URI`

**Touches (likely):** `Note`, `TurnFingerprint`

**Usage (from script header):**

```bash
Usage:
  cd backend
  MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
    npx ts-node scripts/rebuildTurnFingerprints.ts

import mongoose from 'mongoose';
import { NoteModel } from '../src/models/Note';
import { TurnFingerprintModel } from '../src/models/TurnFingerprintModel';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../src/utils/textHash';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const deleteRes = await TurnFingerprintModel.deleteMany({}).exec();
  console.log(`Cleared ${deleteRes.deletedCount ?? 0} existing turn fingerprints`);

  const cursor = NoteModel.find(
    { $or: [{ sourceType: 'chatworthy' }, { 'sources.type': 'chatworthy' }] }
  )
    .lean()
    .cursor();

  let processedNotes = 0;
```

**Safety notes:**

- Writes to the DB: run on a test DB first if you can.

## Utilities

### `extract-chat-urls.mjs`

Utility to extract ChatGPT chat URLs from exports / and/or generate clickable link lists.

**Usage (from script header):**

```bash
Usage:
  node extract-chat-urls.mjs /path/to/conversations.json > archived_chat_urls.txt
  node scripts/extract-chat-urls.mjs /Users/tedshaffer/Documents/ChatGPTExports/ChatGPTFullDataExport-12-24-2025/conversations.json > /Users/tedshaffer/Documents/ChatGPTExports/archived_chat_urls.txt

Notes:
- Export JSON schema varies over time. This script searches broadly.
- If it can detect an "archived" boolean, it will prefer archived-only.
- Otherwise it outputs all conversation IDs it finds; the unarchiver will skip non-archived ones.
/

import fs from "fs";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node extract-chat-urls.mjs /path/to/conversations.json > archived_chat_urls.txt");
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error("Failed to parse JSON:", e.message);
  process.exit(1);
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}
```

### `findMarkdownFiles.sh`

Find markdown files under a directory (helper for piping into other scripts).

**Typical usage:**

```bash
bash findMarkdownFiles.sh
```

### `make-chat-links.mjs`

Utility to extract ChatGPT chat URLs from exports / and/or generate clickable link lists.

**Usage (from script header):**

```bash
Usage:
  node make-chat-links.mjs /path/to/conversations.json /path/to/out.html
  node scripts/make-chat-links.mjs /Users/tedshaffer/Documents/ChatGPTExports/ChatGPTFullDataExport-12-20-2025/conversations.json /Users/tedshaffer/Documents/ChatGPTExports/out.html

Notes:
- Works with typical export shapes:
  - an array of conversations
  - or an object containing { conversations: [...] } or { data: [...] }
- Builds canonical URLs: https://chatgpt.com/c/<id>
- Includes title + created time when available
/

import fs from "node:fs";
import path from "node:path";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function toArray(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.conversations)) return json.conversations;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.items)) return json.items;
  return null;
}

function pickId(obj) {
  return obj?.id ?? obj?.conversation_id ?? obj?.conversationId ?? obj?.uuid ?? null;
```

## ChatGPT UI helpers

These are browser-side helpers for bulk unarchiving ChatGPT conversations. They store a queue/state in `localStorage` and automatically advance through URLs.

### `tamperMonkeyScript` (Tampermonkey user script)

- **What it does:** Runs on `chatgpt.com` / `chat.openai.com`, reads a queued list of chat URLs from `localStorage`, and attempts to click the **Unarchive** UI for each chat.
- **How to use:** Install in Tampermonkey as a new user script, then use `toUseWithTamperMonkey` to seed the queue.

### `toUseWithTamperMonkey` (queue seeder)

Paste this into the browser console (or make a bookmarklet) to prompt for chat URLs and write the queue into `localStorage`, then navigate to the first URL.

```js
(() => {
  const KEY = "bulkUnarchiveQueue_v1";
  const raw = prompt("Paste chat URLs (spaces/commas/newlines ok):");
  if (!raw) return;

  const urls = raw.split(/[\s,]+/g).map(s => s.trim()).filter(Boolean);

  localStorage.setItem(KEY, JSON.stringify({
    urls,
    i: 0,
    running: true,
    results: [],
    triesByUrl: {}
  }));

  console.log(`Queued ${urls.length} URLs. Starting now…`);
  location.href = urls[0];
})();
```

### `stopTamperMonkeyScript` (stop the queue)

Paste into console to stop processing (sets `running=false` in queue state).

```js
(() => {
  const KEY = "bulkUnarchiveQueue_v1";
  const q = JSON.parse(localStorage.getItem(KEY) || "null");
  if (q) {
    q.running = false;
    localStorage.setItem(KEY, JSON.stringify(q));
    console.log("Stopped queue runner.");
  } else {
    console.log("No queue state found.");
  }
})();
```

### `bulkUnarchiveRunner` (standalone runner snippet)

Alternative runner snippet (console/bookmarklet style) that uses a slightly different localStorage key/state version.

```js
(async function () {
  const KEY = "bulkUnarchiveState_v3";

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  // Tunables
  const cfg = {
    waitForUiMaxMs: 15000,   // wait up to 15s for page UI to settle
    pollEveryMs: 300,        // check UI every 300ms
    postClickWaitMs: 1200,   // after click wait
    verifyReloadWaitMs: 2500 // after reload wait
  };

  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
    catch { return null; }
  }
  function saveState(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  function clearState() {
    localStorage.removeItem(KEY);
  }

  function archivedBannerLikely() {
    const body = norm(document.body?.innerText);
    return body.includes("archived") && body.includes("conversation");
  }

  function findUnarchiveButton() {
    return [...document.querySelectorAll("button")]
      .find(b => norm(b.innerText) === "unarchive") || null;
  }

  async function waitForRelevantUi() {
    const start = Date.now();
    while (Date.now() - start < cfg.waitForUiMaxMs) {
      const btn = findUnarchiveButton();
      const archived = archivedBannerLikely();
      if (btn || !archived) return { btn, archived };
      await sleep(cfg.pollEveryMs);
    }
    // Timed out
    return { btn: findUnarchiveButton(), archived: archivedBannerLikely(), timedOut: true };
  }

  async function unarchiveWithVerify() {
    const first = await waitForRelevantUi();

    // If not archived, nothing to do
    if (!first.archived && !first.btn) return "not_archived";

    // Archived but no button => manual
    if (first.archived && !first.btn) return first.timedOut ? "needs_manual_timeout" : "needs_manual";

    // Click unarchive
    first.btn.click();
    await sleep(cfg.postClickWaitMs);

    // Force reload to verify it "sticks"
    sessionStorage.setItem("ua_verify_pending", "1");
    location.reload();

    // After reload, the script continues only if logs preserved;
    // so we detect the reload using sessionStorage.
    return "clicked_reloading";
  }

  async function postReloadVerify() {
    if (sessionStorage.getItem("ua_verify_pending") !== "1") return null;
    sessionStorage.removeItem("ua_verify_pending");

    await sleep(cfg.verifyReloadWaitMs);
    const stillHasBtn = !!findUnarchiveButton();
    const stillArchived = archivedBannerLikely();

    if (stillHasBtn || stillArchived) return "verify_failed_still_archived";
    return "verified_unarchived";
  }

  // -------- Init / Resume --------
  let state = loadState();

  if (!state) {
    const raw = prompt(
      "Paste chat URLs. You can paste:\n" +
      "• one per line, OR\n" +
      "• space-separated, OR\n" +
      "• comma-separated.\n"
    );
    if (!raw) return;

    // Split on whitespace OR commas
    const urls = raw
      .split(/[\s,]+/g)
      .map(s => s.trim())
      .filter(Boolean);

    state = { urls, i: 0, results: [] };
    saveState(state);
    console.log(`Saved ${urls.length} URLs. Starting at #1.`);
  } else {
    const choice = prompt(
      `Found saved run:\n` +
      `• URLs: ${state.urls.length}\n` +
      `• Next index: ${state.i + 1}\n\n` +
      `Type "resume" to continue,\n` +
      `"restart" to start over,\n` +
      `"clear" to forget state.`,
      "resume"
    );
    if (choice === "clear") { clearState(); console.log("Cleared saved state."); return; }
    if (choice === "restart") { state.i = 0; state.results = []; saveState(state); }
  }

  // If we just reloaded for verification, record verification result and continue
  const verifyStatus = await postReloadVerify();
  if (verifyStatus) {
    // Attach verification result to the most recent entry if it was a click
```
