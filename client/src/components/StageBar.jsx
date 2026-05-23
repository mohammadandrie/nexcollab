// StageBar — compact stage indicator + dropdown for stage transitions.
// Lives in thread modal header. Replaces big ApprovalFooter at bottom.
// Simple flow: dropdown to change stage; if approval required and user
// has the right role + version concurrency holds, click moves the card.
import { useState } from 'react';
import { api } from '../api.js';

const STAGES = [
  { v: 'backlog', label: 'Backlog' },
  { v: 'open',    label: 'Open' },
  { v: 'uiux',    label: 'UI/UX' },
  { v: 'dev',     label: 'Dev' },
  { v: 'qa',      label: 'QA' },
  { v: 'pcheck',  label: 'P.Check' },
  { v: 'done',    label: 'Done' },
];

const STAGE_DOT = {
  backlog: 'bg-zinc-500', open: 'bg-violet-500', uiux: 'bg-pink-500',
  dev: 'bg-emerald-500', qa: 'bg-amber-500', pcheck: 'bg-sky-500', done: 'bg-zinc-700',
};

export default function StageBar({ thread, currentUser, onChanged }) {
  const [busy, setBusy] = useState(false);
  if (!thread) return null;
  const stage = thread.stage || 'backlog';
  const toast = (kind, text) => window.dispatchEvent(
    new CustomEvent('nexcollab:toast', { detail: { kind, text } }),
  );

  async function setStage(next) {
    if (next === stage || busy) return;
    setBusy(true);
    try {
      await api(`/api/threads/${thread.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: next, if_version: thread.version ?? 0 }),
      });
      toast('success', `Stage → ${next.toUpperCase()}`);
      onChanged?.();
    } catch (e) {
      const msg = (() => { try { return JSON.parse(e.message)?.detail; } catch { return null; } })();
      toast('error', msg === 'pm_only' ? 'Hanya PM yang bisa drag.'
        : msg === 'version_conflict' ? 'Card berubah, refresh.'
        : (e.message || 'Gagal.'));
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-2 h-2 rounded-full ${STAGE_DOT[stage] || 'bg-zinc-500'}`} />
      <select
        value={stage} onChange={(e) => setStage(e.target.value)}
        disabled={busy || currentUser?.role !== 'PM'}
        title={currentUser?.role === 'PM' ? 'Change stage' : 'PM only'}
        className="theme-input text-xs py-0.5 px-1.5 rounded">
        {STAGES.map((s) => (
          <option key={s.v} value={s.v}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}
