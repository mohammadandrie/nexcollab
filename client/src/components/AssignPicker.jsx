// Compact dropdown to pick a project member as the thread's next assignee.
// Per spec: any project member may assign — not PM-only.
import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';

export default function AssignPicker({ members, currentAssigneeId, onAssign, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" disabled={disabled}
              onClick={() => setOpen((v) => !v)}
              className="theme-card px-2 py-1 rounded hover:opacity-80
                         inline-flex items-center gap-1">
        → Send to Private
        <span className="opacity-60">▾</span>
      </button>
      {open && (
        <div role="menu"
             className="absolute right-0 mt-1 min-w-[180px] py-1 z-30
                        theme-card rounded-md shadow-lg menu-pop">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide theme-muted">
            Assign to
          </div>
          {members.length === 0 && (
            <div className="px-2 py-1.5 theme-muted">No members</div>
          )}
          {members.map((m) => (
            <button key={m.id} type="button" disabled={disabled}
                    onClick={() => { setOpen(false); onAssign(m.id); }}
                    className={`w-full text-left px-2 py-1.5 flex items-center gap-2
                                hover:bg-[color:var(--bg-2)] ${
                      m.id === currentAssigneeId ? 'opacity-50' : ''
                    }`}>
              <Avatar photoUrl={m.photo_url} letter={m.avatar_letter}
                      color={m.color || '#888'} size={18} />
              <span className="truncate">{m.name}</span>
              <span className="ml-auto text-[10px] theme-muted">{m.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
