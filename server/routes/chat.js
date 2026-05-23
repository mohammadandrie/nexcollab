// Chat routes (MongoDB): read messages, send, share to Chat All.
import { Router } from 'express';
import { cC, cM, cP, cU, cT, nextId } from '../db.js';
import { requireAuth } from '../auth.js';
import { loadChatOr403 } from '../chat-auth.js';
import { buildSystemPrompt, buildGeneralPrompt, buildChatAllPrompt, chatComplete, chatCompleteStream, compactHistory, encodeImagePart, isVisionMime, VISION_SYSTEM_NOTE } from '../llm.js';
import { buildPrivatePrompt } from '../buildPrivatePrompt.js';
import { captureUrl } from '../screenshot.js';

const router = Router();

// SSE helper: write a single event to the response stream. We use named
// events ('thinking' / 'delta' / 'final' / 'error' / 'retry') so the client
// can dispatch on `evt.type`. Caller is responsible for res.end() / res.flush.
function sseWrite(res, type, data) {
  try {
    if (res.writableEnded) return;
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data ?? {})}\n\n`);
    // Express sets compression off for SSE because we never set
    // 'Content-Type' to a compressible MIME, but in case proxies buffer,
    // explicitly flush when available.
    if (typeof res.flush === 'function') res.flush();
  } catch {}
}

// Build a compact summary of the project's task board (threads) so Hermes can
// reason about the pin / "task assigned to you" notifications visible in the
// user's UI. Keep it concise — just enough for grounding, not full event logs.
async function buildThreadContext(projectId, userId) {
  if (!projectId) return '';
  const rows = await cT().find({ project_id: projectId })
    .sort({ updated_at: -1 }).limit(50).toArray();
  if (!rows.length) return '\n\nTask board: (no threads yet)';
  const mine = rows.filter((t) => t.current_assignee_id === userId
                                 && t.status !== 'done');
  const open = rows.filter((t) => t.status !== 'done');
  const fmt = (t) => `#${t._id} [${t.status}] ${t.title}`
    + (t.description ? ` — ${String(t.description).replace(/\s+/g, ' ').slice(0, 140)}` : '');
  const parts = ['\n\nTask board context (live, project-scoped):'];
  if (mine.length) {
    parts.push(`\nAssigned to you (${mine.length}):`);
    for (const t of mine.slice(0, 10)) parts.push(`  • ${fmt(t)}`);
  }
  parts.push(`\nOpen threads (${open.length}):`);
  for (const t of open.slice(0, 20)) parts.push(`  • ${fmt(t)}`);
  parts.push('\nWhen the user references "the pin", "task assigned to me", or '
    + 'a thread by title/number, ground your answer in this list. If they ask '
    + 'about a thread NOT in this list, say so plainly.');
  return parts.join('\n');
}

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
      { projection: { _id: 1, name: 1, role: 1, color: 1, avatar_letter: 1, photo_url: 1 } },
    ).toArray();
    const byId = Object.fromEntries(authors.map((u) => [u._id, u]));
    // Lookup table for reply targets (within same chat).
    const msgById = Object.fromEntries(msgs.map((m) => [m._id, m]));

    function summarizeReply(targetId) {
      const t = msgById[targetId];
      if (!t) return null;
      const ta = t.author_id ? byId[t.author_id] : null;
      const isAi = t.role === 'assistant';
      const excerpt = String(t.content || '').replace(/\s+/g, ' ').slice(0, 120);
      return {
        id: t._id,
        author_name: isAi ? 'Hermes' : (ta?.name ?? '—'),
        author_color: isAi ? '#818cf8' : (ta?.color ?? '#888'),
        excerpt,
        has_attachment: Array.isArray(t.attachments) && t.attachments.length > 0,
      };
    }

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
        author_photo_url: a?.photo_url ?? null,
        reply_to_id: m.reply_to_id ?? null,
        reply_to: m.reply_to_id ? summarizeReply(m.reply_to_id) : null,
        pinned: !!m.pinned,
        pinned_at: m.pinned_at ?? null,
        pinned_by: m.pinned_by ?? null,
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

    // Optional reply_to_id — must reference a message in the same chat.
    let replyToId = null;
    if (req.body?.reply_to_id != null) {
      const candidate = parseInt(req.body.reply_to_id, 10);
      if (Number.isFinite(candidate)) {
        const target = await cM().findOne(
          { _id: candidate, chat_id: chatId },
          { projection: { _id: 1 } },
        );
        if (target) replyToId = candidate;
      }
    }

    const userMsgId = await nextId('messages');
    await cM().insertOne({
      _id: userMsgId, chat_id: chatId, author_id: req.user._id,
      role: 'user', content: text, attachments,
      reply_to_id: replyToId,
      created_at: new Date(),
    });

    let assistantMsg = null;
    if (chat.kind === 'private' || chat.kind === 'general') {
      let sysPrompt;
      if (chat.kind === 'private') {
        const proj = await cP().findOne({ _id: chat.project_id });
        sysPrompt = await buildPrivatePrompt(req.user, proj);
        // Inject live thread/task-board context so the agent can reason about
        // threads the user references ("the pin", "task assigned to me", etc.).
        sysPrompt += await buildThreadContext(chat.project_id, req.user._id);
      } else {
        sysPrompt = buildGeneralPrompt(req.user.name, req.user.role);
      }

      const history = await cM().find({ chat_id: chatId })
        .sort({ _id: 1 }).limit(40)
        .project({ role: 1, content: 1, attachments: 1 }).toArray();

      // Build LLM messages. If a message has image attachments we forward them
      // as OpenAI-style multipart content (text + image_url parts) so Claude
      // vision can actually see them.
      let sawVision = false;
      const llmHistory = history.map((m) => {
        const imgs = Array.isArray(m.attachments)
          ? m.attachments.filter((a) => isVisionMime(a.mime))
          : [];
        if (imgs.length === 0) {
          return { role: m.role, content: m.content || '' };
        }
        const parts = [];
        const text = (m.content || '').trim();
        if (text) parts.push({ type: 'text', text });
        for (const a of imgs.slice(0, 4)) {
          const part = encodeImagePart(a);
          if (part) { parts.push(part); sawVision = true; }
        }
        if (parts.length === 0) parts.push({ type: 'text', text: '(image)' });
        return { role: m.role, content: parts };
      });

      const finalSys = sawVision ? sysPrompt + VISION_SYSTEM_NOTE : sysPrompt;
      const msgs = [{ role: 'system', content: finalSys }, ...llmHistory];

      let reply;
      try { reply = await chatComplete(msgs, { maxTokens: sawVision ? 2048 : 1024 }); }
      catch (e) { reply = `_[LLM error: ${e.name}: ${e.message}]_`; }

      // Post-process: pluck up to 2 [!screenshot:URL] markers and capture them.
      const aiAttachments = [];
      const matches = [...reply.matchAll(/\[!screenshot:(https?:\/\/[^\s\]]+)\]/gi)].slice(0, 2);
      for (const m of matches) {
        try {
          const file = await captureUrl(m[1]);
          aiAttachments.push(file);
        } catch (e) {
          console.warn('[screenshot] capture failed', m[1], e.message);
        }
      }
      reply = reply.replace(/\[!screenshot:[^\]]+\]\s*/gi, '').trim();
      if (!reply && aiAttachments.length) {
        reply = aiAttachments.length === 1
          ? `Screenshot of ${aiAttachments[0].source_url}`
          : `${aiAttachments.length} screenshots attached.`;
      }

      const arId = await nextId('messages');
      await cM().insertOne({
        _id: arId, chat_id: chatId, author_id: null,
        role: 'assistant', content: reply, attachments: aiAttachments,
        reply_to_id: userMsgId,
        created_at: new Date(),
      });
      assistantMsg = { id: arId, role: 'assistant', content: reply,
                       attachments: aiAttachments, author_id: null,
                       reply_to_id: userMsgId };
    }

    // Chat All: trigger Hermes if user @-mentions OR replies-to a Hermes msg.
    // Reply-to-Hermes is treated as an implicit "@hermes" so users don't need
    // to type the tag every time they want a follow-up.
    let replyTargetIsHermes = false;
    if (chat.kind === 'all' && replyToId) {
      const target = await cM().findOne(
        { _id: replyToId },
        { projection: { role: 1, author_id: 1 } },
      );
      if (target && (target.role === 'assistant' || target.author_id == null)) {
        replyTargetIsHermes = true;
      }
    }
    if (chat.kind === 'all'
        && (/(^|\s)@hermes\b/i.test(text) || replyTargetIsHermes)) {
      const proj = await cP().findOne({ _id: chat.project_id });
      const sysPrompt = buildChatAllPrompt(
        req.user.name, req.user.role,
        proj?.name || 'Nexcollab', proj?.description || '',
      ) + await buildThreadContext(chat.project_id, req.user._id);
      // A3 = entire Chat All history (cap at 200 to protect token budget).
      const history = await cM().find({ chat_id: chatId })
        .sort({ _id: 1 }).limit(200)
        .project({ _id: 1, role: 1, content: 1, author_id: 1, reply_to_id: 1, attachments: 1 })
        .toArray();
      const aIds = [...new Set(history.map((h) => h.author_id).filter(Boolean))];
      const aRows = await cU().find(
        { _id: { $in: aIds } }, { projection: { _id: 1, name: 1, role: 1 } },
      ).toArray();
      const aMap = Object.fromEntries(aRows.map((u) => [u._id, u]));
      let sawVision2 = false;
      const llmMsgs = [{ role: 'system', content: sysPrompt }];
      for (const h of history) {
        if (h.role === 'assistant') {
          llmMsgs.push({ role: 'assistant', content: h.content });
          continue;
        }
        const u = h.author_id ? aMap[h.author_id] : null;
        const tag = u ? `${u.name} (${u.role})` : 'unknown';
        const ref = h.reply_to_id ? ` [↪ replying to msg #${h.reply_to_id}]` : '';
        const prefix = `[#${h._id} · ${tag}${ref}] `;
        const imgs = Array.isArray(h.attachments)
          ? h.attachments.filter((a) => isVisionMime(a.mime))
          : [];
        if (imgs.length === 0) {
          llmMsgs.push({ role: 'user', content: `${prefix}${h.content}` });
        } else {
          const parts = [{ type: 'text', text: `${prefix}${h.content || ''}`.trim() }];
          for (const a of imgs.slice(0, 4)) {
            const part = encodeImagePart(a);
            if (part) { parts.push(part); sawVision2 = true; }
          }
          llmMsgs.push({ role: 'user', content: parts });
        }
      }
      if (sawVision2) llmMsgs[0].content += VISION_SYSTEM_NOTE;
      let reply2;
      try { reply2 = await chatComplete(llmMsgs, { maxTokens: sawVision2 ? 2048 : 1024 }); }
      catch (e) { reply2 = `_[LLM error: ${e.name}: ${e.message}]_`; }
      const arId2 = await nextId('messages');
      await cM().insertOne({
        _id: arId2, chat_id: chatId, author_id: null,
        role: 'assistant', content: reply2, attachments: [],
        reply_to_id: userMsgId,
        created_at: new Date(),
      });
      assistantMsg = { id: arId2, role: 'assistant', content: reply2,
                       attachments: [], author_id: null,
                       reply_to_id: userMsgId };
    }

    res.json({ user_message_id: userMsgId, assistant_message: assistantMsg });
  } catch (e) { next(e); }
});

