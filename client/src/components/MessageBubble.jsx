import { useState, useEffect, useRef } from 'react';
import { mdLite } from '../api.js';
import Attachment from './Attachment.jsx';
import Avatar from './Avatar.jsx';

export default function MessageBubble({
  msg, canShare, canActions = true, currentUserId, canPromote,
  myAssignedThreads = [],
  onShare, onReply, onPin, onPromote, onJumpTo, onRetry,
}) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [swipeX, setSwipeX] = useState(0);     // current drag offset (px)
  const [swipeArmed, setSwipeArmed] = useState(false); // crossed reply threshold
  const menuRef = useRef(null);
  const touchRef = useRef(null);   // {x0,y0,t0,axis,longPressTimer}

  // Detect coarse pointer (touch device). Re-evaluate on viewport changes
  // so devices with both touch+mouse pick the right mode at runtime.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  // Close the dropdown when the user clicks anywhere outside it.
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

  // ---- Mobile gestures ----------------------------------------------------
  // Swipe horizontally on a bubble to reply (threshold 60px, damped at 90px).
  // Long-press (500ms) without movement opens the action menu.
  const SWIPE_THRESHOLD = 60;
  const SWIPE_MAX = 90;
  const LONG_PRESS_MS = 500;

  function onTouchStart(e) {
    if (!isMobile) return;
    if (typeof msg.id !== 'number') return; // skip optimistic placeholders
    const t = e.touches[0];
    const lpTimer = setTimeout(() => {
      // Cancel any swipe in progress and open menu.
      setSwipeX(0); setSwipeArmed(false);
      if (touchRef.current) touchRef.current.fired = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
    touchRef.current = { x0: t.clientX, y0: t.clientY, axis: null, lpTimer, fired: false };
  }
  function onTouchMove(e) {
    const ref = touchRef.current;
    if (!ref || ref.fired) return;
    const t = e.touches[0];
    const dx = t.clientX - ref.x0;
    const dy = t.clientY - ref.y0;
    if (ref.axis == null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      ref.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      // Vertical: let the page scroll, abort gesture entirely.
      if (ref.axis === 'y') { clearTimeout(ref.lpTimer); ref.lpTimer = null; return; }
      // Horizontal: kill long-press, this is a swipe.
      clearTimeout(ref.lpTimer); ref.lpTimer = null;
    }
    if (ref.axis !== 'x') return;
    const damped = Math.sign(dx) * Math.min(Math.abs(dx), SWIPE_MAX);
    setSwipeX(damped);
    setSwipeArmed(Math.abs(dx) >= SWIPE_THRESHOLD);
  }
  function onTouchEnd() {
    const ref = touchRef.current;
    if (!ref) return;
    if (ref.lpTimer) clearTimeout(ref.lpTimer);
    if (!ref.fired && ref.axis === 'x' && Math.abs(swipeX) >= SWIPE_THRESHOLD && onReply) {
      onReply(msg);
    }
    setSwipeX(0); setSwipeArmed(false);
    touchRef.current = null;
  }

  const isAssistant = msg.role === 'assistant';
  // POV: my own messages align right; everyone else (other humans + Hermes) left.
  const isMine = !isAssistant
    && currentUserId != null
    && msg.author_id != null
    && msg.author_id === currentUserId;
  const wrapCls = isAssistant ? 'hermes-bubble'
                : isMine      ? 'mine-bubble'
                                : 'user-bubble';
  const author = isAssistant
    ? { name: 'Hermes', color: '#818cf8', letter: '✦', role: 'AI', photoUrl: null }
    : {
        name: msg.author_name || '—',
        color: msg.author_color || '#888',
        letter: msg.author_letter || '?',
        role: msg.author_role || '',
        photoUrl: msg.author_photo_url || null,
      };
  const r = msg.reply_to;

  return (
    <div
      id={`msg-${msg.id}`}
      className={`flex gap-2 group ${isMine ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      <Avatar photoUrl={author.photoUrl} letter={author.letter} color={author.color} size={28} />
      <div className={`relative ${wrapCls} rounded-xl px-3 py-2 max-w-[85%] sm:max-w-[75%]
                       ${isMobile ? 'select-none' : ''}`}
           style={{
             transform: swipeX ? `translateX(${swipeX}px)` : undefined,
             transition: swipeX ? 'none' : 'transform 180ms cubic-bezier(.2,.8,.2,1)',
             touchAction: 'pan-y',
           }}
           onTouchStart={onTouchStart}
           onTouchMove={onTouchMove}
           onTouchEnd={onTouchEnd}
           onTouchCancel={onTouchEnd}>
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
          className={`markdown text-sm text-neutral-200 ${msg.streaming ? 'msg-streaming' : ''} ${msg.error ? 'msg-error' : ''}`}
          dangerouslySetInnerHTML={{ __html: mdLite(msg.content) }}
        />
        {msg.streaming && (
          <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-indigo-300/80">
            <span className="typing-dot" />
            <span className="typing-dot" style={{ animationDelay: '120ms' }} />
            <span className="typing-dot" style={{ animationDelay: '240ms' }} />
          </div>
        )}
        {msg.error && msg.retryPayload && typeof onRetry === 'function' && (
          <div className="mt-1.5">
            <button onClick={() => onRetry(msg)}
                    className="text-[11px] px-2 py-1 rounded
                               bg-indigo-500/20 text-indigo-200
                               border border-indigo-500/40 hover:opacity-80">
              ↻ Retry
            </button>
          </div>
        )}
        {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {msg.attachments.map((a, i) => <Attachment key={i} a={a} />)}
          </div>
        )}
        {canShare && (
          <div className="flex items-center gap-2 mt-1.5 text-[10px]">
            <button
              onClick={() => onShare(msg)}
              className="text-indigo-300 hover:text-indigo-200">
              ↗ Send to Chat All
            </button>
            {myAssignedThreads.length > 0 && onPromote && (
              <button
                onClick={() => onPromote(msg)}
                className="text-emerald-300 hover:text-emerald-200">
                ↪ Append to thread
              </button>
            )}
          </div>
        )}

        {canActions && (hover || menuOpen) && typeof msg.id === 'number' && (onReply || onPin) && (
          <div ref={menuRef}
               className="absolute -top-1.5 right-1 z-10">
            {!isMobile && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              title="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
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
                    onClick={() => { setMenuOpen(false); onReply(msg); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-3)]
                               flex items-center gap-2">
                    <span>↩</span><span>Reply</span>
                  </button>
                )}
                {onPin && (
                  <button role="menuitem" type="button"
                    onClick={() => { setMenuOpen(false); onPin(msg); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-3)]
                               flex items-center gap-2">
                    <span>📌</span><span>{msg.pinned ? 'Unpin' : 'Pin'}</span>
                  </button>
                )}
                {canPromote && onPromote && (
                  <button role="menuitem" type="button"
                    onClick={() => { setMenuOpen(false); onPromote(msg); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--bg-3)]
                               flex items-center gap-2">
                    <span>🧵</span><span>Promote to thread</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
