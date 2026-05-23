export default function MobileBar({
  projects, activeProjectId, mode,
  onPickProject, onPickGeneral, onCreateProject,
}) {
  return (
    <div className="md:hidden flex gap-1.5 mb-2 items-center text-xs">
      <button
        onClick={onPickGeneral}
        className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
          mode === 'general'
            ? 'bg-[color:var(--accent)]/15 border-[color:var(--accent)]/40 text-[color:var(--fg)]'
            : 'theme-card text-[color:var(--fg)]'
        }`}>
        💬 <span>Chat</span>
      </button>
      <select
        value={mode === 'project' ? activeProjectId ?? '' : ''}
        onChange={(e) => e.target.value && onPickProject(parseInt(e.target.value, 10))}
        className="flex-1 theme-input text-xs py-1.5">
        <option value="">— pick a project —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button
        onClick={onCreateProject}
        className="px-2.5 py-1.5 rounded-lg bg-[color:var(--accent)]/15
                   border border-[color:var(--accent)]/30 text-[color:var(--accent)]">
        + new
      </button>
    </div>
  );
}
