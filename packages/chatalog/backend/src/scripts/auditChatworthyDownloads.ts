import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import fg from 'fast-glob';
import crypto from 'crypto';

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

type DebugTurn = {
  fileTurnIndex: number;
  prompt: string;
  response: string;
  pairHashV2: string;
  pairHashV1: string;
};

type DebugFile = {
  filePath: string;
  fileName: string;
  chatId: string | null;
  sanitized: boolean;
  rawLen: number;
  contentLen: number;
  cleanedLen: number;
  contentHash: string;
  cleanedHash: string;
  turnCount: number;
  turns: DebugTurn[];
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

type FingerprintOcc = { noteId: string; chatId?: string | null; dbTurnIndex?: number | null };

// ------------------- overlap output types -------------------

type FileOverlapPair = {
  aFileName: string;
  bFileName: string;

  aTurnCount: number;
  bTurnCount: number;

  intersectionCount: number;
  onlyACount: number;
  onlyBCount: number;

  jaccard: number; // intersection / union

  aIsSubsetOfB: boolean;
  bIsSubsetOfA: boolean;

  // helpful “shape” signal
  overlapLabel:
    | 'IDENTICAL'
    | 'A_SUBSET_OF_B'
    | 'B_SUBSET_OF_A'
    | 'PARTIAL_OVERLAP'
    | 'DISJOINT';
};

type FileOverlapFileSummary = {
  fileName: string;
  filePath: string;
  turnCount: number;
};

type FileOverlapGroup = {
  chatId: string;
  chatTitle?: string | null;
  chatUrl?: string | null;

  files: FileOverlapFileSummary[];

  // Group-level counts, independent of DB coverage
  unionTurnCount: number;
  maxTurnCount: number;

  pairs: FileOverlapPair[];

  // Optional suggested “keep” file purely based on coverage/length (not DB)
  recommendedKeepCandidate?: string | null;
};

// ------------------- options -------------------

type ScriptOptions = {
  emitFileOverlap: boolean;
  includePartialDetails: boolean;
  includeDuplicateDetails: boolean;
  explainOverlapPair?: { aPath: string; bPath: string } | null;
};

function parseArgs(argv: string[]): ScriptOptions {
  // defaults preserve your current behavior
  const opts: ScriptOptions = {
    emitFileOverlap: false,
    includePartialDetails: true,
    includeDuplicateDetails: true,
    explainOverlapPair: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--emit-file-overlap') opts.emitFileOverlap = true;
    if (a === '--no-partial-details') opts.includePartialDetails = false;
    if (a === '--no-duplicate-details') opts.includeDuplicateDetails = false;
    if (a === '--explain-overlap-pair') {
      const aPath = argv[i + 1];
      const bPath = argv[i + 2];
      if (aPath && bPath) {
        opts.explainOverlapPair = { aPath, bPath };
        i += 2;
      }
    }
  }

  return opts;
}

// ------------------- tiny utils -------------------

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function showInvisibles(s: string, max = 280): string {
  const head = s.slice(0, max);
  return head
    .replace(/\r/g, '␍')
    .replace(/\n/g, '␊\n')
    .replace(/\t/g, '␉')
    .replace(/ /g, '·');
}

function firstDiffIndex(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function diffStrings(a: string, b: string) {
  const idx = firstDiffIndex(a, b);
  if (idx === -1) return { idx: -1 as const, aSnippet: '', bSnippet: '' };

  const start = Math.max(0, idx - 40);
  const end = idx + 120;

  return {
    idx,
    aSnippet: showInvisibles(a.slice(start, end)),
    bSnippet: showInvisibles(b.slice(start, end)),
  };
}

function setDiff(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  return out.sort();
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size > b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function isStrictSubset(a: Set<string>, b: Set<string>): boolean {
  return a.size < b.size && isSubset(a, b);
}

function uniqSorted(arr: string[]): string[] {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
}

function shellSingleQuote(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

function toFileUrl(filePath: string): string {
  const normalized = path.resolve(filePath);
  return encodeURI(`file://${normalized.startsWith('/') ? '' : '/'}${normalized}`);
}

// ------------------- caches -------------------

const chatIdHasAnyDbNotesCache = new Map<string, boolean>();
const markdownIndexByChatIdCache = new Map<string, Map<string, DbTurnMatch[]>>();
const noteMetaCache = new Map<string, DbTurnMatch>();
const subjectNameCache = new Map<string, string>();
const topicNameCache = new Map<string, string>();

// ------------------- core helpers -------------------

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

function resolveChatalogInboxDir(): string {
  return path.join(os.homedir(), 'Documents', 'chatalogInbox');
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

async function scanOneFileForDebug(filePath: string): Promise<DebugFile> {
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
  }

  const chatId = extractChatId(fm);
  const sanitized = shouldSanitizeChatworthyExport(content);
  const cleaned = sanitized ? sanitizeChatworthyExportContent(content) : content;
  const logicalTurns = extractPromptResponseTurns(cleaned);

  const turns: DebugTurn[] = logicalTurns.map((t, idx) => {
    const fileTurnIndex = typeof t.turnIndex === 'number' ? t.turnIndex : idx;
    const prompt = t.prompt ?? '';
    const response = t.response ?? '';
    return {
      fileTurnIndex,
      prompt,
      response,
      pairHashV2: hashPromptResponsePair(prompt, response, 2),
      pairHashV1: hashPromptResponsePair(prompt, response, 1),
    };
  });

  return {
    filePath,
    fileName: path.basename(filePath),
    chatId,
    sanitized,
    rawLen: raw.length,
    contentLen: content.length,
    cleanedLen: cleaned.length,
    contentHash: sha256(content),
    cleanedHash: sha256(cleaned),
    turnCount: turns.length,
    turns,
  };
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

// ---------------- duplicate groups (existing) ----------------

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

    // ✅ Map.forEach is (value, key) => (v1, v2)
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

// ---------------- NEW: file-vs-file overlap phase/module ----------------

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = intersectionCount(a, b);
  const uni = a.size + b.size - inter;
  return uni === 0 ? 1 : inter / uni;
}

function intersectionCount(a: Set<string>, b: Set<string>): number {
  // iterate smaller
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const x of small) if (big.has(x)) n++;
  return n;
}

function labelOverlap(aSet: Set<string>, bSet: Set<string>): FileOverlapPair['overlapLabel'] {
  const inter = intersectionCount(aSet, bSet);
  if (inter === 0) return 'DISJOINT';
  if (aSet.size === bSet.size && inter === aSet.size) return 'IDENTICAL';
  if (isSubset(aSet, bSet)) return 'A_SUBSET_OF_B';
  if (isSubset(bSet, aSet)) return 'B_SUBSET_OF_A';
  return 'PARTIAL_OVERLAP';
}

async function explainOverlapPair(opts: ScriptOptions) {
  if (!opts.explainOverlapPair) return;

  const { aPath, bPath } = opts.explainOverlapPair;
  const a = await scanOneFileForDebug(aPath);
  const b = await scanOneFileForDebug(bPath);

  const aSet = new Set(a.turns.map((t) => t.pairHashV2));
  const bSet = new Set(b.turns.map((t) => t.pairHashV2));

  const inter = intersectionCount(aSet, bSet);
  const onlyA = setDiff(aSet, bSet);
  const onlyB = setDiff(bSet, aSet);

  const minTurns = Math.min(a.turns.length, b.turns.length);
  let firstTurnTextDiff: any = null;

  for (let i = 0; i < minTurns; i += 1) {
    const ap = a.turns[i].prompt;
    const bp = b.turns[i].prompt;
    const ar = a.turns[i].response;
    const br = b.turns[i].response;

    if (ap !== bp) {
      firstTurnTextDiff = { turn: i, field: 'prompt', ...diffStrings(ap, bp) };
      break;
    }
    if (ar !== br) {
      firstTurnTextDiff = { turn: i, field: 'response', ...diffStrings(ar, br) };
      break;
    }
  }

  const explain = {
    pair: { aPath, bPath },
    fileA: {
      fileName: a.fileName,
      chatId: a.chatId,
      sanitized: a.sanitized,
      rawLen: a.rawLen,
      contentLen: a.contentLen,
      cleanedLen: a.cleanedLen,
      contentHash: a.contentHash,
      cleanedHash: a.cleanedHash,
      turnCount: a.turnCount,
    },
    fileB: {
      fileName: b.fileName,
      chatId: b.chatId,
      sanitized: b.sanitized,
      rawLen: b.rawLen,
      contentLen: b.contentLen,
      cleanedLen: b.cleanedLen,
      contentHash: b.contentHash,
      cleanedHash: b.cleanedHash,
      turnCount: b.turnCount,
    },
    overlap: {
      intersectionCount: inter,
      onlyACount: onlyA.length,
      onlyBCount: onlyB.length,
      jaccard: jaccard(aSet, bSet),
      overlapLabel: labelOverlap(aSet, bSet),
    },
    sanity: {
      contentExactMatch: a.contentHash === b.contentHash,
      cleanedExactMatch: a.cleanedHash === b.cleanedHash,
      sameTurnCount: a.turnCount === b.turnCount,
      firstTurnTextDiff,
    },
    samples: {
      onlyA_hashes: onlyA.slice(0, 20),
      onlyB_hashes: onlyB.slice(0, 20),
    },
    turnsA: a.turns.map((t) => ({
      fileTurnIndex: t.fileTurnIndex,
      pairHashV2: t.pairHashV2,
      promptLen: t.prompt.length,
      responseLen: t.response.length,
      promptPreview: t.prompt.slice(0, 160),
      responsePreview: t.response.slice(0, 160),
    })),
    turnsB: b.turns.map((t) => ({
      fileTurnIndex: t.fileTurnIndex,
      pairHashV2: t.pairHashV2,
      promptLen: t.prompt.length,
      responseLen: t.response.length,
      promptPreview: t.prompt.slice(0, 160),
      responsePreview: t.response.slice(0, 160),
    })),
  };

  const jsonPath = path.join(process.cwd(), 'audit-chatworthy-overlap-explain.json');
  const txtPath = path.join(process.cwd(), 'audit-chatworthy-overlap-explain.txt');

  const lines: string[] = [];
  lines.push(`A: ${a.filePath}`);
  lines.push(`B: ${b.filePath}`);
  lines.push(`A sanitized=${a.sanitized} cleanedHash=${a.cleanedHash} turns=${a.turnCount}`);
  lines.push(`B sanitized=${b.sanitized} cleanedHash=${b.cleanedHash} turns=${b.turnCount}`);
  lines.push(
    `overlap: label=${explain.overlap.overlapLabel} inter=${inter} jaccard=${explain.overlap.jaccard}`,
  );
  if (firstTurnTextDiff?.idx >= 0) {
    lines.push(
      `first text diff: turn=${firstTurnTextDiff.turn} field=${firstTurnTextDiff.field} idx=${firstTurnTextDiff.idx}`,
    );
    lines.push(`A snippet: ${firstTurnTextDiff.aSnippet}`);
    lines.push(`B snippet: ${firstTurnTextDiff.bSnippet}`);
  } else {
    lines.push(`no prompt/response text diff found by index alignment (or turn counts differ)`);
  }
  lines.push('');
  lines.push('onlyA hashes (first 20):');
  lines.push(...onlyA.slice(0, 20));
  lines.push('');
  lines.push('onlyB hashes (first 20):');
  lines.push(...onlyB.slice(0, 20));

  await fs.writeFile(jsonPath, JSON.stringify(explain, null, 2), 'utf8');
  await fs.writeFile(txtPath, lines.join('\n'), 'utf8');

  console.log(`\nExplain written to ${jsonPath}`);
  console.log(`Explain summary written to ${txtPath}`);
}

/**
 * Build purely file-vs-file overlap groups by chatId.
 * Uses pairHashV2 sets (because v2 is your primary identity),
 * and does not involve DB coverage at all.
 */
function buildFileOverlapGroups(files: FileScan[]): FileOverlapGroup[] {
  const byChatId = new Map<string, FileScan[]>();
  for (const f of files) {
    if (!f.chatId) continue;
    if (!byChatId.has(f.chatId)) byChatId.set(f.chatId, []);
    byChatId.get(f.chatId)!.push(f);
  }

  const out: FileOverlapGroup[] = [];

  for (const [chatId, members] of byChatId.entries()) {
    if (members.length < 2) continue;

    // deterministic ordering
    const sorted = [...members].sort((a, b) => a.fileName.localeCompare(b.fileName));

    const sets = new Map<string, Set<string>>();
    const fileSummaries: FileOverlapFileSummary[] = sorted.map((f) => {
      const s = new Set(f.turns.map((t) => t.pairHashV2));
      sets.set(f.fileName, s);
      return { fileName: f.fileName, filePath: f.filePath, turnCount: f.turnCount };
    });

    // union count
    const union = new Set<string>();
    let maxTurnCount = 0;
    for (const f of sorted) {
      const s = sets.get(f.fileName)!;
      maxTurnCount = Math.max(maxTurnCount, s.size);
      for (const h of s) union.add(h);
    }

    const pairs: FileOverlapPair[] = [];
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const aSet = sets.get(a.fileName)!;
        const bSet = sets.get(b.fileName)!;

        const inter = intersectionCount(aSet, bSet);
        const onlyA = aSet.size - inter;
        const onlyB = bSet.size - inter;

        const aSubset = isSubset(aSet, bSet);
        const bSubset = isSubset(bSet, aSet);

        pairs.push({
          aFileName: a.fileName,
          bFileName: b.fileName,
          aTurnCount: aSet.size,
          bTurnCount: bSet.size,
          intersectionCount: inter,
          onlyACount: onlyA,
          onlyBCount: onlyB,
          jaccard: jaccard(aSet, bSet),
          aIsSubsetOfB: aSubset,
          bIsSubsetOfA: bSubset,
          overlapLabel: labelOverlap(aSet, bSet),
        });
      }
    }

    // A simple “keep candidate” heuristic: biggest unique coverage,
    // tie-break by filename (latest timestamp often sorts later, but don’t assume)
    // For now: keep the file with largest set size; ties by lexicographic.
    const keep = [...sorted]
      .sort((a, b) => {
        const asz = sets.get(a.fileName)!.size;
        const bsz = sets.get(b.fileName)!.size;
        if (bsz !== asz) return bsz - asz;
        return b.fileName.localeCompare(a.fileName);
      })[0]?.fileName ?? null;

    out.push({
      chatId,
      chatTitle: sorted.find((m) => m.chatTitle)?.chatTitle ?? null,
      chatUrl: sorted.find((m) => m.chatUrl)?.chatUrl ?? null,
      files: fileSummaries,
      unionTurnCount: union.size,
      maxTurnCount,
      pairs,
      recommendedKeepCandidate: keep,
    });
  }

  return out;
}

function renderFileOverlapHtml(generatedAt: string, downloadsDir: string, groups: FileOverlapGroup[]): string {
  const safeJson = (v: any) => JSON.stringify(v).replace(/</g, '\\u003c');

  // Sort groups by size desc
  const sorted = [...groups].sort((a, b) => {
    if (b.files.length !== a.files.length) return b.files.length - a.files.length;
    return (a.chatTitle ?? a.chatId).localeCompare(b.chatTitle ?? b.chatId);
  });

  return (
    '<!doctype html>\n' +
    '<html>\n<head>\n' +
    '  <meta charset="utf-8" />\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    '  <title>Chatworthy file overlap</title>\n' +
    '  <style>\n' +
    '    body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; }\n' +
    '    .muted { color: #666; font-size: 12px; }\n' +
    '    .group { border: 1px solid #eee; border-radius: 12px; padding: 12px; margin: 14px 0; }\n' +
    '    .hdr { display:flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }\n' +
    '    .title { font-weight: 650; }\n' +
    '    .pill { display:inline-block; font-size: 12px; border: 1px solid #ddd; padding: 3px 8px; border-radius: 999px; margin-right: 6px; }\n' +
    '    table { border-collapse: collapse; width: 100%; margin-top: 10px; }\n' +
    '    th, td { border-bottom: 1px solid #eee; padding: 8px; vertical-align: top; }\n' +
    '    td.mono, th.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }\n' +
    '    .k { font-weight: 600; }\n' +
    '  </style>\n' +
    '</head>\n<body>\n' +
    '  <h2>File-vs-file overlap (Chatworthy exports)</h2>\n' +
    `  <div class="muted">generatedAt: ${generatedAt} &nbsp;|&nbsp; downloadsDir: ${downloadsDir}</div>\n` +
    `  <div class="muted">Groups: ${sorted.length}</div>\n` +
    sorted
      .map((g) => {
        const chatLink = g.chatUrl ? `<a href="${g.chatUrl}" target="_blank" rel="noopener noreferrer">open chat</a>` : '';
        const fileRows = g.files
          .map((f) => {
            const url = toFileUrl(f.filePath);
            return `<tr><td class="mono"><a href="${url}" target="_blank" rel="noopener noreferrer">${f.fileName}</a></td><td class="mono">${f.turnCount}</td><td class="mono">${f.filePath}</td></tr>`;
          })
          .join('\n');

        const pairRows = g.pairs
          .sort((a, b) => b.jaccard - a.jaccard)
          .map((p) => {
            const j = (Math.round(p.jaccard * 1000) / 1000).toFixed(3);
            return (
              `<tr>` +
              `<td class="mono">${p.aFileName}</td>` +
              `<td class="mono">${p.bFileName}</td>` +
              `<td class="mono">${p.overlapLabel}</td>` +
              `<td class="mono">${p.intersectionCount}</td>` +
              `<td class="mono">${p.onlyACount}</td>` +
              `<td class="mono">${p.onlyBCount}</td>` +
              `<td class="mono">${j}</td>` +
              `</tr>`
            );
          })
          .join('\n');

        return (
          `<div class="group">\n` +
          `  <div class="hdr">\n` +
          `    <div>\n` +
          `      <div class="title">${(g.chatTitle ?? '(no chatTitle)')} <span class="muted">(${g.chatId})</span></div>\n` +
          `      <div class="muted">${chatLink}</div>\n` +
          `    </div>\n` +
          `    <div>\n` +
          `      <span class="pill"><span class="k">files</span>: ${g.files.length}</span>\n` +
          `      <span class="pill"><span class="k">union</span>: ${g.unionTurnCount}</span>\n` +
          `      <span class="pill"><span class="k">max</span>: ${g.maxTurnCount}</span>\n` +
          `      <span class="pill"><span class="k">keep</span>: ${g.recommendedKeepCandidate ?? '—'}</span>\n` +
          `    </div>\n` +
          `  </div>\n` +
          `  <h4 style="margin:10px 0 6px;">Files</h4>\n` +
          `  <table>\n` +
          `    <thead><tr><th class="mono">fileName</th><th class="mono">turnCount</th><th class="mono">filePath</th></tr></thead>\n` +
          `    <tbody>\n${fileRows}\n</tbody>\n` +
          `  </table>\n` +
          `  <h4 style="margin:12px 0 6px;">Pairwise overlap</h4>\n` +
          `  <table>\n` +
          `    <thead>\n` +
          `      <tr>\n` +
          `        <th class="mono">A</th><th class="mono">B</th><th class="mono">label</th>\n` +
          `        <th class="mono">∩</th><th class="mono">A\\B</th><th class="mono">B\\A</th><th class="mono">jaccard</th>\n` +
          `      </tr>\n` +
          `    </thead>\n` +
          `    <tbody>\n${pairRows}\n</tbody>\n` +
          `  </table>\n` +
          `</div>\n`
        );
      })
      .join('\n') +
    '\n</body>\n</html>\n'
  );
}

// ---------------- report shaping ----------------

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

function printSummary(
  files: FileScan[],
  duplicateGroups: DuplicateGroup[],
  opts: ScriptOptions
): void {
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

      // Only show matchedTurns hint if details are enabled
      if (opts.includePartialDetails) {
        f.matchedTurns.slice(0, 2).forEach((mt) => {
          const firstMatch = mt.dbMatches[0];
          if (firstMatch) {
            console.log(
              `    turn ${mt.fileTurnIndex} -> note ${firstMatch.noteId} (${firstMatch.title ?? ''})`
            );
          }
        });
      }
    });
  }

  if (opts.includeDuplicateDetails && duplicateGroups.length) {
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

// ---------------- main ----------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  ensureMongoUri();

  const downloadsDir = resolveChatalogInboxDir();

  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  try {
    const generatedAt = new Date().toISOString();

    const files = await scanMarkdownFiles(downloadsDir);
    if (opts.explainOverlapPair) {
      await explainOverlapPair(opts);
    }
    const fingerprintIndex = await loadFingerprintIndex();

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
      file.status =
        file.matchedCount === 0
          ? 'NONE'
          : file.matchedCount === file.turnCount
            ? 'FULL'
            : 'PARTIAL';
    }

    const duplicateGroups = buildDuplicateGroups(files, fingerprintIndex);

    // ---- derive delete/review decisions (unchanged) ----

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

    // ---- JSON report (with toggles) ----

    const report: any = {
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
      partialOverlapFiles: opts.includePartialDetails
        ? partialOverlapFiles.map(fullFileWithDiagnostics)
        : partialOverlapFiles.map(minFileForOutput),
    };

    if (opts.includeDuplicateDetails) {
      report.duplicateGroups = duplicateGroups;
    }

    // ---- primary artifacts (unchanged names) ----

    const outPath = path.join(process.cwd(), 'audit-chatworthy-downloads.json');
    const deleteOutPath = path.join(process.cwd(), 'audit-chatworthy-delete-commands.txt');
    const reviewOutPath = path.join(process.cwd(), 'audit-chatworthy-review-links.html');

    const deleteLines =
      deletePathsFinal.map((p) => `rm ${shellSingleQuote(p)}`).join('\n') +
      (deletePathsFinal.length ? '\n' : '');

    const reportId = `audit:${generatedAt}:${downloadsDir}`;
    const safeJson = (v: any) => JSON.stringify(v).replace(/</g, '\\u003c');

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

    // ---- optional: overlap artifacts ----
    if (opts.emitFileOverlap) {
      const overlapGroups = buildFileOverlapGroups(files);
      const overlapJsonPath = path.join(process.cwd(), 'audit-chatworthy-file-overlap.json');
      const overlapHtmlPath = path.join(process.cwd(), 'audit-chatworthy-file-overlap.html');

      const overlapReport = {
        generatedAt,
        downloadsDir,
        groupCount: overlapGroups.length,
        groups: overlapGroups,
      };

      await fs.writeFile(overlapJsonPath, JSON.stringify(overlapReport, null, 2), 'utf8');
      await fs.writeFile(overlapHtmlPath, renderFileOverlapHtml(generatedAt, downloadsDir, overlapGroups), 'utf8');

      console.log(`\nFile overlap JSON written to ${overlapJsonPath}`);
      console.log(`File overlap HTML written to ${overlapHtmlPath} (open in Chrome)`);
    }

    printSummary(files, duplicateGroups, opts);
    console.log(`\nReport written to ${outPath}`);
    console.log(`Delete commands written to ${deleteOutPath}`);
    console.log(`Review links written to ${reviewOutPath} (open in Chrome)`);
  } finally {
    await db.disconnectFromDatabase();
  }
}

main()
  .then(() => {})
  .catch((err) => {
    console.error('Error running auditChatworthyDownloads:', err);
    process.exit(1);
  });
