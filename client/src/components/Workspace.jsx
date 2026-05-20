import { useState } from 'react';
import { api } from '../api.js';
import useChatState from './useChatState.js';

import TopBar from './TopBar.jsx';
import Sidebar from './Sidebar.jsx';
import MobileBar from './MobileBar.jsx';
import ChatView from './ChatView.jsx';
import GithubPanel from './GithubPanel.jsx';
import ChatComposer from './ChatComposer.jsx';
import CreateProjectModal from './CreateProjectModal.jsx';
import ShareModal from './ShareModal.jsx';
import ProfileModal from './ProfileModal.jsx';
import ProjectSettingsModal from './ProjectSettingsModal.jsx';

export default function Workspace({ user, onLogout, onUserUpdated }) {
  const s = useChatState(user);
  const [showCreate, setShowCreate] = useState(false);
  const [shareMsg, setShareMsg] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [settingsProject, setSettingsProject] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null); // {id, role, content, author_name, author_color}

  const projectName = s.mode === 'general'
    ? 'General chat (out of project)'
    : (s.project?.name ?? '…');

  const titleSubtitle = (() => {
    if (s.mode === 'general') {
      return ['General Chat', 'Free-form, out of project',
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
    // Optimistic user bubble + thinking placeholder where appropriate.
    const expectsLLM = s.mode === 'general'
      || (s.mode === 'project' && s.activeTab === 'private')
      || (s.mode === 'project' && s.activeTab === 'all'
          && /(^|\s)@hermes\b/i.test(text));
    const replySnapshot = replyToId
      ? s.messages.find((m) => m.id === replyToId) : null;
    s.setMessages((prev) => {
      const next = [...prev, {
        id: 'tmp-' + Date.now(), role: 'user', content: text,
        attachments,
        author_id: user.id, author_name: user.name,
        author_color: user.color, author_letter: user.avatar_letter,
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
                    content: '_Hermes is typing…_', author_id: null });
      }
      return next;
    });
    setReplyingTo(null);
    try {
      await api(`/api/chats/${s.activeChatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text, attachments,
                               reply_to_id: replyToId }),
      });
    } catch (e) { console.error(e); }
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
    // Tab change triggers messages reload via effect chain in hook.
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
      <TopBar user={user} projectName={projectName} onLogout={onLogout}
              onProfileClick={() => setShowProfile(true)} />

      <div className="max-w-7xl mx-auto flex gap-4 p-3 sm:p-4">
        <Sidebar
          user={user}
          projects={s.projects}
          activeProjectId={s.project?.id}
          mode={s.mode}
          members={s.members}
          onPickProject={s.switchProject}
          onPickGeneral={s.enterGeneral}
          onCreateProject={() => setShowCreate(true)}
          onProjectSettings={(p) => setSettingsProject(p)}
        />

        <main className="flex-1 min-w-0">
          <MobileBar
            projects={s.projects}
            activeProjectId={s.project?.id}
            mode={s.mode}
            onPickProject={s.switchProject}
            onPickGeneral={s.enterGeneral}
            onCreateProject={() => setShowCreate(true)}
          />

          {s.mode === 'project' && (
            <div className="md:hidden flex gap-1 mb-3 p-1 bg-neutral-900/60
                            border border-neutral-800 rounded-lg">
              {['private', 'all'].map((t) => (
                <button key={t}
                  onClick={() => s.setActiveTab(t)}
                  className={`flex-1 text-xs py-1.5 rounded ${
                    s.activeTab === t
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-400'
                  }`}>
                  {t === 'private' ? '🔒 Private' : '💬 Chat All'}
                </button>
              ))}
            </div>
          )}

          {s.mode === 'project' && (
            <div className="hidden md:flex gap-1 mb-3 p-1 theme-panel rounded-lg max-w-xs">
              {['private', 'all'].map((t) => (
                <button key={t}
                  onClick={() => s.setActiveTab(t)}
                  className={`flex-1 text-xs py-1.5 rounded ${
                    s.activeTab === t
                      ? 'bg-[color:var(--bg-3)] text-[color:var(--fg)]'
                      : 'theme-muted'
                  }`}>
                  {t === 'private' ? '🔒 Private' : '💬 Chat All'}
                </button>
              ))}
            </div>
          )}

          <div className="mb-2 px-1">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-neutral-500">{subtitle}</div>
          </div>

          {s.mode === 'project' && s.project?.github_repo && (
            <GithubPanel project={s.project} />
          )}

          <ChatView
            messages={s.messages}
            mode={s.mode}
            activeTab={s.activeTab}
            onShare={(m) => setShareMsg(m)}
            onReply={(m) => setReplyingTo(m)}
            onPin={onPin}
          />

          <ChatComposer
            hint={hint}
            disabled={!s.activeChatId}
            onSend={send}
            mentionUsers={s.allUsers}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
          />
        </main>
      </div>

      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={onCreated}
      />
      <ShareModal
        message={shareMsg}
        onClose={() => setShareMsg(null)}
        onShared={onShared}
      />
      <ProfileModal
        open={showProfile}
        user={user}
        onClose={() => setShowProfile(false)}
        onSaved={onProfileSaved}
      />
      <ProjectSettingsModal
        open={!!settingsProject}
        project={settingsProject}
        onClose={() => setSettingsProject(null)}
        onSaved={onProjectSaved}
        onDeleted={onProjectDeleted}
      />
    </>
  );
}
