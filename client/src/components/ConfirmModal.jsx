// Reusable confirmation modal (replaces window.confirm).
// Theming: same panel/card tokens as the rest of the app, blurred backdrop.
// Variants control the action button color: 'danger' for destructive,
// 'warning' for state-changing-but-recoverable, 'primary' for everything else.
import { useEffect } from 'react';

const VARIANT = {
  danger: 'bg-red-500/20 text-red-300 border border-red-500/40',
  warning: 'bg-amber-500/20 text-amber-200 border border-amber-500/40',
  primary: 'promote-btn text-white border-0',
};

export default function ConfirmModal({
  open, title, description, confirmLabel = 'Confirm',
  cancelLabel = 'Cancel', variant = 'primary', busy = false,
  onConfirm, onCancel,
}) {
  // Esc → cancel. Click outside → cancel. Enter → confirm UNLESS this is a
  // destructive action; for 'danger' we deliberately disable Enter-to-confirm
  // and focus Cancel by default so a stray keypress can't nuke data.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
      if (e.key === 'Enter' && variant !== 'danger') {
        e.preventDefault(); onConfirm?.();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel, variant]);

  if (!open) return null;
  const btnCls = VARIANT[variant] || VARIANT.primary;
  return (
    <div onClick={(e) => e.target === e.currentTarget && onCancel?.()}
         className="fixed inset-0 z-[60] flex items-center justify-center px-4"
         style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm theme-card rounded-xl p-4 shadow-xl">
        <div className="text-sm font-semibold mb-1">{title}</div>
        {description && (
          <div className="text-[12px] theme-muted mb-3 leading-relaxed">
            {description}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onCancel} disabled={busy}
                  autoFocus={variant === 'danger'}
                  className="text-xs theme-muted px-3 py-1.5 rounded
                             hover:opacity-80 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={busy}
                  autoFocus={variant !== 'danger'}
                  className={`text-xs px-3 py-1.5 rounded-lg
                              hover:opacity-80 disabled:opacity-50 ${btnCls}`}>
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
