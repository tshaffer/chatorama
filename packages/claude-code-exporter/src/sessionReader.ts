import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { SessionInfo, Turn, UserPrompt, SessionData } from './types.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const APP_SESSIONS_DIR = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
const MAX_SESSIONS = 100;

/**
 * Build a map of cliSessionId -> title from the Claude desktop app's session
 * store at ~/Library/Application Support/Claude/claude-code-sessions/.
 * These titles match what Claude Code displays in the Recents panel.
 */
function loadAppSessionTitles(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    for (const level1 of readdirSync(APP_SESSIONS_DIR)) {
      const level1Path = join(APP_SESSIONS_DIR, level1);
      try {
        if (!statSync(level1Path).isDirectory()) continue;
        for (const level2 of readdirSync(level1Path)) {
          const level2Path = join(level1Path, level2);
          try {
            if (!statSync(level2Path).isDirectory()) continue;
            for (const file of readdirSync(level2Path)) {
              if (!file.endsWith('.json')) continue;
              try {
                const data = JSON.parse(readFileSync(join(level2Path, file), 'utf8'));
                if (data.cliSessionId && data.title) {
                  map.set(data.cliSessionId, data.title);
                }
              } catch { /* skip unreadable files */ }
            }
          } catch { /* skip unreadable dirs */ }
        }
      } catch { /* skip unreadable dirs */ }
    }
  } catch { /* APP_SESSIONS_DIR not present (non-macOS or not installed) */ }
  return map;
}

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

function titleFromFile(filePath: string, appTitle?: string): string {
  let aiTitle: string | undefined;
  let customTitle: string | undefined;
  let firstUserMessage: string | undefined;

  try {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: any;
      try { entry = JSON.parse(line); } catch { continue; }

      if (entry.type === 'ai-title' && entry.aiTitle) {
        aiTitle = entry.aiTitle;
      } else if (entry.type === 'custom-title' && entry.customTitle) {
        customTitle = entry.customTitle;
      } else if (!firstUserMessage && entry.type === 'user' && entry.message) {
        const text = extractText(entry.message.content).trim();
        if (text) firstUserMessage = text.replace(/[\n\r]+/g, ' ').slice(0, 80);
      }
    }
  } catch { /* ignore */ }

  // Priority: app store title (matches Recents panel) > custom-title > ai-title > first user message
  return appTitle ?? customTitle ?? aiTitle ?? firstUserMessage ?? 'Untitled Session';
}

export function listSessions(): SessionInfo[] {
  const sessions: SessionInfo[] = [];
  const appTitles = loadAppSessionTitles();

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
        title: titleFromFile(filePath, appTitles.get(sessionId)),
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
