import { useEffect, useRef, useState } from 'react';
import MentionAutocomplete from './MentionAutocomplete.jsx';

export default function ChatComposer({
  hint, disabled, onSend, mentionUsers = [],
  replyingTo, onCancelReply,
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState(null); // {start, query} | null
  const [mentionIdx, setMentionIdx] = useState(0);
  const [attachments, setAttachments] = useState([]); // [{url, name, mime, size}]
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState('');
  const taRef = useRef(null);
  const fileRef = useRef(null);

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

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUpErr(''); setUploading(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        const r = await fetch('/api/upload', {
          method: 'POST', body: fd, credentials: 'same-origin',
        });
        const data = await r.json();
        if (!r.ok) { setUpErr(data.detail || 'upload_failed'); break; }
        setAttachments((prev) => [...prev, data.file]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removeAttachment(idx) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e) {
    e?.preventDefault?.();
    const v = text.trim();
    if ((!v && attachments.length === 0) || busy || disabled) return;
    setBusy(true);
    const sentAttachments = attachments;
    const sentReplyId = replyingTo?.id ?? null;
    setText(''); setAttachments([]);
    try { await onSend(v, sentAttachments, sentReplyId); }
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
      {replyingTo && (
        <div className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-md
                        bg-[color:var(--bg-2)] border-l-2
                        border border-[color:var(--border)]"
             style={{ borderLeftColor: replyingTo.author_color || '#888' }}>
          <span className="text-[11px] theme-muted">Replying to</span>
          <span className="text-[11px] font-medium"
                style={{ color: replyingTo.author_color || '#aaa' }}>
            {replyingTo.author_name || (replyingTo.role === 'assistant' ? 'Hermes' : '—')}
          </span>
          <span className="text-[11px] theme-muted truncate flex-1">
            · {String(replyingTo.content || '').replace(/\s+/g, ' ').slice(0, 80) || '(empty)'}
          </span>
          <button type="button" onClick={onCancelReply}
            className="text-[11px] theme-muted hover:opacity-80 px-1"
            title="Cancel reply">✕</button>
        </div>
      )}
      {(attachments.length > 0 || uploading || upErr) && (
        <div className="mt-2 flex flex-wrap gap-1.5 items-center">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md
                                    bg-[color:var(--bg-2)] border border-[color:var(--border)]
                                    text-[11px]">
              <span>{a.mime?.startsWith('image/') ? '🖼' :
                     a.mime?.startsWith('video/') ? '🎬' :
                     a.mime?.startsWith('audio/') ? '🎵' : '📎'}</span>
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button onClick={() => removeAttachment(i)} type="button"
                className="theme-muted hover:opacity-80">×</button>
            </div>
          ))}
          {uploading && <span className="text-[11px] theme-muted">Uploading…</span>}
          {upErr && <span className="text-[11px] text-red-400">Failed: {upErr}</span>}
        </div>
      )}
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
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => uploadFiles(e.target.files)}
        />
        <button type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || disabled}
          title="Attach file"
          className="px-3 rounded-xl theme-input border text-sm
                     hover:opacity-80 disabled:opacity-50">
          📎
        </button>
        <button
          type="submit"
          disabled={busy || disabled || uploading
                    || (!text.trim() && attachments.length === 0)}
          className="promote-btn text-white text-sm font-medium px-4 rounded-xl
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? '…' : 'Send'}
        </button>
      </form>
      {hint && <div className="text-[10px] theme-muted mt-1 px-1">{hint}</div>}
    </>
  );
}
