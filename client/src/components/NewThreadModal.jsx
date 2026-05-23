// NewThreadModal — manual thread creation from kanban column.
// Backed by POST /api/threads (extended in earlier patch to accept
// stage + assignee_id). Title required, others optional.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const STAGE_LABEL = {
  backlog: 'Backlog', open: 'Open (PM)', uiux: 'UI/UX',
  dev: 'Dev', qa: 'QA', pcheck: 'P.Check', done: 'Done',
};

export default function NewThreadModal({ open, projectId, defaultStage, members = [], onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stage, setStage] = useState(defaultStage || 'open');
  const [assigneeId, setAssigneeId] = useState('');
  const [category, setCategory] = useState('Other');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(''); setDescription(''); setStage(defaultStage || 'open');
      setAssigneeId(''); setCategory('Other'); setErr('');
    }
  }, [open, defaultStage]);

  if (!open) return null;

  async function save() {
    const t = title.trim();
    if (!t) { setErr('Title wajib diisi.'); return; }
    if (!projectId) { setErr('Project belum dipilih.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api('/api/threads', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId, title: t, description: description.trim(),
          stage, category,
          assignee_id: assigneeId ? parseInt(assigneeId, 10) : null,
        }),
      });
      window.dispatchEvent(new CustomEvent('nexcollab:toast', {
        detail: { kind: 'success', text: `Thread #${r.thread.id} dibuat di ${stage.toUpperCase()}` },
      }));
      onCreated?.(r.thread);
      onClose?.();
    } catch (e) {
      setErr(e.message || 'Gagal membuat thread.');
    } finally { setBusy(false); }
  }

  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose?.()}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md theme-card rounded-xl p-4">
        <div className="text-sm font-semibold mb-1">+ New thread</div>
        <div className="text-[11px] theme-muted mb-3">
          Card baru di kolom {STAGE_LABEL[stage] || stage}.
        </div>

        <label className="block text-[11px] theme-muted mb-1">Title *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          maxLength={200} autoFocus
          className="w-full theme-input text-sm mb-3" placeholder="mis. Wireframe login flow" />

        <label className="block text-[11px] theme-muted mb-1">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          rows={4} maxLength={4000}
          className="w-full theme-input text-xs mb-3" placeholder="Brief / context awal (optional)" />

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="block text-[11px] theme-muted mb-1">Stage</label>
            <select value={stage} onChange={(e) => setStage(e.target.value)}
              className="w-full theme-input text-sm">
              {Object.entries(STAGE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[11px] theme-muted mb-1">Assignee</label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full theme-input text-sm">
              <option value="">— unassigned —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
              ))}
            </select>
          </div>
        </div>

        <label className="block text-[11px] theme-muted mb-1">Category</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)}
          maxLength={60}
          className="w-full theme-input text-sm mb-3" placeholder="Other / Bug / Feature / dst" />

        {err && <div className="text-xs text-rose-400 mb-2">{err}</div>}

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="text-xs theme-muted px-3 py-1.5">Cancel</button>
          <button onClick={save} disabled={busy}
            className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white">
            {busy ? 'Creating…' : 'Create thread'}
          </button>
        </div>
      </div>
    </div>
  );
}
