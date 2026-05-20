export default function MobileBar({
  projects, activeProjectId, mode,
  onPickProject, onPickGeneral, onCreateProject,
}) {
  return (
    <div className="md:hidden flex gap-1.5 mb-2 items-center text-xs">
      <button
        onClick={onPickGeneral}
        className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
          mode === 'general'
            ? 'bg-indigo-500/15 border-indigo-500/40 text-white'
            : 'bg-neutral-900/60 border-neutral-800 text-neutral-300'
        }`}>
        💬 <span>General</span>
      </button>
      <select
        value={mode === 'project' ? activeProjectId ?? '' : ''}
        onChange={(e) => e.target.value && onPickProject(parseInt(e.target.value, 10))}
        className="flex-1 px-2 py-1.5 rounded-lg bg-neutral-900/60 border border-neutral-800
                   text-neutral-300">
        <option value="">— pilih project —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button
        onClick={onCreateProject}
        className="px-2.5 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30
                   text-indigo-300">
        + baru
      </button>
    </div>
  );
}
