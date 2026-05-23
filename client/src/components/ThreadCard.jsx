// Mini thread card rendered inside a kanban column.
// Read-only in Fase 2 — drag handler is wired by parent KanbanBoard.
import Avatar from './Avatar.jsx';
import ThreadActionsMenu from './ThreadActionsMenu.jsx';

const STAGE_BADGE = {
  backlog: { label: 'draft',  className: 'bg-zinc-500/15 text-zinc-300' },
  open:    { label: 'PM',     className: 'bg-violet-500/15 text-violet-300' },
  uiux:    { label: 'UX',     className: 'bg-pink-500/15 text-pink-300' },
  dev:     { label: 'Dev',    className: 'bg-emerald-500/15 text-emerald-300' },
  qa:      { label: 'QA',     className: 'bg-amber-500/15 text-amber-300' },
  pcheck:  { label: 'P.Chk',  className: 'bg-sky-500/15 text-sky-300' },
  done:    { label: '✓',      className: 'bg-zinc-700/30 text-zinc-400' },
};

const DEAL_DOT = {
  idle:    null,
  running: { title: 'agent diskusi berjalan',  className: 'bg-amber-400 animate-pulse' },
  stuck:   { title: 'butuh input human',       className: 'bg-rose-400' },
  deal:    { title: 'DEAL — siap di-approve',  className: 'bg-emerald-400' },
};

export default function ThreadCard({ card, onOpen, onDragStart, draggable, currentUserId, onChanged }) {
  const badge = STAGE_BADGE[card.stage] ?? STAGE_BADGE.backlog;
  const dot = DEAL_DOT[card.deal_status] ?? null;
  const assignee = card.assignee;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!draggable}
      onDragStart={(e) => {
        if (!draggable || !onDragStart) return;
        e.dataTransfer.setData('text/plain', String(card.id));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(card);
      }}
      onClick={() => onOpen?.(card.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen?.(card.id); }}
      className="theme-surface theme-border rounded-md p-2 mb-2 border cursor-pointer
                 hover:border-violet-500/60 transition-colors text-left
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      <div className="flex items-start gap-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.className}`}>
          {badge.label}
        </span>
        {dot && (
          <span
            title={dot.title}
            className={`w-2 h-2 rounded-full mt-1 ${dot.className}`}
          />
        )}
        <span className="ml-auto text-[10px] theme-muted">#{card.id}</span>
        {currentUserId != null && (
          <ThreadActionsMenu
            threadId={card.id} title={card.title}
            canEdit canDelete
            onTitleSaved={() => onChanged?.()}
            onDeleted={() => onChanged?.()}
          />
        )}
      </div>
      <div className="mt-1.5 text-sm leading-snug line-clamp-2">{card.title}</div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] theme-muted">
        <span className="truncate">{card.category || '—'}</span>
        {assignee ? (
          <Avatar
            photoUrl={assignee.photo_url}
            letter={assignee.avatar_letter || (assignee.name?.[0] ?? '?')}
            color={assignee.color || '#888'}
            size={18}
          />
        ) : (
          <span className="text-zinc-500">unassigned</span>
        )}
      </div>
    </div>
  );
}