router.post('/messages/:id/share', requireAuth, async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ detail: 'headline_required' });
    const category = String(req.body?.category || 'Other').trim().slice(0, 60) || 'Other';

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
    body = `**${note}**\n\n${body}`;

    const now = new Date();

    // Create the thread first so the Chat All message can reference it.
    const threadId = await nextId('threads');
    const threadDoc = {
      _id: threadId,
      project_id: srcChat.project_id,
      title: note.slice(0, 200),
      description: src.content || '',
      category,
      status: 'open',
      originator_id: req.user._id,
      source_msg_id: messageId,
      current_assignee_id: null,
      events: [{ kind: 'create', actor_id: req.user._id, ts: now,
                 content: 'Created via Send to Chat All' }],
      created_at: now, updated_at: now, closed_at: null,
    };
    await cT().insertOne(threadDoc);

    const newId = await nextId('messages');
    await cM().insertOne({
      _id: newId, chat_id: chatAll._id, author_id: req.user._id,
      role: 'user', content: body,
      shared_from_chat_id: src.chat_id,
      thread_id: threadId,
      created_at: now,
    });
    res.json({ ok: true, chat_all_id: chatAll._id,
               new_message_id: newId, thread_id: threadId });
  } catch (e) { next(e); }
});

router.post('/messages/:id/pin', requireAuth, async (req, res, next) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    const msg = await cM().findOne({ _id: messageId });
    if (!msg) return res.status(404).json({ detail: 'message_not_found' });
    if (!await loadChatOr403(msg.chat_id, req.user, res)) return;
    const next = !msg.pinned;
    await cM().updateOne({ _id: messageId }, next
      ? { $set: { pinned: true, pinned_at: new Date(), pinned_by: req.user._id } }
      : { $unset: { pinned: '', pinned_at: '', pinned_by: '' } });
    res.json({ ok: true, pinned: next });
  } catch (e) { next(e); }
});

