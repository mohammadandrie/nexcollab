// ThreadActionsMenu — shared "⋯" dropdown with Edit Title + Delete.
// Mounted di ThreadCard (kanban) + ThreadDetailModal header.
// Title edit pakai window.prompt untuk simplicity (tetap bekerja di mobile);
// pemanggil bisa ganti dengan inline editor kalau perlu.
import { useEffect, useRef, useState } from 'react';

export default function ThreadActionsMenu({ threadId, title, canEdit, canDelete, onTitleSaved, onDeleted, size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  if (!canEdit && !canDelete) return null;

  const stop = (fn) => (e) => { e.stopPropagation(); e.preventDefault(); fn(); };

  async function editTitle() {
    setOpen(false);
    const next = window.prompt('Edit title:', title || '');
    if (next == null) return;
    const t = next.trim();
    if (!t || t === title) return;
    try {
      const r = await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      window.dispatchEvent(new CustomEvent('nexcollab:toast',
        { detail: { kind: 'success', text: 'Title updated' } }));
      onTitleSaved?.(t);
    } catch (e) {
      window.dispatchEvent(new CustomEvent('nexcollab:toast',
        { detail: { kind: 'error', text: 'Gagal update title: ' + e.message } }));
    }
  }
  async function del() {
    setOpen(false);
    if (!window.confirm(`Hapus thread #${threadId}? Aksi ini tidak bisa dibatalkan.`)) return;
    try {
      const r = await fetch(`/api/threads/${threadId}`, {
        method: 'DELETE', credentials: 'same-origin',
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      window.dispatchEvent(new CustomEvent('nexcollab:toast',
        { detail: { kind: 'success', text: `Thread #${threadId} dihapus` } }));
      onDeleted?.();
    } catch (e) {
      window.dispatchEvent(new CustomEvent('nexcollab:toast',
        { detail: { kind: 'error', text: 'Gagal hapus: ' + e.message } }));
    }
  }

  const btnSize = size === 'lg' ? 'text-sm w-8 h-8' : 'text-[11px] w-6 h-6';
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button onClick={stop(() => setOpen((v) => !v))} aria-label="Thread actions"
              className={`${btnSize} rounded inline-flex items-center justify-center
                          theme-muted hover:bg-[color:var(--border)]`}>⋯</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px]
                        theme-card rounded-md shadow-lg border theme-border py-1">
          {canEdit && (
            <button onClick={stop(editTitle)}
              className="w-full text-left text-xs px-3 py-1.5 hover:bg-[color:var(--border)]">
              ✏ Edit title
            </button>
          )}
          {canDelete && (
            <button onClick={stop(del)}
              className="w-full text-left text-xs px-3 py-1.5 hover:bg-[color:var(--border)]
                         text-rose-400">
              🗑 Delete thread
            </button>
          )}
        </div>
      )}
    </div>
  );
}
