// LinkedThreadBar — shown above private ChatView. Two states:
//   1. Linked: banner with thread #N (clickable → open thread modal)
//             + small ✕ to clear link.
//   2. Unlinked: tiny picker over assigned-or-recent threads so user
//             can quick-link the conversation.
import { useState } from 'react';
import { api } from '../api.js';

export default function LinkedThreadBar({ chatId, linkedThreadId, assignedThreads = [], onOpenThread, onChanged }) {
  const [busy, setBusy] = useState(false);
  if (!chatId) return null;
  const toast = (kind, text) => window.dispatchEvent(
    new CustomEvent('nexcollab:toast', { detail: { kind, text } }),
  );

  async function setLink(threadId) {
    setBusy(true);
    try {
      await api(`/api/chats/${chatId}/link`, {
        method: 'POST',
        body: JSON.stringify({ thread_id: threadId }),
      });
      toast('success', threadId ? `Linked ke #${threadId}` : 'Link cleared');
      onChanged?.();
    } catch (e) {
      toast('error', 'Gagal: ' + (e.message || e));
    } finally { setBusy(false); }
  }

  if (linkedThreadId != null) {
    return (
      <div className="mb-2 flex items-center gap-2 text-[11px]">
        <button
          onClick={() => onOpenThread?.(linkedThreadId)}
          className="flex-1 text-left px-2.5 py-1.5 rounded-md
                     bg-[color:var(--accent)]/10 border border-[color:var(--accent)]/30
                     hover:bg-[color:var(--accent)]/20 flex items-center gap-2">
          <span>🔗</span>
          <span className="font-medium text-[color:var(--accent)]">
            Linked thread #{linkedThreadId}
          </span>
          <span className="theme-muted">· klik untuk buka</span>
        </button>
        <button onClick={() => setLink(null)} disabled={busy}
          title="Lepas link"
          className="text-[11px] theme-muted hover:opacity-80 px-2">✕</button>
      </div>
    );
  }
  if (assignedThreads.length === 0) return null;
  return (
    <div className="mb-2 flex items-center gap-2 text-[11px]">
      <span className="theme-muted">Link to assigned thread:</span>
      <select
        value="" disabled={busy}
        onChange={(e) => e.target.value && setLink(parseInt(e.target.value, 10))}
        className="theme-input text-[11px] py-0.5 px-1 flex-1">
        <option value="">— pilih thread —</option>
        {assignedThreads.map((t) => (
          <option key={t.id} value={t.id}>#{t.id} {t.title}</option>
        ))}
      </select>
    </div>
  );
}
