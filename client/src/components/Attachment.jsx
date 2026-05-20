// Renders one attachment based on MIME type. Used inside MessageBubble.

function isImg(m) { return m.startsWith('image/'); }
function isAud(m) { return m.startsWith('audio/'); }
function isVid(m) { return m.startsWith('video/'); }

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

export default function Attachment({ a }) {
  const mime = a.mime || '';
  if (isImg(mime)) {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="block">
        <img src={a.url} alt={a.name}
          className="rounded-lg max-h-72 max-w-full object-cover
                     border border-[color:var(--border)]" />
      </a>
    );
  }
  if (isVid(mime)) {
    return (
      <video src={a.url} controls preload="metadata"
        className="rounded-lg max-h-72 max-w-full
                   border border-[color:var(--border)]" />
    );
  }
  if (isAud(mime)) {
    return <audio src={a.url} controls className="w-full max-w-sm" />;
  }
  return (
    <a href={a.url} target="_blank" rel="noreferrer"
       className="flex items-center gap-2 px-3 py-2 rounded-lg
                  bg-[color:var(--bg-2)] border border-[color:var(--border)]
                  hover:opacity-90">
      <span className="text-lg">📎</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{a.name || 'file'}</div>
        <div className="text-[10px] theme-muted">{mime} · {fmtSize(a.size)}</div>
      </div>
    </a>
  );
}
