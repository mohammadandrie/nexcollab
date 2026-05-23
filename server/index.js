// Express entry point. Run: node server/index.js
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';

import { HOST, PORT, CLIENT_DIST, UPLOADS_DIR } from './config.js';
import { connect } from './db.js';
import { seed } from './seed.js';
import authRouter from './routes/auth.js';
import projectsRouter from './routes/projects.js';
import chatRouter from './routes/chat.js';
import githubRouter from './routes/github.js';
import uploadRouter from './routes/upload.js';
import typingRouter from './routes/typing.js';
import threadsRouter from './routes/threads.js';
import chatViewsRouter from './routes/chat_views.js';
import agentsRouter from './routes/agents.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api', projectsRouter);
app.use('/api', chatRouter);
app.use('/api', githubRouter);
app.use('/api', uploadRouter);
app.use('/api', typingRouter);
app.use('/api', threadsRouter);
app.use('/api', chatViewsRouter);
app.use('/api', agentsRouter);
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', immutable: true }));

// React client (built by Vite into client/dist).
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback for client-side routing.
  app.get(/^\/(?!api\/|healthz).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res.status(503).send('Client build missing — run `npm --prefix client run build`.'));
}

// Catch-all error handler (async route errors land here).
app.use((err, _req, res, _next) => {
  console.error('[server] error:', err);
  res.status(500).json({ detail: 'server_error', message: err.message });
});

(async () => {
  await connect();
  await seed();
  const server = app.listen(PORT, HOST, () => {
    console.log(`nexcollab listening http://${HOST}:${PORT}`);
  });
  // Long-lived SSE streams (LLM replies) need request/header timeouts that
  // exceed the upstream LLM budget (~10 min). Defaults of 5 min headers /
  // ~5 min request would kill a slow thinking-model reply mid-stream.
  // keepAlive must be > headersTimeout to satisfy Node's invariant.
  server.requestTimeout    = 15 * 60 * 1000;  // 15 min — full request budget
  server.headersTimeout    = 12 * 60 * 1000;  // 12 min — must be > LLM streaming budget
  server.keepAliveTimeout  = 13 * 60 * 1000;  // 13 min — > headersTimeout (Node invariant)
})().catch((err) => { console.error(err); process.exit(1); });
