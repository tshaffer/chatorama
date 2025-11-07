// backend/src/server.ts
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { createRoutes } from './routes';
import { connectToDatabase, disconnectFromDatabase, connectionState } from './db/mongoose';

const PORT = Number(process.env.PORT || 8080);

async function main() {
  // 1) Connect to Mongo first
  await connectToDatabase();

  // 2) Create app + middleware
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // 3) Health (server + DB)
  app.get('/healthz', (_req, res) =>
    res.json({ ok: true, db: connectionState(), time: new Date().toISOString() })
  );

  // 4) API v1 (your existing route tree)
  createRoutes(app);

  // 5) Static frontend (served after API so /api/* isn’t intercepted)
  const publicDir = path.join(__dirname, '../public'); // fixed path
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  } else {
    console.warn(`[WARN] No frontend build at ${publicDir}. Run frontend build first.`);
  }

  // 6) Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = Number(err?.statusCode || err?.status || 500);
    const message = typeof err?.message === 'string' ? err.message : 'Internal Server Error';
    if (status >= 500) console.error('[ERROR]', err);
    res.status(status).json({ error: message });
  });

  // 7) Start HTTP server
  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`✅ Server listening on http://localhost:${PORT}`);
    if (fs.existsSync(publicDir)) {
      console.log(`✅ Serving frontend from ${publicDir}`);
      console.log(`➡  Open http://localhost:${PORT}`);
    }
  });

  // 8) Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`[srv] received ${signal}, shutting down...`);
    server.close(async () => {
      await disconnectFromDatabase();
      console.log('[srv] closed');
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Boot
main().catch((err) => {
  console.error('❌ Failed to start server', err);
  process.exit(1);
});
