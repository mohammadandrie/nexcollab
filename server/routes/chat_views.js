// Per-user unread tracking for chats. Each row in `chat_views` is
// { chat_id, user_id, last_seen_msg_id, last_seen_at }. Unread count for a
// chat = messages with _id > last_seen_msg_id. Per-project unread is the
// sum across that user's private chat + the project's chat_all.
import { Router } from 'express';
import { cC, cM, cCV, cPM } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// GET /api/projects/_unread — { unread: { <project_id>: <count>, ... } }.
// Cheap aggregation: pull (chat_id, last_seen_msg_id) for the user across
// every chat they belong to, count messages with _id > last_seen, group
// by chat.project_id.
router.get('/projects/_unread', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user._id;
    // Project membership → chat_all visibility.
    const memberships = await cPM().find({ user_id: userId })
      .project({ project_id: 1 }).toArray();
    const projectIds = memberships.map((m) => m.project_id);
    // Chats: own private + chat_all of every member project.
    const chats = await cC().find({
      $or: [
        { kind: 'private', owner_id: userId },
        { kind: 'all', project_id: { $in: projectIds } },
      ],
    }).project({ _id: 1, project_id: 1 }).toArray();
    if (!chats.length) return res.json({ unread: {} });

    const views = await cCV().find({
      user_id: userId, chat_id: { $in: chats.map((c) => c._id) },
    }).project({ chat_id: 1, last_seen_msg_id: 1 }).toArray();
    const seenMap = Object.fromEntries(
      views.map((v) => [v.chat_id, v.last_seen_msg_id || 0]),
    );

    const unread = {};
    for (const c of chats) {
      if (!c.project_id) continue; // skip general
      const cutoff = seenMap[c._id] || 0;
      // Don't count user's own messages as "unread to themselves".
      const n = await cM().countDocuments({
        chat_id: c._id,
        _id: { $gt: cutoff },
        author_id: { $ne: userId },
      });
      unread[c.project_id] = (unread[c.project_id] || 0) + n;
    }
    res.json({ unread });
  } catch (e) { next(e); }
});

// POST /api/chats/:id/mark-read — bump last_seen for current user.
// Body optional: { up_to } (numeric msg id). Defaults to the latest msg.
router.post('/chats/:id/mark-read', requireAuth, async (req, res, next) => {
  try {
    const chatId = parseInt(req.params.id, 10);
    if (!Number.isFinite(chatId)) return res.status(400).json({ detail: 'bad_id' });
    let upTo = parseInt(req.body?.up_to, 10);
    if (!Number.isFinite(upTo)) {
      const last = await cM().find({ chat_id: chatId })
        .project({ _id: 1 }).sort({ _id: -1 }).limit(1).toArray();
      upTo = last[0]?._id || 0;
    }
    await cCV().updateOne(
      { chat_id: chatId, user_id: req.user._id },
      { $max: { last_seen_msg_id: upTo },
        $set: { last_seen_at: new Date() } },
      { upsert: true },
    );
    res.json({ ok: true, last_seen_msg_id: upTo });
  } catch (e) { next(e); }
});

export default router;
