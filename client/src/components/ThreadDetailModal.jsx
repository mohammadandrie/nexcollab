// Stage 1 thread detail — read-only desc + event timeline + comment composer.
// Stage 2 adds: edit desc, assign, release. Stage 3 adds: close, promote-update.
import { useEffect, useRef, useState } from 'react';
import { api, mdLite } from '../api.js';
import Avatar from './Avatar.jsx';
import CategoryPicker from './CategoryPicker.jsx';
import CommentBubble from './CommentBubble.jsx';
import StageBar from './StageBar.jsx';
import ThreadActionsMenu from './ThreadActionsMenu.jsx';
import { consumeCommentStream } from './commentStream.js';
import ChatComposer from './ChatComposer.jsx';
import Attachment from './Attachment.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { toast } from './Toast.jsx';

// "May 21, 2026, 11:24 AM" — used in thread header subtitle.
function fmtFullDateTime(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return String(d); }
}

export default function ThreadDetailModal({
  threadId, currentUserId, currentUser, members = [], customCategories = [],
  onClose, onChanged, onTalkToAgent,
}) {
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDescAtts, setEditDescAtts] = useState([]);
  const [replyTo, setReplyTo] = useState(null); // {event_id, author, content}
  const [descUploading, setDescUploading] = useState(false);
  const [descUpErr, setDescUpErr] = useState('');
  const [agents, setAgents] = useState([]);
  const scrollRef = useRef(null);
  const [newMsgPill, setNewMsgPill] = useState(false);
  const lastSeenIdRef = useRef(0);
  // Custom confirm modal state — replaces window.confirm. `pending` holds
  // {title, description, confirmLabel, variant, run} where run() executes
  // the action when user clicks Confirm. Closing/cancel just clears it.
  const [pending, setPending] = useState(null);
  const descRef = useRef(null);
  const descFileRef = useRef(null);
  const descViewRef = useRef(null);

  // Upload files via the 📎 attach button → push into editDescAtts as
  // structured attachment objects. These render OUTSIDE the description body
  // as file cards, regardless of MIME (including images — the user opted in
  // to "this is an attachment, not inline content").
  async function uploadAsAttach(files) {
    if (!files || !files.length) return;
    setDescUploading(true); setDescUpErr('');
    const added = [];
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        const r = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await r.json();
        if (!r.ok) { setDescUpErr(data.detail || 'upload_failed'); break; }
        added.push(data.file);
      }
    } catch (e) { setDescUpErr(e.message || 'upload_failed'); }
    finally { setDescUploading(false); }
    if (added.length) setEditDescAtts((prev) => [...prev, ...added]);
  }

  // Upload an image and insert its URL inline inside the description textarea
  // at the current caret. mdLite() then renders it as an inline preview img.
  // This is the rich-content-editor path — text → image → text → image — and
  // is distinct from uploadAsAttach (the 📎 file card path).
  async function uploadAsInline(files) {
    if (!files || !files.length) return;
    setDescUploading(true); setDescUpErr('');
    const urls = [];
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        const r = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await r.json();
        if (!r.ok) { setDescUpErr(data.detail || 'upload_failed'); break; }
        urls.push(data.file.url);
      }
    } catch (e) { setDescUpErr(e.message || 'upload_failed'); }
    finally { setDescUploading(false); }
    if (!urls.length) return;
    const ta = descRef.current;
    const cur = editDesc || '';
    const start = ta?.selectionStart ?? cur.length;
    const end = ta?.selectionEnd ?? cur.length;
    const before = cur.slice(0, start);
    const after = cur.slice(end);
    // Newline-pad so the URL sits on its own line — mdLite needs whitespace
    // boundaries on both sides to detect the URL and render the inline img.
    const lead = before && !before.endsWith('\n') ? '\n' : '';
    const trail = after.startsWith('\n') || after === '' ? '\n' : '\n';
    const insert = lead + urls.join('\n') + trail;
    const next = before + insert + after;
    setEditDesc(next);
    setTimeout(() => {
      if (ta) {
        ta.focus();
        const caret = (before + insert).length;
        ta.selectionStart = ta.selectionEnd = caret;
      }
    }, 0);
  }

  function removeDescAtt(idx) {
    setEditDescAtts((prev) => prev.filter((_, i) => i !== idx));
  }

  // Paste handler for the description editor. Splits two paths:
  //   - image/* → upload + insert URL inline at caret (rich-content style).
  //   - non-image → upload + push as file card attachment (📎 path).
  // This matches the user mental model: "paste a screenshot to embed it,
  // paste a PDF to attach it".
  function onDescPaste(e) {
    const items = e.clipboardData?.items;
    if (!items || !items.length) return;
    const inlineImgs = [];
    const otherFiles = [];
    for (const it of items) {
      if (it.kind !== 'file') continue;
      const f = it.getAsFile();
      if (!f) continue;
      if (f.type.startsWith('image/')) {
        const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        inlineImgs.push(new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type }));
      } else {
        otherFiles.push(f);
      }
    }
    if (inlineImgs.length || otherFiles.length) e.preventDefault();
    if (inlineImgs.length) uploadAsInline(inlineImgs);
    if (otherFiles.length) uploadAsAttach(otherFiles);
  }

  // Delegated click: intercept inline <img> inside the rendered description
  // and forward to the global preview modal.
  function onDescViewClick(e) {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.classList?.contains('md-img')) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(
        'nexcollab:preview-image',
        { detail: { url: t.getAttribute('src'), alt: t.getAttribute('alt') || '' } },
      ));
    }
  }

  // Mention user list = project members + agents + virtual @hermes entry.
  // Exclude self — user can't @mention themselves.
  const mentionUsers = (() => {
    const out = members
      .filter((m) => m.id !== currentUserId)
      .map((m) => ({
        username: m.username || String(m.name || '').toLowerCase().replace(/\s+/g, ''),
        name: m.name || '—',
        photo_url: m.photo_url, color: m.color, avatar_letter: m.avatar_letter,
      }));
    for (const a of agents) {
      out.push({
        username: String(a.name || '').toLowerCase(),
        name: a.name,
        photo_url: a.photo_url, color: a.color,
        avatar_letter: (a.name || '?')[0]?.toUpperCase() || '🤖',
      });
    }
    out.push({
      username: 'hermes', name: 'Hermes',
      photo_url: null, color: '#818cf8', avatar_letter: '✦',
    });
    return out;
  })();

  async function refetch() {
    if (!threadId) return;
    setLoading(true);
    try {
      const { thread } = await api(`/api/threads/${threadId}`);
      setThread(thread);
      // Fire-and-forget view log so the eye icon on ThreadList stays accurate.
      api(`/api/threads/${threadId}/view`, { method: 'POST' }).catch(() => {});
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setLoading(false); }
  }

  // Quiet poll every 4s while modal open. Merges server events with any
  // in-flight ghost bubbles (_ghost_key set) so optimistic state survives.
  useEffect(() => {
    if (!threadId) return;
    const tick = async () => {
      try {
        const { thread: fresh } = await api(`/api/threads/${threadId}`);
        setThread((prev) => {
          if (!prev) return fresh;
          const ghosts = (prev.events || []).filter((e) => e._ghost_key);
          const serverIds = new Set((fresh.events || [])
            .map((e) => e.event_id).filter(Boolean));
          // Drop any ghost whose persisted twin already landed server-side.
          const liveGhosts = ghosts.filter((g) => !serverIds.has(g.event_id));
          return { ...fresh, events: [...(fresh.events || []), ...liveGhosts] };
        });
      } catch {}
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [threadId]);

  // Switching threads: never carry the previous thread's reply state forward.
  useEffect(() => {
    setThread(null);
    setErr('');
    setReplyTo(null);
    lastSeenIdRef.current = 0;
    setNewMsgPill(false);
    refetch();
  }, [threadId]);

  // Auto-scroll to latest comment when thread loads or events grow.
  // If new message arrived from someone else while user scrolled up,
  // surface a pill at top instead of yanking scroll position.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !thread) return;
    const comments = (thread.events || []).filter((e) => e.kind === 'comment');
    if (comments.length === 0) return;
    const last = comments[comments.length - 1];
    const lastId = last.event_id;
    const isNumId = typeof lastId === 'number';
    const wasNew = isNumId && lastSeenIdRef.current && lastId > lastSeenIdRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    const fromMe = last.actor_id === currentUserId;
    if (lastSeenIdRef.current === 0 || !wasNew || nearBottom || fromMe) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    } else {
      setNewMsgPill(true);
    }
    if (isNumId) lastSeenIdRef.current = lastId;
  }, [thread?.events?.length, threadId, currentUserId]);

  // Fetch agents once so MentionAutocomplete can include them in the @ list.
  useEffect(() => {
    api('/api/agents').then(({ agents }) => setAgents(agents || [])).catch(() => {});
  }, []);

  // ChatComposer.onSend signature: (text, attachments, replyId-from-bubble).
  // We override replyId via our own replyTo state instead — bubble-level reply
  // is handled by setReplyTo({event_id, ...}) outside the composer.
  async function postComment(text, attachments) {
    if (!threadId) return;
    const c = String(text || '').trim();
    const atts = Array.isArray(attachments) ? attachments : [];
    if (!c && atts.length === 0) return;
    setBusy(true); setErr('');
    const tmpKey = 'tmp-user-' + Date.now();
    // Optimistic ghost: render immediately so user sees their bubble.
    setThread((prev) => prev ? {
      ...prev,
      events: [...(prev.events || []), {
        _ghost_key: tmpKey, kind: 'comment',
        event_id: tmpKey, actor_id: currentUserId,
        actor: { id: currentUserId, name: currentUser?.name,
                 color: currentUser?.color, role: currentUser?.role },
        ts: new Date(), content: c, attachments: atts,
        reply_to_event_id: replyTo?.event_id ?? null,
      }],
    } : prev);
    setReplyTo(null);
    const setEvents = (updater) => setThread((prev) => prev ? {
      ...prev, events: typeof updater === 'function'
        ? updater(prev.events || [])
        : updater,
    } : prev);
    try {
      await consumeCommentStream(threadId, {
        content: c, attachments: atts,
        reply_to_event_id: replyTo?.event_id ?? null,
      }, setEvents, tmpKey);
      onChanged?.();
    } catch (e) {
      setErr(e.message || String(e));
      // Drop the ghost so re-attempt doesn't double-post.
      setEvents((prev) => prev.filter((ev) => ev._ghost_key !== tmpKey));
    } finally { setBusy(false); }
  }

  async function callAction(path, body) {
    setBusy(true); setErr('');
    try {
      await api(`/api/threads/${threadId}/${path}`, {
        method: body === undefined ? 'POST' : 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // Friendly per-action confirmation. Defaults to a generic "Done"
      // so any future action gets a toast even before we add a label.
      const labels = {
        close: 'Thread closed',
        reopen: 'Thread reopened',
        take: 'Thread moved to your private',
        release: 'Marked your part done',
      };
      toast.success(labels[path] || 'Done');
      await refetch();
      onChanged?.();
    } catch (e) {
      setErr(e.message || String(e));
      toast.error(e.message || 'Action failed');
    } finally { setBusy(false); }
  }

  async function saveEdit() {
    const t = editTitle.trim();
    if (!t) { setErr('Title required.'); return; }
    setBusy(true); setErr('');
    try {
      await api(`/api/threads/${threadId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: t, description: editDesc,
          description_attachments: editDescAtts,
          // Optimistic concurrency: send the version we last loaded so the
          // server can reject if someone else edited in the meantime.
          if_version: thread?.version ?? null,
        }),
      });
      setEditing(false);
      toast.success('Description saved');
      await refetch();
      onChanged?.();
    } catch (e) {
      const msg = e.message || String(e);
      setErr(msg);
      // Distinguish stale-edit conflict from generic error so the user knows
      // to refresh rather than retry blindly.
      if (/version_conflict|409/i.test(msg)) {
        toast.error('Someone else edited this thread. Reloading…');
        await refetch();
      } else {
        toast.error(msg);
      }
    } finally { setBusy(false); }
  }

  function startEdit() {
    setEditTitle(thread?.title || '');
    setEditDesc(thread?.description || '');
    setEditDescAtts(Array.isArray(thread?.description_attachments)
      ? thread.description_attachments : []);
    setEditing(true);
  }

  async function togglePin(eventId) {
    if (!eventId) return;
    try {
      await api(`/api/threads/${threadId}/events/${eventId}/pin`,
                { method: 'POST' });
      await refetch();
      onChanged?.();
    } catch (e) { setErr(e.message || String(e)); }
  }

  async function editComment(ev, content) {
    if (!ev?.event_id) return;
    try {
      await api(`/api/threads/${threadId}/events/${ev.event_id}`, {
        method: 'PATCH', body: JSON.stringify({ content }),
      });
      await refetch();
      onChanged?.();
    } catch (e) { setErr(e.message || String(e)); }
  }

  async function deleteComment(ev) {
    if (!ev?.event_id) return;
    try {
      await api(`/api/threads/${threadId}/events/${ev.event_id}`,
                { method: 'DELETE' });
      await refetch();
      onChanged?.();
    } catch (e) { setErr(e.message || String(e)); }
  }

  if (!threadId) return null;

  return (
    <div className="theme-panel rounded-xl flex flex-col flex-1 min-h-0
                    overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2
                      border-b border-[color:var(--border)]">
        <button onClick={onClose}
                className="text-[11px] theme-muted hover:opacity-80
                           inline-flex items-center gap-1">
          ← Back to threads
        </button>
        {thread && (
          <div className="flex items-center gap-2">
            {onTalkToAgent && (
              <button onClick={() => onTalkToAgent(thread)}
                      title="Diskusi 1:1 dengan agent kamu tentang thread ini"
                      className="text-[11px] px-2 py-1 rounded
                                 bg-[color:var(--accent)]/15 text-[color:var(--accent)]
                                 hover:bg-[color:var(--accent)]/25">
                💬 Talk to my agent
              </button>
            )}
            {currentUserId != null && thread && (
              <ThreadActionsMenu
                threadId={threadId} title={thread.title}
                canEdit canDelete
                onTitleSaved={() => refetch()}
                onDeleted={() => onClose?.()}
                size="lg"
              />
            )}
            <button onClick={onClose}
                    className="text-xs theme-muted px-2 py-1">✕</button>
          </div>
        )}
      </div>
        {loading && !thread && (
          <div className="text-center text-xs theme-muted py-8">Loading thread…</div>
        )}
        {err && !thread && (
          <div className="text-center text-xs text-red-400 py-8">{err}</div>
        )}
        {thread && (
          <>
            <div className="flex-1 min-h-0 grid grid-cols-1
                            md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
            <aside className="overflow-y-auto scrollbar p-3 md:p-4 space-y-3
                              md:border-r border-[color:var(--border)]
                              min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {editing ? (
                  <input value={editTitle} maxLength={200}
                         onChange={(e) => setEditTitle(e.target.value)}
                         className="w-full theme-input text-sm font-semibold mb-1" />
                ) : (
                  <div className="text-base font-semibold break-words">{thread.title}</div>
                )}
                <div className="text-[11px] theme-muted flex items-center gap-1.5 flex-wrap">
                  <span>by {thread.originator?.name || '—'}</span>
                  <span>·</span>
                  <StageBar thread={thread} currentUser={currentUser}
                            onChanged={() => { refetch(); onChanged?.(); }} />
                  {thread.assignee && <span>· assigned: {thread.assignee.name}</span>}
                  <span>·</span>
                  {currentUserId != null ? (
                    <CategoryPicker
                      current={thread.category || 'Other'}
                      customCategories={customCategories}
                      onPick={async (v) => {
                        await api(`/api/threads/${threadId}`, {
                          method: 'PATCH', body: JSON.stringify({ category: v }),
                        });
                        await refetch();
                        onChanged?.();
                      }}
                    />
                  ) : (
                    <span className="text-[10px] px-1.5 py-px rounded border
                                     bg-neutral-700/30 text-neutral-300 border-neutral-600/40">
                      {thread.category || 'Other'}
                    </span>
                  )}
                </div>
                {/* Date & time line: created vs last-updated. Tooltip carries the
                    raw ISO so power users can copy if needed. */}
                <div className="text-[10px] theme-muted mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                  {thread.created_at && (
                    <span title={thread.created_at}>
                      created {fmtFullDateTime(thread.created_at)}
                    </span>
                  )}
                  {thread.updated_at && thread.updated_at !== thread.created_at && (
                    <span title={thread.updated_at}>
                      · updated {fmtFullDateTime(thread.updated_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {editing ? (
              <>
                <textarea ref={descRef} value={editDesc} maxLength={4000} rows={5}
                          onChange={(e) => setEditDesc(e.target.value)}
                          onPaste={onDescPaste}
                          placeholder="Description… paste a screenshot to embed it inline, or paste a file (PDF, docx, …) to attach it."
                          className="w-full theme-input text-sm mb-1 resize-y" />
                {editDescAtts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {editDescAtts.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md
                                              bg-[color:var(--bg-2)]
                                              border border-[color:var(--border)]
                                              text-[11px]">
                        <span>{a.mime?.startsWith('image/') ? '🖼' :
                               a.mime?.startsWith('video/') ? '🎬' :
                               a.mime?.startsWith('audio/') ? '🎵' : '📎'}</span>
                        <span className="max-w-[160px] truncate">{a.name}</span>
                        <button type="button" onClick={() => removeDescAtt(i)}
                                className="theme-muted hover:opacity-80">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3 text-[11px]">
                  <input ref={descFileRef} type="file" multiple
                         onChange={(e) => {
                           const fs = Array.from(e.target.files || []);
                           if (fs.length) uploadAsAttach(fs);
                           if (descFileRef.current) descFileRef.current.value = '';
                         }} className="hidden" />
                  <button type="button" onClick={() => descFileRef.current?.click()}
                          className="theme-card px-2 py-1 rounded hover:opacity-80">
                    📎 Attach (≤2 MB)
                  </button>
                  {descUploading && <span className="theme-muted">Uploading…</span>}
                  {descUpErr && <span className="text-red-400">Failed: {descUpErr}</span>}
                  <span className="theme-muted ml-auto">
                    📎 = file card · paste image = inline embed
                  </span>
                </div>
              </>
            ) : (
              <>
                {/* Description view: relative wrapper holds the small pencil
                    icon in the top-right corner so we don't need a separate
                    "Edit desc" button. Max-height keeps the panel layout
                    stable when descriptions get long; overflow scrolls
                    inside the box rather than blowing out the page. */}
                {(thread.description
                  || (Array.isArray(thread.description_attachments)
                       && thread.description_attachments.length > 0)
                  || true) && (
                  <div className="relative mb-2">
                    {currentUserId != null && !editing && (
                      <button type="button" onClick={startEdit}
                              title="Edit description"
                              aria-label="Edit description"
                              className="absolute top-1.5 right-1.5 z-10
                                         w-7 h-7 inline-flex items-center justify-center
                                         rounded-md text-[12px] theme-muted
                                         hover:bg-[color:var(--border)]
                                         hover:opacity-100 opacity-70">
                        ✏
                      </button>
                    )}
                    {thread.description ? (
                      <div ref={descViewRef} onClick={onDescViewClick}
                           className="markdown text-[13px]
                                      p-3 pr-10 rounded-md bg-[color:var(--bg-2)]
                                      border border-[color:var(--border)]
                                      max-h-[360px] overflow-y-auto scrollbar"
                           dangerouslySetInnerHTML={{ __html: mdLite(thread.description) }} />
                    ) : (
                      Array.isArray(thread.description_attachments)
                        && thread.description_attachments.length > 0 ? null : (
                        <div className="text-[13px] p-3 pr-10 rounded-md
                                        bg-[color:var(--bg-2)]
                                        border border-[color:var(--border)] theme-muted">
                          No description.
                        </div>
                      )
                    )}
                  </div>
                )}
                {Array.isArray(thread.description_attachments)
                  && thread.description_attachments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {thread.description_attachments.map((a, i) => (
                      <Attachment key={i} a={a} />
                    ))}
                  </div>
                )}
              </>
            )}

            {(() => {
              const isOriginator = thread.originator?.id === currentUserId;
              const isAssignee = thread.assignee?.id === currentUserId;
              const closed = thread.status === 'done';
              if (closed) {
                return (
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
                    <span className="text-emerald-400">🔒 Thread closed.</span>
                    {isOriginator && (
                      <button onClick={() => setPending({
                                title: 'Reopen this thread?',
                                description: 'Reopens the thread for new comments and status changes. Activity log is preserved.',
                                confirmLabel: 'Reopen',
                                variant: 'primary',
                                run: () => callAction('reopen'),
                              })} disabled={busy}
                              className="theme-card px-2 py-1 rounded hover:opacity-80">
                        ↺ Reopen thread
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <div className="flex flex-wrap gap-1.5 mb-3 text-[11px]">
                  {editing && (
                    <>
                      <button onClick={saveEdit} disabled={busy}
                              className="promote-btn text-white px-2 py-1 rounded">Save</button>
                      <button onClick={() => setEditing(false)} disabled={busy}
                              className="theme-card px-2 py-1 rounded hover:opacity-80">Cancel</button>
                    </>
                  )}
                  {!thread.assignee && (
                    <button onClick={() => callAction('take')} disabled={busy}
                            className="theme-card px-2 py-1 rounded hover:opacity-80
                                       border border-indigo-500/40 text-indigo-300">
                      → Send to Private
                    </button>
                  )}
                  {isAssignee && (
                    <button onClick={() => callAction('release', { note: '' })} disabled={busy}
                            className="px-2 py-1 rounded
                                       bg-emerald-500/15 text-emerald-300
                                       border border-emerald-500/30 hover:opacity-80">
                      ✓ Mark my part done
                    </button>
                  )}
                  {thread.assignee && !isAssignee && (
                    <span className="px-2 py-1 rounded theme-muted
                                     bg-amber-500/10 border border-amber-500/30 text-amber-300">
                      ⏳ Waiting for {thread.assignee.name} to finish
                    </span>
                  )}
                  {isOriginator && (
                    <button onClick={() => setPending({
                              title: 'Close this thread?',
                              description: 'Closed threads are read-only — no new comments, no status changes. Originator can reopen later.',
                              confirmLabel: 'Close thread',
                              variant: 'warning',
                              run: () => callAction('close'),
                            })} disabled={busy}
                            className="theme-card px-2 py-1 rounded hover:opacity-80">
                      🔒 Close thread
                    </button>
                  )}
                  {isOriginator && (
                    <button onClick={() => setPending({
                              title: 'Delete this thread?',
                              description: 'Permanently removes the thread and its full activity log. This cannot be undone.',
                              confirmLabel: 'Delete',
                              variant: 'danger',
                              run: async () => {
                                try {
                                  await api(`/api/threads/${threadId}`, { method: 'DELETE' });
                                  toast.success('Thread deleted');
                                  onChanged?.();
                                  onClose?.();
                                } catch (e) {
                                  setErr(e.message || String(e));
                                  toast.error(e.message || 'Delete failed');
                                }
                              },
                            })} disabled={busy}
                            className="px-2 py-1 rounded
                                       bg-red-500/15 text-red-300
                                       border border-red-500/30 hover:opacity-80">
                      🗑 Delete
                    </button>
                  )}
                </div>
              );
            })()}

            {(() => {
              const evs = thread.events || [];
              const pinnedSet = new Set(thread.pinned_event_ids || []);
              const pinnedEvs = evs.filter(
                (e) => e.kind === 'comment' && pinnedSet.has(e.event_id),
              );
              return pinnedEvs.length > 0 ? (
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-wider
                                  text-amber-300/80 mb-1 flex items-center gap-1">
                    📌 Pinned ({pinnedEvs.length})
                  </div>
                  <div className="space-y-2 p-2 rounded-md
                                  bg-amber-500/5 border border-amber-500/30">
                    {pinnedEvs.map((e) => (
                      <CommentBubble key={`pin-${e.event_id}`} ev={e}
                                     currentUserId={currentUserId}
                                     onPin={() => togglePin(e.event_id)}
                                     onJumpToEvent={(eid) => {
                                       const el = document.getElementById(`thread-ev-${eid}`);
                                       el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                     }} />
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Activity log section removed per UX request — keeps the left
                panel focused on description + actions + pinned. Lifecycle
                events are still recorded server-side; we just no longer
                surface them in this column. */}
            </aside>

            <section className="flex flex-col min-w-0 min-h-0
                                bg-[color:var(--bg-1)]">
              <div className="px-3 md:px-4 py-2 border-b border-[color:var(--border)]
                              text-[11px] uppercase tracking-wider theme-muted
                              flex items-center gap-2">
                <span>💬 Discussion</span>
                <span className="opacity-70 normal-case tracking-normal">
                  ({(thread.events || []).filter((e) => e.kind === 'comment').length})
                </span>
              </div>
              <div ref={scrollRef} className="scrollbar overflow-y-auto flex-1 px-3 md:px-4 py-3 space-y-3"
                   onScroll={() => {
                     const el = scrollRef.current;
                     if (!el) return;
                     const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                     if (nearBottom && newMsgPill) setNewMsgPill(false);
                   }}>
                {newMsgPill && (
                  <button onClick={() => {
                    const el = scrollRef.current;
                    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
                    setNewMsgPill(false);
                  }} className="sticky top-1 z-10 self-center mx-auto block
                                text-[11px] px-3 py-1 rounded-full
                                bg-violet-600 hover:bg-violet-500 text-white shadow-lg">
                    ↓ New message
                  </button>
                )}
                {(() => {
                  const comments = (thread.events || []).filter(
                    (e) => e.kind === 'comment',
                  );
                  if (comments.length === 0) {
                    return (
                      <div className="text-center text-xs theme-muted py-12">
                        No comments yet. Start the discussion below.
                      </div>
                    );
                  }
                  return comments.map((e, i) => (
                    <CommentBubble key={`ev-${e.event_id ?? i}`} ev={e}
                                   currentUserId={currentUserId}
                                   onReply={thread.status !== 'done'
                                     ? (src) => setReplyTo({
                                         event_id: src.event_id,
                                         author_name: src.agent
                                           ? `Agent ${src.agent.name}`
                                           : (src.actor_id == null
                                               ? 'Hermes' : (src.actor?.name || '—')),
                                         author_color: src.agent
                                           ? (src.agent.color || '#818cf8')
                                           : (src.actor_id == null
                                               ? '#818cf8' : (src.actor?.color || '#888')),
                                         excerpt: String(src.content || '')
                                                   .replace(/\s+/g, ' ').slice(0, 120),
                                       })
                                     : undefined}
                                   onPin={() => togglePin(e.event_id)}
                                   onJumpToEvent={(eid) => {
                                     const el = document.getElementById(`thread-ev-${eid}`);
                                     if (!el) return;
                                     el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                     el.classList.add('ring-2', 'ring-violet-500');
                                     setTimeout(() => el.classList.remove('ring-2', 'ring-violet-500'), 1500);
                                   }}
                                   onEdit={thread.status !== 'done'
                                     ? editComment : undefined}
                                   onDelete={thread.status !== 'done'
                                     ? deleteComment : undefined} />
                  ));
                })()}
              </div>

              <div className="border-t border-[color:var(--border)]
                              px-3 md:px-4 py-2 bg-[color:var(--bg-1)]">
                {thread.status !== 'done' ? (
                  <ChatComposer
                    hint={`Tip: type @${'\u200B'}name to mention. Tag @hermes to ask Hermes for input.`}
                    onSend={postComment}
                    mentionUsers={mentionUsers}
                    replyingTo={replyTo ? {
                      id: replyTo.event_id,
                      author_name: replyTo.author_name,
                      author_color: replyTo.author_color,
                      content: replyTo.excerpt,
                    } : null}
                    onCancelReply={() => setReplyTo(null)}
                  />
                ) : (
                  <div className="text-[11px] theme-muted italic py-2">
                    Comments disabled — thread is closed.
                  </div>
                )}
                {err && <div className="text-[11px] text-red-400 mt-1">{err}</div>}
              </div>
            </section>
            </div>
          </>
        )}
      <ConfirmModal
        open={!!pending}
        title={pending?.title}
        description={pending?.description}
        confirmLabel={pending?.confirmLabel}
        variant={pending?.variant}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          const fn = pending?.run;
          setPending(null);
          if (typeof fn === 'function') await fn();
        }}
      />
    </div>
  );
}
