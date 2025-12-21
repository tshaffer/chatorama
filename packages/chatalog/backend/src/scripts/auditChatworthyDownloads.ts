import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import fg from 'fast-glob';
import { diffLines } from 'diff';

import { NoteModel } from '../models/Note';
import { TurnFingerprintModel } from '../models/TurnFingerprintModel';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../utils/textHash';

type FileTurn = {
  fileTurnIndex: number;
  pairHashV2: string;
  pairHashV1: string;
};

type DbTurnMatch = {
  matchSource: 'fingerprint' | 'markdown';
  noteId: string;
  dbTurnIndex?: number | null;
  chatId?: string | null;
  chatworthyChatId?: string | null;
  sourceChatId?: string | null;
  chatworthyNoteId?: string | null;
  importBatchId?: string | null;
  title?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
  subjectName?: string | null;
  topicName?: string | null;
};

type MatchedTurnDetail = {
  fileTurnIndex: number;
  pairHash: string;
  pairHashV1?: string;
  dbMatches: DbTurnMatch[];
};

type FileScan = {
  filePath: string;
  fileName: string;
  chatId: string | null;
  chatTitle?: string | null;
  chatUrl?: string | null;

  turnCount: number;
  turns: FileTurn[];

  matchedTurnIndices: number[];
  unmatchedTurnIndices: number[];
  matchedCount: number;
  unmatchedCount: number;
  coverage: string;
  status: 'FULL' | 'NONE' | 'PARTIAL';

  matchedTurns: MatchedTurnDetail[];
  usedFallback?: boolean;
  fallbackReason?: string | null;
};

type DuplicateGroup = {
  chatId: string;
  chatTitle?: string | null;
  chatUrl?: string | null;
  files: {
    fileName: string;
    filePath: string;
    turnCount: number;
    matchedCount: number;
    unmatchedCount: number;
    coverage: string;
    status: 'FULL' | 'NONE' | 'PARTIAL';
    recommendedAction?: 'SAFE_DELETE_DUPLICATE' | null;
    subsetOfFileName?: string | null;
    subsetOfCount?: number;
    isStrictSubsetOf?: string[];
    closestSuperset?: string | null;
    missingTurnIndicesFromClosestSuperset?: number[];
  }[];
  unionTurnCount: number;
  unionMatchedCount: number;
  unionCoverage: string;
  recommendedAction: 'DELETE_ALL' | 'REVIEW_AND_IMPORT' | 'REVIEW';
  recommendedImportCandidate?: string | null;
  safeDeleteFiles?: string[];
  keepFiles?: string[];
};

function showInvisibles(s: string, max = 280): string {
  const head = s.slice(0, max);
  return head
    .replace(/\r/g, '␍')
    .replace(/\n/g, '␊\n')
    .replace(/\t/g, '␉')
    .replace(/ /g, '·');
}

// let __DEBUG_DB_TURN5_RESPONSE: string | null = null;

// async function xdumpDbTurn(noteId: string, turnIndex: number) {
//   const n = await NoteModel.findById(noteId, { markdown: 1, title: 1 }).lean().exec();
//   if (!n) {
//     console.log('DEBUG DB: note not found', noteId);
//     return;
//   }
//   const turns = extractPromptResponseTurns((n as any).markdown ?? '');
//   const t = turns.find(x => (x.turnIndex ?? -1) === turnIndex) ?? turns[turnIndex];
//   console.log('\nDEBUG DB note:', { noteId, title: (n as any).title, extractedTurns: turns.length });
//   if (!t) {
//     console.log('DEBUG DB: could not find turn', turnIndex);
//     return;
//   }
//   __DEBUG_DB_TURN5_RESPONSE = t.response ?? '';
//   dumpTurn(`DB turn ${turnIndex} (from note.markdown)`, t.prompt ?? '', t.response ?? '');
// }

async function dumpRawNoteSnippet(noteId: string, needle: string, contextLines = 8) {
  const n = await NoteModel.findById(noteId, { markdown: 1, title: 1 }).lean().exec();
  if (!n) return;

  const md = String((n as any).markdown ?? '');
  const idx = md.indexOf(needle);

  console.log('\n=== RAW NOTE SNIPPET ===');
  console.log({ noteId, title: (n as any).title, found: idx >= 0, idx });

  if (idx < 0) return;

  // show a few lines around the first occurrence
  const lines = md.split('\n');
  let lineNo = 0;
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (seen === 0 && lines[i].includes(needle)) {
      lineNo = i;
      seen = 1;
      break;
    }
  }

  const start = Math.max(0, lineNo - 3);
  const end = Math.min(lines.length, lineNo + contextLines);
  const snippet = lines.slice(start, end).join('\n');
  console.log(snippet.replace(/\r/g, '␍').replace(/\t/g, '␉'));
}

async function dumpDbTurn(noteId: string, turnIndex: number): Promise<{ prompt: string; response: string } | null> {
  const n = await NoteModel.findById(noteId, { markdown: 1, title: 1 }).lean().exec();
  if (!n) return null;

  const turns = extractPromptResponseTurns((n as any).markdown ?? '');
  const t = turns.find(x => (x.turnIndex ?? -1) === turnIndex) ?? turns[turnIndex];
  if (!t) return null;

  dumpTurn(`DB turn ${turnIndex} (from note.markdown)`, t.prompt ?? '', t.response ?? '');
  return { prompt: t.prompt ?? '', response: t.response ?? '' };
}

