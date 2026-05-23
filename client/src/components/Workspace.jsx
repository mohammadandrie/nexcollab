import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import useChatState from './useChatState.js';

// URL slug helper. Stable, lossy projection: "Tes" → "tes", "My App" → "my-app".
// Two projects with identical slugs would collide; we disambiguate with a
// trailing "-<id>" suffix on every project that shares its base slug with
// another. This keeps single-project slugs short ("/tes") but still gives a
// unique URL when there are duplicates ("/tes-7" vs "/tes-12").
function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Build a base→count map across all projects so canonicalSlug can decide
// whether to append the id suffix. Pure function over the projects array.
function slugCounts(projects) {
  const counts = {};
  for (const p of projects) {
    const b = slugify(p.name);
    if (!b) continue;
    counts[b] = (counts[b] || 0) + 1;
  }
  return counts;
}

// Canonical URL slug for one project given the workspace context.
function canonicalSlug(project, projects) {
  const base = slugify(project?.name || '');
  if (!base) return '';
  const counts = slugCounts(projects);
  return counts[base] > 1 ? `${base}-${project.id}` : base;
}

// Resolve a slug-or-slug-id segment back to a project. Tries id-suffix first
// ("tes-7" → project id=7) then base-slug ("tes" → first match by name).
function resolveProjectFromSlug(seg, projects) {
  if (!seg) return null;
  const m = seg.match(/^(.*)-(\d+)$/);
  if (m) {
    const id = parseInt(m[2], 10);
    const byId = projects.find((p) => p.id === id);
    if (byId && slugify(byId.name) === m[1]) return byId;
  }
  // Fall back to name slug match (single-project case).
  return projects.find((p) => slugify(p.name) === seg) || null;
}

import TopBar from './TopBar.jsx';
import Sidebar from './Sidebar.jsx';
import MobileBar from './MobileBar.jsx';
import ChatView from './ChatView.jsx';
import GithubPanel from './GithubPanel.jsx';
import ChatComposer from './ChatComposer.jsx';
import CreateProjectModal from './CreateProjectModal.jsx';
import ShareModal from './ShareModal.jsx';
import ProfileModal from './ProfileModal.jsx';
import AgentSettingsModal from './AgentSettingsModal.jsx';
import MyCardsModal from './MyCardsModal.jsx';
import ProjectSettingsModal from './ProjectSettingsModal.jsx';
import ThreadList from './ThreadList.jsx';
import KanbanBoard from './KanbanBoard.jsx';
import PromoteModal from './PromoteModal.jsx';
import ThreadDetailModal from './ThreadDetailModal.jsx';
import InboxStrip from './InboxStrip.jsx';
import ImagePreviewModal from './ImagePreviewModal.jsx';
import Toast from './Toast.jsx';
import { consumeChatStream, retryChatStream } from './chatStream.js';

