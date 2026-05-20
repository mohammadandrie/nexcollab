import { mdLite } from '../api.js';

export default function MessageBubble({ msg, canShare, onShare }) {
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

  return (
    <div className={`flex gap-2 ${isAssistant ? '' : 'flex-row-reverse'}`}>
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                      text-[11px] font-bold"
        style={{ background: author.color + '22', color: author.color, border: `1px solid ${author.color}55` }}>
        {author.letter}
      </div>
      <div className={`${wrapCls} rounded-xl px-3 py-2 max-w-[85%] sm:max-w-[75%]`}>
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 mb-0.5">
          <span className="font-medium" style={{ color: author.color }}>{author.name}</span>
          {author.role && <span className="opacity-70">· {author.role}</span>}
        </div>
        <div
          className="markdown text-sm text-neutral-200"
          dangerouslySetInnerHTML={{ __html: mdLite(msg.content) }}
        />
        {canShare && (
          <button
            onClick={() => onShare(msg)}
            className="text-[10px] text-indigo-300 hover:text-indigo-200 mt-1.5">
            ↗ Send to Chat All
          </button>
        )}
      </div>
    </div>
  );
}
