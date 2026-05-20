// Auth routes: login by username (internal team — no password).
import { Router } from 'express';
import { all, get, run } from '../db.js';
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

router.patch('/me', requireAuth, (req, res) => {
  const fields = [];
  const args = [];
  for (const k of ['name', 'color', 'avatar_letter']) {
    if (k in (req.body || {})) {
      const v = String(req.body[k] ?? '').trim();
      if (k === 'name' && !v) return res.status(400).json({ detail: 'name_required' });
      if (k === 'avatar_letter' && v.length > 2) {
        return res.status(400).json({ detail: 'letter_too_long' });
      }
      fields.push(`${k} = ?`); args.push(v);
    }
  }
  if (!fields.length) return res.status(400).json({ detail: 'no_fields' });
  args.push(req.user.id);
  run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, ...args);
  res.json({ ok: true, user: get('SELECT * FROM users WHERE id = ?', req.user.id) });
});

router.get('/users', (_req, res) => {
  const rows = all(
    'SELECT id, username, name, role, color, avatar_letter FROM users',
  );
  res.json({ users: rows });
});

export default router;
