import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { SessionInfo, Turn, UserPrompt, SessionData } from './types.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const MAX_SESSIONS = 100;

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('\n');
  }
  return '';
}

function titleFromFile(filePath: string): string {
  try {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: any;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry.type === 'user' && entry.message) {
        const text = extractText(entry.message.content).trim();
        if (text) return text.replace(/[\n\r]+/g, ' ').slice(0, 80);
      }
    }
  } catch { /* ignore */ }
  return 'Untitled Session';
}

export function listSessions(): SessionInfo[] {
  const sessions: SessionInfo[] = [];

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(PROJECTS_DIR);
  } catch {
    return [];
  }

  for (const slug of projectDirs) {
    const projectPath = join(PROJECTS_DIR, slug);
    let files: string[];
    try {
      const stat = statSync(projectPath);
      if (!stat.isDirectory()) continue;
      files = readdirSync(projectPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;

      const sessionId = file.replace('.jsonl', '');
      const filePath = join(projectPath, file);

      let mtime: Date;
      try {
        mtime = statSync(filePath).mtime;
      } catch {
        continue;
      }

      sessions.push({
        sessionId,
        title: titleFromFile(filePath),
        date: mtime.toISOString().slice(0, 10),
        projectSlug: slug,
        filePath,
      });
    }
  }

  return sessions
    .sort((a, b) => {
      // Sort by mtime descending; use date string as proxy (good enough)
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.sessionId.localeCompare(a.sessionId);
    })
    .slice(0, MAX_SESSIONS);
}

export function parseSession(info: SessionInfo): SessionData | null {
  let lines: string[];
  try {
    lines = readFileSync(info.filePath, 'utf8').trim().split('\n');
  } catch {
    return null;
  }

  const rawTurns: Turn[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }

    if (entry.type !== 'user' && entry.type !== 'assistant') continue;
    if (!entry.message) continue;

    const text = extractText(entry.message.content).trim();
    if (!text) continue;

    rawTurns.push({ role: entry.type as 'user' | 'assistant', text });
  }

  // Collapse consecutive assistant turns into one
  const turns: Turn[] = [];
  for (const turn of rawTurns) {
    const prev = turns[turns.length - 1];
    if (prev && prev.role === 'assistant' && turn.role === 'assistant') {
      prev.text += '\n\n' + turn.text;
    } else {
      turns.push({ ...turn });
    }
  }

  const userPrompts: UserPrompt[] = turns
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.role === 'user')
    .map(({ t, i }) => ({
      turnIndex: i,
      preview: t.text.replace(/[\n\r]+/g, ' ').slice(0, 80),
    }));

  return { session: info, turns, userPrompts };
}
