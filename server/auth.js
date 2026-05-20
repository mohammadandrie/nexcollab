// Cookie session — signed username (no password, internal team workspace).
import crypto from 'node:crypto';
import { SESSION_SECRET } from './config.js';
import { get } from './db.js';

export const COOKIE_NAME = 'nexcollab_session';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');

function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest();
  return `${body}.${b64u(sig)}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest();
  const got = fromB64u(sig);
  if (expected.length !== got.length) return null;
  if (!crypto.timingSafeEqual(expected, got)) return null;
  try { return JSON.parse(fromB64u(body).toString('utf8')); }
  catch { return null; }
}

export function issue(username) { return sign({ u: username }); }

export function readUsername(req) {
  const data = verify(req.cookies?.[COOKIE_NAME]);
  return data?.u ?? null;
}

// Express middleware — attaches req.user or 401s.
export function requireAuth(req, res, next) {
  const username = readUsername(req);
  if (!username) return res.status(401).json({ detail: 'not_logged_in' });
  const row = get('SELECT * FROM users WHERE username = ?', username);
  if (!row) return res.status(401).json({ detail: 'user_not_found' });
  req.user = row;
  next();
}
