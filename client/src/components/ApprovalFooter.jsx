// ApprovalFooter — render stage-approval CTA at thread footer.
// Backed by POST /api/threads/:id/approve. Self-driven: fetches own
// state from `thread` prop. Shows tombol kalau user role match
// stage-approver dan belum approve. Toast on success/error.
import { useState } from 'react';
import { api } from '../api.js';

const STAGE_LABEL = {
  open: 'Open (PM)', uiux: 'UI/UX (UX)', dev: 'Dev (2x)',
  qa: 'QA', pcheck: 'P.Check (PM)',
};
const ROLE_FOR_STAGE = {
  open: 'PM', uiux: 'UX', dev: 'DEV', qa: 'QA', pcheck: 'PM',
};
const NEED = { open: 1, uiux: 1, dev: 2, qa: 1, pcheck: 1 };

export default function ApprovalFooter({ thread, currentUser, onApproved }) {
  const [busy, setBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  if (!thread) return null;
  const stage = thread.stage || 'backlog';
  if (stage === 'backlog' || stage === 'done') return null;

  const need = NEED[stage] ?? 1;
  const expected = ROLE_FOR_STAGE[stage];
  const myRole = currentUser?.role;
  const myId = currentUser?.id ?? currentUser?._id;
  const stageApprovals = (thread.approvals || []).filter((a) => a.stage === stage);
  const have = new Set(stageApprovals.map((a) => a.user_id)).size;
  const alreadyMine = stageApprovals.some((a) => a.user_id === myId);

  const canApprove = myRole === expected && !alreadyMine;
  const toast = (kind, text) => window.dispatchEvent(
    new CustomEvent('nexcollab:toast', { detail: { kind, text } }),
  );

  async function runAgents() {
    setRunBusy(true);
    try {
      await api(`/api/threads/${thread.id}/run`, { method: 'POST' });
      toast('info', 'Agent diskusi dimulai…');
      // Poll a few times so user sees the result without manual refresh.
      for (let i = 0; i < 10; i += 1) {
        await new Promise((r) => setTimeout(r, 3000));
        onApproved?.({ poll: true });
      }
    } catch (e) {
      toast('error', 'Gagal start agent: ' + (e.message || e));
    } finally { setRunBusy(false); }
  }

  async function approve() {
    setBusy(true);
    try {
      const r = await api(`/api/threads/${thread.id}/approve`, { method: 'POST' });
      toast('success', r.advanced ? `Maju ke ${r.stage.toUpperCase()}` : `Approval ${r.approvals_have}/${r.approvals_need}`);
      onApproved?.(r);
    } catch (e) {
      const d = (() => { try { return JSON.parse(e.message)?.detail; } catch { return null; } })();
      toast('error', d === 'wrong_role' ? `Hanya ${expected} yang bisa approve.`
        : d === 'already_approved' ? 'Sudah approve.'
        : (e.message || 'Gagal.'));
    } finally { setBusy(false); }
  }

  return (
    <div className="px-3 py-2 border-t theme-border flex items-center gap-2 text-xs">
      <span className="theme-muted">Stage:</span>
      <span className="font-medium">{STAGE_LABEL[stage] || stage}</span>
      <span className="theme-muted">·</span>
      <span>Approve {have}/{need}</span>
      {thread.deal_state?.status && thread.deal_state.status !== 'idle' && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
          thread.deal_state.status === 'deal' ? 'bg-emerald-500/20 text-emerald-300' :
          thread.deal_state.status === 'stuck' ? 'bg-rose-500/20 text-rose-300' :
          thread.deal_state.status === 'running' ? 'bg-amber-500/20 text-amber-300 animate-pulse' :
          'bg-zinc-500/20 text-zinc-300'
        }`}>{thread.deal_state.status}</span>
      )}
      <div className="ml-auto flex gap-2">
        <button onClick={runAgents} disabled={runBusy}
          title="Trigger agent discussion until DEAL or STUCK"
          className="px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] disabled:opacity-50">
          {runBusy ? '🤖 running…' : '🤖 Run agents'}
        </button>
        {canApprove ? (
          <button onClick={approve} disabled={busy}
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
            {busy ? 'Approving…' : `✓ Approve ${expected}`}
          </button>
        ) : alreadyMine ? (
          <span className="text-emerald-400">✓ kamu sudah approve</span>
        ) : (
          <span className="theme-muted">Menunggu {expected}</span>
        )}
      </div>
    </div>
  );
}
