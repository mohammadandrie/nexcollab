// Kanban board: 7 columns rendered from GET /api/projects/:id/board.
// Read in Fase 2; drag-to-stage for PM via POST /api/threads/:id/stage.
import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import ThreadCard from './ThreadCard.jsx';

const COLS = [
  { key: 'backlog', label: 'Backlog', sub: 'draft' },
  { key: 'open',    label: 'Open',    sub: 'PM' },
  { key: 'uiux',    label: 'UI/UX',   sub: 'UX' },
  { key: 'dev',     label: 'Dev',     sub: 'Dev' },
  { key: 'qa',      label: 'QA',      sub: 'QA' },
  { key: 'pcheck',  label: 'P.Check', sub: 'PM' },
  { key: 'done',    label: 'Done',    sub: '✓' },
];

export default function KanbanBoard({ projectId, currentUser, onOpenThread }) {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [dropOver, setDropOver] = useState(null);

  const isPM = currentUser?.role === 'PM';

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const r = await api(`/projects/${projectId}/board`);
      setBoard(r);
    } catch (e) {
      window.dispatchEvent(new CustomEvent('nexcollab:toast', {
        detail: { kind: 'error', text: `Gagal memuat board: ${e.message || e}` },
      }));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Refresh on cross-tab thread mutations.
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener('nexcollab:threads-changed', onChange);
    return () => window.removeEventListener('nexcollab:threads-changed', onChange);
  }, [load]);

  const handleDrop = useCallback(async (stage) => {
    if (!isPM || !dragId) return;
    const card = Object.values(board?.columns || {}).flat().find((c) => c.id === dragId);
    if (!card || card.stage === stage) { setDragId(null); setDropOver(null); return; }
    try {
      await api(`/threads/${dragId}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage, if_version: card.version ?? 0 }),
      });
      window.dispatchEvent(new CustomEvent('nexcollab:toast', {
        detail: { kind: 'success', text: `Pindah ke ${stage.toUpperCase()}` },
      }));
      load();
    } catch (e) {
      const msg = e?.detail === 'version_conflict'
        ? 'Card sudah berubah, refresh dulu.'
        : (e?.detail === 'pm_only' ? 'Drag hanya untuk PM.' : (e.message || 'Gagal.'));
      window.dispatchEvent(new CustomEvent('nexcollab:toast', {
        detail: { kind: 'error', text: msg },
      }));
    } finally {
      setDragId(null);
      setDropOver(null);
    }
  }, [isPM, dragId, board, load]);

  if (loading && !board) {
    return <div className="p-4 theme-muted">Memuat board…</div>;
  }
  if (!board) return null;

  return (
    <div className="flex-1 min-h-0 overflow-x-auto">
      <div className="flex gap-3 p-3 h-full min-w-max">
        {COLS.map((col) => {
          const cards = board.columns[col.key] || [];
          const isOver = dropOver === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (isPM) { e.preventDefault(); setDropOver(col.key); } }}
              onDragLeave={() => setDropOver((s) => (s === col.key ? null : s))}
              onDrop={() => handleDrop(col.key)}
              className={`w-64 shrink-0 flex flex-col theme-surface theme-border border rounded-lg ${
                isOver ? 'ring-2 ring-violet-500/60' : ''
              }`}
            >
              <div className="px-2 py-2 border-b theme-border flex items-baseline justify-between">
                <div>
                  <div className="text-sm font-semibold">{col.label}</div>
                  <div className="text-[10px] theme-muted uppercase tracking-wide">{col.sub}</div>
                </div>
                <span className="text-xs theme-muted">{cards.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {cards.length === 0 ? (
                  <div className="text-[11px] theme-muted text-center pt-4 select-none">—</div>
                ) : (
                  cards.map((c) => (
                    <ThreadCard
                      key={c.id}
                      card={c}
                      draggable={isPM}
                      onDragStart={() => setDragId(c.id)}
                      onOpen={onOpenThread}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
