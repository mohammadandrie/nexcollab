import Avatar from './Avatar.jsx';

export default function Sidebar({
  user, projects, activeProjectId, mode, members, activeTab,
  unread = {},
  onPickProject, onPickGeneral, onCreateProject, onProjectSettings, onPickTab,
}) {
  return (
    <aside className="hidden md:block w-64 flex-shrink-0">
      <div className="theme-card rounded-xl p-3">
        <div className="text-[11px] uppercase tracking-wider theme-muted mb-2">
          Chat
        </div>
        <button
          onClick={onPickGeneral}
          className={`w-full text-left text-xs p-2 rounded-lg border mb-4
                      flex items-center gap-2 transition-colors ${
            mode === 'general'
              ? 'bg-[color:var(--accent)]/10 border-[color:var(--accent)]/40 text-[color:var(--fg)]'
              : 'border-transparent text-[color:var(--fg)] hover:bg-[color:var(--bg-2)]'
          }`}>
          <span>💬</span>
          <span>Chat</span>
        </button>

        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider theme-muted">Project</div>
          <button onClick={onCreateProject}
            className="text-[10px] text-[color:var(--accent)] hover:opacity-80">+ new</button>
        </div>
        <div className="space-y-1 mb-4">
          {projects.length === 0
            ? <div className="text-[11px] theme-muted italic">no projects yet</div>
            : projects.map((p) => {
                const active = mode === 'project' && p.id === activeProjectId;
                const n = unread[p.id] || 0;
                return (
                  <div key={p.id}>
                  <div className={`group flex items-center gap-1 rounded-lg border transition-colors ${
                      active
                        ? 'bg-[color:var(--accent)]/10 border-[color:var(--accent)]/40'
                        : 'border-transparent hover:bg-[color:var(--bg-2)]'
                    }`}>
                    <button
                      onClick={() => onPickProject(p.id)}
                      className="flex-1 min-w-0 text-left text-xs p-2 text-[color:var(--fg)]">
                      <div className="flex items-center gap-1.5">
                        <span className="theme-muted">▸</span>
                        <span className="truncate">{p.name}</span>
                        {p.github_repo && (
                          <span className="text-[9px] theme-muted ml-auto"
                            title={`${p.github_repo} · ${p.github_branch || 'main'}`}>⎇</span>
                        )}
                        {n > 0 && !active && (
                          <span className={`${p.github_repo ? '' : 'ml-auto'}
                                            inline-flex items-center justify-center
                                            min-w-[16px] h-[16px] px-1 rounded-full
                                            text-[9px] font-semibold
                                            bg-[color:var(--accent)] text-white`}
                                title={`${n} unread`}>
                            {n > 99 ? '99+' : n}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onProjectSettings(p); }}
                      title="Project settings"
                      className="opacity-0 group-hover:opacity-100 px-1.5 py-1 theme-muted
                                 hover:opacity-100 text-xs">⚙</button>
                  </div>
                  {active && (
                    <div className="ml-4 mt-1 mb-2 space-y-0.5">
                      {[
                        { id: 'private', label: '🔒 Private Chat' },
                        { id: 'all',     label: '💬 Chat All' },
                      ].map((t) => {
                        const on = activeTab === t.id;
                        return (
                          <button key={t.id}
                            onClick={() => onPickTab?.(t.id)}
                            className={`w-full text-left text-[11px] px-2 py-1.5 rounded
                                        transition-colors ${
                              on
                                ? 'bg-[color:var(--bg-3)] text-[color:var(--fg)]'
                                : 'theme-muted hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
                            }`}>
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  </div>
                );
              })}
        </div>

        {members.length > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wider theme-muted mb-2">Team</div>
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <Avatar photoUrl={m.photo_url} letter={m.avatar_letter}
                          color={m.color} size={24} />
                  <span className="text-[color:var(--fg)]">{m.name}</span>
                  <span className={`role-${m.role} ml-auto text-[9px] px-1.5 py-0.5 rounded border`}>
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
