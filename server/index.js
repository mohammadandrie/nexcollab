// Express entry point. Run: node server/index.js
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';

import { HOST, PORT, CLIENT_DIST } from './config.js';
import { seed } from './seed.js';
import authRouter from './routes/auth.js';
import projectsRouter from './routes/projects.js';
import chatRouter from './routes/chat.js';

seed();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api', projectsRouter);
app.use('/api', chatRouter);

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

app.listen(PORT, HOST, () => {
  console.log(`nexcollab listening http://${HOST}:${PORT}`);
});
