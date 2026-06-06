import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { buildMarkdownExport } from '@chatorama/chat-md-core';
import type { ExportNoteMetadata, ExportTurn } from '@chatorama/chat-md-core';

// ---- Types (mirrored from src/types.ts) --------------------

interface SessionInfo {
  sessionId: string;
  title: string;
  date: string;
  projectSlug: string;
  filePath: string;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

interface UserPrompt {
  turnIndex: number;
  preview: string;
}

interface SessionData {
  session: SessionInfo;
  turns: Turn[];
  userPrompts: UserPrompt[];
}

// ---- Export helpers ----------------------------------------

function generateNoteId(): string {
  try { return `ext-${crypto.randomUUID()}`; }
  catch { return `ext-${Math.random().toString(36).slice(2)}${Date.now()}`; }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTopic(chatTitle: string, subject: string): string {
  if (!chatTitle) return 'Untitled Conversation';
  if (!subject) return chatTitle.trim();
  const re = new RegExp(`^\\s*${escapeRegex(subject)}\\s*(?:–|—|-|:)\\s*`, 'iu');
  return chatTitle.replace(re, '').trim() || chatTitle.trim();
}

function buildAndDownload(data: SessionData, selectedIndices: Set<number>) {
  const { session, turns } = data;

  // Gather selected turns: each selected user turn + its following assistant turns
  const exportTurns: ExportTurn[] = [];
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].role !== 'user' || !selectedIndices.has(i)) continue;
    exportTurns.push({ role: 'user', text: turns[i].text });
    for (let j = i + 1; j < turns.length; j++) {
      if (turns[j].role === 'user') break;
      exportTurns.push({ role: 'assistant', text: turns[j].text });
    }
  }

  const chatTitle = session.title;
  const subject = chatTitle.split(/ - |:|–|—/)[0]?.trim() ?? '';
  const topic = normalizeTopic(chatTitle, subject) || 'Untitled Conversation';

  const meta: ExportNoteMetadata = {
    noteId: generateNoteId(),
    source: 'claude-code',
    chatId: session.sessionId,
    chatTitle,
    pageUrl: `file://${session.filePath}`,
    exportedAt: new Date().toISOString(),
    subject,
    topic,
    summary: null,
    tags: [],
    autoGenerate: { summary: true, tags: true },
    noteMode: 'auto',
    turnCount: exportTurns.length,
    splitHints: [],
    author: 'me',
    visibility: 'private',
  };

  const md = buildMarkdownExport(meta, exportTurns, {
    title: chatTitle,
    freeformNotes: '',
    includeFrontMatter: true,
  });

  const date = new Date().toISOString().slice(0, 10);
  const slug = chatTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const filename = `${slug || 'session'}-${date}.md`;

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);

  return filename;
}

// ---- App ---------------------------------------------------

function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchSessions = useCallback(async (): Promise<SessionInfo[]> => {
    const res = await fetch('/api/sessions');
    const data: SessionInfo[] = await res.json();
    setSessions(data);
    return data;
  }, []);

  const fetchSession = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}`);
      if (!res.ok) { setSessionData(null); return; }
      const data: SessionData = await res.json();
      setSessionData(data);
      setChecked(new Set());
      setStatus('');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load — auto-select most recent session
  useEffect(() => {
    fetchSessions().then(data => {
      if (data.length > 0) setSelectedSessionId(data[0].sessionId);
    });
  }, [fetchSessions]);

  // Load session whenever selection changes
  useEffect(() => {
    if (selectedSessionId) fetchSession(selectedSessionId);
  }, [selectedSessionId, fetchSession]);

  // WebSocket for live refresh
  useEffect(() => {
    let ws: WebSocket;
    let dead = false;

    function connect() {
      if (dead) return;
      ws = new WebSocket(`ws://${location.host}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string);
        if (msg.type === 'refresh') {
          fetchSessions().then(data => {
            if (selectedSessionId) fetchSession(selectedSessionId);
            else if (data.length > 0) setSelectedSessionId(data[0].sessionId);
          });
        }
      };

      ws.onclose = () => {
        if (!dead) setTimeout(connect, 3000);
      };
    }

    connect();
    return () => { dead = true; ws?.close(); };
  }, [selectedSessionId, fetchSessions, fetchSession]);

  const handleSelectAll = () => {
    if (!sessionData) return;
    setChecked(new Set(sessionData.userPrompts.map(p => p.turnIndex)));
  };

  const handleSelectNone = () => setChecked(new Set());

  const handleToggle = (turnIndex: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(turnIndex)) next.delete(turnIndex); else next.add(turnIndex);
      return next;
    });
  };

  const handleExport = () => {
    if (!sessionData || checked.size === 0) return;
    try {
      const filename = buildAndDownload(sessionData, checked);
      setStatus(`✓ Downloaded ${filename}`);
    } catch (err: any) {
      setStatus(`✗ Export failed: ${err.message}`);
    }
  };

  const hasPrompts = sessionData && sessionData.userPrompts.length > 0;

  return (
    <div className="app">
      <div className="header">Claude Code Exporter</div>

      <div className="session-selector">
        <select
          value={selectedSessionId}
          onChange={e => { setSelectedSessionId(e.target.value); setStatus(''); }}
          disabled={sessions.length === 0}
        >
          {sessions.map(s => (
            <option key={s.sessionId} value={s.sessionId}>
              {s.date} — {s.title}
            </option>
          ))}
        </select>
      </div>

      <div className="controls">
        <button onClick={handleSelectAll} disabled={!hasPrompts || checked.size === sessionData!.userPrompts.length}>
          All
        </button>
        <button onClick={handleSelectNone} disabled={checked.size === 0}>
          None
        </button>
        <button className="export-btn" onClick={handleExport} disabled={checked.size === 0}>
          Export ({checked.size})
        </button>
      </div>

      <div className="turns-list">
        {loading && <div className="empty">Loading…</div>}
        {!loading && sessionData && !hasPrompts && (
          <div className="empty">No prompts found in this session.</div>
        )}
        {!loading && sessionData && sessionData.userPrompts.map(p => (
          <div
            key={p.turnIndex}
            className={`turn-item${checked.has(p.turnIndex) ? ' selected' : ''}`}
            onClick={() => handleToggle(p.turnIndex)}
          >
            <input
              type="checkbox"
              checked={checked.has(p.turnIndex)}
              onChange={() => handleToggle(p.turnIndex)}
              onClick={e => e.stopPropagation()}
            />
            <span className="turn-preview">{p.preview}</span>
          </div>
        ))}
      </div>

      {status && <div className="status">{status}</div>}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
