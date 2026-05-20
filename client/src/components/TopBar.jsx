import { api } from '../api.js';

export default function TopBar({ user, projectName, onLogout, onProfileClick }) {
  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    onLogout();
  }

  return (
    <header className="sticky top-0 z-30 bg-black/70 backdrop-blur border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600
                          flex items-center justify-center text-white text-sm font-bold flex-shrink-0">N</div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">Nexcollab</div>
            <div className="text-[10px] text-neutral-500 -mt-0.5 truncate">{projectName || '…'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/docs.html" target="_blank" rel="noreferrer"
             className="text-[11px] text-neutral-400 hover:text-neutral-200
                        bg-neutral-900 border border-neutral-800 rounded-full px-2.5 py-1">
            📖 docs
          </a>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 bg-neutral-900
                          border border-neutral-800 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot"></span>
            Hermes online
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span>{user.name}</span>
            <span className={`role-${user.role} border text-[10px] rounded-full px-2 py-0.5`}>
              {user.role}
            </span>
          </div>
          <button
            onClick={onProfileClick}
            title="Edit profil"
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                       hover:ring-2 hover:ring-white/30 transition"
            style={{ background: user.color + '22', color: user.color, border: `1px solid ${user.color}55` }}>
            {user.avatar_letter}
          </button>
          <button onClick={logout} className="text-[11px] text-neutral-500 hover:text-neutral-300">
            logout
          </button>
        </div>
      </div>
    </header>
  );
}
