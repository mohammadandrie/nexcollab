// Dropdown shown above the composer when user types `@partial`.
// Pure presentational — keyboard nav lives in the parent ChatComposer.
import Avatar from './Avatar.jsx';

export default function MentionAutocomplete({ users, selectedIndex, onSelect }) {
  if (!users.length) return null;
  return (
    <div className="absolute bottom-full mb-1 left-0 right-0 max-h-48 overflow-y-auto
                    theme-card rounded-lg shadow-lg z-20 scrollbar">
      <div className="text-[10px] uppercase tracking-wider theme-muted px-3 pt-2 pb-1">
        Mention
      </div>
      {users.map((u, i) => (
        <button
          key={u.username}
          onMouseDown={(e) => { e.preventDefault(); onSelect(u); }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm ${
            i === selectedIndex
              ? 'bg-indigo-500/15 text-[color:var(--fg)]'
              : 'hover:bg-[color:var(--bg-2)]'
          }`}>
          <Avatar photoUrl={u.photo_url} letter={u.avatar_letter}
                  color={u.color} size={24} />
          <span>{u.name}</span>
          <span className="text-[11px] theme-muted ml-auto">@{u.username}</span>
        </button>
      ))}
    </div>
  );
}
