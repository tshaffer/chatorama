// src/scripts/detectAberrantTurnBlocks.ts
//
// Scans ~/Downloads/*.md and flags files that look like the "aberrant" structure:
//   - "# Transcript"
//   - ":::turns" ... ":::end-turns"
//   - YAML-ish list items: "- role: user|assistant" and "text: ..."
//
// Usage (from the same package that has tsx in dev deps):
//   npx tsx src/scripts/detectAberrantTurnBlocks.ts
//   npx tsx src/scripts/detectAberrantTurnBlocks.ts --out ./audit-aberrant-exports.json
//   npx tsx src/scripts/detectAberrantTurnBlocks.ts --limit 200
//
// Notes:
// - Uses the same ~/Downloads glob as your audit script.
// - Does NOT connect to MongoDB (pure file scan).

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
    hasEndTurnsFence: boolean;
    hasRoleLines: boolean;
    hasTextLines: boolean;
    roleLineCount: number;
    textLineCount: number;
  };
  kind: AberrantKind | null;
  sample: {
    transcriptLine?: string | null;
    turnsFenceLine?: string | null;
    firstRoleLine?: string | null;
    firstTextLine?: string | null;
  };
};

function resolveDownloadsDir(): string {
  return path.join(os.homedir(), 'Downloads');
}

function parseArgs(argv: string[]) {
  const out: { outPath: string | null; limit: number | null } = { outPath: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.outPath = argv[i + 1] ?? null;
    if (a === '--limit') out.limit = Number(argv[i + 1] ?? '');
  }
  if (out.limit != null && !Number.isFinite(out.limit)) out.limit = null;
  return out;
}

function firstMatchingLine(lines: string[], re: RegExp): string | null {
  for (const line of lines) {
    if (re.test(line)) return line;
  }
  return null;
}

function summarizeKind(sig: FileFinding['signals']): AberrantKind | null {
  const flags = [
    sig.hasTurnsFence && sig.hasEndTurnsFence,
    sig.hasTranscriptHeader,
    sig.hasRoleLines || sig.hasTextLines,
  ].filter(Boolean).length;

  if (!flags) return null;

  // Strongest: the fenced turns block
  if (sig.hasTurnsFence && sig.hasEndTurnsFence) {
    if (sig.hasTranscriptHeader || sig.hasRoleLines || sig.hasTextLines) return 'MIXED';
    return 'TURNS_BLOCK';
  }

  if (sig.hasTranscriptHeader) {
    if (sig.hasRoleLines || sig.hasTextLines) return 'MIXED';
    return 'TRANSCRIPT_HEADER';
  }

  if (sig.hasRoleLines || sig.hasTextLines) return 'TURNS_LIST_ITEMS';

  return null;
}

async function main() {
  const { outPath, limit } = parseArgs(process.argv.slice(2));

  const downloadsDir = resolveDownloadsDir();
  const files = await fg('*.md', { cwd: downloadsDir, absolute: true, onlyFiles: true });
  const selected = limit ? files.slice(0, limit) : files;

  const findings: FileFinding[] = [];
  let scanned = 0;

  for (const filePath of selected) {
    scanned++;
    let raw = '';
    let statSize = 0;
    try {
      const st = await fs.stat(filePath);
      statSize = st.size;
      raw = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      // Skip unreadable files
      continue;
    }

    // front matter (best-effort)
    let hasFrontMatter = false;
    let fmKeys: string[] = [];
    try {
      const gm = matter(raw);
      hasFrontMatter = Object.keys(gm.data ?? {}).length > 0 && raw.trimStart().startsWith('---');
      fmKeys = Object.keys(gm.data ?? {}).sort((a, b) => a.localeCompare(b));
    } catch {
      // ignore
    }

    const lines = raw.split(/\r?\n/);

    const transcriptLine = firstMatchingLine(lines, /^#\s+Transcript\s*$/i);
    const turnsFenceLine = firstMatchingLine(lines, /^:::turns\s*$/i);
    const endTurnsFenceLine = firstMatchingLine(lines, /^:::end-turns\s*$/i);

    const roleRe = /^\s*-\s*role:\s*(user|assistant)\s*$/i;
    const textRe = /^\s*text:\s*".*"\s*$/; // matches your shown format with quotes

    let roleLineCount = 0;
    let textLineCount = 0;
    let firstRoleLine: string | null = null;
    let firstTextLine: string | null = null;

    for (const line of lines) {
      if (roleRe.test(line)) {
        roleLineCount++;
        if (!firstRoleLine) firstRoleLine = line;
      }
      if (textRe.test(line)) {
        textLineCount++;
        if (!firstTextLine) firstTextLine = line;
      }
    }

    const signals = {
      hasTranscriptHeader: !!transcriptLine,
      hasTurnsFence: !!turnsFenceLine,
      hasEndTurnsFence: !!endTurnsFenceLine,
      hasRoleLines: roleLineCount > 0,
      hasTextLines: textLineCount > 0,
      roleLineCount,
      textLineCount,
    };

    const kind = summarizeKind(signals);

    // Only record files that show at least one signal
    if (kind) {
      findings.push({
        fileName: path.basename(filePath),
        filePath,
        sizeBytes: statSize,
        hasFrontMatter,
        frontMatterKeys: fmKeys,
        signals,
        kind,
        sample: {
          transcriptLine,
          turnsFenceLine,
          firstRoleLine,
          firstTextLine,
        },
      });
    }
  }

  // Small console summary
  const byKind = new Map<string, number>();
  for (const f of findings) byKind.set(f.kind ?? 'null', (byKind.get(f.kind ?? 'null') ?? 0) + 1);

  console.log('--- detectAberrantTurnBlocks ---');
  console.log(`Downloads dir: ${downloadsDir}`);
  console.log(`Scanned .md files: ${scanned}`);
  console.log(`Flagged files: ${findings.length}`);
  for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${n}`);
  }

  // Show first few for quick sanity
  findings.slice(0, 12).forEach((f) => {
    console.log(
      `- ${f.fileName} | kind=${f.kind} | signals=` +
        `transcript=${f.signals.hasTranscriptHeader ? 1 : 0},` +
        `turnsFence=${f.signals.hasTurnsFence && f.signals.hasEndTurnsFence ? 1 : 0},` +
        `roleLines=${f.signals.roleLineCount},textLines=${f.signals.textLineCount}`
    );
  });

  if (outPath) {
    const payload = {
      generatedAt: new Date().toISOString(),
      downloadsDir,
      scannedCount: scanned,
      flaggedCount: findings.length,
      kinds: Object.fromEntries([...byKind.entries()]),
      findings,
    };
    await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\nWrote JSON report to: ${path.resolve(outPath)}`);
  } else {
    console.log('\nTip: add --out ./audit-aberrant-exports.json to write a JSON report.');
  }
}

main().catch((err) => {
  console.error('detectAberrantTurnBlocks failed:', err);
  process.exit(1);
});
