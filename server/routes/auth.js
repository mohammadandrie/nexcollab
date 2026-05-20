// Auth routes: login by username (internal team — no password).
import { Router } from 'express';
import { all, get } from '../db.js';
import { issue, requireAuth, COOKIE_NAME } from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const row = get('SELECT * FROM users WHERE username = ?', username);
  if (!row) return res.status(404).json({ detail: 'unknown_user' });
  res.cookie(COOKIE_NAME, issue(username), {
    httpOnly: true, sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30 * 1000, path: '/',
  });
  res.json({ ok: true, user: row });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.get('/users', (_req, res) => {
  const rows = all(
    'SELECT id, username, name, role, color, avatar_letter FROM users',
  );
  res.json({ users: rows });
});

export default router;
