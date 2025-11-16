// scripts/export-ai-seed-from-chatworthy.ts
//
// Build an "AI seed" JSON purely from Chatworthy Markdown exports.
// No Mongo / no existing Chatalog DB required.
//
// Usage:
//   cd packages/chatalog/backend
//   npx ts-node scripts/export-ai-seed-from-chatworthy.ts ../chatworthy-dump ./ai-seed.json
//
// Where ../chatworthy-dump is a directory full of .md files exported by Chatworthy.

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// ---------- Types for the AI seed ----------

type AiSeed = {
  version: 1;
  generatedAt: string;
  notes: AiSeedNote[];
};

type AiSeedNote = {
  /** Stable key we’ll use when talking to ChatGPT */
  aiNoteKey: string;

  /** Chatworthy noteId from front matter */
  chatworthyNoteId: string;

  /** File + turn info (for your own debugging) */
  fileName: string;
  turnIndex: number; // 1-based if split into multiple turns

  /** Hints from front matter */
  chatTitle?: string;
  subjectHint?: string;
  topicHint?: string;

  /** The cleaned markdown body for this logical note */
  markdown: string;
};

// ---------- Helpers copied from imports.chatworthy.ts (simplified) ----------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type StripOpts = {
  subject?: string;
  topic?: string;
  chatTitle?: string;
  fmTitle?: string;
};

function buildCompositeTitle(subject?: string, topic?: string): string | undefined {
  if (!subject || !topic) return undefined;
  return `${subject.trim()} - ${topic.trim()}`;
}

/** Remove ToC block, anchors, meta rows, and a duplicate first H1 title. */
function stripForAiSeed(md: string, opts: StripOpts = {}): string {
  let out = md;

  // 1) Drop the "## Table of Contents" section
  out = out.replace(
    /^\s*##\s*Table of Contents\s*\r?\n(?:\r?\n)?(?:^\d+\.\s+\[.*?\]\(#p-\d+\)\s*\r?\n)+/gmi,
    ''
  );

  // 2) Remove standalone anchor lines like <a id="p-2"></a>
  out = out.replace(/^\s*<a id="p-\d+"><\/a>\s*$(?:\r?\n)?/gmi, '');

  // 3) Remove exporter meta rows
  out = out.replace(/^Source:\s.*$\r?\n?/gmi, '');
  out = out.replace(/^Exported:\s.*$\r?\n?/gmi, '');

  // 3.5) Remove a duplicate top-level H1 that matches our computed title(s).
  const candidates: string[] = [];
  const composite = buildCompositeTitle(opts.subject, opts.topic);
  if (composite) candidates.push(composite);
  if (opts.chatTitle) candidates.push(opts.chatTitle);
  if (opts.fmTitle) candidates.push(opts.fmTitle);

  if (opts.subject && opts.topic) {
    const sub = escapeRe(opts.subject.trim());
    const top = escapeRe(opts.topic.trim());
    const reComposite = new RegExp(
      String.raw`^(?:\uFEFF)?\s*#\s*${sub}\s*[–—\-:]\s*${top}\s*\r?\n+`,
      'i'
    );
    out = out.replace(reComposite, '');
  }

  for (const t of candidates) {
    const esc = escapeRe(t.trim());
    const re = new RegExp(
      String.raw`^(?:\uFEFF)?\s*#\s*${esc}\s*\r?\n+`,
      'i'
    );
    const next = out.replace(re, '');
    if (next !== out) {
      out = next;
      break;
    }
  }

  // 4) Collapse excessive blank lines
  out = out.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();

  return out;
}

type TurnSection = {
  index: number;
  markdown: string;
};

/**
 * Split the full body into per-turn sections based on <a id="p-N"></a>.
 * If none are present, returns [] and caller treats whole doc as one note.
 */
function splitIntoTurnSections(body: string): TurnSection[] {
  const anchorRe = /(^|\r?\n)\s*<a id="p-(\d+)"><\/a>\s*\r?\n/gi;
  const matches = [...body.matchAll(anchorRe)];
  if (!matches.length) return [];

  const sections: TurnSection[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const idxStr = m[2];
    const index = idxStr ? parseInt(idxStr, 10) : i + 1;

    const start = i === 0 ? 0 : (matches[i].index ?? 0);
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length;

    const slice = body.slice(start, end);
    sections.push({ index, markdown: slice });
  }

  return sections;
}

