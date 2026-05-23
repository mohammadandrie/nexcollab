// Inbox strip — shown above the Private chat when the current user has
// active assignments. Per spec: visible in Private timeline so receiver
// knows a task came in. Click to open the thread; quick "Done" releases.
import Avatar from './Avatar.jsx';

export default function InboxStrip({ threads, currentUserId, onOpen, onRelease }) {
  const mine = (threads || []).filter(
    (t) => t.assignee?.id === currentUserId && t.status === 'assigned'
  );
  if (mine.length === 0) return null;
  return (
    <div className="mb-2 rounded-lg border border-amber-500/40
                    bg-amber-500/10 px-3 py-2 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-amber-300">
        📥 Inbox · {mine.length} task{mine.length > 1 ? 's' : ''} assigned to you
      </div>
      {mine.map((t) => (
        <div key={t.id}
             className="flex items-center gap-2 text-[12px]
                        rounded px-2 py-1 hover:bg-amber-500/15">
          <Avatar photoUrl={t.originator?.photo_url} letter={t.originator?.avatar_letter}
                  color={t.originator?.color || '#888'} size={20} />
          <button onClick={() => onOpen(t.id)}
                  className="flex-1 min-w-0 text-left truncate text-[color:var(--fg)]">
            {t.title}
            <span className="theme-muted ml-2 text-[10px]">
              from {t.originator?.name || '—'}
            </span>
          </button>
          <button onClick={() => onRelease(t.id)}
                  title="Mark my part done"
                  className="text-[10px] px-2 py-0.5 rounded
                             bg-emerald-500/15 text-emerald-300
                             border border-emerald-500/30 hover:opacity-80">
            ✓ Done
          </button>
        </div>
      ))}
    </div>
  );
}
