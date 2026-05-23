// Lightweight global toast. Components dispatch a CustomEvent and we render
// a small stack in the bottom-right. Same pattern as ImagePreviewModal so
// callers don't need to import a context — just:
//   window.dispatchEvent(new CustomEvent('nexcollab:toast',
//     { detail: { type:'success', message:'Thread closed' } }));
// Types: 'success' | 'error' | 'info'. Auto-dismiss after 3.5s.
import { useEffect, useState } from 'react';

const STYLE = {
  success: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  error:   'bg-red-500/15     text-red-200     border-red-500/40',
  info:    'bg-sky-500/15     text-sky-200     border-sky-500/40',
};
const ICON = { success: '✓', error: '⚠', info: 'ℹ' };

export default function Toast() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let counter = 0;
    function onToast(e) {
      const id = ++counter;
      const type = e.detail?.type || 'info';
      const message = String(e.detail?.message || '').slice(0, 200);
      if (!message) return;
      setItems((prev) => [...prev, { id, type, message }]);
      const ttl = e.detail?.ttl ?? 3500;
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, ttl);
    }
    window.addEventListener('nexcollab:toast', onToast);
    return () => window.removeEventListener('nexcollab:toast', onToast);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2
                    pointer-events-none">
      {items.map((t) => (
        <div key={t.id}
             className={`pointer-events-auto px-3 py-2 rounded-lg border
                         text-xs shadow-lg backdrop-blur-md
                         flex items-start gap-2 max-w-[320px]
                         ${STYLE[t.type] || STYLE.info}`}>
          <span className="text-sm leading-none mt-0.5">{ICON[t.type] || ICON.info}</span>
          <span className="flex-1 leading-relaxed">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// Convenience helper. Components can `import { toast } from './Toast.jsx'`
// and call `toast.success('Saved')`.
function fire(type, message, ttl) {
  window.dispatchEvent(new CustomEvent('nexcollab:toast',
    { detail: { type, message, ttl } }));
}
export const toast = {
  success: (m, ttl) => fire('success', m, ttl),
  error:   (m, ttl) => fire('error', m, ttl),
  info:    (m, ttl) => fire('info', m, ttl),
};
