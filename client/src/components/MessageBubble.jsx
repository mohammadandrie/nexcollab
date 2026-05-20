import { useState } from 'react';
import { mdLite } from '../api.js';
import Attachment from './Attachment.jsx';

export default function MessageBubble({
  msg, canShare, canActions = true, onShare, onReply, onPin, onJumpTo,
}) {
  const [hover, setHover] = useState(false);
  const isAssistant = msg.role === 'assistant';
  const wrapCls = isAssistant ? 'hermes-bubble' : 'user-bubble';
  const author = isAssistant
    ? { name: 'Hermes', color: '#818cf8', letter: '✦', role: 'AI' }
    : {
        name: msg.author_name || '—',
        color: msg.author_color || '#888',
        letter: msg.author_letter || '?',
        role: msg.author_role || '',
      };
  const r = msg.reply_to;

  return (
    <div
      id={`msg-${msg.id}`}
      className={`flex gap-2 group ${isAssistant ? '' : 'flex-row-reverse'}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                      text-[11px] font-bold"
        style={{ background: author.color + '22', color: author.color,
                 border: `1px solid ${author.color}55` }}>
        {author.letter}
      </div>
      <div className={`relative ${wrapCls} rounded-xl px-3 py-2 max-w-[85%] sm:max-w-[75%]`}>
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 mb-0.5">
          <span className="font-medium" style={{ color: author.color }}>{author.name}</span>
          {author.role && <span className="opacity-70">· {author.role}</span>}
          {msg.pinned && (
            <span className="ml-1 px-1.5 py-px rounded bg-amber-500/20 text-amber-300
                             border border-amber-500/40 text-[9px]">📌 Pinned</span>
          )}
        </div>

        {r && (
          <button
            type="button"
            onClick={() => onJumpTo?.(r.id)}
            title="Jump to original message"
            className="block w-full text-left mb-1.5 px-2 py-1 rounded-md
                       border-l-2 bg-black/15 hover:bg-black/25 transition"
            style={{ borderLeftColor: r.author_color || '#888' }}>
            <div className="text-[10px] font-medium" style={{ color: r.author_color }}>
              ↪ {r.author_name}
            </div>
            <div className="text-[11px] text-neutral-400 truncate">
              {r.has_attachment && '📎 '}{r.excerpt || '(empty)'}
            </div>
          </button>
        )}

        <div
          className="markdown text-sm text-neutral-200"
          dangerouslySetInnerHTML={{ __html: mdLite(msg.content) }}
        />
        {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {msg.attachments.map((a, i) => <Attachment key={i} a={a} />)}
          </div>
        )}
        {canShare && (
          <button
            onClick={() => onShare(msg)}
            className="text-[10px] text-indigo-300 hover:text-indigo-200 mt-1.5">
            ↗ Send to Chat All
          </button>
        )}

        {canActions && hover && typeof msg.id === 'number' && (
          <div className={`absolute -top-2 ${isAssistant ? 'right-1' : 'left-1'}
                          flex gap-0.5 px-1 py-0.5 rounded-md
                          bg-[color:var(--bg-2)] border border-[color:var(--border)]
                          shadow-md text-[11px] z-10`}>
            {onReply && (
              <button onClick={() => onReply(msg)} title="Reply"
                className="px-1.5 py-0.5 rounded hover:bg-[color:var(--bg-3)]">
                ↩ Reply
              </button>
            )}
            {onPin && (
              <button onClick={() => onPin(msg)}
                title={msg.pinned ? 'Unpin' : 'Pin'}
                className="px-1.5 py-0.5 rounded hover:bg-[color:var(--bg-3)]">
                {msg.pinned ? '📌 Unpin' : '📌 Pin'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
