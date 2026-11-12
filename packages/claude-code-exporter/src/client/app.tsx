import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

interface BuiltExport {
  filename: string;
  markdown: string;
}

function buildExport(data: SessionData, selectedIndices: Set<number>): BuiltExport {
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

  const markdown = buildMarkdownExport(meta, exportTurns, {
    title: chatTitle,
    freeformNotes: '',
    includeFrontMatter: true,
  });

  const date = new Date().toISOString().slice(0, 10);
  const slug = chatTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return { filename: `${slug || 'session'}-${date}.md`, markdown };
}

function download({ filename, markdown }: BuiltExport) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// ---- Send to Chatalog --------------------------------------

// Chatalog's address. Must match PORT in packages/chatalog/backend/.env.
const CHATALOG_URL = 'http://localhost:8008';

type SendResult = { ok: true; via: 'extension' | 'tab' } | { ok: false; error: string; chatalogUrl?: string };

// With Chatworthy installed, its exporterBridge content script hands the export to
// the extension, which reuses (and brings to the front) the Chatalog tab already open.
function sendViaChatworthy(exp: BuiltExport): Promise<{ ok: boolean; error?: string }> | null {
  if (document.documentElement.dataset.chatworthyBridge !== '1') return null;
  const requestId = generateNoteId();
  return new Promise(resolve => {
    const timer = setTimeout(() => finish({ ok: false, error: 'Chatworthy didn’t answer' }), 15000);
    function finish(result: { ok: boolean; error?: string }) {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(result);
    }
    function onMessage(e: MessageEvent) {
      const msg = e.data;
      if (e.source !== window || msg?.type !== 'chatworthy:sendToChatalogResult' || msg.requestId !== requestId) return;
      finish({ ok: !!msg.ok, error: msg.error });
    }
    window.addEventListener('message', onMessage);
    window.postMessage(
      { type: 'chatworthy:sendToChatalog', requestId, fileName: exp.filename, markdown: exp.markdown },
      location.origin,
    );
  });
}

// Without Chatworthy: hold the export in Chatalog and open it in a Chatalog tab.
// A page can't find tabs it didn't open, so this reuses only a tab it opened before.
async function sendDirect(exp: BuiltExport): Promise<SendResult> {
  let id: string;
  try {
    const res = await fetch(
      `${CHATALOG_URL}/api/v1/imports/pending?fileName=${encodeURIComponent(exp.filename)}`,
      { method: 'POST', headers: { 'Content-Type': 'text/markdown' }, body: exp.markdown },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
    ({ id } = await res.json());
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'request failed' };
  }
  const chatalogUrl = `${CHATALOG_URL}/#import=${id}`;
  const win = window.open(chatalogUrl, 'chatalog');
  if (!win) return { ok: false, error: 'popup blocked', chatalogUrl };
  return { ok: true, via: 'tab' };
}

async function sendToChatalog(exp: BuiltExport): Promise<SendResult> {
  const viaExtension = sendViaChatworthy(exp);
  if (viaExtension) {
    const res = await viaExtension;
    if (res.ok) return { ok: true, via: 'extension' };
    console.warn('[exporter] Chatworthy couldn’t send, trying directly:', res.error);
  }
  return sendDirect(exp);
}

// ---- App ---------------------------------------------------

function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<React.ReactNode>('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const turnRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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

  // Load session whenever selection changes. Live refreshes reload the same
  // session and keep the checked prompts; only switching sessions clears them.
  useEffect(() => {
    setChecked(new Set());
    setStatus('');
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

  const scrollToTurn = (turnIndex: number) => {
    const el = turnRefs.current.get(turnIndex);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleToggle = (turnIndex: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(turnIndex)) next.delete(turnIndex); else next.add(turnIndex);
      return next;
    });
    scrollToTurn(turnIndex);
  };

  const handleExport = () => {
    if (!sessionData || checked.size === 0) return;
    try {
      const exp = buildExport(sessionData, checked);
      download(exp);
      setStatus(`✓ Downloaded ${exp.filename}`);
    } catch (err: any) {
      setStatus(`✗ Export failed: ${err.message}`);
    }
  };

  const handleSend = async () => {
    if (!sessionData || checked.size === 0) return;
    let exp: BuiltExport;
    try {
      exp = buildExport(sessionData, checked);
    } catch (err: any) {
      setStatus(`✗ Export failed: ${err.message}`);
      return;
    }
    setSending(true);
    setStatus('Sending to Chatalog…');
    try {
      const res = await sendToChatalog(exp);
      if (res.ok) {
        setStatus('✓ Sent to Chatalog — review it there');
      } else if (res.chatalogUrl) {
        // Sent, but the browser blocked the new tab
        setStatus(<>✓ Sent. <a href={res.chatalogUrl} target="chatalog">Open it in Chatalog</a></>);
      } else {
        console.error('[exporter] send to Chatalog failed:', res.error);
        setStatus('✗ Couldn’t reach Chatalog. Is it running?');
        if (confirm('Couldn’t reach Chatalog. Is it running?\n\nDownload the export as a file instead?')) {
          download(exp);
          setStatus(`✓ Downloaded ${exp.filename}`);
        }
      }
    } finally {
      setSending(false);
    }
  };

  const hasPrompts = sessionData && sessionData.userPrompts.length > 0;
  // A live refresh of the shown session reloads in place, without the Loading… flash
  const switching = loading && sessionData?.session.sessionId !== selectedSessionId;

  return (
    <>
      <div className="panel">
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
          <button onClick={handleSend} disabled={checked.size === 0 || sending}>
            Send to Chatalog
          </button>
        </div>

        <div className="turns-list">
          {switching && <div className="empty">Loading…</div>}
          {!switching && sessionData && !hasPrompts && (
            <div className="empty">No prompts found in this session.</div>
          )}
          {!switching && sessionData && sessionData.userPrompts.map(p => (
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

      {sessionData && (
        <div className="conversation">
          {sessionData.turns.map((turn, i) => (
            <div
              key={i}
              ref={el => { if (el) turnRefs.current.set(i, el); else turnRefs.current.delete(i); }}
              className={`conv-turn conv-turn--${turn.role}${checked.has(i) ? ' conv-turn--selected' : ''}`}
            >
              <div className="conv-label">
                {turn.role === 'user' ? 'Prompt' : 'Response'}
              </div>
              <div className="conv-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {turn.text}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
