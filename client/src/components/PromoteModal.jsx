// Modal opened from a Private message bubble's "Promote to thread" action.
// Stage 1: create new thread (no "append to existing" yet — Stage 3 adds that).
import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function PromoteModal({ message, projectId, assignedThreads = [], onClose, onPromoted }) {
  // Default to 'append' if the caller already has assigned threads (the new
  // "↪ Append to thread" entry point). Falls back to 'new' otherwise.
  const [mode, setMode] = useState(assignedThreads.length > 0 ? 'append' : 'new');
  const [appendThreadId, setAppendThreadId] = useState(
    assignedThreads.length === 1 ? assignedThreads[0].id : null,
  );
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!message) return;
    const txt = String(message.content || '').replace(/\s+/g, ' ').trim();
    setTitle(txt.slice(0, 80));
    setDesc(message.content || '');
    setErr('');
  }, [message]);

  if (!message) return null;

  async function submit() {
    if (!projectId) { setErr('No active project.'); return; }
    setBusy(true); setErr('');
    try {
      if (mode === 'append') {
        if (!appendThreadId) { setErr('Pick a thread to append to.'); setBusy(false); return; }
        const content = String(message.content || '').trim();
        if (!content) { setErr('Empty message.'); setBusy(false); return; }
        await api(`/api/threads/${appendThreadId}/promote-update`, {
          method: 'POST',
          body: JSON.stringify({
            content,
            source_msg_id: typeof message.id === 'number' ? message.id : null,
          }),
        });
        onPromoted?.({ id: appendThreadId });
      } else {
        const t = title.trim();
        if (!t) { setErr('Title is required.'); setBusy(false); return; }
        const { thread } = await api('/api/threads', {
          method: 'POST',
          body: JSON.stringify({
            project_id: projectId,
            source_msg_id: typeof message.id === 'number' ? message.id : null,
            title: t,
            description: desc,
          }),
        });
        onPromoted?.(thread);
      }
      onClose();
    } catch (e) {
      setErr('Failed: ' + (e.message || e));
    } finally { setBusy(false); }
  }

  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()}
         className="fixed inset-0 z-50 flex items-center justify-center px-4"
         style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg theme-card rounded-xl p-4">
        <div className="text-sm font-semibold mb-1">🧵 Promote to thread</div>
        <div className="text-[11px] theme-muted mb-3">
          {mode === 'new'
            ? 'Create a new Chat All thread from this message.'
            : 'Append this message as an update to an existing thread.'}
        </div>

        <div className="flex gap-1 mb-3 text-[11px]">
          <button type="button" onClick={() => setMode('new')}
                  className={`px-2 py-1 rounded transition-colors ${
                    mode === 'new' ? 'bg-[color:var(--accent)]/15 text-[color:var(--fg)]'
                                   : 'theme-muted hover:opacity-80'
                  }`}>
            ➕ New thread
          </button>
          <button type="button" onClick={() => setMode('append')}
                  disabled={assignedThreads.length === 0}
                  title={assignedThreads.length === 0 ? 'No threads assigned to you' : ''}
                  className={`px-2 py-1 rounded transition-colors disabled:opacity-40 ${
                    mode === 'append' ? 'bg-[color:var(--accent)]/15 text-[color:var(--fg)]'
                                      : 'theme-muted hover:opacity-80'
                  }`}>
            ↪ Append to assigned
          </button>
        </div>

        {mode === 'append' ? (
          <>
            <label className="text-[11px] theme-muted">Append to thread</label>
            <select value={appendThreadId ?? ''}
                    onChange={(e) => setAppendThreadId(e.target.value ? parseInt(e.target.value, 10) : null)}
                    className="w-full theme-input text-sm mb-3">
              <option value="">— pick a thread —</option>
              {assignedThreads.map((t) => (
                <option key={t.id} value={t.id}>#{t.id} {t.title}</option>
              ))}
            </select>
            <label className="text-[11px] theme-muted">Update content (from message)</label>
            <div className="theme-input text-sm mb-3 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {message.content || <span className="theme-muted">(empty)</span>}
            </div>
          </>
        ) : (
          <>
            <label className="text-[11px] theme-muted">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
                   maxLength={200}
                   className="w-full theme-input text-sm mb-3" />

            <label className="text-[11px] theme-muted">Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)}
                      rows={5} maxLength={4000}
                      className="w-full theme-input text-sm mb-3 resize-y" />
          </>
        )}

        {err && <div className="text-[11px] text-red-400 mb-2">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs theme-muted px-3 py-1.5">Cancel</button>
          <button onClick={submit} disabled={busy}
                  className="promote-btn text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
            {busy ? 'Creating…' : 'Create thread'}
          </button>
        </div>
      </div>
    </div>
  );
}
