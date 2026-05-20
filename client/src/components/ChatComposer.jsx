import { useEffect, useRef, useState } from 'react';

export default function ChatComposer({ hint, disabled, onSend }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const taRef = useRef(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [text]);

  async function submit(e) {
    e?.preventDefault?.();
    const v = text.trim();
    if (!v || busy || disabled) return;
    setBusy(true);
    setText('');
    try { await onSend(v); }
    finally { setBusy(false); taRef.current?.focus(); }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) submit(e);
  }

  return (
    <>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Tulis pesan… (Enter untuk kirim, Shift+Enter baris baru)"
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2
                     text-sm resize-none focus:outline-none focus:border-indigo-500/50"
        />
        <button
          type="submit"
          disabled={busy || disabled || !text.trim()}
          className="promote-btn text-white text-sm font-medium px-4 rounded-xl
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? '…' : 'Kirim'}
        </button>
      </form>
      {hint && <div className="text-[10px] text-neutral-600 mt-1 px-1">{hint}</div>}
    </>
  );
}
