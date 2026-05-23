// Global image preview modal. Any component dispatches a `nexcollab:preview-image`
// custom event with detail.url to open it. Esc / backdrop click closes.
import { useEffect, useState } from 'react';

export default function ImagePreviewModal() {
  const [src, setSrc] = useState(null);
  const [alt, setAlt] = useState('');

  useEffect(() => {
    function onOpen(e) {
      const { url, alt: a } = e.detail || {};
      if (!url) return;
      setSrc(url);
      setAlt(a || '');
    }
    window.addEventListener('nexcollab:preview-image', onOpen);
    return () => window.removeEventListener('nexcollab:preview-image', onOpen);
  }, []);

  useEffect(() => {
    if (!src) return;
    function onEsc(e) { if (e.key === 'Escape') setSrc(null); }
    document.addEventListener('keydown', onEsc);
    // Lock background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prev;
    };
  }, [src]);

  if (!src) return null;

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) setSrc(null); }}
         className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(8px)' }}>
      <button onClick={() => setSrc(null)}
              title="Close (Esc)"
              className="absolute top-3 right-3 text-white/80 hover:text-white
                         text-2xl leading-none px-2 py-1">✕</button>
      <a href={src} target="_blank" rel="noreferrer noopener"
         className="absolute top-3 left-3 text-white/80 hover:text-white
                    text-xs underline">Open in new tab</a>
      <img src={src} alt={alt}
           className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
    </div>
  );
}
