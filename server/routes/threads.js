// Threads — cross-role work units in Chat All.
// Stage 1: create from private message, list, detail, comment.
import { Router } from 'express';
import { cT, cP, cPM, cU, cM, cA, nextId } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  buildChatAllPrompt, chatComplete, encodeImagePart,
  isVisionMime, VISION_SYSTEM_NOTE,
} from '../llm.js';

const router = Router();

// Multi-agent kanban: stage → required approver role(s).
// 'dev' butuh BOTH developers approve; lainnya cukup 1 dari role itu.
const STAGE_APPROVERS = {
  backlog: [],            // draft, no approval needed
  open: ['PM'],
  uiux: ['UX'],
  dev: ['DEV', 'DEV'],    // both devs must approve
  qa: ['QA'],
  pcheck: ['PM'],
  done: [],
};
// stage → next stage on approve. 'done' is terminal.
const NEXT_STAGE = {
  backlog: 'open', open: 'uiux', uiux: 'dev',
  dev: 'qa', qa: 'pcheck', pcheck: 'done', done: null,
};

// Build a thread-history transcript Hermes can reason about, then post the
// reply as a synthetic `comment` event (actor_id: null, role: assistant).
// Returned event is sent to the caller so the UI can render it immediately.
async function replyAsHermes(threadId, triggerUser) {
  const t = await cT().findOne({ _id: threadId });
  if (!t) return null;
  const proj = await cP().findOne({ _id: t.project_id });
  const sysPrompt = buildChatAllPrompt(
    triggerUser.name, triggerUser.role,
    proj?.name || 'Nexcollab', proj?.description || '',
  ) + `\n\nYou are now replying inside a Chat All THREAD titled "${t.title}". `
    + `Description: ${t.description || '(none)'}. `
    + `Status: ${t.status}. Stay focused on this thread's topic.`;

  // Hydrate authors so we can label "[Name (role)] …" in the transcript.
  const events = t.events || [];
  const aIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))];
  const aRows = aIds.length ? await cU().find(
    { _id: { $in: aIds } }, { projection: { _id: 1, name: 1, role: 1 } },
  ).toArray() : [];
  const aMap = Object.fromEntries(aRows.map((u) => [u._id, u]));

  let sawVision = false;
  const llmMsgs = [{ role: 'system', content: sysPrompt }];
  for (const ev of events) {
    if (ev.kind !== 'comment' && ev.kind !== 'create' && ev.kind !== 'promote-update') continue;
    const isAi = ev.actor_id == null;
    const u = ev.actor_id ? aMap[ev.actor_id] : null;
    const tag = isAi ? 'Hermes' : (u ? `${u.name} (${u.role})` : 'unknown');
    const text = String(ev.content || '').trim();
    const imgs = Array.isArray(ev.attachments)
      ? ev.attachments.filter((a) => isVisionMime(a.mime))
      : [];
    const role = isAi ? 'assistant' : 'user';
    if (imgs.length === 0) {
      llmMsgs.push({ role, content: isAi ? text : `[${tag}] ${text}` });
    } else {
      const parts = [{ type: 'text', text: isAi ? text : `[${tag}] ${text}` }];
      for (const a of imgs.slice(0, 4)) {
        const part = encodeImagePart(a);
        if (part) { parts.push(part); sawVision = true; }
      }
      llmMsgs.push({ role, content: parts });
    }
  }
  if (sawVision) llmMsgs[0].content += VISION_SYSTEM_NOTE;

  let reply;
  try { reply = await chatComplete(llmMsgs, { maxTokens: sawVision ? 2048 : 1024 }); }
  catch (e) { reply = `_[Hermes error: ${e.message}]_`; }

  const event_id = await nextId('thread_events');
  const ts = new Date();
  const ev = {
    event_id, kind: 'comment', actor_id: null, ts,
    content: reply, attachments: [], reply_to_event_id: null,
  };
  await cT().updateOne(
    { _id: threadId },
    { $push: { events: ev }, $set: { updated_at: ts } },
  );
  return ev;
}

// Authorization: user must be a member of the project the thread belongs to.
async function loadThreadOr403(threadId, user, res) {
  const t = await cT().findOne({ _id: threadId });
  if (!t) { res.status(404).json({ detail: 'thread_not_found' }); return null; }
  const member = await cPM().findOne({ project_id: t.project_id, user_id: user._id });
  if (!member) { res.status(403).json({ detail: 'not_a_member' }); return null; }
  return t;
}

