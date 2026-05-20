import { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble.jsx';

export default function ChatView({
  messages, mode, activeTab,
  onShare, onReply, onPin,
}) {
  const boxRef = useRef(null);
  const [showPinned, setShowPinned] = useState(true);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function jumpTo(id) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash-highlight');
    setTimeout(() => el.classList.remove('flash-highlight'), 1500);
  }

  let placeholder;
  if (mode === 'general') placeholder = 'General chat. Start typing anything…';
  else if (activeTab === 'private') placeholder = 'Start a conversation with Hermes…';
  else placeholder = 'No decisions shared in this project yet.';

  const canShare = mode === 'project' && activeTab === 'private';
  const pinned = messages.filter((m) => m.pinned && typeof m.id === 'number');

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 240px)', minHeight: 380 }}>
      {pinned.length > 0 && (
        <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <button
            onClick={() => setShowPinned((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px]
                       text-amber-300 hover:bg-amber-500/10">
            <span>📌 {pinned.length} pinned message{pinned.length > 1 ? 's' : ''}</span>
            <span className="opacity-70">{showPinned ? '▾' : '▸'}</span>
          </button>
          {showPinned && (
            <div className="px-3 pb-2 space-y-1 max-h-32 overflow-y-auto scrollbar">
              {pinned.map((m) => (
                <button key={m.id} onClick={() => jumpTo(m.id)}
                  className="block w-full text-left px-2 py-1 rounded
                             hover:bg-[color:var(--bg-2)] text-[11px]">
                  <span className="font-medium" style={{ color: m.author_color || '#aaa' }}>
                    {m.role === 'assistant' ? 'Hermes' : (m.author_name || '—')}
                  </span>
                  <span className="theme-muted ml-1.5">
                    {String(m.content || '').replace(/\s+/g, ' ').slice(0, 90) || '(empty)'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div
        ref={boxRef}
        className="scrollbar bg-neutral-900/30 border border-neutral-800 rounded-xl
                   p-3 sm:p-4 space-y-3 overflow-y-auto flex-1">
        {messages.length === 0
          ? <div className="text-center text-xs text-neutral-600 py-12">{placeholder}</div>
          : messages.map((m) => (
              <MessageBubble key={m.id} msg={m}
                canShare={canShare}
                onShare={onShare}
                onReply={onReply}
                onPin={onPin}
                onJumpTo={jumpTo} />
            ))}
      </div>
    </div>
  );
}
