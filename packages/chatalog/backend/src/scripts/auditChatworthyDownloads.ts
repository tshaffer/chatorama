import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import fg from 'fast-glob';

import { NoteModel } from '../models/Note';
import { TurnFingerprintModel } from '../models/TurnFingerprintModel';
import { SubjectModel } from '../models/Subject';
import { TopicModel } from '../models/Topic';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../utils/textHash';

type FileTurn = {
  fileTurnIndex: number;
  pairHash: string;
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
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function extractChatTitle(data: Record<string, any>): string | null {
  const keys = ['chatworthyChatTitle', 'chatTitle', 'chat_title'];
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
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
  s = s.replace(
    /^\s*##\s+Table of Contents[\s\S]*?(?=^\s*\*\*Prompt\*\*|\s*$)/gm,
    '',
  );
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function shouldSanitizeChatworthyExport(content: string): boolean {
  if (!content) return false;
  if (/\n\s*##\s+Table of Contents\s*\n/i.test(content)) return true;
  if (/<a\s+id="p-\d+"\s*><\/a>/i.test(content)) return true;
  const promptCount = (content.match(/\*\*Prompt\*\*/gi) ?? []).length;
  if (promptCount >= 2) return true;
  return false;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text ?? '', 'utf8').digest('hex');
}

function clip(s: string, n = 300): string {
  const t = (s ?? '').replace(/\r\n/g, '\n');
  return t.length <= n ? t : t.slice(0, n) + '…';
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

  for (const [id, meta] of noteMetaCache.entries()) {
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
      const pairHash = hashPromptResponsePair(t.prompt, t.response);
      const base = noteMetaCache.get(noteId)!;
      const match: DbTurnMatch = {
        ...base,
        matchSource: 'markdown',
        noteId,
        dbTurnIndex: typeof t.turnIndex === 'number' ? t.turnIndex : null,
        chatId,
      };
      if (!index.has(pairHash)) index.set(pairHash, []);
      index.get(pairHash)!.push(match);
    });
  }

  markdownIndexByChatIdCache.set(chatId, index);
  return index;
}

async function scanMarkdownFiles(downloadsDir: string): Promise<FileScan[]> {
  const pattern = '*.md';
  const files = await fg(pattern, { cwd: downloadsDir, absolute: true, onlyFiles: true });
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
      } catch (e) {
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
      if (path.basename(filePath).includes('programmatic-extraction-options-from-export-data-202512200723')) {
        const t = logicalTurns.find((x) => (x.turnIndex ?? -1) === 5) ?? logicalTurns[5];
        console.log('DEBUG FILE turn5 prompt:', JSON.stringify(t?.prompt));
        console.log('DEBUG FILE turn5 response:', JSON.stringify(t?.response));
        console.log('prompt length:', t?.prompt?.length);
        console.log('response length:', t?.response?.length);

      }
      const turns: FileTurn[] = logicalTurns.map((t, idx) => ({
        fileTurnIndex: typeof t.turnIndex === 'number' ? t.turnIndex : idx,
        pairHash: hashPromptResponsePair(t.prompt, t.response),
      }));
      const turnCount = turns.length;

      const matchedTurnIndices: number[] = [];

      results.push({
        filePath,
        fileName: path.basename(filePath),
        chatId,
        chatTitle,
        chatUrl,
        turnCount,
        turns,
        matchedTurnIndices,
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
      continue;
    }
  }

  return results;
}

