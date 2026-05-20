import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import BranchSelector from './BranchSelector.jsx';

export default function CreateProjectModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(''); setDesc(''); setRepo(''); setBranch('');
      setErr(''); setBusy(false);
      setTimeout(() => nameRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    const n = name.trim();
    if (!n) { setErr('Project name is required.'); return; }
    setBusy(true); setErr('');
    try {
      const { project_id } = await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: n, description: desc.trim(),
          github_repo: repo.trim(), github_branch: branch.trim(),
        }),
      });
      onCreated(project_id);
    } catch (e) {
      setErr('Failed: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md theme-card rounded-xl p-4">
        <div className="text-sm font-semibold mb-1">New project</div>
        <div className="text-[11px] theme-muted mb-3">
          Each team member will get a private chat plus one shared Chat All.
        </div>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Project name"
          className="w-full theme-input text-sm mb-2"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          placeholder="Short description (optional)"
          className="w-full theme-input text-sm resize-none mb-3"
        />

        <div className="text-[11px] uppercase tracking-wider theme-muted mb-1.5">
          GitHub (optional)
        </div>
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repo (e.g. mohammadandrie/nexcollab)"
          className="w-full theme-input text-sm mb-2"
        />
        <BranchSelector repo={repo} branch={branch} onChange={setBranch} disabled={busy} />
        <div className="h-3" />
        {err && <div className="text-[11px] text-red-400 mb-2">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="text-xs theme-muted px-3 py-1.5">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="promote-btn text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
