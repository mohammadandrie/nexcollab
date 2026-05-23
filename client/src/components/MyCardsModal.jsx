// MyCardsModal — global inbox of cards waiting on this user across
// all projects. Backed by GET /api/my-cards. Click a card → switch to
// that project's Chat All and open thread modal.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const STAGE_LABEL = {
  open: 'Open (PM)', uiux: 'UI/UX', dev: 'Dev',
  qa: 'QA', pcheck: 'P.Check',
};

export default function MyCardsModal({ open, onClose, onPickCard }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true); setErr('');
    api('/api/my-cards')
      .then((r) => setItems(r.items || []))
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md theme-card rounded-xl p-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">📥 My cards</div>
          <button onClick={onClose} className="theme-muted text-xs px-2">✕</button>
        </div>
        <div className="text-[11px] theme-muted mb-3">
          Cards menunggu approval kamu, semua project.
        </div>
        {loading && <div className="theme-muted text-xs py-6 text-center">Memuat…</div>}
        {err && <div className="text-xs text-rose-400 py-2">{err}</div>}
        {!loading && !err && items.length === 0 && (
          <div className="theme-muted text-xs py-6 text-center">
            Tidak ada card menunggu kamu. 🎉
          </div>
        )}
        <div className="overflow-y-auto flex-1 space-y-2">
          {items.map((it) => (
            <button key={it.id}
              onClick={() => { onPickCard?.(it); onClose?.(); }}
              className="w-full text-left theme-surface theme-border border rounded-md p-2
                         hover:border-violet-500/60 transition-colors">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-wide theme-muted">
                  {STAGE_LABEL[it.stage] || it.stage}
                </span>
                {it.deal_status && it.deal_status !== 'idle' && (
                  <span className={`text-[10px] px-1.5 rounded ${
                    it.deal_status === 'deal' ? 'bg-emerald-500/20 text-emerald-300' :
                    it.deal_status === 'stuck' ? 'bg-rose-500/20 text-rose-300' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>{it.deal_status}</span>
                )}
                <span className="ml-auto text-[10px] theme-muted">#{it.id}</span>
              </div>
              <div className="text-sm mt-1 truncate">{it.title}</div>
              <div className="text-[10px] theme-muted mt-1">project {it.project_id}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
