// Comment bubble for thread Activity / Pinned sections.
// Visual parity with MessageBubble in chat: hover-reveal ▾ menu (Reply / Pin),
// optional WhatsApp-style reply quote at the top, attachments rendered via
// the shared Attachment component. Hermes (actor null) gets the indigo accent.
import { useEffect, useRef, useState } from 'react';
import { mdLite } from '../api.js';
import Avatar from './Avatar.jsx';
import Attachment from './Attachment.jsx';
import ConfirmModal from './ConfirmModal.jsx';

function fmtAge(d) {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtFull(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return String(d); }
}

export default function CommentBubble({
  ev, currentUserId, onReply, onPin, onJumpToEvent, onEdit, onDelete, compact,
}) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const menuRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  // Confirm-modal-driven delete. ConfirmModal owns the focus-on-Cancel for
  // danger; we just run the actual delete + emit a toast for visible feedback.
  async function runDelete() {
    try {
      await onDelete?.(ev);
      window.dispatchEvent(new CustomEvent('nexcollab:toast',
        { detail: { type: 'success', message: 'Comment deleted' } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('nexcollab:toast',
        { detail: { type: 'error', message: e?.message || 'Delete failed' } }));
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onEsc(e) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const isAi = ev.actor_id == null;
  const isMine = !isAi && ev.actor_id === currentUserId;
  const author = isAi
    ? { name: 'Hermes', color: '#818cf8', letter: '✦', role: 'AI', photo_url: null }
    : {
        name: ev.actor?.name || '—',
        color: ev.actor?.color || '#888',
        letter: ev.actor?.avatar_letter || '?',
        role: ev.actor?.role || '',
        photo_url: ev.actor?.photo_url || null,
      };
  const wrapCls = isAi ? 'hermes-bubble' : isMine ? 'mine-bubble' : 'user-bubble';
  const r = ev.reply_to;
  const evId = ev.event_id;
  const canActions = !compact && evId != null;
  const canEdit = !compact && isMine && !ev.deleted && onEdit;
  const canDelete = !compact && isMine && !ev.deleted && onDelete;
  const isDeleted = !!ev.deleted;

  return (
    <div id={`thread-ev-${evId ?? ''}`}
         className={`flex gap-2 group ${isMine ? 'flex-row-reverse' : ''}`}
         onMouseEnter={() => setHover(true)}
         onMouseLeave={() => setHover(false)}>
      <Avatar photoUrl={author.photo_url} letter={author.letter}
              color={author.color} size={26} />
      <div className={`relative ${wrapCls} rounded-xl px-3 py-2 max-w-[88%] md:max-w-[70%]`}>
        <div className="flex items-center gap-2 text-[10px] text-neutral-500 mb-0.5">
          <span className="font-medium" style={{ color: author.color }}>{author.name}</span>
          {author.role && <span className="opacity-70">· {author.role}</span>}
          {ev.pinned && (
            <span className="ml-1 px-1.5 py-px rounded bg-amber-500/20 text-amber-300
                             border border-amber-500/40 text-[9px]">📌 Pinned</span>
          )}
          <span className="theme-muted ml-auto text-[10px]">
            {fmtAge(ev.ts)} · <span className="opacity-80">{fmtFull(ev.ts)}</span>
          </span>
        </div>

        {r && (
          <button type="button"
                  onClick={() => onJumpToEvent?.(r.event_id)}
                  title="Jump to original comment"
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

        {isDeleted ? (
          <div className="text-[12px] italic theme-muted">— deleted —</div>
        ) : editing ? (
          <div className="space-y-1.5">
            <textarea value={draft} maxLength={4000} rows={3}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full theme-input text-[13px] resize-y" />
            <div className="flex items-center gap-1.5 text-[11px]">
              <button type="button"
                onClick={() => {
                  const next = draft.trim();
                  if (!next) return;
                  onEdit?.(ev, next);
                  setEditing(false);
                }}
                className="promote-btn text-white px-2 py-0.5 rounded">
                Save
              </button>
              <button type="button"
                onClick={() => setEditing(false)}
                className="theme-card px-2 py-0.5 rounded hover:opacity-80">
                Cancel
              </button>
            </div>
          </div>
        ) : ev.content && (
          <div className="markdown text-[13px] text-neutral-200"
               onClick={(e) => {
                 const t = e.target;
                 if (t && t.tagName === 'IMG' && t.classList?.contains('md-img')) {
                   e.preventDefault();
                   window.dispatchEvent(new CustomEvent(
                     'nexcollab:preview-image',
                     { detail: { url: t.getAttribute('src'),
                                 alt: t.getAttribute('alt') || '' } },
                   ));
                 }
               }}
               dangerouslySetInnerHTML={{ __html: mdLite(ev.content) }} />
        )}
        {!isDeleted && !editing && ev.edited_at && (
          <div className="text-[10px] theme-muted opacity-70 mt-0.5">
            (edited)
          </div>
        )}
        {!isDeleted && !editing
          && Array.isArray(ev.attachments) && ev.attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {ev.attachments.map((a, i) => <Attachment key={i} a={a} />)}
          </div>
        )}

        {canActions && (hover || menuOpen) && !isDeleted && !editing
            && (onReply || onPin || canEdit || canDelete) && (
          <div ref={menuRef} className="absolute -top-1.5 right-1 z-10">
            {!isMobile && (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                title="More actions" aria-haspopup="menu" aria-expanded={menuOpen}
                className="px-1 leading-none text-[12px]
                           text-neutral-400 hover:text-neutral-100
                           opacity-70 hover:opacity-100
                           bg-transparent border-0 shadow-none
                           transition-transform duration-150"
                style={{ transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ▾
              </button>
            )}
            {menuOpen && (
              <div role="menu"
                   className="absolute mt-1 right-0 origin-top-right
                              min-w-[120px] py-1 rounded-md
                              bg-[color:var(--bg-2)] border border-[color:var(--border)]
                              shadow-lg text-[12px] menu-pop">
                {onReply && (
                  <button role="menuitem" type="button"
                    onClick={() => { setMenuOpen(false); onReply(ev); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-3)]
                               flex items-center gap-2">
                    <span>↩</span><span>Reply</span>
                  </button>
                )}
                {onPin && (
                  <button role="menuitem" type="button"
                    onClick={() => { setMenuOpen(false); onPin(ev); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-3)]
                               flex items-center gap-2">
                    <span>📌</span><span>{ev.pinned ? 'Unpin' : 'Pin'}</span>
                  </button>
                )}
                {canEdit && (
                  <button role="menuitem" type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setDraft(String(ev.content || ''));
                      setEditing(true);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-3)]
                               flex items-center gap-2">
                    <span>✏</span><span>Edit</span>
                  </button>
                )}
                {canDelete && (
                  <button role="menuitem" type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDel(true);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-3)]
                               flex items-center gap-2 text-red-300">
                    <span>🗑</span><span>Delete</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmModal
        open={confirmDel}
        title="Delete this comment?"
        description="This permanently removes the comment from the thread. Cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => { setConfirmDel(false); runDelete(); }}
      />
    </div>
  );
}
