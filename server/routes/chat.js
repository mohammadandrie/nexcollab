// Chat routes: read messages, send, share to Chat All.
import { Router } from 'express';
import { db, all, get, run } from '../db.js';
import { requireAuth } from '../auth.js';
import { buildSystemPrompt, buildGeneralPrompt, chatComplete } from '../llm.js';

const router = Router();

function loadChatOr403(chatId, user, res) {
  const chat = get('SELECT * FROM chats WHERE id = ?', chatId);
  if (!chat) { res.status(404).json({ detail: 'chat_not_found' }); return null; }

  if (chat.kind === 'general') {
    if (chat.owner_id !== user.id) {
      res.status(403).json({ detail: 'not_your_general_chat' }); return null;
    }
    return chat;
  }
  const member = get(
    'SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',
    chat.project_id, user.id,
  );
  if (!member) { res.status(403).json({ detail: 'not_a_member' }); return null; }
  if (chat.kind === 'private' && chat.owner_id !== user.id) {
    res.status(403).json({ detail: 'not_your_private_chat' }); return null;
  }
  return chat;
}

router.get('/chats/general', requireAuth, (req, res) => {
  let row = get(
    `SELECT id FROM chats WHERE kind='general' AND owner_id=?`,
    req.user.id,
  );
  if (!row) {
    const r = run(
      `INSERT INTO chats(project_id,kind,owner_id) VALUES (NULL,'general',?)`,
      req.user.id,
    );
    row = { id: r.lastInsertRowid };
  }
  res.json({ chat_id: row.id });
});

router.get('/chats/:id/messages', requireAuth, (req, res) => {
  const chatId = parseInt(req.params.id, 10);
  if (!loadChatOr403(chatId, req.user, res)) return;
  const rows = all(
    `SELECT m.id, m.role, m.content, m.author_id, m.shared_from_chat_id,
            m.created_at,
            u.name AS author_name, u.role AS author_role,
            u.color AS author_color, u.avatar_letter AS author_letter
     FROM messages m
     LEFT JOIN users u ON u.id = m.author_id
     WHERE m.chat_id = ?
     ORDER BY m.id ASC`,
    chatId,
  );
  res.json({ messages: rows });
});

router.post('/chats/:id/messages', requireAuth, async (req, res) => {
  const chatId = parseInt(req.params.id, 10);
  const chat = loadChatOr403(chatId, req.user, res);
  if (!chat) return;

  const text = String(req.body?.content || '').trim();
  if (!text) return res.status(400).json({ detail: 'empty_message' });

  const r = run(
    'INSERT INTO messages(chat_id,author_id,role,content) VALUES (?,?,?,?)',
    chatId, req.user.id, 'user', text,
  );
  const userMsgId = r.lastInsertRowid;

  let assistantMsg = null;
  if (chat.kind === 'private' || chat.kind === 'general') {
    let sysPrompt;
    if (chat.kind === 'private') {
      const proj = get('SELECT * FROM projects WHERE id = ?', chat.project_id);
      sysPrompt = buildSystemPrompt(
        req.user.name, req.user.role,
        proj?.name || 'Nexcollab', proj?.description || '',
      );
    } else {
      sysPrompt = buildGeneralPrompt(req.user.name, req.user.role);
    }

    const history = all(
      'SELECT role, content FROM messages WHERE chat_id=? ORDER BY id ASC LIMIT 40',
      chatId,
    );
    const msgs = [{ role: 'system', content: sysPrompt }, ...history];

    let reply;
    try { reply = await chatComplete(msgs); }
    catch (e) { reply = `_[LLM error: ${e.name}: ${e.message}]_`; }

    const ar = run(
      'INSERT INTO messages(chat_id,author_id,role,content) VALUES (?,NULL,?,?)',
      chatId, 'assistant', reply,
    );
    assistantMsg = {
      id: ar.lastInsertRowid, role: 'assistant',
      content: reply, author_id: null,
    };
  }

  res.json({ user_message_id: userMsgId, assistant_message: assistantMsg });
});

router.post('/messages/:id/share', requireAuth, (req, res) => {
  const messageId = parseInt(req.params.id, 10);
  const note = String(req.body?.note || '').trim();

  const src = get(
    `SELECT m.*, c.project_id, c.kind, c.owner_id AS chat_owner
     FROM messages m JOIN chats c ON c.id = m.chat_id
     WHERE m.id = ?`,
    messageId,
  );
  if (!src) return res.status(404).json({ detail: 'message_not_found' });
  if (src.kind !== 'private' || src.chat_owner !== req.user.id) {
    return res.status(403).json({ detail: 'not_your_message' });
  }

  const chatAll = get(
    `SELECT id FROM chats WHERE project_id=? AND kind='all'`,
    src.project_id,
  );
  if (!chatAll) return res.status(500).json({ detail: 'chat_all_missing' });

  let body = src.role === 'assistant'
    ? `_From Hermes (shared by ${req.user.name}):_\n\n${src.content}`
    : src.content;
  if (note) body = `**${note}**\n\n${body}`;

  const r = run(
    `INSERT INTO messages(chat_id,author_id,role,content,shared_from_chat_id)
     VALUES (?,?,?,?,?)`,
    chatAll.id, req.user.id, 'user', body, src.chat_id,
  );
  res.json({ ok: true, chat_all_id: chatAll.id, new_message_id: r.lastInsertRowid });
});

export default router;
