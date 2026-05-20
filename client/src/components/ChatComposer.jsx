import { useEffect, useRef, useState } from 'react';
import MentionAutocomplete from './MentionAutocomplete.jsx';

export default function ChatComposer({ hint, disabled, onSend, mentionUsers = [] }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState(null); // {start, query} | null
  const [mentionIdx, setMentionIdx] = useState(0);
  const taRef = useRef(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [text]);

  // Detect "@partial" immediately before the caret. Returns null if none.
  function detectMention(value, caret) {
    const before = value.slice(0, caret);
    const m = before.match(/(^|\s)@([a-zA-Z0-9_-]*)$/);
    if (!m) return null;
    return { start: caret - m[2].length - 1, query: m[2].toLowerCase() };
  }

  const filtered = mention
    ? mentionUsers.filter(
        (u) => u.username.toLowerCase().startsWith(mention.query)
            || u.name.toLowerCase().includes(mention.query),
      ).slice(0, 6)
    : [];

  function pickMention(u) {
    if (!mention) return;
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.query.length);
    const next = `${before}@${u.username} ${after.replace(/^\s/, '')}`;
    setText(next);
    setMention(null); setMentionIdx(0);
  }

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
    if (mention && filtered.length) {
      if (e.key === 'ArrowDown') { e.preventDefault();
        setMentionIdx((i) => (i + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault();
        setMentionIdx((i) => (i - 1 + filtered.length) % filtered.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault(); pickMention(filtered[mentionIdx]); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) submit(e);
  }

  function onChange(e) {
    const v = e.target.value;
    setText(v);
    const next = detectMention(v, e.target.selectionStart ?? v.length);
    setMention(next);
    if (next) setMentionIdx(0);
  }

  return (
    <>
      <form onSubmit={submit} className="mt-3 flex gap-2 relative">
        {mention && filtered.length > 0 && (
          <MentionAutocomplete
            users={filtered}
            selectedIndex={mentionIdx}
            onSelect={pickMention}
          />
        )}
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          onChange={onChange}
          onKeyDown={onKey}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          className="flex-1 theme-input text-sm resize-none"
        />
        <button
          type="submit"
          disabled={busy || disabled || !text.trim()}
          className="promote-btn text-white text-sm font-medium px-4 rounded-xl
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? '…' : 'Send'}
        </button>
      </form>
      {hint && <div className="text-[10px] theme-muted mt-1 px-1">{hint}</div>}
    </>
  );
}
