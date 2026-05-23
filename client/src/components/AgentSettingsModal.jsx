// AgentSettingsModal — self-only edit of agent name, color, photo_url,
// system_prompt for the user's persona. Backed by PATCH /api/agents/:id.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

const PRESET_COLORS = [
  '#a78bfa', '#f472b6', '#34d399', '#fbbf24',
  '#60a5fa', '#f87171', '#22d3ee', '#fb923c',
];

const ROLE_LABEL = { pm: 'PM', ux: 'UX', dev: 'Dev', qa: 'QA' };

export default function AgentSettingsModal({ open, currentUserId, onClose, onSaved }) {
  const [agent, setAgent] = useState(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#888');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Load my agent on open. We fetch the full list and pick by owner_user_id —
  // agents endpoint is small (5 rows total) so this is cheap.
  useEffect(() => {
    if (!open) return;
    setErr('');
    setLoading(true);
    api('/api/agents')
      .then(({ agents }) => {
        const mine = (agents || []).find((a) => a.owner_user_id === currentUserId);
        if (!mine) { setErr('Agent kamu belum di-seed. Restart server / hubungi admin.'); return; }
        setAgent(mine);
        setName(mine.name || '');
        setColor(mine.color || '#888');
        setPhotoUrl(mine.photo_url || null);
        setSystemPrompt(mine.system_prompt || '');
      })
      .catch((e) => setErr('Gagal memuat agent: ' + (e.message || e)))
      .finally(() => setLoading(false));
  }, [open, currentUserId]);

  if (!open) return null;

  async function save() {
    if (!agent) return;
    const n = name.trim();
    if (!n) { setErr('Nama agent wajib diisi.'); return; }
    setBusy(true); setErr('');
    try {
      const { agent: updated } = await api(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: n,
          color,
          photo_url: photoUrl || null,
          system_prompt: systemPrompt,
        }),
      });
      window.dispatchEvent(new CustomEvent('nexcollab:toast', {
        detail: { kind: 'success', text: 'Agent tersimpan.' },
      }));
      onSaved?.(updated);
      onClose?.();
    } catch (e) {
      const msg = e?.message?.includes('bad_color') ? 'Warna tidak valid (#hex6).'
        : e?.message?.includes('name_required') ? 'Nama wajib diisi.'
        : ('Gagal: ' + (e.message || e));
      setErr(msg);
    } finally { setBusy(false); }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg theme-card rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-sm font-semibold">Agent settings</div>
          {agent && (
            <div className="text-[11px] theme-muted">
              {ROLE_LABEL[agent.role] || agent.role} · stages: {agent.allowed_stages.join(', ')}
            </div>
          )}
        </div>
        <div className="text-[11px] theme-muted mb-3">
          Edit nama, warna, dan persona. Role &amp; allowed_stages tidak bisa diubah.
        </div>

        {loading ? (
          <div className="theme-muted text-xs py-6 text-center">Memuat…</div>
        ) : !agent ? (
          <div className="text-xs text-rose-400 py-2">{err || 'Agent tidak ditemukan.'}</div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <Avatar
                photoUrl={photoUrl}
                letter={(name || agent.name || '?')[0]?.toUpperCase()}
                color={color}
                size={48}
              />
              <div className="text-[11px] theme-muted">
                Avatar: huruf depan nama. Photo URL opsional (mulai /uploads/).
              </div>
            </div>

            <label className="block text-[11px] theme-muted mb-1">Nama agent</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="w-full theme-input text-sm mb-3"
              placeholder="mis. Pimpi"
            />

            <label className="block text-[11px] theme-muted mb-1">Warna</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PRESET_COLORS.map((c) => (
                <button key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ background: c }}
                  aria-label={`color ${c}`}
                />
              ))}
              <input
                type="text" value={color} onChange={(e) => setColor(e.target.value)}
                className="theme-input text-xs w-24" placeholder="#a78bfa"
              />
            </div>

            <label className="block text-[11px] theme-muted mb-1">Photo URL (opsional)</label>
            <input
              value={photoUrl || ''} onChange={(e) => setPhotoUrl(e.target.value || null)}
              className="w-full theme-input text-sm mb-3"
              placeholder="/uploads/xxx.png"
            />

            <label className="block text-[11px] theme-muted mb-1">
              System prompt (persona)
            </label>
            <textarea
              value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8} maxLength={8000}
              className="w-full theme-input text-xs font-mono mb-1"
            />
            <div className="text-[10px] theme-muted mb-3">
              {systemPrompt.length}/8000. Stance-tag rules ditambahkan otomatis di server.
            </div>

            {err && <div className="text-xs text-rose-400 mb-2">{err}</div>}
          </>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="text-xs theme-muted px-3 py-1.5">Cancel</button>
          <button
            onClick={save} disabled={busy || !agent}
            className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white"
          >{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