// Hydrate userIds → user mini-objects for client rendering.
async function expandUsers(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const rows = await cU().find(
    { _id: { $in: uniq } },
    { projection: { _id: 1, name: 1, role: 1, color: 1, avatar_letter: 1, photo_url: 1 } },
  ).toArray();
  return Object.fromEntries(rows.map((u) => [u._id, { ...u, id: u._id }]));
}

// POST /api/threads — create from a Private message (promote).
// Body: { project_id, source_msg_id, title, description, category? }
router.post('/threads', requireAuth, async (req, res, next) => {
  try {
    const projectId = parseInt(req.body?.project_id, 10);
    const sourceMsgId = parseInt(req.body?.source_msg_id, 10);
    const title = String(req.body?.title || '').trim().slice(0, 200);
    const description = String(req.body?.description || '').trim().slice(0, 4000);
    const description_attachments = Array.isArray(req.body?.description_attachments)
      ? req.body.description_attachments
          .filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/uploads/'))
          .slice(0, 8)
          .map((a) => ({
            url: a.url, name: String(a.name || '').slice(0, 200),
            mime: String(a.mime || ''), size: Number(a.size) || 0,
          }))
      : [];
    const category = String(req.body?.category || 'Other').trim().slice(0, 60) || 'Other';
    if (!projectId || !title) return res.status(400).json({ detail: 'missing_fields' });

    const member = await cPM().findOne({ project_id: projectId, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });

    // Validate source message belongs to caller's private chat (audit trail).
    let sourceOk = null;
    if (Number.isFinite(sourceMsgId)) {
      const m = await cM().findOne({ _id: sourceMsgId });
      if (m) sourceOk = sourceMsgId;
    }

    const _id = await nextId('threads');
    const now = new Date();
    const doc = {
      _id, project_id: projectId, title, description, description_attachments,
      category,
      status: 'open',
      originator_id: req.user._id,
      source_msg_id: sourceOk,
      current_assignee_id: null,
      events: [{ kind: 'create', actor_id: req.user._id, ts: now }],
      version: 0,
      created_at: now, updated_at: now, closed_at: null,
    };
    await cT().insertOne(doc);
    res.json({ ok: true, thread: { ...doc, id: _id } });
  } catch (e) { next(e); }
});

// GET /api/projects/:id/threads — list threads for a project.
router.get('/projects/:id/threads', requireAuth, async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const member = await cPM().findOne({ project_id: projectId, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });

    const rows = await cT().find({ project_id: projectId })
      .sort({ updated_at: -1 }).limit(200).toArray();
    const userMap = await expandUsers(rows.flatMap(
      (t) => [t.originator_id, t.current_assignee_id]
    ));
    const threads = rows.map((t) => ({
      id: t._id, title: t.title, description: t.description,
      category: t.category || 'Other',
      status: t.status,
      originator: userMap[t.originator_id] || null,
      assignee: t.current_assignee_id ? userMap[t.current_assignee_id] || null : null,
      comment_count: (t.events || []).filter((e) => e.kind === 'comment').length,
      views_count: (t.views || []).length,
      created_at: t.created_at, updated_at: t.updated_at, closed_at: t.closed_at,
    }));
    res.json({ threads });
  } catch (e) { next(e); }
});

