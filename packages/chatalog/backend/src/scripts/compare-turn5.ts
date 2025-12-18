import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

import { NoteModel } from '../models/Note';
import { extractPromptResponseTurns, hashPromptResponsePair } from '../utils/textHash';

function ensureMongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI env var is required.');
    process.exit(1);
  }
  return uri;
}

function showDiff(a: string, b: string, label: string) {
  if (a === b) {
    console.log(`${label}: EXACT MATCH`);
    return;
  }

  const alen = a.length;
  const blen = b.length;
  const n = Math.min(alen, blen);

  let i = 0;
  for (; i < n; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) break;
  }

  console.log(`${label}: DIFFER`);
  console.log(`  a.length=${alen}, b.length=${blen}`);
  console.log(`  firstDiffIndex=${i}`);

  const start = Math.max(0, i - 30);
  const end = Math.min(n, i + 30);

  const aSlice = a.slice(start, end);
  const bSlice = b.slice(start, end);

  const hex = (s: string) =>
    [...s].map((ch) => ch.codePointAt(0)!.toString(16).padStart(4, '0')).join(' ');

  console.log(`  a slice: ${JSON.stringify(aSlice)}`);
  console.log(`  b slice: ${JSON.stringify(bSlice)}`);
  console.log(`  a hex:   ${hex(aSlice)}`);
  console.log(`  b hex:   ${hex(bSlice)}`);
}

async function main() {
  ensureMongoUri();
  const db = await import('../db/mongoose');
  await db.connectToDatabase();

  try {
    const noteId = process.argv[2];
    const mdFilePath = process.argv[3];
    const turnIndex = Number(process.argv[4] ?? '5');

    if (!noteId || !mdFilePath) {
      throw new Error('Usage: compare-turn5.ts <noteId> <mdFilePath> [turnIndex]');
    }

    // ---- DB turn ----
    const note = await NoteModel.findById(noteId, { title: 1, markdown: 1 }).lean().exec();
    if (!note) throw new Error(`Note not found: ${noteId}`);

    const dbTurns = extractPromptResponseTurns((note as any).markdown ?? '');
    const dbT = dbTurns.find((x) => (x.turnIndex ?? -1) === turnIndex) ?? dbTurns[turnIndex];
    if (!dbT) throw new Error(`DB turn ${turnIndex} not found (turns=${dbTurns.length})`);

    const dbHash = hashPromptResponsePair(dbT.prompt, dbT.response);

    // ---- FILE turn ----
    const raw = await fs.readFile(mdFilePath, 'utf8');
    const gm = matter(raw);
    const fileContent = gm.content ?? raw;

    const fileTurns = extractPromptResponseTurns(fileContent);
    const fileT = fileTurns.find((x) => (x.turnIndex ?? -1) === turnIndex) ?? fileTurns[turnIndex];
    if (!fileT) throw new Error(`FILE turn ${turnIndex} not found (turns=${fileTurns.length})`);

    const fileHash = hashPromptResponsePair(fileT.prompt, fileT.response);

    console.log('NOTE title:', (note as any).title);
    console.log('turnIndex:', turnIndex);
    console.log('DB hash:  ', dbHash);
    console.log('FILE hash:', fileHash);

    console.log('\n--- PROMPT ---');
    showDiff(fileT.prompt ?? '', dbT.prompt ?? '', 'prompt');
    console.log('\n--- RESPONSE ---');
    showDiff(fileT.response ?? '', dbT.response ?? '', 'response');
  } finally {
    await db.disconnectFromDatabase();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
