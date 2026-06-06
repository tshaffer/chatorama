#!/usr/bin/env node
// claude-export — export a Claude Code session to Markdown
//
// Usage:
//   claude-export                          # export most recent session
//   claude-export <session-id>             # export specific session
//   claude-export --list                   # list recent sessions
//   claude-export -o ~/notes/session.md    # specify output file
//   claude-export --dir /path/to/project   # sessions for a specific project dir

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// ---- Arg parsing -------------------------------------------

const args = process.argv.slice(2);
const listMode = args.includes('--list');
const outIdx = args.indexOf('-o');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
const dirIdx = args.indexOf('--dir');
const filterDir = dirIdx !== -1 ? args[dirIdx + 1] : null;
const fromStdin = args.includes('--stdin');

const positional = args.filter((a, i) => {
  if (a.startsWith('-')) return false;
  if (i > 0 && (args[i - 1] === '-o' || args[i - 1] === '--dir')) return false;
  return true;
});
const targetSessionId = positional[0] || null;

// ---- Read stdin if --stdin flag ---------------------------

async function readStdinJson() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', d => chunks.push(d));
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    setTimeout(() => resolve({}), 500);
  });
}

// ---- Find sessions -----------------------------------------

function slugForDir(dir) {
  return dir.replace(/\//g, '-').replace(/^-/, '');
}

function findAllSessions() {
  const sessions = [];
  let projectDirs;
  try {
    projectDirs = readdirSync(PROJECTS_DIR);
  } catch {
    console.error('No sessions found at', PROJECTS_DIR);
    process.exit(1);
  }

  for (const projectSlug of projectDirs) {
    const projectPath = join(PROJECTS_DIR, projectSlug);
    let files;
    try {
      files = readdirSync(projectPath);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const sessionId = file.replace('.jsonl', '');
      const filePath = join(projectPath, file);
      let mtime;
      try {
        mtime = statSync(filePath).mtime;
      } catch {
        continue;
      }
      sessions.push({ sessionId, filePath, projectSlug, mtime });
    }
  }

  return sessions.sort((a, b) => b.mtime - a.mtime);
}

// ---- Parse a session ---------------------------------------

function parseSession(filePath) {
  const lines = readFileSync(filePath, 'utf8').trim().split('\n');
  const turns = [];
  let title = null;

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Extract title from first user message if not set
    if (!title && entry.type === 'user' && entry.message) {
      const content = entry.message.content;
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.filter(b => b.type === 'text').map(b => b.text).join(' ')
          : '';
      title = text.trim().slice(0, 80).replace(/[\n\r]+/g, ' ');
    }

    if (entry.type !== 'user' && entry.type !== 'assistant') continue;
    if (!entry.message) continue;

    const role = entry.type;
    const content = entry.message.content;
    let text = '';

    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
    }

    if (text.trim()) turns.push({ role, text: text.trim() });
  }

  // Collapse consecutive assistant entries into a single turn
  const collapsed = [];
  for (const turn of turns) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.role === 'assistant' && turn.role === 'assistant') {
      prev.text += '\n\n' + turn.text;
    } else {
      collapsed.push({ ...turn });
    }
  }

  return { title, turns: collapsed };
}

// ---- Render to Markdown ------------------------------------

function renderMarkdown(title, turns, sessionId, mtime) {
  const date = mtime.toISOString().slice(0, 10);
  let md = `# ${title || 'Claude Code Session'}\n\n`;
  md += `_Session: ${sessionId}_  \n`;
  md += `_Exported: ${date}_\n\n---\n\n`;

  for (const t of turns) {
    md += `## ${t.role === 'user' ? 'User' : 'Claude'}\n\n`;
    md += `${t.text}\n\n---\n\n`;
  }

  return md;
}

// ---- Main --------------------------------------------------

const stdinData = fromStdin ? await readStdinJson() : {};
const stdinSessionId = stdinData.session_id || null;

const sessions = findAllSessions();

if (listMode) {
  console.log('\nRecent Claude Code sessions:\n');
  sessions.slice(0, 20).forEach((s, i) => {
    const date = s.mtime.toISOString().slice(0, 16).replace('T', ' ');
    const dir = s.projectSlug.replace(/-/g, '/').replace(/^\//, '');
    console.log(`  ${i + 1}.  ${s.sessionId}`);
    console.log(`       dir: /${dir}`);
    console.log(`       modified: ${date}\n`);
  });
  process.exit(0);
}

let session;
const resolvedSessionId = targetSessionId || stdinSessionId;
if (resolvedSessionId) {
  session = sessions.find(s => s.sessionId.startsWith(resolvedSessionId));
  if (!session) {
    console.error(`Session not found: ${resolvedSessionId}`);
    process.exit(1);
  }
} else {
  // Filter by dir if specified
  const candidates = filterDir
    ? sessions.filter(s => s.projectSlug === slugForDir(resolve(filterDir)))
    : sessions;

  session = candidates[0];
  if (!session) {
    console.error('No sessions found.');
    process.exit(1);
  }
}

const { title, turns } = parseSession(session.filePath);
const md = renderMarkdown(title, turns, session.sessionId, session.mtime);

const date = session.mtime.toISOString().slice(0, 10);
const slug = (title || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const defaultOut = join(homedir(), 'Desktop', `${slug}-${date}.md`);
const dest = outFile ? resolve(outFile) : defaultOut;

writeFileSync(dest, md);
console.log(`Exported ${turns.length} turns → ${dest}`);