// GET /api/threads/:id — full detail with expanded event authors.
router.get('/threads/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    const userMap = await expandUsers([
      t.originator_id, t.current_assignee_id,
      ...(t.events || []).map((e) => e.actor_id),
    ]);
    // Hydrate agent metadata so client bubble can render persona name/color/avatar.
    const agentIds = [...new Set((t.events || []).map((e) => e.agent_id).filter(Boolean))];
    const agentRows = agentIds.length ? await cA().find(
      { _id: { $in: agentIds } },
      { projection: { _id: 1, name: 1, role: 1, color: 1, photo_url: 1 } },
    ).toArray() : [];
    const agentMap = Object.fromEntries(agentRows.map((a) => [a._id, a]));
    const events = t.events || [];
    // Lookup table so reply_to references can be expanded into a tiny preview.
    const evById = Object.fromEntries(
      events.filter((e) => e.event_id != null).map((e) => [e.event_id, e]),
    );
    function summarizeEvent(eid) {
      const src = evById[eid];
      if (!src) return null;
      const isAi = src.actor_id == null;
      const ag = src.agent_id ? agentMap[src.agent_id] : null;
      const a = src.actor_id ? userMap[src.actor_id] : null;
      return {
        event_id: src.event_id,
        author_name: ag ? `Agent ${ag.name}` : (isAi ? 'Hermes' : (a?.name || '—')),
        author_color: ag ? (ag.color || '#818cf8') : (isAi ? '#818cf8' : (a?.color || '#888')),
        excerpt: String(src.content || '').replace(/\s+/g, ' ').slice(0, 120),
        has_attachment: Array.isArray(src.attachments) && src.attachments.length > 0,
      };
    }
    const pinnedSet = new Set(Array.isArray(t.pinned_event_ids) ? t.pinned_event_ids : []);
    res.json({
      thread: {
        id: t._id, project_id: t.project_id,
        title: t.title, description: t.description,
        description_attachments: Array.isArray(t.description_attachments)
          ? t.description_attachments : [],
        status: t.status,
        category: t.category || 'Other',
        originator: userMap[t.originator_id] || null,
        assignee: t.current_assignee_id ? userMap[t.current_assignee_id] || null : null,
        source_msg_id: t.source_msg_id,
        events: events.map((e) => ({
          ...e,
          actor: e.actor_id ? (userMap[e.actor_id] || null) : null,
          agent: e.agent_id ? (agentMap[e.agent_id] || null) : null,
          pinned: e.event_id != null && pinnedSet.has(e.event_id),
          reply_to: e.reply_to_event_id != null
            ? summarizeEvent(e.reply_to_event_id) : null,
        })),
        pinned_event_ids: Array.isArray(t.pinned_event_ids) ? t.pinned_event_ids : [],
        version: t.version || 0,
        // Multi-agent kanban (mak) fields. Defaults handle pre-migration rows.
        stage: t.stage || 'backlog',
        stage_owners: t.stage_owners || {},
        approvals: Array.isArray(t.approvals) ? t.approvals : [],
        description_locks: t.description_locks || {},
        deal_state: t.deal_state || { status: 'idle' },
        created_at: t.created_at, updated_at: t.updated_at, closed_at: t.closed_at,
      },
    });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/comment — append comment event.
router.post('/threads/:id/comment', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.status === 'done') return res.status(409).json({ detail: 'thread_closed' });
    const content = String(req.body?.content || '').trim().slice(0, 4000);
    const attachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments
          .filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/uploads/'))
          .slice(0, 8)
          .map((a) => ({
            url: a.url, name: String(a.name || '').slice(0, 200),
            mime: String(a.mime || ''), size: Number(a.size) || 0,
          }))
      : [];
    if (!content && attachments.length === 0) {
      return res.status(400).json({ detail: 'empty_comment' });
    }
    // Optional reply target — must be an event already in this thread.
    let replyToEventId = null;
    if (req.body?.reply_to_event_id != null) {
      const candidate = parseInt(req.body.reply_to_event_id, 10);
      if (Number.isFinite(candidate)
          && (t.events || []).some((e) => e.event_id === candidate)) {
        replyToEventId = candidate;
      }
    }
    const event_id = await nextId('thread_events');
    const ev = {
      event_id, kind: 'comment', actor_id: req.user._id, ts: new Date(),
      content, attachments, reply_to_event_id: replyToEventId,
    };
    await cT().updateOne(
      { _id: id },
      { $push: { events: ev }, $set: { updated_at: ev.ts } },
    );

    // Smart agent dispatch: triggers via @mention OR reply-context, plus
    // recursive agent-to-agent chain. Legacy @hermes literal token still
    // routes to replyAsHermes for backward compat.
    let hermesEvent = null;
    const mentionTokens = [...content.matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase());
    try {
      const { dispatchAgentReply } = await import('../agentDispatch.js');
      hermesEvent = await dispatchAgentReply(id, ev, req.user);
    } catch (e) { console.warn('[threads] agent dispatch failed', e.message); }
    if (!hermesEvent && mentionTokens.includes('hermes')) {
      try { hermesEvent = await replyAsHermes(id, req.user); }
      catch (e) { console.warn('[threads] hermes reply failed', e.message); }
    }
    res.json({ ok: true, event: ev, hermes_event: hermesEvent });
  } catch (e) { next(e); }
});