function buildDuplicateGroups(
  files: FileScan[],
  fingerprintIndex: Map<string, FingerprintOcc[]>
): DuplicateGroup[] {
  const byChatId = new Map<string, FileScan[]>();
  files.forEach((file) => {
    if (!file.chatId) return;
    if (!byChatId.has(file.chatId)) byChatId.set(file.chatId, []);
    byChatId.get(file.chatId)!.push(file);
  });

  const groups: DuplicateGroup[] = [];
  for (const [chatId, members] of byChatId.entries()) {
    if (!members.length || members.length < 2) continue;

    const summaries = members.map((f) => ({
      file: f,
      fileSet: new Set(f.turns.map((t) => t.pairHash)),
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

      const sortedSupersets = supersets.sort((a, b) => a.file.turnCount - b.file.turnCount);
      const chosen = sortedSupersets[0];

      entry.summary.subsetOfFileName = chosen?.file.fileName ?? null;
      entry.summary.subsetOfCount = supersets.length;
      entry.summary.isStrictSubsetOf = supersets.map((s) => s.file.fileName);
      entry.summary.closestSuperset = chosen?.file.fileName ?? null;
      entry.summary.recommendedAction = 'SAFE_DELETE_DUPLICATE';

      if (chosen) {
        const missing = chosen.file.turns
          .filter((t) => !entry.fileSet.has(t.pairHash))
          .map((t) => t.fileTurnIndex ?? t.turnIndex ?? 0);
        entry.summary.missingTurnIndicesFromClosestSuperset = missing;
      }
    });

    const filesSummary = summaries.map((s) => s.summary);

    const unionHashes = new Set<string>();
    members.forEach((f) => f.turns.forEach((t) => unionHashes.add(t.pairHash)));

    const unionMatched = new Set<string>();
    unionHashes.forEach((h) => {
      if (fingerprintIndex.has(h)) {
        unionMatched.add(h);
      } else if (chatId && markdownIndexByChatIdCache.has(chatId)) {
        const mdIdx = markdownIndexByChatIdCache.get(chatId)!;
        if (mdIdx.has(h)) unionMatched.add(h);
      }
    });

    const unionTurnCount = unionHashes.size;
    const unionMatchedCount = unionMatched.size;
    const unionCoverage = unionTurnCount
      ? `${unionMatchedCount}/${unionTurnCount}`
      : '0/0';

    let recommendedAction: 'DELETE_ALL' | 'REVIEW_AND_IMPORT' | 'REVIEW';
    if (unionMatchedCount === unionTurnCount) recommendedAction = 'DELETE_ALL';
    else if (members.some((f) => f.unmatchedCount > 0)) recommendedAction = 'REVIEW_AND_IMPORT';
    else recommendedAction = 'REVIEW';

    const recommendedImportCandidate =
      recommendedAction === 'REVIEW_AND_IMPORT'
        ? [...members]
          .sort((a, b) => {
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
      if (g.keepFiles?.length) {
        console.log(`  keepFiles: ${g.keepFiles.join(', ')}`);
      }
      if (g.safeDeleteFiles?.length) {
        console.log(`  safeDeleteFiles: ${g.safeDeleteFiles.join(', ')}`);
      }
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
  // Wrap in single quotes; escape any embedded single quote safely for bash.
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

async function main() {
  ensureMongoUri();
  const downloadsDir = resolveDownloadsDir();

  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  try {
    const fingerprintIndex = await loadFingerprintIndex();
    const files = await scanMarkdownFiles(downloadsDir);

    for (const file of files) {
      const matchedTurns: MatchedTurnDetail[] = [];
      const matchedIdx = new Set<number>();

      const noteIdsToHydrate = new Set<string>();
      file.turns.forEach((ft) => {
        const occs = fingerprintIndex.get(ft.pairHash) ?? [];
        occs.forEach((o) => noteIdsToHydrate.add(o.noteId));
      });
      await hydrateNoteMeta([...noteIdsToHydrate]);

      for (const ft of file.turns) {
        const occs = fingerprintIndex.get(ft.pairHash) ?? [];
        if (!occs.length) continue;

        matchedIdx.add(ft.fileTurnIndex);
        const dbMatches: DbTurnMatch[] = occs.map((o) => {
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
        matchedTurns.push({
          fileTurnIndex: ft.fileTurnIndex,
          pairHash: ft.pairHash,
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
            const hits = mdIndex.get(ft.pairHash) ?? [];
            if (!hits.length) continue;
            matchedIdx.add(ft.fileTurnIndex);
            matchedTurns.push({
              fileTurnIndex: ft.fileTurnIndex,
              pairHash: ft.pairHash,
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
      if (file.matchedCount === 0) file.status = 'NONE';
      else if (file.matchedCount === file.turnCount) file.status = 'FULL';
      else file.status = 'PARTIAL';

      // ✅ add debug block here (now unmatchedTurnIndices exists)
      if (file.fileName.includes('programmatic-extraction-options-from-export-data-202512200723')) {
        const unmatched = file.turns.filter((t) =>
          file.unmatchedTurnIndices.includes(t.fileTurnIndex)
        );
        console.log('DEBUG unmatched turns:', {
          file: file.fileName,
          chatId: file.chatId,
          unmatchedTurnIndices: file.unmatchedTurnIndices,
          unmatched,
        });
      }
    }

    const duplicateGroups = buildDuplicateGroups(files, fingerprintIndex);

    // ---- Build actionable outputs: delete commands + review links ----

    const fileByName = new Map<string, FileScan>();
    for (const f of files) fileByName.set(f.fileName, f);

    const importCandidatesToReview = new Set<string>();
    for (const g of duplicateGroups) {
      if (g.recommendedAction === 'REVIEW_AND_IMPORT' && g.recommendedImportCandidate) {
        importCandidatesToReview.add(g.recommendedImportCandidate);
      }
    }

    const deletePaths: string[] = [];
    const reviewPaths: string[] = [];

    // 1) From group recommendations
    for (const g of duplicateGroups) {
      if (g.recommendedAction === 'DELETE_ALL') {
        for (const f of g.files) deletePaths.push(f.filePath);
        continue;
      }

      // Otherwise, group requires review
      for (const f of g.files) reviewPaths.push(f.filePath);

      // Plus any "safe delete duplicate" within the group goes to delete list
      for (const f of g.files) {
        if (f.recommendedAction === 'SAFE_DELETE_DUPLICATE') {
          deletePaths.push(f.filePath);
        }
      }
    }

    // 2) From per-file statuses (for files not already covered by group logic)
    const alreadyMentioned = new Set<string>([...deletePaths, ...reviewPaths]);

    for (const f of files) {
      if (alreadyMentioned.has(f.filePath)) continue;

      if (f.status === 'FULL' && !importCandidatesToReview.has(f.fileName)) {
        deletePaths.push(f.filePath);
      } else {
        reviewPaths.push(f.filePath);
      }
    }

    const deletePathsFinal = uniqSorted(deletePaths);
    const reviewPathsFinal = uniqSorted(reviewPaths);

    const fullyCoveredFiles = files.filter((f) => f.status === 'FULL');
    const noOverlapFiles = files.filter((f) => f.status === 'NONE');
    const partialOverlapFiles = files.filter((f) => f.status === 'PARTIAL');

    const report = {
      generatedAt: new Date().toISOString(),
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
    const reportId = `audit:${new Date().toISOString()}:${downloadsDir}`;
    const safeJson = (v: any) => JSON.stringify(v).replace(/</g, '\\u003c');
    const reviewItems = reviewPathsFinal.map((p) => ({
      path: p,
      name: path.basename(p),
      url: toFileUrl(p),
    }));
    const deleteItems = deletePathsFinal.map((p) => ({ path: p }));
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
      '    .controls { display: flex; gap: 10px; align-items: center; }\n' +
      '    td.ctrl { text-align: center; }\n' +
      '    input[type="radio"] { transform: scale(1.05); }\n' +
      '  </style>\n' +
      '</head>\n<body>\n' +
      `  <h2>Files to review</h2>\n` +
      `  <div class="muted">This checklist persists in your browser (localStorage). Report key: <span id="reportKey"></span></div>\n` +
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
      '\n' +
      `  <script>\n` +
      `    const REPORT_ID = ${safeJson(reportId)};\n` +
      `    const reviewItems = ${safeJson(reviewItems)};\n` +
      `    const REVIEWED_KEY = "chatworthy_reviewed:" + REPORT_ID;\n` +
      `    const DISPO_KEY = "chatworthy_dispo:" + REPORT_ID;\n` +
      `    const HIDE_KEY = "chatworthy_hideReviewed:" + REPORT_ID;\n` +
      `\n` +
      `    document.getElementById("reportKey").textContent = REVIEWED_KEY;\n` +
      `\n` +
      `    function loadJson(key, fallback) {\n` +
      `      try {\n` +
      `        const raw = localStorage.getItem(key);\n` +
      `        return raw ? JSON.parse(raw) : fallback;\n` +
      `      } catch {\n` +
      `        return fallback;\n` +
      `      }\n` +
      `    }\n` +
      `\n` +
      `    function saveJson(key, val) {\n` +
      `      localStorage.setItem(key, JSON.stringify(val));\n` +
      `    }\n` +
      `\n` +
      `    function loadHide() {\n` +
      `      return localStorage.getItem(HIDE_KEY) === "1";\n` +
      `    }\n` +
      `\n` +
      `    function saveHide(v) {\n` +
      `      localStorage.setItem(HIDE_KEY, v ? "1" : "0");\n` +
      `    }\n` +
      `\n` +
      `    const reviewedState = loadJson(REVIEWED_KEY, {});\n` +
      `    const dispoState = loadJson(DISPO_KEY, {});\n` +
      `    const tbody = document.getElementById("rows");\n` +
      `    const chkHide = document.getElementById("chkHideReviewed");\n` +
      `\n` +
      `    function render() {\n` +
      `      tbody.innerHTML = "";\n` +
      `      const hideReviewed = chkHide.checked;\n` +
      `      let reviewedCount = 0;\n` +
      `      let removeCount = 0;\n` +
      `\n` +
      `      for (const item of reviewItems) {\n` +
      `        const dispo = dispoState[item.path] || "import";\n` +
      `        const isRemove = dispo === "remove";\n` +
      `        const isDone = !!reviewedState[item.path];\n` +
      `        if (isRemove) removeCount++;\n` +
      `        if (isDone) reviewedCount++;\n` +
      `\n` +
      `        const tr = document.createElement("tr");\n` +
      `        if (isDone) tr.classList.add("reviewed");\n` +
      `        if (hideReviewed && isDone) tr.classList.add("hidden");\n` +
      `\n` +
      `        const tdReviewed = document.createElement("td");\n` +
      `        tdReviewed.className = "ctrl";\n` +
      `        const cb = document.createElement("input");\n` +
      `        cb.type = "checkbox";\n` +
      `        cb.checked = isDone;\n` +
      `        cb.addEventListener("change", () => {\n` +
      `          reviewedState[item.path] = cb.checked;\n` +
      `          if (!cb.checked) delete reviewedState[item.path];\n` +
      `          saveJson(REVIEWED_KEY, reviewedState);\n` +
      `          render();\n` +
      `        });\n` +
      `        tdReviewed.appendChild(cb);\n` +
      `\n` +
      `        const tdImport = document.createElement("td");\n` +
      `        tdImport.className = "ctrl";\n` +
      `        const rImport = document.createElement("input");\n` +
      `        rImport.type = "radio";\n` +
      `        rImport.name = "dispo:" + item.path;\n` +
      `        rImport.checked = dispo === "import";\n` +
      `        rImport.addEventListener("change", () => {\n` +
      `          dispoState[item.path] = "import";\n` +
      `          saveJson(DISPO_KEY, dispoState);\n` +
      `          render();\n` +
      `        });\n` +
      `        tdImport.appendChild(rImport);\n` +
      `\n` +
      `        const tdRemove = document.createElement("td");\n` +
      `        tdRemove.className = "ctrl";\n` +
      `        const rRemove = document.createElement("input");\n` +
      `        rRemove.type = "radio";\n` +
      `        rRemove.name = "dispo:" + item.path;\n` +
      `        rRemove.checked = dispo === "remove";\n` +
      `        rRemove.addEventListener("change", () => {\n` +
      `          dispoState[item.path] = "remove";\n` +
      `          saveJson(DISPO_KEY, dispoState);\n` +
      `          render();\n` +
      `        });\n` +
      `        tdRemove.appendChild(rRemove);\n` +
      `\n` +
      `        const tdFile = document.createElement("td");\n` +
      `        const a = document.createElement("a");\n` +
      `        a.href = item.url;\n` +
      `        a.textContent = item.name;\n` +
      `        a.target = "_blank";\n` +
      `        a.rel = "noopener noreferrer";\n` +
      `        tdFile.appendChild(document.createTextNode("review "));\n` +
      `        tdFile.appendChild(a);\n` +
      `\n` +
      `        const tdPath = document.createElement("td");\n` +
      `        const div = document.createElement("div");\n` +
      `        div.className = "path";\n` +
      `        div.textContent = item.path;\n` +
      `        tdPath.appendChild(div);\n` +
      `\n` +
      `        tr.appendChild(tdReviewed);\n` +
      `        tr.appendChild(tdImport);\n` +
      `        tr.appendChild(tdRemove);\n` +
      `        tr.appendChild(tdFile);\n` +
      `        tr.appendChild(tdPath);\n` +
      `        tbody.appendChild(tr);\n` +
      `      }\n` +
      `\n` +
      `      document.getElementById("counts").textContent = \n` +
      `        "Reviewed: " + reviewedCount + "/" + reviewItems.length +\n` +
      `        " | Remove: " + removeCount +\n` +
      `        " | Remaining: " + (reviewItems.length - reviewedCount);\n` +
      `    }\n` +
      `\n` +
      `    // init hide toggle\n` +
      `    chkHide.checked = loadHide();\n` +
      `    chkHide.addEventListener("change", () => { saveHide(chkHide.checked); render(); });\n` +
      `\n` +
      `    document.getElementById("btnMarkAll").addEventListener("click", () => {\n` +
      `      for (const item of reviewItems) reviewedState[item.path] = true;\n` +
      `      saveJson(REVIEWED_KEY, reviewedState);\n` +
      `      render();\n` +
      `    });\n` +
      `\n` +
      `    document.getElementById("btnClear").addEventListener("click", () => {\n` +
      `      for (const item of reviewItems) delete reviewedState[item.path];\n` +
      `      saveJson(REVIEWED_KEY, reviewedState);\n` +
      `      render();\n` +
      `    });\n` +
      `\n` +
      `    document.getElementById("btnCopyRmRemove").addEventListener("click", async () => {\n` +
      `      const removeList = reviewItems\n` +
      `        .filter(i => (dispoState[i.path] || "import") === "remove")\n` +
      `        .map(i => "rm " + i.path)\n` +
      `        .join("\\n");\n` +
      `      try {\n` +
      `        await navigator.clipboard.writeText(removeList + (removeList ? "\\n" : ""));\n` +
      `        alert("Copied rm commands for Remove to clipboard.");\n` +
      `      } catch (e) {\n` +
      `        window.prompt("Copy rm commands:", removeList);\n` +
      `      }\n` +
      `    });\n` +
      `\n` +
      `    document.getElementById("btnClearRemove").addEventListener("click", () => {\n` +
      `      for (const item of reviewItems) {\n` +
      `        if (dispoState[item.path] === "remove") {\n` +
      `          dispoState[item.path] = "import";\n` +
      `        }\n` +
      `      }\n` +
      `      for (const item of reviewItems) {\n` +
      `        if (dispoState[item.path] === "import") delete dispoState[item.path];\n` +
      `      }\n` +
      `      saveJson(DISPO_KEY, dispoState);\n` +
      `      render();\n` +
      `    });\n` +
      `\n` +
      `    render();\n` +
      `  </script>\n` +
      '</body>\n</html>\n';

    await fs.writeFile(deleteOutPath, deleteLines, 'utf8');
    await fs.writeFile(reviewOutPath, reviewLines, 'utf8');
    await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
    printSummary(files, duplicateGroups);
    console.log(`\nReport written to ${outPath}`);
    console.log(`Delete commands written to ${deleteOutPath}`);
    console.log(`Review links written to ${reviewOutPath} (open in Chrome)`);
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
