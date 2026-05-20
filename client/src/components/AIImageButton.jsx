import { useState } from 'react';

// Inline button + tiny popover prompt that calls /api/ai/image.
// On success, hands the resulting file (same shape as upload) to onResult.
export default function AIImageButton({ disabled, onResult }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function generate() {
    const p = prompt.trim();
    if (!p) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/ai/image', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.message || data.detail || 'failed');
        return;
      }
      onResult(data.file);
      setOpen(false); setPrompt('');
    } catch (e) {
      setErr(String(e.message || e));
    } finally { setBusy(false); }
  }

  return (
    <div className="relative">
      <button type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title="Generate image with AI"
        className="px-3 rounded-xl theme-input border text-sm
                   hover:opacity-80 disabled:opacity-50">
        ✨
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-72 p-3 z-30 theme-card rounded-lg shadow-lg">
          <div className="text-[11px] uppercase tracking-wider theme-muted mb-1.5">
            Generate image
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="A red cube on a wooden table…"
            className="w-full theme-input text-sm resize-none mb-2"
          />
          {err && <div className="text-[11px] text-red-400 mb-2">{err}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} type="button"
              className="text-xs theme-muted px-2 py-1">Cancel</button>
            <button onClick={generate} type="button"
              disabled={busy || !prompt.trim()}
              className="promote-btn text-white text-xs px-3 py-1 rounded-lg disabled:opacity-50">
              {busy ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