// ---------- Core: process one .md file ----------

function buildAiSeedNotesFromFile(mdPath: string): AiSeedNote[] {
  const raw = fs.readFileSync(mdPath, 'utf8');
  const gm = matter(raw);
  const fm = gm.data as Record<string, any>;
  const content = gm.content;

  const chatworthyNoteId = typeof fm.noteId === 'string' ? fm.noteId.trim() : '';
  if (!chatworthyNoteId) {
    throw new Error(`File ${mdPath} is missing noteId in front matter`);
  }

  const fmTitle = typeof fm.title === 'string' ? fm.title.trim() : undefined;
  const fmChatTitle = typeof fm.chatTitle === 'string' ? fm.chatTitle.trim() : undefined;
  const subject = typeof fm.subject === 'string' ? fm.subject.trim() : undefined;
  const topic = typeof fm.topic === 'string' ? fm.topic.trim() : undefined;

  const opts: StripOpts = {
    subject,
    topic,
    chatTitle: fmChatTitle,
    fmTitle,
  };

  const body = content;
  const turnSections = splitIntoTurnSections(body);
  const fileName = path.basename(mdPath);

  // No anchors → whole document is a single logical note
  if (!turnSections.length) {
    const cleaned = stripForAiSeed(body, opts).trim();
    if (!cleaned) return [];

    return [
      {
        aiNoteKey: chatworthyNoteId,      // single note maps 1:1 to Chatworthy noteId
        chatworthyNoteId,
        fileName,
        turnIndex: 1,
        chatTitle: fmChatTitle,
        subjectHint: subject,
        topicHint: topic,
        markdown: cleaned,
      },
    ];
  }

  // Multi-turn → one logical note per section; aiNoteKey gets a #turn suffix
  const notes: AiSeedNote[] = [];
  for (const section of turnSections) {
    const cleaned = stripForAiSeed(section.markdown, opts).trim();
    if (!cleaned) continue;

    const aiNoteKey = `${chatworthyNoteId}#${section.index}`;

    notes.push({
      aiNoteKey,
      chatworthyNoteId,
      fileName,
      turnIndex: section.index,
      chatTitle: fmChatTitle,
      subjectHint: subject,
      topicHint: topic,
      markdown: cleaned,
    });
  }

  return notes;
}

// ---------- Main CLI ----------

function collectMarkdownFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
          files.push(full);
        }
      }
    }
  }

  walk(rootDir);
  return files;
}

async function main() {
  const srcDir = process.argv[2];
  const outPath = process.argv[3];

  if (!srcDir || !outPath) {
    console.error(
      'Usage: ts-node scripts/export-ai-seed-from-chatworthy.ts <src-dir> <out-file.json>'
    );
    process.exit(1);
  }

  const absSrc = path.resolve(process.cwd(), srcDir);
  const absOut = path.resolve(process.cwd(), outPath);

  if (!fs.existsSync(absSrc) || !fs.statSync(absSrc).isDirectory()) {
    console.error(`Source directory does not exist or is not a directory: ${absSrc}`);
    process.exit(1);
  }

  const mdFiles = collectMarkdownFiles(absSrc);
  console.log(`Found ${mdFiles.length} markdown file(s) under ${absSrc}`);

  const allNotes: AiSeedNote[] = [];
  for (const mdPath of mdFiles) {
    try {
      const notes = buildAiSeedNotesFromFile(mdPath);
      allNotes.push(...notes);
    } catch (err) {
      console.error(`Error processing ${mdPath}:`, err);
    }
  }

  const seed: AiSeed = {
    version: 1,
    generatedAt: new Date().toISOString(),
    notes: allNotes,
  };

  fs.writeFileSync(absOut, JSON.stringify(seed, null, 2), 'utf8');
  console.log(`AI seed written to: ${absOut}`);
  console.log(`Total logical notes: ${allNotes.length}`);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
