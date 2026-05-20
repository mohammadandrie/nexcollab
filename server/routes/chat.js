// Chat routes (MongoDB): read messages, send, share to Chat All.
import { Router } from 'express';
import { cC, cM, cP, cU, nextId } from '../db.js';
import { requireAuth } from '../auth.js';
import { loadChatOr403 } from '../chat-auth.js';
import { buildSystemPrompt, buildGeneralPrompt, chatComplete } from '../llm.js';

const router = Router();

router.get('/chats/general', requireAuth, async (req, res, next) => {
  try {
    let row = await cC().findOne({ kind: 'general', owner_id: req.user._id });
    if (!row) {
      const _id = await nextId('chats');
      await cC().insertOne({ _id, project_id: null, kind: 'general', owner_id: req.user._id });
      row = { _id };
    }
    res.json({ chat_id: row._id });
  } catch (e) { next(e); }
});

router.get('/chats/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const chatId = parseInt(req.params.id, 10);
    if (!await loadChatOr403(chatId, req.user, res)) return;

    const msgs = await cM().find({ chat_id: chatId }).sort({ _id: 1 }).toArray();
    const authorIds = [...new Set(msgs.map((m) => m.author_id).filter(Boolean))];
    const authors = await cU().find(
      { _id: { $in: authorIds } },
      { projection: { _id: 1, name: 1, role: 1, color: 1, avatar_letter: 1 } },
    ).toArray();
    const byId = Object.fromEntries(authors.map((u) => [u._id, u]));

    const messages = msgs.map((m) => {
      const a = m.author_id ? byId[m.author_id] : null;
      return {
        id: m._id, role: m.role, content: m.content,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        author_id: m.author_id, shared_from_chat_id: m.shared_from_chat_id ?? null,
        created_at: m.created_at,
        author_name: a?.name ?? null,
        author_role: a?.role ?? null,
        author_color: a?.color ?? null,
        author_letter: a?.avatar_letter ?? null,
      };
    });
    res.json({ messages });
  } catch (e) { next(e); }
});

router.post('/chats/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const chatId = parseInt(req.params.id, 10);
    const chat = await loadChatOr403(chatId, req.user, res);
    if (!chat) return;

    const text = String(req.body?.content || '').trim();
    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments
          .filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/uploads/'))
          .slice(0, 8)
          .map((a) => ({
            url: a.url, name: String(a.name || '').slice(0, 200),
            mime: String(a.mime || ''), size: Number(a.size) || 0,
          }))
      : [];
    if (!text && attachments.length === 0) {
      return res.status(400).json({ detail: 'empty_message' });
    }

    const userMsgId = await nextId('messages');
    await cM().insertOne({
      _id: userMsgId, chat_id: chatId, author_id: req.user._id,
      role: 'user', content: text, attachments,
      created_at: new Date(),
    });

    let assistantMsg = null;
    if (chat.kind === 'private' || chat.kind === 'general') {
      let sysPrompt;
      if (chat.kind === 'private') {
        const proj = await cP().findOne({ _id: chat.project_id });
        sysPrompt = buildSystemPrompt(
          req.user.name, req.user.role,
          proj?.name || 'Nexcollab', proj?.description || '',
        );
      } else {
        sysPrompt = buildGeneralPrompt(req.user.name, req.user.role);
      }

      const history = await cM().find({ chat_id: chatId })
        .sort({ _id: 1 }).limit(40)
        .project({ role: 1, content: 1 }).toArray();
      const msgs = [{ role: 'system', content: sysPrompt }, ...history];

      let reply;
      try { reply = await chatComplete(msgs); }
      catch (e) { reply = `_[LLM error: ${e.name}: ${e.message}]_`; }

      const arId = await nextId('messages');
      await cM().insertOne({
        _id: arId, chat_id: chatId, author_id: null,
        role: 'assistant', content: reply, created_at: new Date(),
      });
      assistantMsg = { id: arId, role: 'assistant', content: reply, author_id: null };
    }

    res.json({ user_message_id: userMsgId, assistant_message: assistantMsg });
  } catch (e) { next(e); }
});

router.post('/messages/:id/share', requireAuth, async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const note = String(req.body?.note || '').trim();

    const src = await cM().findOne({ _id: messageId });
    if (!src) return res.status(404).json({ detail: 'message_not_found' });
    const srcChat = await cC().findOne({ _id: src.chat_id });
    if (!srcChat || srcChat.kind !== 'private' || srcChat.owner_id !== req.user._id) {
      return res.status(403).json({ detail: 'not_your_message' });
    }

    const chatAll = await cC().findOne({ project_id: srcChat.project_id, kind: 'all' });
    if (!chatAll) return res.status(500).json({ detail: 'chat_all_missing' });

    let body = src.role === 'assistant'
      ? `_From Hermes (shared by ${req.user.name}):_\n\n${src.content}`
      : src.content;
    if (note) body = `**${note}**\n\n${body}`;

    const newId = await nextId('messages');
    await cM().insertOne({
      _id: newId, chat_id: chatAll._id, author_id: req.user._id,
      role: 'user', content: body, shared_from_chat_id: src.chat_id,
      created_at: new Date(),
    });
    res.json({ ok: true, chat_all_id: chatAll._id, new_message_id: newId });
  } catch (e) { next(e); }
});

export default router;