function firstDiffIndex(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function dumpTurn(label: string, prompt: string, response: string) {
  const h1 = hashPromptResponsePair(prompt, response, 1);
  const h2 = hashPromptResponsePair(prompt, response, 2);
  console.log(`\n=== ${label} ===`);
  console.log(`prompt.len=${prompt.length} response.len=${response.length}`);
  console.log(`hash.v1=${h1}`);
  console.log(`hash.v2=${h2}`);
  console.log(`prompt.head:\n${showInvisibles(prompt)}`);
  console.log(`response.head:\n${showInvisibles(response)}`);
  console.log(`response.tail:\n${showInvisibles(response.slice(Math.max(0, response.length - 280)))}`);
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size > b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function isStrictSubset(a: Set<string>, b: Set<string>): boolean {
  return a.size < b.size && isSubset(a, b);
}

type FingerprintOcc = { noteId: string; chatId?: string | null; dbTurnIndex?: number | null };

const chatIdHasAnyDbNotesCache = new Map<string, boolean>();
const markdownIndexByChatIdCache = new Map<string, Map<string, DbTurnMatch[]>>();
const noteMetaCache = new Map<string, DbTurnMatch>();
const subjectNameCache = new Map<string, string>();
const topicNameCache = new Map<string, string>();

function ensureMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required to run auditChatworthyDownloads.');
    process.exit(1);
  }
  return uri;
}

function stripFrontMatter(raw: string): { frontMatterRaw: string | null; content: string } {
  if (!raw.startsWith('---')) return { frontMatterRaw: null, content: raw };
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { frontMatterRaw: null, content: raw };
  return { frontMatterRaw: m[1] ?? '', content: raw.slice(m[0].length) };
}

function parseFrontMatterLoosely(frontMatterRaw: string | null): Record<string, any> {
  const data: Record<string, any> = {};
  if (!frontMatterRaw) return data;
  const lines = frontMatterRaw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return data;
}

function resolveDownloadsDir(): string {
  return path.join(os.homedir(), 'Downloads');
}

