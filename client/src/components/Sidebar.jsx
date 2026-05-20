export default function Sidebar({
  user, projects, activeProjectId, mode, members,
  onPickProject, onPickGeneral, onCreateProject, onProjectSettings,
}) {
  return (
    <aside className="hidden md:block w-64 flex-shrink-0">
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
        <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
          Chat Bebas
        </div>
        <button
          onClick={onPickGeneral}
          className={`w-full text-left text-xs p-2 rounded-lg border mb-4
                      flex items-center gap-2 ${
            mode === 'general'
              ? 'bg-indigo-500/10 border-indigo-500/40 text-white'
              : 'border-transparent text-neutral-300 hover:bg-neutral-800/50'
          }`}>
          <span>💬</span>
          <span>General</span>
          <span className="ml-auto text-[10px] text-neutral-500">bebas</span>
        </button>

        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Project</div>
          <button onClick={onCreateProject}
            className="text-[10px] text-indigo-300 hover:text-indigo-200">+ baru</button>
        </div>
        <div className="space-y-1 mb-4">
          {projects.length === 0
            ? <div className="text-[11px] text-neutral-600 italic">belum ada project</div>
            : projects.map((p) => {
                const active = mode === 'project' && p.id === activeProjectId;
                return (
                  <div key={p.id} className={`group flex items-center gap-1 rounded-lg border ${
                      active
                        ? 'bg-indigo-500/10 border-indigo-500/40'
                        : 'border-transparent hover:bg-neutral-800/50'
                    }`}>
                    <button
                      onClick={() => onPickProject(p.id)}
                      className={`flex-1 min-w-0 text-left text-xs p-2 ${
                        active ? 'text-white' : 'text-neutral-300'
                      }`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-500">▸</span>
                        <span className="truncate">{p.name}</span>
                        {p.github_repo && (
                          <span className="text-[9px] text-neutral-500 ml-auto"
                            title={`${p.github_repo} · ${p.github_branch || 'main'}`}>⎇</span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onProjectSettings(p); }}
                      title="Setting project"
                      className="opacity-0 group-hover:opacity-100 px-1.5 py-1 text-neutral-500
                                 hover:text-neutral-200 text-xs">⚙</button>
                  </div>
                );
              })}
        </div>

        {members.length > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">Tim</div>
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center
                                  text-[11px] font-bold"
                    style={{ background: m.color + '22', color: m.color,
                             border: `1px solid ${m.color}55` }}>
                    {m.avatar_letter}
                  </div>
                  <span className="text-neutral-300">{m.name}</span>
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
