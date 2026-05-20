import { useEffect, useState } from 'react';
import { api } from '../api.js';

const PRESET_COLORS = [
  '#a78bfa', '#f472b6', '#34d399', '#fbbf24',
  '#60a5fa', '#f87171', '#22d3ee', '#fb923c',
];

export default function ProfileModal({ open, user, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [letter, setLetter] = useState('');
  const [color, setColor] = useState('#888');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open && user) {
      setName(user.name || '');
      setLetter(user.avatar_letter || '');
      setColor(user.color || '#888');
      setErr('');
    }
  }, [open, user]);

  if (!open) return null;

  async function save() {
    const n = name.trim();
    const l = letter.trim().slice(0, 2);
    if (!n) { setErr('Nama wajib diisi.'); return; }
    setBusy(true); setErr('');
    try {
      const { user: updated } = await api('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: n, avatar_letter: l, color }),
      });
      onSaved(updated);
    } catch (e) {
      setErr('Failed: ' + (e.message || e));
    } finally { setBusy(false); }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-xl p-4">
        <div className="text-sm font-semibold mb-1">Your profile</div>
        <div className="text-[11px] theme-muted mb-3">
          Edit display name, avatar letter, and color. Username is read-only.
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold"
            style={{ background: color + '22', color, border: `1px solid ${color}55` }}>
            {letter || '?'}
          </div>
          <div className="text-[11px] text-neutral-500">
            preview · @{user?.username}
          </div>
        </div>

        <label className="text-[11px] theme-muted">Display name</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-3
                     focus:outline-none focus:border-indigo-500/50" />

        <label className="text-[11px] theme-muted">Avatar letter (1–2 chars / emoji)</label>
        <input value={letter} onChange={(e) => setLetter(e.target.value)}
          maxLength={2}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-3
                     focus:outline-none focus:border-indigo-500/50" />

        <label className="text-[11px] theme-muted block mb-1">Color</label>
        <div className="flex gap-2 flex-wrap mb-3">
          {PRESET_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full ${
                color === c ? 'ring-2 ring-white/70' : ''
              }`} style={{ background: c }} />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            className="w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer" />
        </div>

        {err && <div className="text-[11px] text-red-400 mb-2">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs theme-muted px-3 py-1.5">Cancel</button>
          <button onClick={save} disabled={busy}
            className="promote-btn text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
