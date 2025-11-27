// scripts/check-chatworthy-files-against-db.ts
//
// Usage (from packages/chatalog/backend):
//
//   # Full report (table + JSON)
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//     npx ts-node scripts/check-chatworthy-files-against-db.ts /path/to/chatworthy/exports
//
//   # BRIEF MODE: only files that are none/partial, with prompt snippets
//   MONGO_URI="mongodb://localhost:27017/chatalog_dev" \
//     npx ts-node scripts/check-chatworthy-files-against-db.ts /path/to/chatworthy/exports --brief
//     npx ts-node scripts/check-chatworthy-files-against-db.ts /Users/tedshaffer/Documents/ChatworthyExports/manual --brief

// This script:
//   - Scans a directory recursively for .md files
//   - For each file, parses Chatworthy front matter + anchors:
//       * chatId (or falls back to noteId)
//       * chatTitle
//       * number of turns in the file
//   - Looks in MongoDB for notes that match either:
//       * chatworthyChatId == chatId, or
//       * chatworthyFileName == <basename of the .md file>
//   - For each file, reports:
//       * none    → no turns from this chat/file are in DB
//       * partial → some but not all turns from this chat/file are in DB
//       * complete→ all turns in the file are already in DB
//   - Always writes JSON to ./data/chatworthy-file-status.json
//   - In --brief mode, prints ONLY:
//       * Filenames with status NONE/PARTIAL
//       * For PARTIAL: first 120 chars of each missing turn section
//     and writes the same text to ./data/chatworthy-file-status.txt
//

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import matter from 'gray-matter';

import { NoteModel } from '../src/models/Note';

type FileScanInfo = {
  filePath: string;
  fileName: string; // basename of filePath
  chatId: string | null;
  chatTitle?: string | null;
  turnsInFile: number;
  body: string;
};

type DbInfo = {
  importedTurnIndexes: number[];
};

type MissingTurnSnippet = {
  turnIndex: number;
  snippet: string;
};

type FileStatus = {
  filePath: string;
  chatId: string | null;
  chatTitle?: string | null;
  turnsInFile: number;
  importedTurnIndexes: number[];
  missingTurnIndexes: number[];
  importedTurnCount: number;
  status: 'none' | 'partial' | 'complete' | 'unknown';
  missingTurnSnippets: MissingTurnSnippet[];
};

type TurnSection = {
  index: number; // 0-based turn index
  markdown: string;
};

function usageAndExit(): never {
  console.error(
    'Usage: ts-node scripts/check-chatworthy-files-against-db.ts <directory> [--brief]'
  );
  process.exit(1);
}

// Recursively walk a directory and collect .md files
function collectMarkdownFiles(rootDir: string): string[] {
  const result: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && fullPath.toLowerCase().endsWith('.md')) {
        result.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return result;
}

// Count turn anchors <a id="p-N"></a> in a Chatworthy export
function countTurnsInBody(body: string): number {
  const anchorRe = /(^|\r?\n)\s*<a id="p-(\d+)"><\/a>\s*\r?\n/gi;
  const matches = [...body.matchAll(anchorRe)];
  if (!matches.length) return 1; // No anchors → single "turn"
  return matches.length;
}

// Split body into per-turn sections, similar to imports.chatworthy.ts
function splitIntoTurnSections(body: string): TurnSection[] {
  const anchorRe = /(^|\r?\n)\s*<a id="p-(\d+)"><\/a>\s*\r?\n/gi;
  const matches = [...body.matchAll(anchorRe)];
  if (!matches.length) {
    return [];
  }

  const sections: TurnSection[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index ?? 0;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length;
    const slice = body.slice(start, end);
    sections.push({ index: i, markdown: slice }); // 0-based index
  }

  return sections;
}

// Compute snippets (first 120 chars) for missing turns in a given file
function computeMissingTurnSnippets(
  file: FileScanInfo,
  missingIndexes: number[],
  maxLen = 120
): MissingTurnSnippet[] {
  const sections = splitIntoTurnSections(file.body);
  const snippets: MissingTurnSnippet[] = [];

  // If there are no anchors, treat the whole body as turn 0
  if (!sections.length) {
    if (missingIndexes.includes(0)) {
      let text = file.body.replace(/\s+/g, ' ').trim();
      if (text.length > maxLen) {
        text = text.slice(0, maxLen);
      }
      if (text) {
        snippets.push({ turnIndex: 0, snippet: text });
      }
    }
    return snippets;
  }

  for (const idx of missingIndexes) {
    const section = sections.find((s) => s.index === idx);
    if (!section) continue;

    // Strip the anchor line at the top
    let text = section.markdown.replace(/^\s*<a id="p-\d+"><\/a>\s*/i, '');

    // Collapse whitespace and trim
    text = text.replace(/\s+/g, ' ').trim();

    if (!text) continue;

    if (text.length > maxLen) {
      text = text.slice(0, maxLen);
    }

    snippets.push({ turnIndex: idx, snippet: text });
  }

  return snippets;
}

