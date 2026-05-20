// Auth routes: login by username (internal team — no password).
import { Router } from 'express';
import { cU } from '../db.js';
import { issue, requireAuth, COOKIE_NAME } from '../auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const row = await cU().findOne({ username });
    if (!row) return res.status(404).json({ detail: 'unknown_user' });
    res.cookie(COOKIE_NAME, issue(username), {
      httpOnly: true, sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 * 1000, path: '/',
    });
    res.json({ ok: true, user: { ...row, id: row._id } });
  } catch (e) { next(e); }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { ...req.user, id: req.user._id } });
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const update = {};
    for (const k of ['name', 'color', 'avatar_letter', 'photo_url']) {
      if (k in (req.body || {})) {
        const v = req.body[k] == null ? null : String(req.body[k]).trim();
        if (k === 'name' && !v) return res.status(400).json({ detail: 'name_required' });
        if (k === 'avatar_letter' && v && [...v].length > 2) {
          return res.status(400).json({ detail: 'letter_too_long' });
        }
        update[k] = v;
      }
    }
    if (!Object.keys(update).length) return res.status(400).json({ detail: 'no_fields' });
    await cU().updateOne({ _id: req.user._id }, { $set: update });
    const updated = await cU().findOne({ _id: req.user._id });
    res.json({ ok: true, user: { ...updated, id: updated._id } });
  } catch (e) { next(e); }
});

router.get('/users', async (_req, res, next) => {
  try {
    const rows = await cU().find({}, {
      projection: { _id: 1, username: 1, name: 1, role: 1, color: 1, avatar_letter: 1, photo_url: 1 },
    }).toArray();
    // Map _id → id for frontend compatibility.
    res.json({ users: rows.map((u) => ({ ...u, id: u._id })) });
  } catch (e) { next(e); }
});

export default router;
