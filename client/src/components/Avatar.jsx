// Reusable avatar: renders photo_url image when present, falls back to a
// colored circle with the avatar letter. Keeps every consumer (bubble,
// sidebar, mentions, login, profile modal) consistent.
export default function Avatar({ photoUrl, letter, color = '#888', size = 28, ringClass }) {
  const px = `${size}px`;
  const fontPx = `${Math.max(10, Math.round(size * 0.4))}px`;
  const common = {
    width: px, height: px,
    borderRadius: '9999px',
    flexShrink: 0,
  };
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={letter || ''}
        loading="lazy"
        draggable={false}
        className={ringClass || ''}
        style={{
          ...common,
          objectFit: 'cover',
          background: color + '22',
          border: `1px solid ${color}55`,
        }}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center font-bold ${ringClass || ''}`}
      style={{
        ...common,
        fontSize: fontPx,
        background: color + '22',
        color,
        border: `1px solid ${color}55`,
      }}>
      {letter || '?'}
    </div>
  );
}
