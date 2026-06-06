import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import chokidar from 'chokidar';
import { listSessions, parseSession } from './sessionReader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 9090;
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const CLIENT_DIR = join(__dirname, '..', 'dist', 'client');

const app = express();
app.use(express.json());
app.use(express.static(CLIENT_DIR));

// ---- API ----------------------------------------------------

app.get('/api/sessions', (_req, res) => {
  res.json(listSessions());
});

app.get('/api/session/:sessionId', (req, res) => {
  const sessions = listSessions();
  const info = sessions.find(s => s.sessionId === req.params.sessionId);
  if (!info) { res.status(404).json({ error: 'Session not found' }); return; }

  const data = parseSession(info);
  if (!data) { res.status(500).json({ error: 'Failed to parse session' }); return; }

  res.json(data);
});

// ---- HTTP + WebSocket ---------------------------------------

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

function broadcast(msg: object) {
  const json = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  });
}

// Watch ~/.claude/projects/ — emit refresh when any .jsonl changes
chokidar
  .watch(PROJECTS_DIR, { ignoreInitial: true, depth: 2, ignored: /subagents/ })
  .on('add',    path => { if (path.endsWith('.jsonl')) broadcast({ type: 'refresh' }); })
  .on('change', path => { if (path.endsWith('.jsonl')) broadcast({ type: 'refresh' }); });

httpServer.listen(PORT, () => {
  console.log(`\nClaude Code Exporter running at http://localhost:${PORT}\n`);
});
