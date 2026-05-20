import { useEffect, useState } from 'react';
import { api, mdLite } from '../api.js';

export default function ShareModal({ message, onClose, onShared }) {
  const [headline, setHeadline] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setHeadline(''); setBusy(false); }, [message]);

  if (!message) return null;

  async function submit() {
    setBusy(true);
    try {
      await api(`/api/messages/${message.id}/share`, {
        method: 'POST',
        body: JSON.stringify({ note: headline.trim() || null }),
      });
      onShared();
    } finally { setBusy(false); }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-xl p-4">
        <div className="text-sm font-semibold mb-2">Send to Chat All</div>
        <div className="text-[11px] text-neutral-500 mb-3">
          Posting ke decision log project. Semua anggota akan lihat.
        </div>
        <div
          className="text-xs text-neutral-300 bg-neutral-950 border border-neutral-800 rounded-lg
                     p-2 mb-3 max-h-40 overflow-y-auto scrollbar"
          dangerouslySetInnerHTML={{ __html: mdLite(message.content) }}
        />
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Headline (opsional)"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm
                     mb-3 focus:outline-none focus:border-indigo-500/50"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-neutral-400 px-3 py-1.5">Batal</button>
          <button onClick={submit} disabled={busy}
            className="promote-btn text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
            {busy ? 'Posting…' : 'Posting'}
          </button>
        </div>
      </div>
    </div>
  );
}
