import { useEffect, useState } from 'react';
import { api, mdLite } from '../api.js';

export default function ShareModal({ message, projectId, onClose, onShared }) {
  const [headline, setHeadline] = useState('');
  const [category, setCategory] = useState('Request');
  const [customCat, setCustomCat] = useState('');
  const [customCategories, setCustomCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setHeadline(''); setBusy(false); setErr('');
    setCategory('Request'); setCustomCat('');
  }, [message]);

  // Pull live custom categories from the server whenever the modal opens for
  // a project. Falls back to empty array on error.
  useEffect(() => {
    if (!message || !projectId) { setCustomCategories([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { categories } = await api(`/api/projects/${projectId}/categories`);
        if (!cancelled) setCustomCategories(categories || []);
      } catch { if (!cancelled) setCustomCategories([]); }
    })();
    return () => { cancelled = true; };
  }, [message, projectId]);

  if (!message) return null;

  // Built-in + per-project custom categories. "Other" stays as a reveal trigger
  // so users can name a new category, which is then saved on submit.
  const presets = ['Request', 'Bug', ...customCategories];

  async function submit() {
    const h = headline.trim();
    if (!h) { setErr('Headline wajib diisi.'); return; }
    let cat = category;
    if (cat === 'Other') {
      cat = customCat.trim();
      if (!cat) { setErr('Custom category wajib diisi.'); return; }
    }
    setBusy(true); setErr('');
    try {
      await api(`/api/messages/${message.id}/share`, {
        method: 'POST',
        body: JSON.stringify({ note: h, category: cat }),
      });
      // Persist custom category to the server so it's shared cross-device and
      // cross-user within the project. Idempotent: server dedupes case-insensitively.
      if (projectId && !['Request', 'Bug'].includes(cat)) {
        try {
          await api(`/api/projects/${projectId}/categories`, {
            method: 'POST', body: JSON.stringify({ name: cat }),
          });
        } catch {}
      }
      onShared();
    } catch (e) {
      setErr('Gagal posting: ' + (e.message || e));
    } finally { setBusy(false); }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md theme-card rounded-xl p-4">
        <div className="text-sm font-semibold mb-2">Send to Chat All</div>
        <div className="text-[11px] theme-muted mb-3">
          Posting to the project decision log. All members will see this.
        </div>
        <div
          className="text-xs text-neutral-300 bg-neutral-950 border border-neutral-800 rounded-lg
                     p-2 mb-3 max-h-40 overflow-y-auto scrollbar"
          dangerouslySetInnerHTML={{ __html: mdLite(message.content) }}
        />
        <label className="text-[11px] theme-muted">Headline <span className="text-red-400">*</span></label>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Ringkas dalam 1 baris (wajib)"
          maxLength={200}
          autoFocus
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm
                     mt-1 mb-2 focus:outline-none focus:border-indigo-500/50"
        />
        <label className="text-[11px] theme-muted">Category <span className="text-red-400">*</span></label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm
                     mt-1 mb-2 focus:outline-none focus:border-indigo-500/50">
          {presets.map((c) => (<option key={c} value={c}>{c}</option>))}
          <option value="Other">Other (custom…)</option>
        </select>
        {category === 'Other' && (
          <input
            value={customCat}
            onChange={(e) => setCustomCat(e.target.value)}
            placeholder="Nama category baru (mis. Design, Spec, Idea)"
            maxLength={60}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm
                       mt-1 mb-2 focus:outline-none focus:border-indigo-500/50"
          />
        )}
        {err && <div className="text-[11px] text-red-400 mb-2">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs theme-muted px-3 py-1.5">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="promote-btn text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
            {busy ? 'Posting…' : 'Posting'}
          </button>
        </div>
      </div>
    </div>
  );
}
