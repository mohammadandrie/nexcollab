import { useEffect, useState } from 'react';
import { api } from '../api.js';
import BranchSelector from './BranchSelector.jsx';

export default function ProjectSettingsModal({ open, project, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && project) {
      setName(project.name || '');
      setDesc(project.description || '');
      setRepo(project.github_repo || '');
      setBranch(project.github_branch || '');
      setErr(''); setConfirmDelete(false);
    }
  }, [open, project]);

  if (!open || !project) return null;

  async function save() {
    const n = name.trim();
    if (!n) { setErr('Project name is required.'); return; }
    setBusy(true); setErr('');
    try {
      const { project: updated } = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: n, description: desc.trim(),
          github_repo: repo.trim(), github_branch: branch.trim(),
        }),
      });
      onSaved(updated);
    } catch (e) {
      setErr('Gagal: ' + (e.message || e));
    } finally { setBusy(false); }
  }

  async function doDelete() {
    setBusy(true); setErr('');
    try {
      await api(`/api/projects/${project.id}`, { method: 'DELETE' });
      onDeleted(project.id);
    } catch (e) {
      setErr('Delete failed: ' + (e.message || e));
    } finally { setBusy(false); }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md theme-card rounded-xl p-4">
        <div className="text-sm font-semibold mb-3">Project settings</div>

        <label className="text-[11px] theme-muted">Project name</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-3
                     focus:outline-none focus:border-indigo-500/50" />

        <label className="text-[11px] theme-muted">Description</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm
                     resize-none mb-3 focus:outline-none focus:border-indigo-500/50" />

        <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5">GitHub</div>
        <label className="text-[11px] text-neutral-500">Repository (owner/repo)</label>
        <input value={repo} onChange={(e) => setRepo(e.target.value)}
          placeholder="mohammadandrie/nexcollab"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-2
                     focus:outline-none focus:border-indigo-500/50" />
        <label className="text-[11px] theme-muted">Branch</label>
        <BranchSelector repo={repo} branch={branch} onChange={setBranch} disabled={busy} />
        <div className="h-3" />

        {err && <div className="text-[11px] text-red-400 mb-2">{err}</div>}

        <div className="flex justify-between items-center gap-2 pt-2 border-t border-neutral-800">
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-[11px] text-red-300">
              Confirm? <button onClick={doDelete} disabled={busy}
                className="text-red-400 underline">delete permanently</button>
              <button onClick={() => setConfirmDelete(false)}
                className="theme-muted">cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="text-[11px] text-red-400 hover:text-red-300">
              Delete project
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs theme-muted px-3 py-1.5">Close</button>
            <button onClick={save} disabled={busy}
              className="promote-btn text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
