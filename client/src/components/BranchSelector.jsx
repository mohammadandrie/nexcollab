import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Auto-fetches branches once `repo` matches owner/name; dropdown otherwise.
export default function BranchSelector({ repo, branch, onChange, disabled }) {
  const [branches, setBranches] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | ok | err
  const [err, setErr] = useState('');

  useEffect(() => {
    setBranches([]); setStatus('idle'); setErr('');
    const r = (repo || '').trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(r)) return;

    let cancel = false;
    setStatus('loading');
    api(`/api/github/branches?repo=${encodeURIComponent(r)}`)
      .then((d) => {
        if (cancel) return;
        setBranches(d.branches);
        setStatus('ok');
        // Auto-pick default if current selection is empty or stale.
        const names = d.branches.map((b) => b.name);
        if (!branch || !names.includes(branch)) {
          onChange(names.includes('main') ? 'main' : (names[0] || ''));
        }
      })
      .catch((e) => {
        if (cancel) return;
        setStatus('err');
        try { setErr(JSON.parse(e.message).detail || 'fetch_failed'); }
        catch { setErr('fetch_failed'); }
      });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  if (status === 'idle') {
    return <input value={branch} onChange={(e) => onChange(e.target.value)}
      disabled={disabled} placeholder="main"
      className="w-full theme-input text-sm" />;
  }
  if (status === 'loading') {
    return <div className="text-[11px] text-neutral-500 italic px-3 py-2">
      Loading branches…</div>;
  }
  if (status === 'err') {
    return <div className="text-[11px] text-red-400 px-3 py-2">
      Failed: {err === 'repo_not_found' ? 'repo not found or private' :
               err === 'rate_limited' ? 'GitHub rate limit reached' : err}
    </div>;
  }
  return (
    <select value={branch} onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full theme-input text-sm">
      {branches.map((b) => (
        <option key={b.name} value={b.name}>{b.name}</option>
      ))}
    </select>
  );
}
