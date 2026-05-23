// Shared category picker — used by ThreadList card pill and ThreadDetail header.
// Renders the popover via portal with `position: fixed`, anchored to the
// trigger button's rect, so it never gets clipped by ancestor overflow:auto/
// overflow:hidden containers (the original `absolute right-0` was getting
// cut off by the thread-card row + scrolling list).
//
// Smart edge handling:
//   - Default align right edge of panel with right edge of trigger.
//   - If that pushes the panel off the left of the viewport, flip to align
//     left-with-left of trigger.
//   - If panel would overflow bottom, flip to open upward.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PANEL_W = 220;
const PANEL_H_EST = 280; // generous estimate for flip decision

export default function CategoryPicker({
  current, customCategories = [], onPick, disabled,
  triggerClassName, label,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('preset'); // 'preset' | 'other'
  const [customCat, setCustomCat] = useState('');
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState(null); // {top, left, placement}
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  // Recompute panel position from the trigger rect. Called on open + on
  // viewport changes while open so the panel tracks scroll/resize.
  function recalc() {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Default: right edge of panel aligned with right edge of trigger.
    let left = r.right - PANEL_W;
    // Flip to left-align if that goes off the left side of the viewport.
    if (left < 8) left = Math.min(r.left, vw - PANEL_W - 8);
    // Final clamp inside viewport with 8px gutter.
    left = Math.max(8, Math.min(left, vw - PANEL_W - 8));
    // Default place below trigger; flip up if not enough room.
    let top = r.bottom + 4;
    let placement = 'down';
    if (top + PANEL_H_EST > vh - 8 && r.top - 4 > PANEL_H_EST) {
      top = r.top - 4 - PANEL_H_EST;
      placement = 'up';
    }
    setPos({ top, left, placement });
  }

  useLayoutEffect(() => {
    if (!open) return;
    recalc();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onWin() { recalc(); }
    window.addEventListener('scroll', onWin, true);
    window.addEventListener('resize', onWin);
    return () => {
      window.removeEventListener('scroll', onWin, true);
      window.removeEventListener('resize', onWin);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      // Only close if click is outside both the trigger and the panel.
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) { setMode('preset'); setCustomCat(''); }
  }, [open]);

  async function pick(value) {
    setBusy(true);
    try {
      await onPick(value);
      setOpen(false);
    } finally { setBusy(false); }
  }

  const presets = ['Bug', 'Request', ...customCategories];

  return (
    <span className="inline-block"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}>
      <button ref={triggerRef} type="button" disabled={disabled}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
              className={triggerClassName ||
                'text-[10px] px-1.5 py-px rounded border ' +
                'bg-neutral-700/30 text-neutral-300 border-neutral-600/40 ' +
                'hover:opacity-80'}>
        {label || current || 'Other'} ▾
      </button>
      {open && pos && createPortal(
        <div ref={panelRef}
             onMouseDown={(e) => e.stopPropagation()}
             onClick={(e) => e.stopPropagation()}
             style={{
               position: 'fixed',
               top: pos.top, left: pos.left, width: PANEL_W,
               zIndex: 9999,
             }}
             className="theme-card rounded-md shadow-xl menu-pop p-1.5
                        border border-[color:var(--border)]
                        backdrop-blur-sm">
          {mode === 'preset' ? (
            <>
              <div className="text-[10px] uppercase tracking-wide theme-muted px-2 pt-1 pb-1.5">
                Change category
              </div>
              <div className="max-h-56 overflow-y-auto scrollbar">
                {presets.map((c) => (
                  <button key={c} type="button" disabled={busy}
                          onClick={() => pick(c)}
                          className={`w-full text-left px-2 py-1.5 text-[11px] rounded
                                      hover:bg-[color:var(--bg-2)] ${
                            c === current ? 'opacity-50' : ''
                          }`}>
                    {c}
                  </button>
                ))}
              </div>
              <button type="button"
                      onClick={() => setMode('other')}
                      className="w-full text-left px-2 py-1.5 text-[11px] rounded
                                 hover:bg-[color:var(--bg-2)] text-indigo-300">
                + Other (custom…)
              </button>
            </>
          ) : (
            <div className="p-1 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide theme-muted px-1">
                Custom category
              </div>
              <input value={customCat} autoFocus
                     onChange={(e) => setCustomCat(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter' && customCat.trim()) pick(customCat.trim());
                       if (e.key === 'Escape') setMode('preset');
                     }}
                     placeholder="Mis. Design, Spec…" maxLength={60}
                     className="w-full theme-input text-[11px] px-2 py-1" />
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setMode('preset')}
                        className="flex-1 px-2 py-1 text-[11px] rounded
                                   theme-card hover:opacity-80">
                  Cancel
                </button>
                <button type="button"
                        disabled={busy || !customCat.trim()}
                        onClick={() => pick(customCat.trim())}
                        className="flex-1 px-2 py-1 text-[11px] rounded
                                   promote-btn text-white disabled:opacity-50">
                  {busy ? '…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}
