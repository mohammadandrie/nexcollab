import { useState } from 'react';
import { api } from '../api.js';
import useChatState from './useChatState.js';

import TopBar from './TopBar.jsx';
import Sidebar from './Sidebar.jsx';
import MobileBar from './MobileBar.jsx';
import ChatView from './ChatView.jsx';
import ChatComposer from './ChatComposer.jsx';
import CreateProjectModal from './CreateProjectModal.jsx';
import ShareModal from './ShareModal.jsx';

export default function Workspace({ user, onLogout }) {
  const s = useChatState(user);
  const [showCreate, setShowCreate] = useState(false);
  const [shareMsg, setShareMsg] = useState(null);

  const projectName = s.mode === 'general'
    ? 'Chat bebas (di luar project)'
    : (s.project?.name ?? '…');

  const titleSubtitle = (() => {
    if (s.mode === 'general') {
      return ['Chat General', 'Bebas — di luar project',
        'Brainstorm apa saja. Tidak terhubung ke project manapun.'];
    }
    const proj = s.project?.name || '';
    if (s.activeTab === 'private') {
      return ['Chat Pribadi', `Brainstorming privat dengan Hermes · ${proj}`,
        'Hermes akan jawab. Klik "Send to Chat All" buat share ke tim.'];
    }
    return ['Chat All — decision log', `Shared dengan semua anggota · ${proj}`,
      'Pesan di sini langsung tampil ke semua anggota project.'];
  })();
  const [title, subtitle, hint] = titleSubtitle;

  async function send(text) {
    // Optimistic user bubble + thinking placeholder where appropriate.
    const expectsLLM = s.mode === 'general'
      || (s.mode === 'project' && s.activeTab === 'private');
    s.setMessages((prev) => {
      const next = [...prev, {
        id: 'tmp-' + Date.now(), role: 'user', content: text,
        author_id: user.id, author_name: user.name,
        author_color: user.color, author_letter: user.avatar_letter,
        author_role: user.role,
      }];
      if (expectsLLM) {
        next.push({ id: 'thinking', role: 'assistant',
                    content: '_Hermes mengetik…_', author_id: null });
      }
      return next;
    });
    try {
      await api(`/api/chats/${s.activeChatId}/messages`, {
        method: 'POST', body: JSON.stringify({ content: text }),
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

  return (
    <>
      <TopBar user={user} projectName={projectName} onLogout={onLogout} />

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
                  {t === 'private' ? '🔒 Pribadi' : '💬 Chat All'}
                </button>
              ))}
            </div>
          )}

          {s.mode === 'project' && (
            <div className="hidden md:flex gap-1 mb-3 p-1 bg-neutral-900/60
                            border border-neutral-800 rounded-lg max-w-xs">
              {['private', 'all'].map((t) => (
                <button key={t}
                  onClick={() => s.setActiveTab(t)}
                  className={`flex-1 text-xs py-1.5 rounded ${
                    s.activeTab === t
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-400'
                  }`}>
                  {t === 'private' ? '🔒 Pribadi' : '💬 Chat All'}
                </button>
              ))}
            </div>
          )}

          <div className="mb-2 px-1">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-neutral-500">{subtitle}</div>
          </div>

          <ChatView
            messages={s.messages}
            mode={s.mode}
            activeTab={s.activeTab}
            onShare={(m) => setShareMsg(m)}
          />

          <ChatComposer
            hint={hint}
            disabled={!s.activeChatId}
            onSend={send}
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
    </>
  );
}