export default function Workspace({ user, onLogout, onUserUpdated }) {
  const s = useChatState(user);
  const [showCreate, setShowCreate] = useState(false);
  const [shareMsg, setShareMsg] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [showMyCards, setShowMyCards] = useState(false);
  const [myCardsCount, setMyCardsCount] = useState(0);

  // Poll /api/my-cards count every 30s so the 📥 badge stays fresh.
  // Light query (cap by role match + project scope) so cost is low.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      api('/api/my-cards').then((r) => {
        if (!cancelled) setMyCardsCount(r.count || 0);
      }).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  const [settingsProject, setSettingsProject] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null); // {id, role, content, author_name, author_color}
  const [promoteMsg, setPromoteMsg] = useState(null);  // {id, content} → opens PromoteModal
  const [openThreadId, setOpenThreadId] = useState(null);

  // Project / mode switch must reset transient cross-thread/cross-tab state
  // so the previous project's thread detail, reply draft, share modal, and
  // promote modal don't leak into the new project. The chat state hook
  // already clears messages/threads/members; this covers the local UI state.
  useEffect(() => {
    setOpenThreadId(null);
    setReplyingTo(null);
    setShareMsg(null);
    setPromoteMsg(null);
  }, [s.mode, s.project?.id]);

  const navigate = useNavigate();
  const location = useLocation();

  // URL → state. Path shapes supported:
  //   /                     → first project, Private
  //   /general              → general (free) chat
  //   /<slug>               → project, Private
  //   /<slug>/all           → project, Chat All
  //   /<slug>-<id>[/all]    → disambiguated when slugs collide
  // Run after projects are loaded so the resolver has something to match.
  useEffect(() => {
    if (!s.projects.length) return;
    const parts = location.pathname.replace(/^\/+|\/+$/g, '').split('/');
    const slug = parts[0] || '';
    const tabSeg = (parts[1] || '').toLowerCase();
    const wantTab = tabSeg === 'all' ? 'all' : 'private';
    if (!slug) {
      const target = s.projects[0];
      if (target && (s.mode !== 'project' || s.project?.id !== target.id)) {
        s.switchProject(target.id);
      }
      return;
    }
    if (slug === 'general') {
      if (s.mode !== 'general') s.enterGeneral();
      return;
    }
    const match = resolveProjectFromSlug(slug, s.projects);
    if (match) {
      if (s.mode !== 'project' || s.project?.id !== match.id) {
        s.switchProject(match.id).then(() => {
          if (wantTab === 'all') s.setActiveTab('all');
        });
      } else if (wantTab !== s.activeTab) {
        s.setActiveTab(wantTab);
      }
    }
    // No match = stale URL; we let the user keep their current view rather
    // than forcibly redirecting. The next sidebar click will fix the URL.
  }, [location.pathname, s.projects.length]);

  // State → URL. Mirror active project + tab to the URL bar so reload/share
  // preserves it. Private is the default and stays implicit (no /private
  // suffix); Chat All gets an explicit /all so a teammate can deep-link.
  useEffect(() => {
    let target = '/';
    if (s.mode === 'general') {
      target = '/general';
    } else if (s.project) {
      const slug = canonicalSlug(s.project, s.projects);
      if (slug) {
        target = '/' + slug + (s.activeTab === 'all' ? '/all' : '');
      }
    }
    if (target && location.pathname !== target) {
      navigate(target, { replace: false });
    }
  }, [s.mode, s.project?.id, s.project?.name, s.activeTab, s.projects.length]);

  const projectName = s.mode === 'general'
    ? 'Chat (out of project)'
    : (s.project?.name ?? '…');

  const titleSubtitle = (() => {
    if (s.mode === 'general') {
      return ['Chat', 'Free-form, out of project',
        'Brainstorm anything. Not tied to any project.'];
    }
    const proj = s.project?.name || '';
    if (s.activeTab === 'private') {
      return ['Private Chat', `Private brainstorm with Hermes · ${proj}`,
        'Hermes will reply. Click "Send to Chat All" to share with the team.'];
    }
    return ['Chat All — decision log', `Shared with all members · ${proj}`,
      'Messages here are visible to all project members.'];
  })();
  const [title, subtitle, hint] = titleSubtitle;

  async function send(text, attachments = [], replyToId = null) {
    // Optimistic user bubble + thinking placeholder. We use SSE so the user
    // sees progress (heartbeat → delta → final) instead of a single blocking
    // fetch that's prone to AbortError on long replies. The temporary
    // 'thinking' bubble morphs into a streaming bubble as deltas arrive,
    // then is REPLACED (not appended) by the final persisted message.
    const replySnapshot = replyToId
      ? s.messages.find((m) => m.id === replyToId) : null;
    const replyTargetIsHermes = !!replySnapshot
      && (replySnapshot.role === 'assistant' || replySnapshot.author_id == null);
    const expectsLLM = s.mode === 'general'
      || (s.mode === 'project' && s.activeTab === 'private')
      || (s.mode === 'project' && s.activeTab === 'all'
          && (/(^|\s)@hermes\b/i.test(text) || replyTargetIsHermes));
    const tmpUserId = 'tmp-' + Date.now();
    s.setMessages((prev) => {
      const next = [...prev, {
        id: tmpUserId, role: 'user', content: text,
        attachments,
        author_id: user.id, author_name: user.name,
        author_color: user.color, author_letter: user.avatar_letter,
        author_photo_url: user.photo_url || null,
        author_role: user.role,
        reply_to_id: replyToId,
        reply_to: replySnapshot ? {
          id: replySnapshot.id,
          author_name: replySnapshot.role === 'assistant'
            ? 'Hermes' : (replySnapshot.author_name || '—'),
          author_color: replySnapshot.role === 'assistant'
            ? '#818cf8' : (replySnapshot.author_color || '#888'),
          excerpt: String(replySnapshot.content || '')
            .replace(/\s+/g, ' ').slice(0, 120),
          has_attachment: Array.isArray(replySnapshot.attachments)
            && replySnapshot.attachments.length > 0,
        } : null,
      }];
      if (expectsLLM) {
        next.push({ id: 'thinking', role: 'assistant',
                    content: '_Hermes is thinking…_', author_id: null,
                    streaming: true });
      }
      return next;
    });
    setReplyingTo(null);

    const chatId = s.activeChatId;
    try {
      await consumeChatStream(chatId, { content: text, attachments,
                                        reply_to_id: replyToId },
        s.setMessages, tmpUserId, expectsLLM);
    } catch (e) {
      console.error(e);
      // consumeChatStream already mutates the placeholder into an error bubble;
      // we just refresh in case the user message was saved server-side anyway.
    }
    await s.reloadMessages();
  }

  async function onCreated(projectId) {
    setShowCreate(false);
    await s.refreshProjects();
    await s.switchProject(projectId);
  }

  async function onShared() {
    setShareMsg(null);
    s.setActiveTab('all');
    // Reload threads list so the freshly-created thread shows up immediately
    // (Send to Chat All now creates the thread server-side).
    s.loadThreads();
  }

  async function onProfileSaved(updated) {
    setShowProfile(false);
    onUserUpdated?.(updated);
  }

  async function onProjectSaved(updated) {
    setSettingsProject(null);
    await s.refreshProjects();
    if (s.project?.id === updated.id) await s.switchProject(updated.id);
  }

  async function onProjectDeleted(deletedId) {
    setSettingsProject(null);
    const remaining = await s.refreshProjects();
    if (s.project?.id === deletedId) {
      if (remaining.length) await s.switchProject(remaining[0].id);
      else await s.enterGeneral();
    }
  }

  async function onPin(msg) {
    if (typeof msg.id !== 'number') return;
    try {
      await api(`/api/messages/${msg.id}/pin`, { method: 'POST' });
      await s.reloadMessages();
    } catch (e) { console.error(e); }
  }

  return (
    <>
      <div className="h-screen flex flex-col overflow-hidden">
        <TopBar user={user} projectName={projectName} onLogout={onLogout}
                onProfileClick={() => setShowProfile(true)}
                onAgentSettingsClick={() => setShowAgentSettings(true)}
                onMyCardsClick={() => setShowMyCards(true)}
                myCardsCount={myCardsCount} />

        <div className="flex gap-2 pl-1 sm:pl-2 pr-1 sm:pr-2 pt-2 pb-3
                        flex-1 min-h-0 w-full overflow-hidden">
          <Sidebar
          user={user}
          projects={s.projects}
          activeProjectId={s.project?.id}
          mode={s.mode}
          activeTab={s.activeTab}
          members={s.members}
          unread={s.unread}
          onPickProject={s.switchProject}
          onPickGeneral={s.enterGeneral}
          onPickTab={s.setActiveTab}
          onCreateProject={() => setShowCreate(true)}
          onProjectSettings={(p) => setSettingsProject(p)}
        />

        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          <MobileBar
            projects={s.projects}
            activeProjectId={s.project?.id}
            mode={s.mode}
            onPickProject={s.switchProject}
            onPickGeneral={s.enterGeneral}
            onCreateProject={() => setShowCreate(true)}
          />

          {s.mode === 'project' && s.project?.github_repo && (
            <GithubPanel project={s.project} />
          )}

          {s.mode === 'project' && s.activeTab === 'private' && (
            <InboxStrip
              threads={s.threads}
              currentUserId={user?.id ?? user?._id ?? null}
              onOpen={(id) => setOpenThreadId(id)}
              onRelease={async (id) => {
                try {
                  await api(`/api/threads/${id}/release`, {
                    method: 'POST', body: JSON.stringify({ note: '' }),
                  });
                  s.loadThreads();
                } catch {}
              }}
            />
          )}

          <div key={`${s.mode}:${s.activeTab}:${s.activeChatId ?? 'none'}`}
               className="tab-fade flex-1 min-h-0 flex flex-col">
            {s.mode === 'project' && s.activeTab === 'all' ? (
              openThreadId ? (
                <ThreadDetailModal
                  threadId={openThreadId}
                  currentUserId={user?.id ?? user?._id ?? null}
                  currentUser={user}
                  members={s.members || []}
                  customCategories={s.customCategories || []}
                  onClose={() => setOpenThreadId(null)}
                  onChanged={() => s.loadThreads()}
                  onTalkToAgent={async (thread) => {
                    if (!s.chats?.private) {
                      window.dispatchEvent(new CustomEvent('nexcollab:toast',
                        { detail: { kind: 'error', text: 'Private chat belum siap.' } }));
                      return;
                    }
                    try {
                      await api(`/api/chats/${s.chats.private}/link`, {
                        method: 'POST',
                        body: JSON.stringify({ thread_id: thread.id }),
                      });
                      setOpenThreadId(null);
                      s.setActiveTab?.('private');
                      window.dispatchEvent(new CustomEvent('nexcollab:toast',
                        { detail: { kind: 'success', text: `Private chat dilink ke #${thread.id}` } }));
                    } catch (e) {
                      window.dispatchEvent(new CustomEvent('nexcollab:toast',
                        { detail: { kind: 'error', text: 'Gagal link: ' + (e.message || e) } }));
                    }
                  }}
                />
              ) : (
                <KanbanBoard
                  projectId={s.project?.id ?? null}
                  currentUser={user}
                  members={s.members || []}
                  onOpenThread={(id) => setOpenThreadId(id)}
                />
              )
            ) : (
              <>
                {s.activeChat?.linked_thread_id != null && (
                  <button
                    onClick={() => setOpenThreadId(s.activeChat.linked_thread_id)}
                    className="mb-2 text-left text-[11px] px-2.5 py-1.5 rounded-md
                               bg-[color:var(--accent)]/10 border border-[color:var(--accent)]/30
                               hover:bg-[color:var(--accent)]/20 flex items-center gap-2"
                    title="Buka thread yang sedang dibahas">
                    <span>🔗</span>
                    <span className="font-medium text-[color:var(--accent)]">
                      Linked thread #{s.activeChat.linked_thread_id}
                    </span>
                    <span className="theme-muted">· klik untuk buka</span>
                  </button>
                )}
              <ChatView
                messages={s.messages}
                mode={s.mode}
                activeTab={s.activeTab}
                currentUserId={user?.id ?? user?._id ?? null}
                loading={s.messagesLoading}
                canPromote={s.mode === 'project' && s.activeTab === 'private'}
                myAssignedThreads={(s.threads || []).filter(
                  (t) => t.assignee?.id === (user?.id ?? user?._id)
                         && t.status !== 'done'
                )}
                onShare={(m) => setShareMsg(m)}
                onReply={(m) => setReplyingTo(m)}
                onPin={onPin}
                onRetry={(m) => retryChatStream(m, s.setMessages, user)}
                onPromote={(m) => setPromoteMsg(m)}
              />
              </>
            )}
          </div>

          {!(s.mode === 'project' && s.activeTab === 'all') && (
            <>
              {s.typingUsers && s.typingUsers.length > 0 && (
                <div className="px-1 mt-1 text-[11px] theme-muted flex items-center gap-1.5">
                  <span className="inline-flex gap-0.5">
                    <span className="typing-dot" />
                    <span className="typing-dot" style={{ animationDelay: '120ms' }} />
                    <span className="typing-dot" style={{ animationDelay: '240ms' }} />
                  </span>
                  <span>
                    {s.typingUsers.length === 1
                      ? `${s.typingUsers[0].name} is typing…`
                      : s.typingUsers.length === 2
                        ? `${s.typingUsers[0].name} and ${s.typingUsers[1].name} are typing…`
                        : `${s.typingUsers.length} people are typing…`}
                  </span>
                </div>
              )}

              <ChatComposer
                hint={hint}
                disabled={!s.activeChatId}
                onSend={send}
                mentionUsers={s.allUsers}
                replyingTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
                onTyping={s.pingTyping}
              />
            </>
          )}
        </main>
        </div>
      </div>

      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={onCreated}
      />
      <ShareModal
        message={shareMsg}
        projectId={s.project?.id ?? null}
        onClose={() => setShareMsg(null)}
        onShared={onShared}
      />
      <ProfileModal
        open={showProfile}
        user={user}
        onClose={() => setShowProfile(false)}
        onSaved={onProfileSaved}
      />
      <AgentSettingsModal
        open={showAgentSettings}
        currentUserId={user?.id ?? user?._id ?? null}
        onClose={() => setShowAgentSettings(false)}
        onSaved={() => window.dispatchEvent(new CustomEvent('nexcollab:threads-changed'))}
      />
      <MyCardsModal
        open={showMyCards}
        onClose={() => setShowMyCards(false)}
        onPickCard={(item) => {
          const proj = (s.projects || []).find((p) => p.id === item.project_id);
          if (proj) s.pickProject(proj.id);
          setOpenThreadId(item.id);
          s.setActiveTab?.('all');
        }}
      />
      <ProjectSettingsModal
        open={!!settingsProject}
        project={settingsProject}
        onClose={() => setSettingsProject(null)}
        onSaved={onProjectSaved}
        onDeleted={onProjectDeleted}
      />
      <PromoteModal
        message={promoteMsg}
        projectId={s.project?.id ?? null}
        assignedThreads={(s.threads || []).filter(
          (t) => t.assignee?.id === (user?.id ?? user?._id) && t.status === 'assigned'
        )}
        onClose={() => setPromoteMsg(null)}
        onPromoted={(thread) => { s.loadThreads(); setOpenThreadId(thread.id); }}
      />
      <ImagePreviewModal />
      <Toast />
    </>
  );
}
