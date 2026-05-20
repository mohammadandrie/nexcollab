import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

// Custom hook keeps Workspace.jsx lean.
export default function useChatState(user) {
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [chats, setChats] = useState({ private: null, all: null, general: null });
  const [mode, setMode] = useState('project');         // 'project' | 'general'
  const [activeTab, setActiveTab] = useState('private');// 'private' | 'all'
  const [messages, setMessages] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const refreshProjects = useCallback(async () => {
    const { projects } = await api('/api/projects');
    setProjects(projects);
    return projects;
  }, []);

  const switchProject = useCallback(async (projectId) => {
    const detail = await api(`/api/projects/${projectId}`);
    setProject(detail.project);
    setMembers(detail.members);
    setChats((c) => ({ ...c, private: detail.my_private_chat_id, all: detail.chat_all_id }));
    setMode('project');
  }, []);

  const enterGeneral = useCallback(async () => {
    if (!chats.general) {
      const { chat_id } = await api('/api/chats/general');
      setChats((c) => ({ ...c, general: chat_id }));
    }
    setMode('general');
    setProject(null);
    setMembers([]);
  }, [chats.general]);

  // Bootstrap: load projects + general id + all users (for @-mention).
  useEffect(() => {
    (async () => {
      const ps = await refreshProjects();
      try {
        const { chat_id } = await api('/api/chats/general');
        setChats((c) => ({ ...c, general: chat_id }));
      } catch {}
      try {
        const { users } = await api('/api/auth/users');
        setAllUsers(users);
      } catch {}
      if (ps.length) await switchProject(ps[0].id);
    })().catch(console.error);
  }, [refreshProjects, switchProject]);

  // Reload messages whenever active chat changes.
  const activeChatId = mode === 'general' ? chats.general
    : (activeTab === 'private' ? chats.private : chats.all);

  useEffect(() => {
    if (!activeChatId) { setMessages([]); return; }
    let cancelled = false;
    api(`/api/chats/${activeChatId}/messages`).then(({ messages }) => {
      if (!cancelled) setMessages(messages);
    });
    return () => { cancelled = true; };
  }, [activeChatId]);

  const reloadMessages = useCallback(async () => {
    if (!activeChatId) return;
    const { messages } = await api(`/api/chats/${activeChatId}/messages`);
    setMessages(messages);
  }, [activeChatId]);

  return {
    projects, project, members, chats, mode, activeTab, messages,
    activeChatId, user, allUsers,
    setActiveTab, setMessages,
    refreshProjects, switchProject, enterGeneral, reloadMessages,
  };
}