function extractChatId(data: Record<string, any>): string | null {
  const keys = ['chatworthyChatId', 'sourceChatId', 'chatId', 'chat_id'];
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractChatTitle(data: Record<string, any>): string | null {
  const keys = ['chatworthyChatTitle', 'chatTitle', 'chat_title'];
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractChatUrl(data: Record<string, any>): string | null {
  const keys = ['pageUrl', 'pageURL', 'url', 'sourceUrl', 'chatUrl', 'chatURL'];
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function sanitizeChatworthyExportContent(content: string): string {
  if (!content) return content;
  let s = content.replace(/\r\n/g, '\n');
  s = s.replace(/^\s*<a\s+id="p-\d+"\s*><\/a>\s*\n/gm, '');
  s = s.replace(/^\s*Source:\s+https?:\/\/\S+\s*\n/gm, '');
  s = s.replace(/^\s*Exported:\s+.+\s*\n/gm, '');
  s = s.replace(/^\s*##\s+Table of Contents[\s\S]*?(?=^\s*\*\*Prompt\*\*|\s*$)/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function shouldSanitizeChatworthyExport(content: string): boolean {
  if (!content) return false;
  if (/\n\s*##\s+Table of Contents\s*\n/i.test(content)) return true;
  if (/<a\s+id="p-\d+"\s*><\/a>/i.test(content)) return true;
  const promptCount = (content.match(/\*\*Prompt\*\*/gi) ?? []).length;
  return promptCount >= 2;
}

async function chatIdHasAnyDbNotes(chatId: string): Promise<boolean> {
  if (chatIdHasAnyDbNotesCache.has(chatId)) return chatIdHasAnyDbNotesCache.get(chatId)!;
  const count = await NoteModel.countDocuments({
    $or: [{ chatworthyChatId: chatId }, { sourceChatId: chatId }],
  }).exec();
  const has = count > 0;
  chatIdHasAnyDbNotesCache.set(chatId, has);
  return has;
}

async function hydrateNoteMeta(noteIds: string[]): Promise<void> {
  const missing = noteIds.filter((id) => !noteMetaCache.has(id));
  if (!missing.length) return;

  const notes = await NoteModel.find(
    { _id: { $in: missing } },
    {
      _id: 1,
      title: 1,
      subjectId: 1,
      topicId: 1,
      chatworthyChatId: 1,
      sourceChatId: 1,
      chatworthyNoteId: 1,
      importBatchId: 1,
    }
  )
    .lean()
    .exec();

  const subjectIds = new Set<string>();
  const topicIds = new Set<string>();

  for (const n of notes) {
    const id = n._id.toString();
    if ((n as any).subjectId) subjectIds.add(String((n as any).subjectId));
    if ((n as any).topicId) topicIds.add(String((n as any).topicId));

    noteMetaCache.set(id, {
      matchSource: 'fingerprint',
      noteId: id,
      dbTurnIndex: null,
      chatId: null,
      chatworthyChatId: (n as any).chatworthyChatId ?? null,
      sourceChatId: (n as any).sourceChatId ?? null,
      chatworthyNoteId: (n as any).chatworthyNoteId ?? null,
      importBatchId: (n as any).importBatchId ?? null,
      title: (n as any).title ?? null,
      subjectId: (n as any).subjectId ? String((n as any).subjectId) : null,
      topicId: (n as any).topicId ? String((n as any).topicId) : null,
      subjectName: null,
      topicName: null,
    });
  }

  const missingSubjectIds = [...subjectIds].filter((id) => !subjectNameCache.has(id));
  if (missingSubjectIds.length) {
    const subs = await SubjectModel.find({ _id: { $in: missingSubjectIds } }, { name: 1 })
      .lean()
      .exec();
    subs.forEach((s: any) => subjectNameCache.set(String(s._id), s.name ?? ''));
  }

  const missingTopicIds = [...topicIds].filter((id) => !topicNameCache.has(id));
  if (missingTopicIds.length) {
    const tops = await TopicModel.find({ _id: { $in: missingTopicIds } }, { name: 1 })
      .lean()
      .exec();
    tops.forEach((t: any) => topicNameCache.set(String(t._id), t.name ?? ''));
  }

  for (const [, meta] of noteMetaCache.entries()) {
    if (meta.subjectId && subjectNameCache.has(meta.subjectId)) {
      meta.subjectName = subjectNameCache.get(meta.subjectId)!;
    }
    if (meta.topicId && topicNameCache.has(meta.topicId)) {
      meta.topicName = topicNameCache.get(meta.topicId)!;
    }
  }
}

async function loadFingerprintIndex(): Promise<Map<string, FingerprintOcc[]>> {
  const fps = await TurnFingerprintModel.find(
    { sourceType: 'chatworthy' },
    { pairHash: 1, noteId: 1, chatId: 1, turnIndex: 1 }
  )
    .lean()
    .exec();

  const index = new Map<string, FingerprintOcc[]>();
  for (const fp of fps) {
    const h = (fp as any).pairHash;
    if (!h) continue;
    const occ: FingerprintOcc = {
      noteId: (fp as any).noteId?.toString?.() ?? String((fp as any).noteId),
      chatId: (fp as any).chatId ?? null,
      dbTurnIndex: typeof (fp as any).turnIndex === 'number' ? (fp as any).turnIndex : null,
    };
    if (!index.has(h)) index.set(h, []);
    index.get(h)!.push(occ);
  }
  return index;
}

async function loadMarkdownIndexForChatId(chatId: string): Promise<Map<string, DbTurnMatch[]>> {

  if (markdownIndexByChatIdCache.has(chatId)) return markdownIndexByChatIdCache.get(chatId)!;

  const notes = await NoteModel.find(
    { $or: [{ chatworthyChatId: chatId }, { sourceChatId: chatId }] },
    {
      _id: 1,
      markdown: 1,
      title: 1,
      subjectId: 1,
      topicId: 1,
      chatworthyChatId: 1,
      sourceChatId: 1,
      chatworthyNoteId: 1,
      importBatchId: 1,
    }
  )
    .lean()
    .exec();

  const noteIds = notes.map((n) => n._id.toString());
  await hydrateNoteMeta(noteIds);

  const index = new Map<string, DbTurnMatch[]>();

  for (const n of notes) {
    const noteId = n._id.toString();
    const turns = extractPromptResponseTurns((n as any).markdown ?? '');
    turns.forEach((t) => {

      if (
        chatId === '6946aff7-db30-8325-b6f0-b5a4bf7be152' &&
        t.turnIndex === 5
      ) {
        console.log('=== DB TURN 5 RAW ===');
        console.log(JSON.stringify({
          prompt: t.prompt,
          response: t.response,
          promptLen: t.prompt.length,
          responseLen: t.response.length,
        }, null, 2));
      }


      const pairHashV2 = hashPromptResponsePair(t.prompt, t.response, 2);
      const pairHashV1 = hashPromptResponsePair(t.prompt, t.response, 1);
      const base = noteMetaCache.get(noteId)!;

      const match: DbTurnMatch = {
        ...base,
        matchSource: 'markdown',
        noteId,
        dbTurnIndex: typeof t.turnIndex === 'number' ? t.turnIndex : null,
        chatId,
      };

      [pairHashV2, pairHashV1].forEach((h) => {
        if (!index.has(h)) index.set(h, []);
        index.get(h)!.push(match);
      });
    });
  }

  markdownIndexByChatIdCache.set(chatId, index);
  return index;
}

async function scanMarkdownFiles(downloadsDir: string): Promise<FileScan[]> {
  const files = await fg('*.md', { cwd: downloadsDir, absolute: true, onlyFiles: true });
  const results: FileScan[] = [];

  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');

      let fm: Record<string, any> = {};
      let content = raw;

      try {
        const gm = matter(raw);
        fm = (gm.data ?? {}) as Record<string, any>;
        content = gm.content ?? raw;
      } catch {
        const { frontMatterRaw, content: stripped } = stripFrontMatter(raw);
        fm = parseFrontMatterLoosely(frontMatterRaw);
        content = stripped;
        console.warn(
          `[warn] Failed to parse YAML front matter in ${path.basename(filePath)}; using loose parser.`
        );
      }

      const chatId = extractChatId(fm);
      const chatTitle = extractChatTitle(fm);
      const chatUrl = extractChatUrl(fm);

      const cleaned = shouldSanitizeChatworthyExport(content)
        ? sanitizeChatworthyExportContent(content)
        : content;

      const logicalTurns = extractPromptResponseTurns(cleaned);

      if (
        path.basename(filePath).includes(
          'programmatic-extraction-options-from-export-data-202512200723'
        )
      ) {
        const t = logicalTurns.find((x) => (x.turnIndex ?? -1) === 5) ?? logicalTurns[5];

        console.log('\n=== FILE TURN 5 ===');
        console.log('prompt.len=', t?.prompt?.length);
        console.log('response.len=', t?.response?.length);
        console.log('hash.v1=', hashPromptResponsePair(t.prompt, t.response, 1));
        console.log('hash.v2=', hashPromptResponsePair(t.prompt, t.response, 2));
        console.log('prompt.head:\n', JSON.stringify(t?.prompt?.slice(0, 120)));
        console.log('response.head:\n', JSON.stringify(t?.response?.slice(0, 300)));
        console.log('response.tail:\n', JSON.stringify(t?.response?.slice(-300)));

        if (dbTurn5 && t?.response) {
          const a = dbTurn5.response;
          const b = t.response;

          const i = firstDiffIndex(a, b);
          console.log('\n=== FIRST DIFF INDEX ===', i);
          if (i >= 0) {
            const start = Math.max(0, i - 120);
            const end = Math.min(Math.max(a.length, b.length), i + 120);

            console.log('\n=== DB CONTEXT ===');
            console.log(showInvisibles(a.slice(start, end), 10_000));

            console.log('\n=== FILE CONTEXT ===');
            console.log(showInvisibles(b.slice(start, end), 10_000));
          }
        }

        // // 🔍 ONE-TIME VERIFICATION DIFF
        // if (__DEBUG_DB_TURN5_RESPONSE && t?.response) {
        //   console.log('\n=== RESPONSE DIFF (DB vs FILE) ===');
        //   const diffs = diffLines(__DEBUG_DB_TURN5_RESPONSE, t.response);
        //   diffs.forEach(part => {
        //     const mark = part.added ? '+' : part.removed ? '-' : ' ';
        //     process.stdout.write(
        //       mark + part.value.replace(/\n/g, '␊\n')
        //     );
        //   });
        //   console.log('\n=== END OF RESPONSE DIFF (DB vs FILE) ===');
        // }
      }

      const turns: FileTurn[] = logicalTurns.map((t, idx) => ({
        fileTurnIndex: typeof t.turnIndex === 'number' ? t.turnIndex : idx,
        pairHashV2: hashPromptResponsePair(t.prompt, t.response, 2),
        pairHashV1: hashPromptResponsePair(t.prompt, t.response, 1),
      }));

      const turnCount = turns.length;

      results.push({
        filePath,
        fileName: path.basename(filePath),
        chatId,
        chatTitle,
        chatUrl,
        turnCount,
        turns,
        matchedTurnIndices: [],
        unmatchedTurnIndices: [],
        matchedCount: 0,
        unmatchedCount: turnCount,
        coverage: `0/${turnCount}`,
        status: 'NONE',
        matchedTurns: [],
        usedFallback: false,
        fallbackReason: null,
      });
    } catch (err) {
      console.warn(`[warn] Skipping ${path.basename(filePath)} due to error:`, err);
    }
  }

  return results;
}

function buildDuplicateGroups(
  files: FileScan[],
  fingerprintIndex: Map<string, FingerprintOcc[]>
): DuplicateGroup[] {
  const byChatId = new Map<string, FileScan[]>();
  for (const file of files) {
    if (!file.chatId) continue;
    if (!byChatId.has(file.chatId)) byChatId.set(file.chatId, []);
    byChatId.get(file.chatId)!.push(file);
  }

  const groups: DuplicateGroup[] = [];

  for (const [chatId, members] of byChatId.entries()) {
    if (members.length < 2) continue;

    const summaries = members.map((f) => ({
      file: f,
      fileSet: new Set(f.turns.map((t) => t.pairHashV2)),
      summary: {
        fileName: f.fileName,
        filePath: f.filePath,
        turnCount: f.turnCount,
        matchedCount: f.matchedCount,
        unmatchedCount: f.unmatchedCount,
        coverage: f.coverage,
        status: f.status,
        recommendedAction: null as 'SAFE_DELETE_DUPLICATE' | null,
        subsetOfFileName: null as string | null,
        subsetOfCount: 0 as number,
        isStrictSubsetOf: undefined as string[] | undefined,
        closestSuperset: undefined as string | null | undefined,
        missingTurnIndicesFromClosestSuperset: undefined as number[] | undefined,
      },
    }));

    summaries.forEach((entry) => {
      const supersets = summaries.filter((other) => {
        if (other === entry) return false;
        return isStrictSubset(entry.fileSet, other.fileSet);
      });

      if (!supersets.length) return;

      const chosen = supersets.sort((a, b) => a.file.turnCount - b.file.turnCount)[0];

      entry.summary.subsetOfFileName = chosen?.file.fileName ?? null;
      entry.summary.subsetOfCount = supersets.length;
      entry.summary.isStrictSubsetOf = supersets.map((s) => s.file.fileName);
      entry.summary.closestSuperset = chosen?.file.fileName ?? null;
      entry.summary.recommendedAction = 'SAFE_DELETE_DUPLICATE';

      if (chosen) {
        // Indices that exist in the closest superset but are absent from this file.
        const missingIndices = chosen.file.turns
          .filter((t) => !entry.fileSet.has(t.pairHashV2))
          .map((t) => t.fileTurnIndex);
        entry.summary.missingTurnIndicesFromClosestSuperset = missingIndices;
      }
    });

    const filesSummary = summaries.map((s) => s.summary);

    // unionHashes: key=v2, value=v1
    const unionHashes = new Map<string, string>();
    for (const f of members) {
      for (const t of f.turns) {
        if (!unionHashes.has(t.pairHashV2)) unionHashes.set(t.pairHashV2, t.pairHashV1);
      }
    }

    const unionMatched = new Set<string>();

    // ✅ FIX: Map.forEach is (value, key) => (v1, v2)
    unionHashes.forEach((v1, v2) => {
      if (fingerprintIndex.has(v2) || fingerprintIndex.has(v1)) {
        unionMatched.add(v2);
        return;
      }

      const mdIdx = markdownIndexByChatIdCache.get(chatId);
      if (mdIdx && (mdIdx.has(v2) || mdIdx.has(v1))) {
        unionMatched.add(v2);
      }
    });

    const unionTurnCount = unionHashes.size;
    const unionMatchedCount = unionMatched.size;
    const unionCoverage = unionTurnCount ? `${unionMatchedCount}/${unionTurnCount}` : '0/0';

    let recommendedAction: 'DELETE_ALL' | 'REVIEW_AND_IMPORT' | 'REVIEW';
    if (unionMatchedCount === unionTurnCount) recommendedAction = 'DELETE_ALL';
    else if (members.some((f) => f.unmatchedCount > 0)) recommendedAction = 'REVIEW_AND_IMPORT';
    else recommendedAction = 'REVIEW';

    const recommendedImportCandidate =
      recommendedAction === 'REVIEW_AND_IMPORT'
        ? [...members].sort((a, b) => {
          if (b.unmatchedCount !== a.unmatchedCount) return b.unmatchedCount - a.unmatchedCount;
          if (b.turnCount !== a.turnCount) return b.turnCount - a.turnCount;
          return b.fileName.localeCompare(a.fileName);
        })[0]?.fileName ?? null
        : null;

    const safeDeleteFiles = filesSummary
      .filter((f) => f.recommendedAction === 'SAFE_DELETE_DUPLICATE')
      .map((f) => f.fileName);

    const keepFiles = filesSummary
      .filter((f) => f.recommendedAction !== 'SAFE_DELETE_DUPLICATE')
      .map((f) => f.fileName);

    groups.push({
      chatId,
      chatTitle: members.find((m) => m.chatTitle)?.chatTitle ?? null,
      chatUrl: members.find((m) => m.chatUrl)?.chatUrl ?? null,
      files: filesSummary,
      unionTurnCount,
      unionMatchedCount,
      unionCoverage,
      recommendedAction,
      recommendedImportCandidate,
      safeDeleteFiles,
      keepFiles,
    });
  }

  return groups;
}

function minFileForOutput(f: FileScan) {
  return {
    fileName: f.fileName,
    filePath: f.filePath,
    chatId: f.chatId,
    chatTitle: f.chatTitle,
    chatUrl: f.chatUrl,
    turnCount: f.turnCount,
    matchedCount: f.matchedCount,
    unmatchedCount: f.unmatchedCount,
    coverage: f.coverage,
    status: f.status,
    matchedTurnIndices: f.matchedTurnIndices,
    unmatchedTurnIndices: f.unmatchedTurnIndices,
    usedFallback: f.usedFallback,
    fallbackReason: f.fallbackReason,
  };
}

function fullFileWithDiagnostics(f: FileScan) {
  return {
    ...minFileForOutput(f),
    matchedTurns: f.matchedTurns,
  };
}

function printSummary(files: FileScan[], duplicateGroups: DuplicateGroup[]): void {
  const full = files.filter((f) => f.status === 'FULL');
  const none = files.filter((f) => f.status === 'NONE');
  const partial = files.filter((f) => f.status === 'PARTIAL');

  console.log('--- auditChatworthyDownloads (turn coverage) ---');
  console.log(`Total files: ${files.length}`);
  console.log(`FULL: ${full.length}`);
  console.log(`NONE: ${none.length}`);
  console.log(`PARTIAL: ${partial.length}`);

  if (partial.length) {
    console.log('\nPARTIAL files:');
    partial.forEach((f) => {
      console.log(
        `- ${f.fileName} | coverage=${f.coverage} | matched=${f.matchedTurnIndices.join(',')} | unmatched=${f.unmatchedTurnIndices.join(',')}`
      );
      f.matchedTurns.slice(0, 2).forEach((mt) => {
        const firstMatch = mt.dbMatches[0];
        if (firstMatch) {
          console.log(
            `    turn ${mt.fileTurnIndex} -> note ${firstMatch.noteId} (${firstMatch.title ?? ''})`
          );
        }
      });
    });
  }

  if (duplicateGroups.length) {
    console.log('\nDuplicate groups:');
    duplicateGroups.forEach((g) => {
      console.log(
        `- chatId=${g.chatId} unionCoverage=${g.unionCoverage} action=${g.recommendedAction} candidate=${g.recommendedImportCandidate ?? '—'}`
      );
      if (g.keepFiles?.length) console.log(`  keepFiles: ${g.keepFiles.join(', ')}`);
      if (g.safeDeleteFiles?.length) console.log(`  safeDeleteFiles: ${g.safeDeleteFiles.join(', ')}`);
    });
  }
}

function toFileUrl(filePath: string): string {
  const normalized = path.resolve(filePath);
  return encodeURI(`file://${normalized.startsWith('/') ? '' : '/'}${normalized}`);
}

function uniqSorted(arr: string[]): string[] {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
}

function shellSingleQuote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

function uniqDbMatches(matches: DbTurnMatch[]): DbTurnMatch[] {
  const seen = new Set<string>();
  const out: DbTurnMatch[] = [];
  for (const m of matches) {
    const k = `${m.noteId}:${m.dbTurnIndex ?? ''}:${m.matchSource}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

let dbTurn5: any;

async function main() {
  ensureMongoUri();

  const downloadsDir = resolveDownloadsDir();

  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  console.log('dumpRawNoteSnippet tests:');
  await dumpRawNoteSnippet('6947444168f062d4d2c90eb7', 'source: chatgpt-export');
  await dumpRawNoteSnippet('6947444168f062d4d2c90eb7', 'chatUrl: https://chatgpt.com/c/');
  console.log('--- end of dumpRawNoteSnippet tests ---\n');
  
  dbTurn5 = await dumpDbTurn('6947444168f062d4d2c90eb7', 5);

  try {
    const generatedAt = new Date().toISOString();

    const fingerprintIndex = await loadFingerprintIndex();
    const files = await scanMarkdownFiles(downloadsDir);

    for (const file of files) {
      const matchedTurns: MatchedTurnDetail[] = [];
      const matchedIdx = new Set<number>();

      const noteIdsToHydrate = new Set<string>();
      file.turns.forEach((ft) => {
        const occs = fingerprintIndex.get(ft.pairHashV2) ?? fingerprintIndex.get(ft.pairHashV1) ?? [];
        occs.forEach((o) => noteIdsToHydrate.add(o.noteId));
      });
      await hydrateNoteMeta([...noteIdsToHydrate]);

      for (const ft of file.turns) {
        const occs =
          fingerprintIndex.get(ft.pairHashV2) ??
          fingerprintIndex.get(ft.pairHashV1) ??
          [];

        if (!occs.length) continue;

        matchedIdx.add(ft.fileTurnIndex);

        const dbMatchesRaw: DbTurnMatch[] = occs.map((o) => {
          const base = noteMetaCache.get(o.noteId);
          return {
            ...(base ?? {
              matchSource: 'fingerprint',
              noteId: o.noteId,
              title: null,
              subjectName: null,
              topicName: null,
            }),
            matchSource: 'fingerprint',
            noteId: o.noteId,
            dbTurnIndex: o.dbTurnIndex ?? null,
            chatId: o.chatId ?? file.chatId ?? null,
          };
        });

        const dbMatches = uniqDbMatches(dbMatchesRaw);

        matchedTurns.push({
          fileTurnIndex: ft.fileTurnIndex,
          pairHash: ft.pairHashV2,
          pairHashV1: ft.pairHashV1,
          dbMatches,
        });
      }

      if (matchedIdx.size === 0 && file.chatId) {
        const hasChatNotes = await chatIdHasAnyDbNotes(file.chatId);
        if (hasChatNotes) {
          file.usedFallback = true;
          file.fallbackReason = 'no fingerprint matches';

          const mdIndex = await loadMarkdownIndexForChatId(file.chatId);
          for (const ft of file.turns) {
            const hitsRaw = mdIndex.get(ft.pairHashV2) ?? mdIndex.get(ft.pairHashV1) ?? [];
            const hits = uniqDbMatches(hitsRaw);
            if (!hits.length) continue;

            matchedIdx.add(ft.fileTurnIndex);
            matchedTurns.push({
              fileTurnIndex: ft.fileTurnIndex,
              pairHash: ft.pairHashV2,
              pairHashV1: ft.pairHashV1,
              dbMatches: hits,
            });
          }
        }
      }

      file.matchedTurns = matchedTurns;
      const allIndices = file.turns.map((t) => t.fileTurnIndex);
      file.matchedTurnIndices = [...matchedIdx].sort((a, b) => a - b);
      file.unmatchedTurnIndices = allIndices.filter((i) => !matchedIdx.has(i));
      file.matchedCount = file.matchedTurnIndices.length;
      file.unmatchedCount = file.unmatchedTurnIndices.length;
      file.coverage = `${file.matchedCount}/${file.turnCount}`;
      file.status = file.matchedCount === 0 ? 'NONE' : file.matchedCount === file.turnCount ? 'FULL' : 'PARTIAL';
    }

    const duplicateGroups = buildDuplicateGroups(files, fingerprintIndex);

    const importCandidatesToReview = new Set<string>();
    for (const g of duplicateGroups) {
      if (g.recommendedAction === 'REVIEW_AND_IMPORT' && g.recommendedImportCandidate) {
        importCandidatesToReview.add(g.recommendedImportCandidate);
      }
    }

    const deletePaths: string[] = [];
    const reviewPaths: string[] = [];

    for (const g of duplicateGroups) {
      if (g.recommendedAction === 'DELETE_ALL') {
        for (const f of g.files) deletePaths.push(f.filePath);
        continue;
      }

      for (const f of g.files) reviewPaths.push(f.filePath);

      for (const f of g.files) {
        if (f.recommendedAction === 'SAFE_DELETE_DUPLICATE') deletePaths.push(f.filePath);
      }
    }

    const alreadyMentioned = new Set<string>([...deletePaths, ...reviewPaths]);

    for (const f of files) {
      if (alreadyMentioned.has(f.filePath)) continue;

      if (f.status === 'FULL' && !importCandidatesToReview.has(f.fileName)) deletePaths.push(f.filePath);
      else reviewPaths.push(f.filePath);
    }

    const deletePathsFinal = uniqSorted(deletePaths);
    const reviewPathsFinal = uniqSorted(reviewPaths);

    const fullyCoveredFiles = files.filter((f) => f.status === 'FULL');
    const noOverlapFiles = files.filter((f) => f.status === 'NONE');
    const partialOverlapFiles = files.filter((f) => f.status === 'PARTIAL');

    const report = {
      generatedAt,
      downloadsDir,
      summary: {
        totalFiles: files.length,
        full: fullyCoveredFiles.length,
        none: noOverlapFiles.length,
        partial: partialOverlapFiles.length,
      },
      fullyCoveredFiles: fullyCoveredFiles.map(minFileForOutput),
      noOverlapFiles: noOverlapFiles.map(minFileForOutput),
      partialOverlapFiles: partialOverlapFiles.map(fullFileWithDiagnostics),
      duplicateGroups,
    };

    const outPath = path.join(process.cwd(), 'audit-chatworthy-downloads.json');
    const deleteOutPath = path.join(process.cwd(), 'audit-chatworthy-delete-commands.txt');
    const reviewOutPath = path.join(process.cwd(), 'audit-chatworthy-review-links.html');

    const deleteLines =
      deletePathsFinal.map((p) => `rm ${shellSingleQuote(p)}`).join('\n') +
      (deletePathsFinal.length ? '\n' : '');

    const reportId = `audit:${generatedAt}:${downloadsDir}`;
    const safeJson = (v: any) => JSON.stringify(v).replace(/</g, '\\u003c');

    // ✅ include rmCmd with proper quoting for weird filenames
    const reviewItems = reviewPathsFinal.map((p) => ({
      path: p,
      name: path.basename(p),
      url: toFileUrl(p),
      rmCmd: `rm ${shellSingleQuote(p)}`,
    }));

    const reviewLines =
      '<!doctype html>\n' +
      '<html>\n<head>\n' +
      '  <meta charset="utf-8" />\n' +
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
      '  <title>Chatworthy files to review</title>\n' +
      '  <style>\n' +
      '    body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; }\n' +
      '    .bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 12px 0 16px; }\n' +
      '    button { padding: 6px 10px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; }\n' +
      '    button:hover { background: #f6f6f6; }\n' +
      '    .muted { color: #666; font-size: 12px; }\n' +
      '    table { border-collapse: collapse; width: 100%; }\n' +
      '    th, td { border-bottom: 1px solid #eee; padding: 8px; vertical-align: top; }\n' +
      '    tr.reviewed td { opacity: 0.55; }\n' +
      '    tr.reviewed a { text-decoration: line-through; }\n' +
      '    .path { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; color: #444; }\n' +
      '    .hidden { display: none; }\n' +
      '    td.ctrl { text-align: center; }\n' +
      '    input[type="radio"] { transform: scale(1.05); }\n' +
      '  </style>\n' +
      '</head>\n<body>\n' +
      '  <h2>Files to review</h2>\n' +
      '  <div class="muted">This checklist persists in your browser (localStorage). Report key: <span id="reportKey"></span></div>\n' +
      '  <div class="bar">\n' +
      '    <button id="btnMarkAll">Mark all reviewed</button>\n' +
      '    <button id="btnClear">Clear all marks</button>\n' +
      '    <label style="display:flex;align-items:center;gap:6px;">\n' +
      '      <input type="checkbox" id="chkHideReviewed" /> Hide reviewed\n' +
      '    </label>\n' +
      '    <button id="btnCopyRmRemove">Copy rm commands for Remove</button>\n' +
      '    <button id="btnClearRemove">Clear Remove</button>\n' +
      '    <span class="muted" id="counts"></span>\n' +
      '  </div>\n' +
      '  <table>\n' +
      '    <thead>\n' +
      '      <tr>\n' +
      '        <th style="width:70px;">Reviewed</th>\n' +
      '        <th style="width:70px;">Import</th>\n' +
      '        <th style="width:80px;">Remove</th>\n' +
      '        <th>File</th>\n' +
      '        <th>Path</th>\n' +
      '      </tr>\n' +
      '    </thead>\n' +
      '    <tbody id="rows"></tbody>\n' +
      '  </table>\n' +
      '  <script>\n' +
      `    const REPORT_ID = ${safeJson(reportId)};\n` +
      `    const reviewItems = ${safeJson(reviewItems)};\n` +
      `    const REVIEWED_KEY = "chatworthy_reviewed:" + REPORT_ID;\n` +
      `    const DISPO_KEY = "chatworthy_dispo:" + REPORT_ID;\n` +
      `    const HIDE_KEY = "chatworthy_hideReviewed:" + REPORT_ID;\n` +
      `    document.getElementById("reportKey").textContent = REVIEWED_KEY;\n` +
      `    function loadJson(key, fallback) {\n` +
      `      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }\n` +
      `      catch { return fallback; }\n` +
      `    }\n` +
      `    function saveJson(key, val) { localStorage.setItem(key, JSON.stringify(val)); }\n` +
      `    function loadHide() { return localStorage.getItem(HIDE_KEY) === "1"; }\n` +
      `    function saveHide(v) { localStorage.setItem(HIDE_KEY, v ? "1" : "0"); }\n` +
      `    const reviewedState = loadJson(REVIEWED_KEY, {});\n` +
      `    const dispoState = loadJson(DISPO_KEY, {});\n` +
      `    const tbody = document.getElementById("rows");\n` +
      `    const chkHide = document.getElementById("chkHideReviewed");\n` +
      `    function render() {\n` +
      `      tbody.innerHTML = "";\n` +
      `      const hideReviewed = chkHide.checked;\n` +
      `      let reviewedCount = 0;\n` +
      `      let removeCount = 0;\n` +
      `      for (const item of reviewItems) {\n` +
      `        const dispo = dispoState[item.path] || "import";\n` +
      `        const isRemove = dispo === "remove";\n` +
      `        const isDone = !!reviewedState[item.path];\n` +
      `        if (isRemove) removeCount++;\n` +
      `        if (isDone) reviewedCount++;\n` +
      `        const tr = document.createElement("tr");\n` +
      `        if (isDone) tr.classList.add("reviewed");\n` +
      `        if (hideReviewed && isDone) tr.classList.add("hidden");\n` +
      `        const tdReviewed = document.createElement("td"); tdReviewed.className = "ctrl";\n` +
      `        const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = isDone;\n` +
      `        cb.addEventListener("change", () => { reviewedState[item.path] = cb.checked; if (!cb.checked) delete reviewedState[item.path]; saveJson(REVIEWED_KEY, reviewedState); render(); });\n` +
      `        tdReviewed.appendChild(cb);\n` +
      `        const tdImport = document.createElement("td"); tdImport.className = "ctrl";\n` +
      `        const rImport = document.createElement("input"); rImport.type = "radio"; rImport.name = "dispo:" + item.path; rImport.checked = dispo === "import";\n` +
      `        rImport.addEventListener("change", () => { dispoState[item.path] = "import"; saveJson(DISPO_KEY, dispoState); render(); });\n` +
      `        tdImport.appendChild(rImport);\n` +
      `        const tdRemove = document.createElement("td"); tdRemove.className = "ctrl";\n` +
      `        const rRemove = document.createElement("input"); rRemove.type = "radio"; rRemove.name = "dispo:" + item.path; rRemove.checked = dispo === "remove";\n` +
      `        rRemove.addEventListener("change", () => { dispoState[item.path] = "remove"; saveJson(DISPO_KEY, dispoState); render(); });\n` +
      `        tdRemove.appendChild(rRemove);\n` +
      `        const tdFile = document.createElement("td");\n` +
      `        const a = document.createElement("a"); a.href = item.url; a.textContent = item.name; a.target = "_blank"; a.rel = "noopener noreferrer";\n` +
      `        tdFile.appendChild(document.createTextNode("review ")); tdFile.appendChild(a);\n` +
      `        const tdPath = document.createElement("td");\n` +
      `        const div = document.createElement("div"); div.className = "path"; div.textContent = item.path; tdPath.appendChild(div);\n` +
      `        tr.appendChild(tdReviewed); tr.appendChild(tdImport); tr.appendChild(tdRemove); tr.appendChild(tdFile); tr.appendChild(tdPath);\n` +
      `        tbody.appendChild(tr);\n` +
      `      }\n` +
      `      document.getElementById("counts").textContent = "Reviewed: " + reviewedCount + "/" + reviewItems.length + " | Remove: " + removeCount + " | Remaining: " + (reviewItems.length - reviewedCount);\n` +
      `    }\n` +
      `    chkHide.checked = loadHide();\n` +
      `    chkHide.addEventListener("change", () => { saveHide(chkHide.checked); render(); });\n` +
      `    document.getElementById("btnMarkAll").addEventListener("click", () => { for (const item of reviewItems) reviewedState[item.path] = true; saveJson(REVIEWED_KEY, reviewedState); render(); });\n` +
      `    document.getElementById("btnClear").addEventListener("click", () => { for (const item of reviewItems) delete reviewedState[item.path]; saveJson(REVIEWED_KEY, reviewedState); render(); });\n` +
      `    document.getElementById("btnCopyRmRemove").addEventListener("click", async () => {\n` +
      `      const removeList = reviewItems\n` +
      `        .filter(i => (dispoState[i.path] || "import") === "remove")\n` +
      `        .map(i => i.rmCmd)\n` +
      `        .join("\\n");\n` +
      `      try { await navigator.clipboard.writeText(removeList + (removeList ? "\\n" : "")); alert("Copied rm commands for Remove to clipboard."); }\n` +
      `      catch { window.prompt("Copy rm commands:", removeList); }\n` +
      `    });\n` +
      `    document.getElementById("btnClearRemove").addEventListener("click", () => {\n` +
      `      for (const item of reviewItems) { if (dispoState[item.path] === "remove") dispoState[item.path] = "import"; }\n` +
      `      for (const item of reviewItems) { if (dispoState[item.path] === "import") delete dispoState[item.path]; }\n` +
      `      saveJson(DISPO_KEY, dispoState);\n` +
      `      render();\n` +
      `    });\n` +
      `    render();\n` +
      '  </script>\n' +
      '</body>\n</html>\n';

    await fs.writeFile(deleteOutPath, deleteLines, 'utf8');
    await fs.writeFile(reviewOutPath, reviewLines, 'utf8');
    await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

    printSummary(files, duplicateGroups);
    console.log(`\nReport written to ${outPath}`);
    console.log(`Delete commands written to ${deleteOutPath}`);
    console.log(`Review links written to ${reviewOutPath} (open in Chrome)`);

    // Better v1/v2 sanity: this SHOULD differ if v2 is active
    console.log(
      'sanity v1/v2 differ? (expected true)',
      hashPromptResponsePair('a', 'x\n\n\nz', 1) !== hashPromptResponsePair('a', 'x\n\n\nz', 2)
    );
  } finally {
    await db.disconnectFromDatabase();
  }
}

main()
  .then(() => { })
  .catch((err) => {
    console.error('Error running auditChatworthyDownloads:', err);
    process.exit(1);
  });
