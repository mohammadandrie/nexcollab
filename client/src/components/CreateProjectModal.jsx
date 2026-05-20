import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function CreateProjectModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(''); setDesc(''); setErr(''); setBusy(false);
      setTimeout(() => nameRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    const n = name.trim();
    if (!n) { setErr('Nama project wajib diisi.'); return; }
    setBusy(true); setErr('');
    try {
      const { project_id } = await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: n, description: desc.trim() }),
      });
      onCreated(project_id);
    } catch (e) {
      setErr('Gagal: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-xl p-4">
        <div className="text-sm font-semibold mb-1">Project baru</div>
        <div className="text-[11px] text-neutral-500 mb-3">
          Setiap anggota tim dapat Chat Pribadi sendiri di sini, plus satu Chat All bersama.
        </div>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Nama project"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm
                     mb-2 focus:outline-none focus:border-indigo-500/50"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          placeholder="Deskripsi singkat (opsional)"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm
                     resize-none mb-3 focus:outline-none focus:border-indigo-500/50"
        />
        {err && <div className="text-[11px] text-red-400 mb-2">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="text-xs text-neutral-400 px-3 py-1.5">Batal</button>
          <button onClick={submit} disabled={busy}
            className="promote-btn text-white text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
            {busy ? 'Membuat…' : 'Buat'}
          </button>
        </div>
      </div>
    </div>
  );
}