// Streaming variant of POST /chats/:id/messages.
// Emits SSE events so the browser can show progressive UI:
//   user_saved  → { user_message_id }       (user msg persisted, can render)
//   thinking    → { msg }                   (initial "Hermes is thinking…")
//   heartbeat   → { ts }                    (every ~5s while waiting upstream)
//   delta       → { content }               (token chunk from LLM)
//   retry       → { attempt, delay_ms }     (transient gateway error retry)
//   final       → { assistant_message }     (persisted final msg row)
//   error       → { detail, message }       (terminal error; client shows Retry)
// On any error, the user message stays persisted; only the assistant reply is
// dropped, so a Retry call can re-trigger streaming for the same user_msg_id.
router.post('/chats/:id/stream', requireAuth, async (req, res, next) => {
  // SSE headers — tell every hop "no buffering, please".
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // nginx-style hint; Caddy reverse_proxy honors flush_interval
  });
  res.flushHeaders?.();

  // Heartbeat loop keeps the socket warm so Caddy/Express/Node never decide
  // it's idle. Cleared as soon as the first delta lands.
  let heartbeatTimer = setInterval(() => sseWrite(res, 'heartbeat', { ts: Date.now() }), 5000);
  const stopHeartbeat = () => { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } };
  // If the client disconnects mid-stream, abort upstream work cleanly.
  const abortCtl = new AbortController();
  req.on('close', () => { stopHeartbeat(); abortCtl.abort(); });

  try {
    const chatId = parseInt(req.params.id, 10);
    const chat = await loadChatOr403(chatId, req.user, res);
    if (!chat) return;  // loadChatOr403 already wrote 403; SSE will die after.

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
      sseWrite(res, 'error', { detail: 'empty_message' });
      stopHeartbeat(); return res.end();
    }

    let replyToId = null;
    if (req.body?.reply_to_id != null) {
      const cand = parseInt(req.body.reply_to_id, 10);
      if (Number.isFinite(cand)) {
        const target = await cM().findOne({ _id: cand, chat_id: chatId },
                                          { projection: { _id: 1 } });
        if (target) replyToId = cand;
      }
    }

    const userMsgId = await nextId('messages');
    await cM().insertOne({
      _id: userMsgId, chat_id: chatId, author_id: req.user._id,
      role: 'user', content: text, attachments,
      reply_to_id: replyToId, created_at: new Date(),
    });
    sseWrite(res, 'user_saved', { user_message_id: userMsgId });
    sseWrite(res, 'thinking', { msg: 'Hermes is thinking…' });

    // Decide which LLM path applies. Private + general always reply.
    // Chat All replies only when the user @-mentions Hermes or replies to a
    // Hermes message (matches the existing non-streaming handler semantics).
    let triggerLLM = (chat.kind === 'private' || chat.kind === 'general');
    let chatAllMode = false;
    if (chat.kind === 'all') {
      let replyTargetIsHermes = false;
      if (replyToId) {
        const t = await cM().findOne({ _id: replyToId },
                                     { projection: { role: 1, author_id: 1 } });
        if (t && (t.role === 'assistant' || t.author_id == null)) replyTargetIsHermes = true;
      }
      if (/(^|\s)@hermes\b/i.test(text) || replyTargetIsHermes) {
        triggerLLM = true; chatAllMode = true;
      }
    }
    if (!triggerLLM) {
      // Plain user post in Chat All without @hermes — nothing to stream.
      sseWrite(res, 'final', { assistant_message: null });
      stopHeartbeat(); return res.end();
    }

    // Build system prompt + history once. Same logic as the non-streaming
    // path; future refactor could extract this into llm.js.
    let llmMsgs;
    let sawVision = false;
    if (chatAllMode) {
      const proj = await cP().findOne({ _id: chat.project_id });
      let sys = buildChatAllPrompt(req.user.name, req.user.role,
        proj?.name || 'Nexcollab', proj?.description || '');
      sys += await buildThreadContext(chat.project_id, req.user._id);
      const hist = await cM().find({ chat_id: chatId })
        .sort({ _id: 1 }).limit(200)
        .project({ _id: 1, role: 1, content: 1, author_id: 1, reply_to_id: 1, attachments: 1 })
        .toArray();
      const aIds = [...new Set(hist.map((h) => h.author_id).filter(Boolean))];
      const aRows = await cU().find({ _id: { $in: aIds } },
        { projection: { _id: 1, name: 1, role: 1 } }).toArray();
      const aMap = Object.fromEntries(aRows.map((u) => [u._id, u]));
      llmMsgs = [{ role: 'system', content: sys }];
      for (const h of hist) {
        if (h.role === 'assistant') { llmMsgs.push({ role: 'assistant', content: h.content }); continue; }
        const u = h.author_id ? aMap[h.author_id] : null;
        const tag = u ? `${u.name} (${u.role})` : 'unknown';
        const ref = h.reply_to_id ? ` [↪ replying to msg #${h.reply_to_id}]` : '';
        const prefix = `[#${h._id} · ${tag}${ref}] `;
        const imgs = Array.isArray(h.attachments)
          ? h.attachments.filter((a) => isVisionMime(a.mime)) : [];
        if (imgs.length === 0) {
          llmMsgs.push({ role: 'user', content: `${prefix}${h.content}` });
        } else {
          const parts = [{ type: 'text', text: `${prefix}${h.content || ''}`.trim() }];
          for (const a of imgs.slice(0, 4)) {
            const part = encodeImagePart(a);
            if (part) { parts.push(part); sawVision = true; }
          }
          llmMsgs.push({ role: 'user', content: parts });
        }
      }
    } else {
      let sys;
      if (chat.kind === 'private') {
        const proj = await cP().findOne({ _id: chat.project_id });
        sys = await buildPrivatePrompt(req.user, proj);
        sys += await buildThreadContext(chat.project_id, req.user._id);
      } else {
        sys = buildGeneralPrompt(req.user.name, req.user.role);
      }
      const hist = await cM().find({ chat_id: chatId })
        .sort({ _id: 1 }).limit(40)
        .project({ role: 1, content: 1, attachments: 1 }).toArray();
      const llmHistory = hist.map((m) => {
        const imgs = Array.isArray(m.attachments)
          ? m.attachments.filter((a) => isVisionMime(a.mime)) : [];
        if (imgs.length === 0) return { role: m.role, content: m.content || '' };
        const parts = [];
        const t = (m.content || '').trim();
        if (t) parts.push({ type: 'text', text: t });
        for (const a of imgs.slice(0, 4)) {
          const part = encodeImagePart(a);
          if (part) { parts.push(part); sawVision = true; }
        }
        if (parts.length === 0) parts.push({ type: 'text', text: '(image)' });
        return { role: m.role, content: parts };
      });
      llmMsgs = [{ role: 'system', content: sys }, ...llmHistory];
    }
    if (sawVision) llmMsgs[0].content += VISION_SYSTEM_NOTE;
    // Compaction: keep payload small even on long chats so retries are cheap.
    llmMsgs = compactHistory(llmMsgs, 20);

    // Stream tokens. First delta cancels the heartbeat — we now have real
    // traffic on the socket, so idle timers are safe.
    let acc = '';
    let firstDelta = true;
    try {
      for await (const ev of chatCompleteStream(llmMsgs, {
        maxTokens: sawVision ? 2048 : 1024,
        retries: 2,
        onAttempt: (attempt, delay) => sseWrite(res, 'retry', { attempt, delay_ms: Math.round(delay) }),
      })) {
        if (ev.type === 'delta') {
          if (firstDelta) { stopHeartbeat(); firstDelta = false; }
          acc += ev.content;
          sseWrite(res, 'delta', { content: ev.content });
        } else if (ev.type === 'final') {
          acc = ev.content || acc;
        }
      }
    } catch (e) {
      stopHeartbeat();
      sseWrite(res, 'error', {
        detail: 'llm_failed',
        message: `${e.name}: ${e.message}`,
        user_message_id: userMsgId,
        retryable: true,
      });
      return res.end();
    }
    stopHeartbeat();

    // Post-process screenshot markers exactly like the non-streaming handler.
    let reply = acc.trim();
    const aiAttachments = [];
    const matches = [...reply.matchAll(/\[!screenshot:(https?:\/\/[^\s\]]+)\]/gi)].slice(0, 2);
    for (const m of matches) {
      try { aiAttachments.push(await captureUrl(m[1])); }
      catch (e) { console.warn('[screenshot] capture failed', m[1], e.message); }
    }
    reply = reply.replace(/\[!screenshot:[^\]]+\]\s*/gi, '').trim();
    if (!reply && aiAttachments.length) {
      reply = aiAttachments.length === 1
        ? `Screenshot of ${aiAttachments[0].source_url}`
        : `${aiAttachments.length} screenshots attached.`;
    }

    const arId = await nextId('messages');
    await cM().insertOne({
      _id: arId, chat_id: chatId, author_id: null,
      role: 'assistant', content: reply, attachments: aiAttachments,
      reply_to_id: userMsgId, created_at: new Date(),
    });
    sseWrite(res, 'final', {
      assistant_message: {
        id: arId, role: 'assistant', content: reply,
        attachments: aiAttachments, author_id: null, reply_to_id: userMsgId,
      },
    });
    res.end();
  } catch (e) {
    stopHeartbeat();
    try { sseWrite(res, 'error', { detail: 'server_error', message: e.message }); } catch {}
    try { res.end(); } catch {}
    // Don't bubble to next() — SSE response is already in flight.
  }
});

export default router;
