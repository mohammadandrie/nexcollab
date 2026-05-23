// In-memory typing indicator. Per-chat map of userId -> { name, expiresAt }.
// No DB persistence — typing status is ephemeral by definition.
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { loadChatOr403 } from '../chat-auth.js';

const router = Router();

// chatId -> Map<userId, { name, expiresAt }>
const typingByChat = new Map();
const TTL_MS = 5000;

function getMap(chatId) {
  let m = typingByChat.get(chatId);
  if (!m) { m = new Map(); typingByChat.set(chatId, m); }
  return m;
}
function prune(m) {
  const now = Date.now();
  for (const [uid, v] of m) if (v.expiresAt <= now) m.delete(uid);
}

// Heartbeat: caller pings ~every 2s while their textarea has unsent content.
// Body: { typing: bool }. typing=false (or omit ping for >5s) clears entry.
router.post('/chats/:id/typing', requireAuth, async (req, res) => {
  const chatId = parseInt(req.params.id, 10);
  if (!await loadChatOr403(chatId, req.user, res)) return;
  const m = getMap(chatId);
  if (req.body?.typing === false) {
    m.delete(req.user._id);
  } else {
    m.set(req.user._id, {
      name: req.user.name,
      expiresAt: Date.now() + TTL_MS,
    });
  }
  res.json({ ok: true });
});

router.get('/chats/:id/typing', requireAuth, async (req, res) => {
  const chatId = parseInt(req.params.id, 10);
  if (!await loadChatOr403(chatId, req.user, res)) return;
  const m = getMap(chatId);
  prune(m);
  // Exclude the requester themselves.
  const users = [];
  for (const [uid, v] of m) {
    if (uid !== req.user._id) users.push({ id: uid, name: v.name });
  }
  res.json({ users });
});

export default router;
