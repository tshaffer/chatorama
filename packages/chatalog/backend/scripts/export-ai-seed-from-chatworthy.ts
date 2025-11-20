// scripts/export-ai-seed-from-chatworthy.ts
//
// Usage (example):
//   npx ts-node scripts/export-ai-seed-from-chatworthy.ts \
//     "/Users/tedshaffer/Documents/ChatworthyExports/v1/**/*.md" \
//     > ./data/ai-seed-v2.json
//
// Or, if you prefer to just pass a directory, this script will expand it:
//   npx ts-node scripts/export-ai-seed-from-chatworthy.ts \
//     "/Users/tedshaffer/Documents/ChatworthyExports/v1" \
//     > ./data/ai-seed-v2.json
//
// Assumptions:
// - Chatworthy export format as in your example (anchors + **Prompt**/**Response**).
// - Each Prompt/Response block is one "turn" -> one ai-seed note entry.
// - Front matter contains: noteId, subject, topic, chatTitle, exportedAt, etc.

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
  chatworthyNoteId: string;
  fileName: string;
  subjectHint?: string;
  topicHint?: string;
  chatTitle?: string;
  turnIndex: number;
  promptText: string;
  responseText: string;
};

type AiSeedRoot = {
  version: 1;
  generatedAt: string;
  notes: AiSeedNote[];
};

function usageAndExit(code = 1): never {
  console.error(
    'Usage: npx ts-node scripts/export-ai-seed-from-chatworthy.ts "<dir-or-glob-pattern>"'
  );
  process.exit(code);
}

// Simple helper to strip leading markdown blockquote markers and whitespace
function stripBlockquote(s: string): string {
  return s
    .split('\n')
    .map((line) => line.replace(/^>\s?/, ''))
    .join('\n')
    .trim();
}

// Parse all turns from a single Chatworthy-exported markdown file
function extractTurnsFromMarkdown(body: string): {
  promptText: string;
  responseText: string;
}[] {
  // Regex explanation:
  // - Match an anchor like <a id="p-1"></a>
  // - Then **Prompt**
  // - Then capture everything up to **Response** as the prompt block
  // - Then capture everything after **Response** up to the next anchor or EOF as the response block
  //
  // The "s" flag (dotAll) lets '.' match newlines.
  const turnRegex =
    /<a id="p-(\d+)"><\/a>\s*\*\*Prompt\*\*\s*([\s\S]*?)\*\*Response\*\*\s*([\s\S]*?)(?=(?:\n<a id="p-\d+"><\/a>|$))/g;

  const turns: { promptText: string; responseText: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = turnRegex.exec(body)) !== null) {
    const promptBlock = match[2] ?? '';
    const responseBlock = match[3] ?? '';

    const promptText = stripBlockquote(promptBlock);
    const responseText = responseBlock.trim();

    // Only push if we actually have a prompt or response; this avoids phantom turns
    if (promptText || responseText) {
      turns.push({ promptText, responseText });
    }
  }

  return turns;
}

function buildAiSeedNotesFromFile(filePath: string): AiSeedNote[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  const fm = data as FrontMatter;

  if (!fm.noteId) {
    throw new Error(`Missing noteId in front matter for file: ${filePath}`);
  }

  const chatworthyNoteId = fm.noteId;
  const fileName = path.basename(filePath);

  const subjectHint = fm.subject;
  const topicHint = fm.topic;
  const chatTitle = fm.chatTitle;

  const turns = extractTurnsFromMarkdown(content);

  return turns.map((turn, index) => {
    const turnIndex = index + 1; // 1-based
    const aiNoteKey = `${chatworthyNoteId}#${turnIndex}`;

    return {
      aiNoteKey,
      chatworthyNoteId,
      fileName,
      subjectHint,
      topicHint,
      chatTitle,
      turnIndex,
      promptText: turn.promptText,
      responseText: turn.responseText,
    };
  });
}

function resolvePattern(arg: string): string {
  // If it's a directory, expand to dir/**/*.md
  if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
    return path.join(arg, '**/*.md');
  }
  // Otherwise, assume it's already a glob pattern
  return arg;
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    usageAndExit();
  }

  const pattern = resolvePattern(arg);

  const files = globSync(pattern, { nodir: true });
  if (!files.length) {
    console.error(`No files matched pattern: ${pattern}`);
    process.exit(1);
  }

  const allNotes: AiSeedNote[] = [];

  for (const filePath of files) {
    const notes = buildAiSeedNotesFromFile(filePath);
    allNotes.push(...notes);
  }

  const output: AiSeedRoot = {
    version: 1,
    generatedAt: new Date().toISOString(),
    notes: allNotes,
  };

  process.stdout.write(JSON.stringify(output, null, 2));
}

main();