// Parse a single Chatworthy .md file just enough to get chatId, title, turn count, and body.
function scanChatworthyFile(filePath: string): FileScanInfo {
  const raw = fs.readFileSync(filePath, 'utf8');
  const gm = matter(raw);
  const fm = gm.data as Record<string, any>;

  const noteId =
    typeof fm.noteId === 'string' ? fm.noteId.trim() : undefined;
  const chatIdFromFm =
    typeof fm.chatId === 'string' ? fm.chatId.trim() : undefined;

  // Fallback: if chatId is missing, use noteId as the chat grouping key
  const chatId = chatIdFromFm ?? noteId ?? null;

  const chatTitle =
    typeof fm.chatTitle === 'string' ? fm.chatTitle.trim() : undefined;

  const body = gm.content;
  const turnsInFile = countTurnsInBody(body);

  const fileName = path.basename(filePath);

  return {
    filePath,
    fileName,
    chatId,
    chatTitle: chatTitle ?? null,
    turnsInFile,
    body,
  };
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI environment variable is required');
    usageAndExit();
  }

  const args = process.argv.slice(2);
  const dirArg = args[0];
  const briefMode = args.includes('--brief');

  if (!dirArg) {
    usageAndExit();
  }

  const rootDir = path.resolve(dirArg);
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    console.error('ERROR: Provided path is not a directory:', rootDir);
    process.exit(1);
  }

  console.log('Scanning directory for .md files:', rootDir);
  const mdFiles = collectMarkdownFiles(rootDir);
  if (!mdFiles.length) {
    console.log('No .md files found under directory.');
    process.exit(0);
  }

  console.log(`Found ${mdFiles.length} .md files. Parsing front matter...`);

  const fileInfos: FileScanInfo[] = mdFiles.map(scanChatworthyFile);

  const chatIds = Array.from(
    new Set(
      fileInfos
        .map((f) => f.chatId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const fileNames = Array.from(
    new Set(fileInfos.map((f) => f.fileName))
  );

  console.log(`Distinct chats in these files (from front matter): ${chatIds.length}`);
  console.log(`Distinct file basenames in these files: ${fileNames.length}`);

  await mongoose.connect(mongoUri);

  // Pull all notes in DB for these chatIds and/or fileNames in one query
  const dbNotes = await NoteModel.find({
    $or: [
      { chatworthyChatId: { $in: chatIds } },
      { chatworthyFileName: { $in: fileNames } },
    ],
  })
    .select('chatworthyChatId chatworthyFileName chatworthyTurnIndex')
    .lean();

  console.log(
    `Found ${dbNotes.length} notes in DB with matching chatworthyChatId or chatworthyFileName.`
  );

  const dbByChatId = new Map<string, DbInfo>();
  const dbByFileName = new Map<string, DbInfo>();

  for (const n of dbNotes as any[]) {
    const chatId: string | undefined = n.chatworthyChatId ?? undefined;
    const fileName: string | undefined = n.chatworthyFileName ?? undefined;
    const turnIndex: number | undefined = n.chatworthyTurnIndex;

    if (typeof turnIndex !== 'number') continue;

    if (chatId) {
      let info = dbByChatId.get(chatId);
      if (!info) {
        info = { importedTurnIndexes: [] };
        dbByChatId.set(chatId, info);
      }
      info.importedTurnIndexes.push(turnIndex);
    }

    if (fileName) {
      let info = dbByFileName.get(fileName);
      if (!info) {
        info = { importedTurnIndexes: [] };
        dbByFileName.set(fileName, info);
      }
      info.importedTurnIndexes.push(turnIndex);
    }
  }

  // Deduplicate + sort imported turn indexes in both maps
  for (const info of dbByChatId.values()) {
    info.importedTurnIndexes = Array.from(
      new Set(info.importedTurnIndexes)
    ).sort((a, b) => a - b);
  }
  for (const info of dbByFileName.values()) {
    info.importedTurnIndexes = Array.from(
      new Set(info.importedTurnIndexes)
    ).sort((a, b) => a - b);
  }

  // Combine file scan results with DB info
  const fileStatuses: FileStatus[] = fileInfos.map((f) => {
    // Combine notes matched by chatId AND by fileName
    const fromChat =
      f.chatId && dbByChatId.get(f.chatId)
        ? dbByChatId.get(f.chatId)!.importedTurnIndexes
        : [];
    const fromFile =
      dbByFileName.get(f.fileName)?.importedTurnIndexes ?? [];

    const importedTurnIndexes = Array.from(
      new Set([...fromChat, ...fromFile])
    ).sort((a, b) => a - b);

    const importedTurnCount = importedTurnIndexes.length;

    if (!f.chatId && !fromFile.length && !fromChat.length) {
      // No chatId and nothing matched by fileName → unknown
      return {
        filePath: f.filePath,
        chatId: null,
        chatTitle: f.chatTitle,
        turnsInFile: f.turnsInFile,
        importedTurnIndexes: [],
        missingTurnIndexes: [],
        importedTurnCount: 0,
        status: 'unknown',
        missingTurnSnippets: [],
      };
    }

    // ---- Normalized mismatch detection (handles 0-based or 1-based DB indexes) ----

    let status: FileStatus['status'] = 'unknown';
    let missingTurnIndexes: number[] = [];

    if (importedTurnCount === 0) {
      // No matches at all
      status = 'none';
    } else {
      // Heuristic: if the smallest imported index is 1, assume 1-based.
      const minImported = importedTurnIndexes[0];
      const indexBase = minImported === 1 ? 1 : 0;

      // Normalize imported indexes so that "0" corresponds to the first turn in the file.
      const normalizedImported = new Set(
        importedTurnIndexes.map((idx) => idx - indexBase)
      );

      const allNormalized = Array.from({ length: f.turnsInFile }, (_, i) => i);
      missingTurnIndexes = allNormalized.filter((i) => !normalizedImported.has(i));

      if (missingTurnIndexes.length === 0 && importedTurnCount >= f.turnsInFile) {
        status = 'complete';
      } else if (missingTurnIndexes.length === f.turnsInFile) {
        // All turns appear "missing" after normalization → something is off.
        status = 'unknown';
      } else {
        status = 'partial';
      }
    }

    const missingTurnSnippets =
      status === 'partial' || status === 'none'
        ? computeMissingTurnSnippets(f, missingTurnIndexes)
        : [];

    return {
      filePath: f.filePath,
      chatId: f.chatId,
      chatTitle: f.chatTitle,
      turnsInFile: f.turnsInFile,
      importedTurnIndexes,
      missingTurnIndexes,
      importedTurnCount,
      status,
      missingTurnSnippets,
    };
  });

  // Ensure ./data exists
  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const jsonOutputPath = path.join(dataDir, 'chatworthy-file-status.json');
  fs.writeFileSync(
    jsonOutputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rootDir,
        fileCount: fileStatuses.length,
        files: fileStatuses,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log();
  console.log('Wrote file status JSON report to:', jsonOutputPath);
  console.log();

  if (briefMode) {
    // BRIEF MODE: Only files that are none/partial, filenames only,
    // and for partial: snippets for missing turns.
    const interesting = fileStatuses.filter(
      (s) => s.status === 'none' || s.status === 'partial'
    );

    const lines: string[] = [];

    if (!interesting.length) {
      const msg = 'All files are fully imported (status=complete).';
      console.log(msg);
      lines.push(msg);
    } else {
      lines.push('Files with status NONE or PARTIAL:');
      for (const s of interesting) {
        const fileName = path.basename(s.filePath);

        if (s.status === 'none') {
          // NONE: only show the file name and status, nothing else.
          lines.push(`${fileName} [NONE]`);
          continue;
        }

        if (s.status === 'partial') {
          // PARTIAL: show file name + status, then only the missing turns.
          lines.push('');
          lines.push(`${fileName} [PARTIAL]`);

          if (!s.missingTurnSnippets.length) {
            continue;
          }

          for (const m of s.missingTurnSnippets) {
            lines.push(`  - Missing turn ${m.turnIndex}: ${m.snippet}`);
          }
        }
      }
    }

    const txtOutputPath = path.join(dataDir, 'chatworthy-file-status.txt');
    fs.writeFileSync(txtOutputPath, lines.join('\n') + '\n', 'utf8');

    console.log(lines.join('\n'));
    console.log();
    console.log('Wrote brief text report to:', txtOutputPath);
  } else {
    // FULL MODE: existing table
    console.log('Summary (one row per file):');
    console.table(
      fileStatuses.map((s) => ({
        file: path.relative(rootDir, s.filePath),
        chatId: s.chatId ?? '',
        title: s.chatTitle ?? '',
        turnsInFile: s.turnsInFile,
        importedTurns: s.importedTurnCount,
        status: s.status,
        missing: s.missingTurnIndexes.join(','),
      }))
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Unhandled error in check-chatworthy-files-against-db:', err);
  process.exit(1);
});
