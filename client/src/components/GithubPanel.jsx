import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Shows the last 15 commits for a project's configured repo+branch.
export default function GithubPanel({ project }) {
  const [commits, setCommits] = useState([]);
  const [status, setStatus] = useState('idle'); // idle|loading|ok|err
  const [err, setErr] = useState('');

  const repo = (project?.github_repo || '').trim();
  const branch = (project?.github_branch || '').trim();

  useEffect(() => {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      setStatus('idle'); setCommits([]); return;
    }
    let cancel = false;
    setStatus('loading'); setErr('');
    const qs = new URLSearchParams({ repo });
    if (branch) qs.set('branch', branch);
    api(`/api/github/commits?${qs}`)
      .then((d) => { if (!cancel) { setCommits(d.commits); setStatus('ok'); } })
      .catch((e) => {
        if (cancel) return;
        setStatus('err');
        try { setErr(JSON.parse(e.message).detail || 'fetch_failed'); }
        catch { setErr('fetch_failed'); }
      });
    return () => { cancel = true; };
  }, [repo, branch]);

  if (status === 'idle') return null;

  return (
    <div className="theme-panel rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider theme-muted">
          Recent commits
        </div>
        <a href={`https://github.com/${repo}/commits/${branch || 'HEAD'}`}
           target="_blank" rel="noreferrer"
           className="text-[10px] theme-muted hover:opacity-80">
          {repo}{branch ? ` · ${branch}` : ''} ↗
        </a>
      </div>
      {status === 'loading' && (
        <div className="text-[11px] theme-muted">Loading…</div>
      )}
      {status === 'err' && (
        <div className="text-[11px] text-red-400">
          {err === 'repo_not_found' ? 'Repo not found or private' :
           err === 'rate_limited' ? 'GitHub rate limit reached' : err}
        </div>
      )}
      {status === 'ok' && commits.length === 0 && (
        <div className="text-[11px] theme-muted italic">No commits yet.</div>
      )}
      {status === 'ok' && commits.map((c) => (
        <a key={c.sha} href={c.url} target="_blank" rel="noreferrer"
           className="flex items-start gap-2 py-1.5 text-xs hover:opacity-80
                      border-t border-[color:var(--border)] first:border-t-0">
          <code className="text-[10px] theme-muted flex-shrink-0 mt-0.5">
            {c.short_sha}
          </code>
          <div className="min-w-0 flex-1">
            <div className="truncate">{c.message}</div>
            <div className="text-[10px] theme-muted">
              {c.author}{c.date ? ` · ${new Date(c.date).toLocaleDateString()}` : ''}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