// PATCH /api/threads/:id — edit title and/or description.
// Originator-only. Locked once thread is closed.
router.patch('/threads/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.originator_id !== req.user._id) {
      return res.status(403).json({ detail: 'originator_only' });
    }
    if (t.status === 'done') return res.status(409).json({ detail: 'thread_closed' });
    // Optimistic concurrency: if the client sent the version it last loaded,
    // reject when the server has moved on. `null`/missing = legacy client,
    // we let it through (last-write-wins for backward compat).
    if (req.body?.if_version != null) {
      const expected = parseInt(req.body.if_version, 10);
      const actual = parseInt(t.version || 0, 10);
      if (Number.isFinite(expected) && expected !== actual) {
        return res.status(409).json({
          detail: 'version_conflict',
          server_version: actual, client_version: expected,
        });
      }
    }
    const set = {};
    if ('title' in req.body) {
      const v = String(req.body.title || '').trim().slice(0, 200);
      if (!v) return res.status(400).json({ detail: 'empty_title' });
      set.title = v;
    }
    if ('description' in req.body) {
      set.description = String(req.body.description || '').trim().slice(0, 4000);
    }
    if ('description_attachments' in req.body) {
      const arr = Array.isArray(req.body.description_attachments)
        ? req.body.description_attachments : [];
      set.description_attachments = arr
        .filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/uploads/'))
        .slice(0, 8)
        .map((a) => ({
          url: a.url, name: String(a.name || '').slice(0, 200),
          mime: String(a.mime || ''), size: Number(a.size) || 0,
        }));
    }
    if ('category' in req.body) {
      const c = String(req.body.category || '').trim().slice(0, 60);
      if (!c) return res.status(400).json({ detail: 'category_required' });
      set.category = c;
    }
    if (!Object.keys(set).length) return res.status(400).json({ detail: 'no_fields' });
    set.updated_at = new Date();
    const ev = { kind: 'edit-desc', actor_id: req.user._id, ts: set.updated_at };
    // Bump version so concurrent edits with stale `if_version` get rejected.
    await cT().updateOne(
      { _id: id },
      { $set: set, $push: { events: ev }, $inc: { version: 1 } },
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/assign — set current assignee.
// Any project member may assign (per spec: bebas siapa pun assign).
// Body: { assignee_id }. Status flips to 'assigned'.
router.post('/threads/:id/assign', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.status === 'done') return res.status(409).json({ detail: 'thread_closed' });
    const assigneeId = parseInt(req.body?.assignee_id, 10);
    if (!Number.isFinite(assigneeId)) return res.status(400).json({ detail: 'bad_assignee' });
    const target = await cPM().findOne({ project_id: t.project_id, user_id: assigneeId });
    if (!target) return res.status(400).json({ detail: 'assignee_not_in_project' });
    const now = new Date();
    const ev = { kind: 'assign', actor_id: req.user._id, ts: now,
                 content: `→ assignee #${assigneeId}` };
    await cT().updateOne({ _id: id }, {
      $set: { current_assignee_id: assigneeId, status: 'assigned', updated_at: now },
      $push: { events: ev },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/release — current assignee marks their part done.
// Status flips to 'review' and assignee cleared, awaiting next routing.
router.post('/threads/:id/release', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.status === 'done') return res.status(409).json({ detail: 'thread_closed' });
    if (t.current_assignee_id !== req.user._id) {
      return res.status(403).json({ detail: 'not_current_assignee' });
    }
    const note = String(req.body?.note || '').trim().slice(0, 1000);
    const now = new Date();
    const ev = { kind: 'release', actor_id: req.user._id, ts: now,
                 content: note || '(marked my part done)' };
    await cT().updateOne({ _id: id }, {
      $set: { current_assignee_id: null, status: 'review', updated_at: now },
      $push: { events: ev },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/promote-update — append a Private result back to thread.
// Body: { content, source_msg_id? }. Any project member may post (the assignee
// reports back here). Does NOT change status — releasing is a separate call.
router.post('/threads/:id/promote-update', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.status === 'done') return res.status(409).json({ detail: 'thread_closed' });
    const content = String(req.body?.content || '').trim().slice(0, 4000);
    if (!content) return res.status(400).json({ detail: 'empty_update' });
    const sourceMsgId = parseInt(req.body?.source_msg_id, 10);
    const now = new Date();
    const ev = {
      kind: 'promote-update', actor_id: req.user._id, ts: now, content,
      source_msg_id: Number.isFinite(sourceMsgId) ? sourceMsgId : null,
    };
    await cT().updateOne({ _id: id }, {
      $push: { events: ev }, $set: { updated_at: now },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/close — originator marks the whole thread done.
// Locks the thread: no more comments, edits, assigns, releases.
router.post('/threads/:id/close', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.originator_id !== req.user._id) {
      return res.status(403).json({ detail: 'originator_only' });
    }
    if (t.status === 'done') return res.json({ ok: true });
    const now = new Date();
    const ev = { kind: 'close', actor_id: req.user._id, ts: now };
    await cT().updateOne({ _id: id }, {
      $set: { status: 'done', closed_at: now, updated_at: now,
              current_assignee_id: null },
      $push: { events: ev },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/take — current user self-assigns the thread.
// This is the new "Send to Private" action: any project member who isn't
// already the assignee can claim an unassigned thread. Status flips to
// 'assigned'. The thread then surfaces in the taker's Private InboxStrip.
router.post('/threads/:id/take', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.status === 'done') return res.status(409).json({ detail: 'thread_closed' });
    if (t.current_assignee_id) {
      return res.status(409).json({ detail: 'already_assigned' });
    }
    const now = new Date();
    const ev = { kind: 'take', actor_id: req.user._id, ts: now,
                 content: 'Took thread to Private' };
    await cT().updateOne({ _id: id }, {
      $set: { current_assignee_id: req.user._id, status: 'assigned', updated_at: now },
      $push: { events: ev },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/view — log that current user opened the thread.
// Idempotent: each user gets at most one views[] row (last_seen updates on revisit).
router.post('/threads/:id/view', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    const now = new Date();
    // Try to bump last_seen on the existing row first.
    const r = await cT().updateOne(
      { _id: id, 'views.user_id': req.user._id },
      { $set: { 'views.$.last_seen': now } },
    );
    // If no row matched, this is the user's first view → push a new row.
    if (r.matchedCount === 0) {
      await cT().updateOne(
        { _id: id },
        { $push: { views: { user_id: req.user._id, first_seen: now, last_seen: now } } },
      );
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/threads/:id/views — list users who have opened this thread.
router.get('/threads/:id/views', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    const views = (t.views || []).slice().sort(
      (a, b) => new Date(b.last_seen) - new Date(a.last_seen),
    );
    const userMap = await expandUsers(views.map((v) => v.user_id));
    res.json({
      views: views.map((v) => ({
        user: userMap[v.user_id] || null,
        first_seen: v.first_seen, last_seen: v.last_seen,
      })),
    });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/reopen — originator reactivates a closed thread.
router.post('/threads/:id/reopen', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.originator_id !== req.user._id) {
      return res.status(403).json({ detail: 'originator_only' });
    }
    if (t.status !== 'done') return res.status(409).json({ detail: 'not_closed' });
    const now = new Date();
    const ev = { kind: 'reopen', actor_id: req.user._id, ts: now };
    await cT().updateOne({ _id: id }, {
      $set: { status: 'open', closed_at: null, updated_at: now },
      $push: { events: ev },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/threads/:id — originator deletes the whole thread.
router.delete('/threads/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.originator_id !== req.user._id) {
      return res.status(403).json({ detail: 'originator_only' });
    }
    await cT().deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/events/:eventId/pin — toggle pinned state on a comment.
// Any project member may pin/unpin. Pinned comments surface above Activity.
router.post('/threads/:id/events/:eventId/pin', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = parseInt(req.params.eventId, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (!Number.isFinite(eventId)) return res.status(400).json({ detail: 'bad_event_id' });
    const exists = (t.events || []).some(
      (e) => e.event_id === eventId && e.kind === 'comment',
    );
    if (!exists) return res.status(404).json({ detail: 'event_not_found' });
    const pinned = Array.isArray(t.pinned_event_ids) ? t.pinned_event_ids : [];
    const isPinned = pinned.includes(eventId);
    await cT().updateOne({ _id: id }, isPinned
      ? { $pull: { pinned_event_ids: eventId }, $set: { updated_at: new Date() } }
      : { $addToSet: { pinned_event_ids: eventId }, $set: { updated_at: new Date() } });
    res.json({ ok: true, pinned: !isPinned });
  } catch (e) { next(e); }
});

// PATCH /api/threads/:id/events/:eventId — edit a comment event.
// Author-only. Records edited_at + appends an 'edit' marker so history is
// auditable. Locked once thread is closed.
router.patch('/threads/:id/events/:eventId', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = parseInt(req.params.eventId, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.status === 'done') return res.status(409).json({ detail: 'thread_closed' });
    const ev = (t.events || []).find((e) => e.event_id === eventId);
    if (!ev || ev.kind !== 'comment') {
      return res.status(404).json({ detail: 'event_not_found' });
    }
    if (ev.actor_id !== req.user._id) {
      return res.status(403).json({ detail: 'author_only' });
    }
    const content = String(req.body?.content || '').trim().slice(0, 4000);
    if (!content) return res.status(400).json({ detail: 'empty_comment' });
    const now = new Date();
    await cT().updateOne(
      { _id: id, 'events.event_id': eventId },
      { $set: { 'events.$.content': content, 'events.$.edited_at': now,
                updated_at: now } },
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/threads/:id/events/:eventId — soft-delete a comment event.
// Author-only. Marks deleted=true + clears content/attachments. The event row
// stays so reply-to references remain resolvable; the UI renders a tombstone.
router.delete('/threads/:id/events/:eventId', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const eventId = parseInt(req.params.eventId, 10);
    const t = await loadThreadOr403(id, req.user, res);
    if (!t) return;
    if (t.status === 'done') return res.status(409).json({ detail: 'thread_closed' });
    const ev = (t.events || []).find((e) => e.event_id === eventId);
    if (!ev || ev.kind !== 'comment') {
      return res.status(404).json({ detail: 'event_not_found' });
    }
    if (ev.actor_id !== req.user._id) {
      return res.status(403).json({ detail: 'author_only' });
    }
    const now = new Date();
    await cT().updateOne(
      { _id: id, 'events.event_id': eventId },
      { $set: { 'events.$.deleted': true,
                'events.$.content': '',
                'events.$.attachments': [],
                'events.$.deleted_at': now,
                updated_at: now } },
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/approve — stage approval (mak Fase 3).
// Records this user's approval for the current stage. When ALL required
// approvers (per STAGE_APPROVERS) have approved, snapshot description to
// description_locks[stage] and advance to NEXT_STAGE. Optimistic
// concurrency via if_version on the read-side; the actual transition
// uses an atomic updateOne keyed on the same version.
router.post('/threads/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await cT().findOne({ _id: id });
    if (!t) return res.status(404).json({ detail: 'thread_not_found' });
    const member = await cPM().findOne({ project_id: t.project_id, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });

    const stage = t.stage || 'backlog';
    const required = STAGE_APPROVERS[stage] || [];
    if (required.length === 0) {
      return res.status(409).json({ detail: 'stage_no_approval', stage });
    }
    if (!required.includes(req.user.role)) {
      return res.status(403).json({ detail: 'wrong_role', expected: required, got: req.user.role });
    }

    const existing = (t.approvals || []).filter((a) => a.stage === stage);
    if (existing.some((a) => a.user_id === req.user._id)) {
      return res.status(409).json({ detail: 'already_approved' });
    }

    // Tally with this user added. For 'dev' stage we need 2 approvers,
    // each must be a different user (role check above already validates DEV).
    const approverIds = new Set(existing.map((a) => a.user_id));
    approverIds.add(req.user._id);
    const haveCount = approverIds.size;
    const needCount = required.length;

    const now = new Date();
    const newApproval = { user_id: req.user._id, stage, ts: now };

    if (haveCount < needCount) {
      // Partial: just record approval, no transition.
      await cT().updateOne(
        { _id: id },
        { $push: { approvals: newApproval }, $set: { updated_at: now } },
      );
      return res.json({
        ok: true, advanced: false, stage,
        approvals_have: haveCount, approvals_need: needCount,
      });
    }

    // Full quorum → advance. Snapshot description to locks[stage] and move.
    const next = NEXT_STAGE[stage];
    const newVersion = (t.version || 0) + 1;
    const histEntry = {
      version: newVersion, ts: now, by_id: req.user._id,
      by_kind: 'human', source: 'stage_approve',
      from_stage: stage, to_stage: next,
    };
    const lockKey = `description_locks.${stage}`;
    await cT().updateOne(
      { _id: id },
      {
        $push: { approvals: newApproval, description_history: histEntry },
        $set: {
          stage: next,
          updated_at: now,
          [lockKey]: { content: t.description || '', ts: now, by_id: req.user._id },
        },
        $inc: { version: 1 },
      },
    );
    res.json({
      ok: true, advanced: true, stage: next, prev_stage: stage,
      version: newVersion, approvals_have: haveCount, approvals_need: needCount,
    });
    // Auto-greet from the new stage's lead agent. Fire-and-forget so
    // we don't block the approve response on an LLM call.
    import('../agentHandoffGreet.js').then(({ postHandoffGreet }) =>
      postHandoffGreet(id, stage, next),
    ).catch((e) => console.warn('[mak] handoff greet skipped:', e.message));
  } catch (e) { next(e); }
});

// POST /api/threads/:id/stage — manual stage move (drag from kanban).
// PM-only for now; future: stage-owner approval gates this. Optimistic
// concurrency via if_version. Records the move in description_history
// for audit but does NOT mutate description text yet (that happens on
// auto-DEAL in Fase 4).
const VALID_STAGES = new Set(['backlog', 'open', 'uiux', 'dev', 'qa', 'pcheck', 'done']);

router.post('/threads/:id/stage', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await cT().findOne({ _id: id });
    if (!t) return res.status(404).json({ detail: 'thread_not_found' });
    const member = await cPM().findOne({ project_id: t.project_id, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });
    if (req.user.role !== 'PM') return res.status(403).json({ detail: 'pm_only' });

    const next_stage = String(req.body?.stage || '').trim().toLowerCase();
    if (!VALID_STAGES.has(next_stage)) return res.status(400).json({ detail: 'bad_stage' });

    if (req.body?.if_version != null) {
      const expected = parseInt(req.body.if_version, 10);
      const actual = parseInt(t.version || 0, 10);
      if (Number.isFinite(expected) && expected !== actual) {
        return res.status(409).json({
          detail: 'version_conflict',
          server_version: actual, client_version: expected,
        });
      }
    }

    const prev_stage = t.stage || 'backlog';
    if (prev_stage === next_stage) return res.json({ ok: true, stage: next_stage, unchanged: true });

    const now = new Date();
    const histEntry = {
      version: (t.version || 0) + 1,
      ts: now,
      by_id: req.user._id,
      by_kind: 'human',
      source: 'manual_drag',
      from_stage: prev_stage,
      to_stage: next_stage,
    };
    await cT().updateOne(
      { _id: id },
      {
        $set: { stage: next_stage, updated_at: now },
        $inc: { version: 1 },
        $push: { description_history: histEntry },
      },
    );
    res.json({ ok: true, stage: next_stage, prev_stage, version: (t.version || 0) + 1 });
  } catch (e) { next(e); }
});

// GET /api/my-cards — global inbox: thread cards across ALL projects
// where the current stage's required role matches the user's role and
// the user hasn't approved yet. Plus a `running` bucket showing threads
// where agent loop is active and the user might want to peek.
router.get('/my-cards', requireAuth, async (req, res, next) => {
  try {
    const userRole = req.user.role;
    const myProjects = await cPM().find({ user_id: req.user._id })
      .project({ project_id: 1 }).toArray();
    const projIds = myProjects.map((m) => m.project_id);
    if (projIds.length === 0) return res.json({ count: 0, items: [] });

    const STAGE_ROLE = { open: 'PM', uiux: 'UX', dev: 'DEV', qa: 'QA', pcheck: 'PM' };
    const matchingStages = Object.keys(STAGE_ROLE)
      .filter((s) => STAGE_ROLE[s] === userRole);
    if (matchingStages.length === 0) return res.json({ count: 0, items: [] });

    const rows = await cT().find({
      project_id: { $in: projIds },
      stage: { $in: matchingStages },
    }).project({
      _id: 1, project_id: 1, title: 1, stage: 1, deal_state: 1,
      approvals: 1, updated_at: 1,
    }).sort({ updated_at: -1 }).toArray();

    // Filter out already-approved-by-me.
    const items = rows
      .filter((t) => !(t.approvals || []).some(
        (a) => a.user_id === req.user._id && a.stage === t.stage,
      ))
      .map((t) => ({
        id: t._id, project_id: t.project_id, title: t.title,
        stage: t.stage, deal_status: t.deal_state?.status || 'idle',
        updated_at: t.updated_at,
      }));
    res.json({ count: items.length, items });
  } catch (e) { next(e); }
});

// GET /api/projects/:id/board — kanban view: thread cards grouped by stage.
// Member-only. Used by KanbanBoard.jsx to render the 7 columns.
router.get('/projects/:id/board', requireAuth, async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    if (!Number.isFinite(projectId)) return res.status(400).json({ detail: 'bad_id' });
    const member = await cPM().findOne({ project_id: projectId, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });

    const rows = await cT().find({ project_id: projectId })
      .project({
        _id: 1, title: 1, description: 1, status: 1, stage: 1,
        category: 1, current_assignee_id: 1, created_by: 1,
        deal_state: 1, version: 1, updated_at: 1, created_at: 1,
      })
      .sort({ updated_at: -1 })
      .toArray();

    // Hydrate names for assignee + creator (small set, single query).
    const userIds = new Set();
    for (const r of rows) {
      if (r.current_assignee_id) userIds.add(r.current_assignee_id);
      if (r.created_by) userIds.add(r.created_by);
    }
    const users = userIds.size ? await cU().find(
      { _id: { $in: [...userIds] } },
      { projection: { _id: 1, name: 1, role: 1, color: 1, photo_url: 1, avatar_letter: 1 } },
    ).toArray() : [];
    const uMap = Object.fromEntries(users.map((u) => [u._id, u]));

    const STAGES = ['backlog', 'open', 'uiux', 'dev', 'qa', 'pcheck', 'done'];
    const columns = Object.fromEntries(STAGES.map((s) => [s, []]));
    for (const r of rows) {
      const stage = STAGES.includes(r.stage) ? r.stage : 'backlog';
      columns[stage].push({
        id: r._id,
        title: r.title,
        category: r.category ?? null,
        stage,
        legacy_status: r.status ?? null,
        version: r.version ?? 0,
        deal_status: r.deal_state?.status ?? 'idle',
        assignee: r.current_assignee_id ? uMap[r.current_assignee_id] ?? null : null,
        creator: r.created_by ? uMap[r.created_by] ?? null : null,
        updated_at: r.updated_at,
      });
    }
    res.json({ project_id: projectId, stages: STAGES, columns });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/mention/:agentId — manual one-shot agent
// reply (escape hatch). Determines if the agent is the current-stage
// agent (full stance allowed) or cross-stage (NOTE/ASK only).
router.post('/threads/:id/mention/:agentId', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const agentId = parseInt(req.params.agentId, 10);
    const t = await cT().findOne({ _id: id });
    if (!t) return res.status(404).json({ detail: 'thread_not_found' });
    const member = await cPM().findOne({ project_id: t.project_id, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });
    const { runAgentTurn } = await import('../agentMessage.js');
    const stageRolesByStage = { backlog:['pm'], open:['pm'], uiux:['ux','pm'],
      dev:['dev'], qa:['qa'], pcheck:['pm'], done:[] };
    const { cA: agents } = await import('../db.js');
    const agent = await agents().findOne({ _id: agentId });
    if (!agent) return res.status(404).json({ detail: 'agent_not_found' });
    const stageRoles = stageRolesByStage[t.stage || 'backlog'] || [];
    const isStageAgent = stageRoles.includes(agent.role);
    const ev = await runAgentTurn({ threadId: id, agentId, isStageAgent, triggerUser: req.user });
    res.json({ ok: true, event: ev, isStageAgent });
  } catch (e) { next(e); }
});

// POST /api/threads/:id/run — trigger agent discussion loop until DEAL or
// STUCK. Kicks off in background and returns immediately so the request
// doesn't block on multiple LLM calls. Client polls thread for new events.
router.post('/threads/:id/run', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = await cT().findOne({ _id: id });
    if (!t) return res.status(404).json({ detail: 'thread_not_found' });
    const member = await cPM().findOne({ project_id: t.project_id, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });
    // Mark running so UI can show indicator. Loop updates status on exit.
    await cT().updateOne(
      { _id: id },
      { $set: { 'deal_state.status': 'running', 'deal_state.started_at': new Date() } },
    );
    res.json({ ok: true, status: 'running' });
    // Fire-and-forget: import lazily so circular imports stay safe.
    import('../agentRunner.js').then(({ runAgentLoop }) => runAgentLoop(id))
      .then((r) => console.log(`[mak] thread ${id} loop done:`, r))
      .catch((e) => {
        console.error(`[mak] thread ${id} loop error:`, e);
        cT().updateOne({ _id: id },
          { $set: { 'deal_state.status': 'error',
                    'deal_state.last_error': String(e.message || e) } });
      });
  } catch (e) { next(e); }
});

export default router;
