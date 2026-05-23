// Stage 1 thread list — replaces flat Chat All timeline.
// Card actions: Edit (originator), Delete (originator), View (eye → views list).
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import CategoryPicker from './CategoryPicker.jsx';

const STATUS_STYLE = {
  open:       { label: 'Open',      cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  assigned:   { label: 'Assigned',  cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  review:     { label: 'In review', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  done:       { label: 'Done',      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

function fmtAge(d) {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// "May 21, 2026, 10:35 AM" — for hover tooltip.
function fmtFull(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return String(d); }
}

const PAGE_SIZE = 5;

export default function ThreadList({ threads, loading, currentUserId, projectId, onOpen, onChanged }) {
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [delId, setDelId] = useState(null);
  const [viewsId, setViewsId] = useState(null);
  const [viewsList, setViewsList] = useState([]);
  const [busy, setBusy] = useState(false);
  const popRef = useRef(null);

  // Filters + pagination.
  const [fCategory, setFCategory] = useState('All');
  const [fFrom, setFFrom] = useState('');
  const [fUntil, setFUntil] = useState('');
  const [fSearch, setFSearch] = useState('');
  const [page, setPage] = useState(1);
  const [customCats, setCustomCats] = useState([]);

  // Reload custom categories from server when project context changes.
  useEffect(() => {
    if (!projectId) { setCustomCats([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { categories } = await api(`/api/projects/${projectId}/categories`);
        if (!cancelled) setCustomCats(categories || []);
      } catch { if (!cancelled) setCustomCats([]); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Reset to page 1 whenever filters change.
  useEffect(() => { setPage(1); }, [fCategory, fFrom, fUntil, fSearch]);

  // Project switch ↦ wipe transient list state. Filters/category/search/page
  // and the inline-edit/delete row state must NOT leak from the previous
  // project's view; otherwise the user lands on project B with project A's
  // category dropdown and an open delete confirm pointed at a stale id.
  useEffect(() => {
    setFCategory('All'); setFFrom(''); setFUntil(''); setFSearch('');
    setPage(1);
    setEditId(null); setEditTitle('');
    setDelId(null);
    setViewsId(null); setViewsList([]);
  }, [projectId]);

  // Defensive: if user pushes From past the current Until, clear Until so the
  // input doesn't render with an invalid (out-of-min) value.
  useEffect(() => {
    if (fFrom && fUntil && fFrom > fUntil) setFUntil('');
  }, [fFrom, fUntil]);

  function resetFilters() {
    setFCategory('All'); setFFrom(''); setFUntil(''); setFSearch(''); setPage(1);
  }

  // Close views popover on outside click.
  useEffect(() => {
    if (!viewsId) return;
    function onDown(e) {
      if (popRef.current && !popRef.current.contains(e.target)) setViewsId(null);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [viewsId]);

  async function loadViews(id) {
    setViewsList([]);
    try {
      const { views } = await api(`/api/threads/${id}/views`);
      setViewsList(views || []);
    } catch { setViewsList([]); }
  }

  async function saveEdit() {
    const t = editTitle.trim();
    if (!t || !editId) return;
    setBusy(true);
    try {
      await api(`/api/threads/${editId}`, {
        method: 'PATCH', body: JSON.stringify({ title: t }),
      });
      setEditId(null); setEditTitle('');
      onChanged?.();
    } finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!delId) return;
    setBusy(true);
    try {
      await api(`/api/threads/${delId}`, { method: 'DELETE' });
      setDelId(null);
      onChanged?.();
    } finally { setBusy(false); }
  }

  // Change a thread's category. If the picked value isn't a builtin or known
  // custom, register it on the project first so it shows up in dropdowns
  // everywhere (cross-device, cross-user). Anti-empty: caller (CategoryPicker)
  // already guards against empty strings.
  async function changeCategory(threadId, value) {
    const v = String(value || '').trim();
    if (!v) return;
    const known = ['Bug', 'Request', ...customCats]
      .map((s) => s.toLowerCase());
    if (!known.includes(v.toLowerCase()) && projectId) {
      try {
        const { categories } = await api(`/api/projects/${projectId}/categories`, {
          method: 'POST', body: JSON.stringify({ name: v }),
        });
        if (Array.isArray(categories)) setCustomCats(categories);
      } catch {}
    }
    await api(`/api/threads/${threadId}`, {
      method: 'PATCH', body: JSON.stringify({ category: v }),
    });
    onChanged?.();
  }

  // Apply filter chain: category → date range → search.
  const filtered = (threads || []).filter((t) => {
    if (fCategory !== 'All' && (t.category || 'Other') !== fCategory) return false;
    if (fFrom) {
      const from = new Date(fFrom + 'T00:00:00');
      if (new Date(t.updated_at) < from) return false;
    }
    if (fUntil) {
      // Defensive: if Until somehow ended up before From, ignore it instead of
      // returning zero rows for an obviously broken state.
      if (!fFrom || fUntil >= fFrom) {
        const until = new Date(fUntil + 'T23:59:59');
        if (new Date(t.updated_at) > until) return false;
      }
    }
    if (fSearch.trim()) {
      const q = fSearch.trim().toLowerCase();
      if (!String(t.title || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="theme-panel rounded-xl p-2 mb-2
                      flex flex-wrap items-center gap-2 text-[11px]">
        <select value={fCategory}
                onChange={(e) => setFCategory(e.target.value)}
                className="theme-input px-2 py-1 text-xs">
          <option value="All">All categories</option>
          <option value="Bug">Bug</option>
          <option value="Request">Request</option>
          {customCats.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <label className="theme-muted">From
          <input type="date" value={fFrom}
                 onChange={(e) => setFFrom(e.target.value)}
                 className="theme-input px-1.5 py-1 ml-1 text-xs" />
        </label>
        <label className="theme-muted">Until
          <input type="date" value={fUntil}
                 min={(() => {
                   const today = new Date().toISOString().slice(0, 10);
                   return fFrom && fFrom > today ? fFrom : today;
                 })()}
                 onChange={(e) => setFUntil(e.target.value)}
                 className="theme-input px-1.5 py-1 ml-1 text-xs
                            disabled:opacity-50" />
        </label>
        <input type="search" value={fSearch}
               onChange={(e) => setFSearch(e.target.value)}
               placeholder="Search by title…"
               className="theme-input px-2 py-1 text-xs flex-1 min-w-[140px]" />
        <button type="button" onClick={resetFilters}
                className="px-2 py-1 rounded theme-card hover:opacity-80">
          ↺ Reset
        </button>
        <span className="theme-muted ml-auto whitespace-nowrap">
          {filtered.length} of {threads.length}
        </span>
      </div>
      <div className="scrollbar theme-panel rounded-xl p-3 sm:p-4 space-y-2 overflow-y-auto flex-1">
        {loading && (
          <div className="text-center text-xs theme-muted py-12">Loading threads…</div>
        )}
        {!loading && threads.length === 0 && (
          <div className="text-center text-xs theme-muted py-12">
            No threads yet. Promote a Private message to start one.
          </div>
        )}
        {!loading && threads.length > 0 && filtered.length === 0 && (
          <div className="text-center text-xs theme-muted py-12">
            No threads match your filters.
          </div>
        )}
        {!loading && pageRows.map((t) => {
          const st = STATUS_STYLE[t.status] || STATUS_STYLE.open;
          const isOwner = t.originator?.id === currentUserId;
          const isEditing = editId === t.id;
          return (
            <div key={t.id}
              role="button" tabIndex={0}
              onClick={() => { if (!isEditing) onOpen(t.id); }}
              onKeyDown={(e) => {
                if (isEditing) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.id); }
              }}
              className="theme-card rounded-lg p-3 flex items-start gap-3
                         hover:opacity-95 transition cursor-pointer
                         focus:outline-none focus:ring-1 focus:ring-indigo-500/40">
              <Avatar photoUrl={t.originator?.photo_url} letter={t.originator?.avatar_letter}
                      color={t.originator?.color || '#888'} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  {isEditing ? (
                    <input value={editTitle} maxLength={200} autoFocus
                           onClick={(e) => e.stopPropagation()}
                           onChange={(e) => setEditTitle(e.target.value)}
                           onKeyDown={(e) => {
                             e.stopPropagation();
                             if (e.key === 'Enter') saveEdit();
                             if (e.key === 'Escape') setEditId(null);
                           }}
                           className="theme-input text-sm flex-1" />
                  ) : (
                    <span className="text-sm font-medium truncate text-[color:var(--fg)]">
                      {t.title}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-px rounded border ${st.cls}`}>
                    {st.label}
                  </span>
                  {t.originator?.id === currentUserId ? (
                    <CategoryPicker
                      current={t.category || 'Other'}
                      customCategories={customCats}
                      onPick={(v) => changeCategory(t.id, v)}
                    />
                  ) : (
                    <span className="text-[10px] px-1.5 py-px rounded border
                                     bg-neutral-700/30 text-neutral-300 border-neutral-600/40">
                      {t.category || 'Other'}
                    </span>
                  )}
                </div>
                <div className="text-[11px] theme-muted truncate">
                  {t.originator?.name || '—'}
                  {t.assignee && <> · → {t.assignee.name}</>}
                  {' · '}{fmtAge(t.updated_at)}
                  {' · '}<span className="opacity-80">{fmtFull(t.updated_at)}</span>
                  {t.comment_count > 0 && <> · 💬 {t.comment_count}</>}
                </div>
              </div>
              <div className="flex items-center gap-1 text-[12px] relative"
                   onClick={(e) => e.stopPropagation()}>
                {isEditing ? (
                  <>
                    <button onClick={saveEdit} disabled={busy}
                            className="px-2 py-1 rounded promote-btn text-white">Save</button>
                    <button onClick={() => setEditId(null)} disabled={busy}
                            className="px-2 py-1 rounded theme-card hover:opacity-80">Cancel</button>
                  </>
                ) : (
                  <>
                    <button title={`${t.views_count || 0} views`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (viewsId === t.id) { setViewsId(null); return; }
                              setViewsId(t.id); loadViews(t.id);
                            }}
                            className="px-1.5 py-1 rounded hover:bg-[color:var(--bg-2)]">
                      👁 <span className="text-[10px] theme-muted">{t.views_count || 0}</span>
                    </button>
                    {isOwner && (
                      <>
                        <button title="Edit title"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditId(t.id); setEditTitle(t.title);
                                }}
                                className="px-1.5 py-1 rounded hover:bg-[color:var(--bg-2)]">
                          ✏
                        </button>
                        <button title="Delete thread"
                                onClick={(e) => { e.stopPropagation(); setDelId(t.id); }}
                                className="px-1.5 py-1 rounded hover:bg-red-500/15 text-red-400">
                          🗑
                        </button>
                      </>
                    )}
                  </>
                )}
                {viewsId === t.id && (
                  <div ref={popRef}
                       className="absolute right-0 top-full mt-1 z-30 min-w-[200px]
                                  theme-card rounded-md shadow-lg menu-pop p-2">
                    <div className="text-[10px] uppercase tracking-wide theme-muted mb-1.5">
                      Viewed by ({viewsList.length})
                    </div>
                    {viewsList.length === 0 ? (
                      <div className="text-[11px] theme-muted py-1">
                        No views yet.
                      </div>
                    ) : viewsList.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 text-[11px]">
                        <Avatar photoUrl={v.user?.photo_url} letter={v.user?.avatar_letter}
                                color={v.user?.color || '#888'} size={18} />
                        <span className="truncate flex-1">{v.user?.name || '—'}</span>
                        <span className="theme-muted text-[10px] whitespace-nowrap">
                          {fmtAge(v.last_seen)} · {fmtFull(v.last_seen)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-2 text-[11px]">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="px-2 py-1 rounded theme-card hover:opacity-80 disabled:opacity-40">
            ‹ Prev
          </button>
          <span className="theme-muted">
            Page {safePage} of {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="px-2 py-1 rounded theme-card hover:opacity-80 disabled:opacity-40">
            Next ›
          </button>
        </div>
      )}

      {delId && (
        <div onClick={(e) => e.target === e.currentTarget && setDelId(null)}
             className="fixed inset-0 z-50 flex items-center justify-center px-4"
             style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm theme-card rounded-xl p-4">
            <div className="text-sm font-semibold mb-1">Delete thread?</div>
            <div className="text-[11px] theme-muted mb-3">
              This permanently removes the thread and its activity log.
              Cannot be undone.
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDelId(null)} disabled={busy}
                      className="text-xs theme-muted px-3 py-1.5">Cancel</button>
              <button onClick={confirmDelete} disabled={busy}
                      className="text-xs px-3 py-1.5 rounded-lg
                                 bg-red-500/20 text-red-300 border border-red-500/40
                                 hover:opacity-80 disabled:opacity-50">
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
