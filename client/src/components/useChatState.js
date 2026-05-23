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
  const [typingUsers, setTypingUsers] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [unread, setUnread] = useState({}); // { project_id: count }

  const refreshProjects = useCallback(async () => {
    const { projects } = await api('/api/projects');
    setProjects(projects);
    return projects;
  }, []);

  // Pull per-project unread counts. Cheap one-shot endpoint, polled below.
  const loadUnread = useCallback(async () => {
    try {
      const { unread } = await api('/api/projects/_unread');
      setUnread(unread || {});
    } catch {}
  }, []);

  // Bump last_seen for the given chat id. Called when user enters a chat
  // and after sending. Server clamps to latest msg if up_to omitted.
  const markRead = useCallback(async (chatId) => {
    if (!chatId) return;
    try {
      await api(`/api/chats/${chatId}/mark-read`, { method: 'POST', body: '{}' });
      loadUnread();
    } catch {}
  }, [loadUnread]);

  const switchProject = useCallback(async (projectId) => {
    // Cache hygiene: clear stale per-project state SYNCHRONOUSLY before the
    // new fetch resolves. We do NOT setProject(null) here on purpose — that
    // briefly puts the app into mode='project' + project=null, which causes
    // the state→URL effect in Workspace to emit '/', then the URL→state
    // effect picks projects[0] and re-fires switchProject on the OLD project,
    // bouncing the user back. Keep the old project visible during the fetch;
    // the per-request id guard below protects correctness.
    setMembers([]);
    setMessages([]);
    setThreads([]);
    setCustomCategories([]);
    setChats((c) => ({ ...c, private: null, all: null }));
    // Per-fetch ID guard: if user clicks A→B→A quickly, B's response can
    // arrive AFTER A's and clobber A's state, leaving the sidebar showing A
    // but data from B (the "must refresh manually" bug). Bump the request
    // sequence and drop any response whose id no longer matches the latest.
    switchProject._seq = (switchProject._seq || 0) + 1;
    const reqId = switchProject._seq;
    const detail = await api(`/api/projects/${projectId}`);
    if (reqId !== switchProject._seq) return; // stale response, drop.
    setProject(detail.project);
    setMembers(detail.members);
    setChats((c) => ({ ...c, private: detail.my_private_chat_id, all: detail.chat_all_id }));
    setMode('project');
    setActiveTab('private');
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
  // NOTE: we do NOT auto-switch into the first project here — the URL router
  // in Workspace.jsx is the source of truth for which project is active.
  // Auto-picking here races the URL effect and causes a flash of the wrong
  // project when deep-linking via /<slug>.
  useEffect(() => {
    (async () => {
      await refreshProjects();
      try {
        const { chat_id } = await api('/api/chats/general');
        setChats((c) => ({ ...c, general: chat_id }));
      } catch {}
      try {
        const { users } = await api('/api/auth/users');
        setAllUsers(users);
      } catch {}
    })().catch(console.error);
  }, [refreshProjects]);

  // Reload messages whenever active chat changes.
  const activeChatId = mode === 'general' ? chats.general
    : (activeTab === 'private' ? chats.private : chats.all);

  useEffect(() => {
    if (!activeChatId) { setMessages([]); setMessagesLoading(false); return; }
    // Clear stale messages from the previous chat IMMEDIATELY so users never
    // see ghost bubbles from another tab while the new fetch is in-flight.
    setMessages([]);
    setMessagesLoading(true);
    let cancelled = false;
    const requestedChatId = activeChatId;
    api(`/api/chats/${activeChatId}/messages`).then(({ messages }) => {
      // Guard: if user switched tabs again before this fetch resolved,
      // don't pollute the new tab with the previous tab's data.
      if (cancelled || requestedChatId !== activeChatId) return;
      setMessages(messages);
      setMessagesLoading(false);
      // Entering a chat clears its unread count for the current user.
      markRead(activeChatId);
    }).catch(() => { if (!cancelled) setMessagesLoading(false); });
    return () => { cancelled = true; };
  }, [activeChatId, markRead]);

  // Refresh the global user list every 15s so name/avatar/color edits made
  // by other users propagate without a hard reload.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const { users } = await api('/api/auth/users');
        if (!cancelled) setAllUsers(users);
      } catch {}
    };
    const id = setInterval(tick, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Live updates: poll the active chat every 3s while the tab is visible.
  useEffect(() => {
    if (!activeChatId) return;
    let cancelled = false;
    async function tick() {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const { messages: srv } = await api(`/api/chats/${activeChatId}/messages`);
        if (cancelled) return;
        setMessages((prev) => {
          // Optimistic placeholders kept across polls:
          //   - 'tmp-*' user bubbles (await server insert)
          //   - 'thinking' assistant placeholder (await Hermes reply)
          const placeholders = prev.filter((m) => typeof m.id === 'string');
          const prevSrv = prev.filter((m) => typeof m.id === 'number');
          const lastPrev = prevSrv.length ? prevSrv[prevSrv.length - 1].id : 0;
          const lastSrv = srv.length ? srv[srv.length - 1].id : 0;
          if (lastSrv === lastPrev && prevSrv.length === srv.length) return prev;
          // Server has new messages → drop optimistic user bubbles (the real
          // ones just landed) but keep the 'thinking' placeholder until an
          // assistant reply actually arrives.
          const lastSrvMsg = srv[srv.length - 1];
          const assistantArrived = !!lastSrvMsg
            && lastSrvMsg.role === 'assistant'
            && lastSrvMsg.id > lastPrev;
          const kept = placeholders.filter((m) => {
            if (m.id === 'thinking') return !assistantArrived;
            // tmp-* user bubble: drop as soon as server caught up.
            return false;
          });
          return [...srv, ...kept];
        });
      } catch {}
    }
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeChatId]);

  // Typing indicator: poll active chat for who's typing every 2.5s.
  useEffect(() => {
    if (!activeChatId) { setTypingUsers([]); return; }
    let cancelled = false;
    async function tick() {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const { users } = await api(`/api/chats/${activeChatId}/typing`);
        if (!cancelled) setTypingUsers(users || []);
      } catch {}
    }
    tick();
    const id = setInterval(tick, 2500);
    return () => { cancelled = true; clearInterval(id); setTypingUsers([]); };
  }, [activeChatId]);

  const reloadMessages = useCallback(async () => {
    if (!activeChatId) return;
    const { messages } = await api(`/api/chats/${activeChatId}/messages`);
    setMessages(messages);
  }, [activeChatId]);

  // Threads: load list for current project (Chat All view consumes this).
  // Per-fetch ID guard: if user switched project while this request was in
  // flight, drop the response so we don't pollute the new project's view with
  // the old project's threads (root cause of cross-project thread bleed).
  const loadThreads = useCallback(async () => {
    if (!project?.id) { setThreads([]); return; }
    setThreadsLoading(true);
    loadThreads._seq = (loadThreads._seq || 0) + 1;
    const reqId = loadThreads._seq;
    const reqProjectId = project.id;
    try {
      const { threads } = await api(`/api/projects/${project.id}/threads`);
      if (reqId !== loadThreads._seq) return;
      if (reqProjectId !== project.id) return;
      setThreads(threads);
    } catch {} finally {
      if (reqId === loadThreads._seq) setThreadsLoading(false);
    }
  }, [project?.id]);

  // Auto-load threads on project switch (used by Chat All view + Private inbox).
  useEffect(() => {
    if (mode === 'project' && project?.id) loadThreads();
  }, [mode, project?.id, loadThreads]);

  // Project-scoped custom categories (server-backed, shared across the team).
  // Capture project.id at hook-start; bail if it changes mid-request so we
  // don't show project A's categories under project B.
  const [customCategories, setCustomCategories] = useState([]);
  useEffect(() => {
    if (mode !== 'project' || !project?.id) { setCustomCategories([]); return; }
    let cancelled = false;
    const pid = project.id;
    (async () => {
      // One-shot migration: lift any legacy per-browser localStorage entries
      // up to the server so they become shared/cross-device. Runs once per
      // project context. Failures are silent — server is source of truth.
      try {
        const k = `nexcollab.customCategories.${pid}`;
        const legacy = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(legacy) && legacy.length) {
          for (const name of legacy) {
            try {
              await api(`/api/projects/${pid}/categories`, {
                method: 'POST', body: JSON.stringify({ name }),
              });
            } catch {}
          }
          localStorage.removeItem(k);
        }
      } catch {}
      try {
        const { categories } = await api(`/api/projects/${pid}/categories`);
        if (!cancelled && pid === project.id) setCustomCategories(categories || []);
      } catch { if (!cancelled && pid === project.id) setCustomCategories([]); }
    })();
    return () => { cancelled = true; };
  }, [mode, project?.id]);

  // Realtime: poll threads list every 4s while in a project so newly-shared
  // threads (Send to Chat All from any teammate) appear without manual refresh.
  // Capture project.id at tick-start; if user switches mid-request, drop result.
  useEffect(() => {
    if (mode !== 'project' || !project?.id) return;
    let cancelled = false;
    const pid = project.id;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const { threads: srv } = await api(`/api/projects/${pid}/threads`);
        if (cancelled || pid !== project.id) return;
        setThreads(srv);
      } catch {}
    };
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [mode, project?.id]);

  // Throttled typing ping. Caller may invoke on every keystroke; we only
  // POST at most once per 2s, and explicitly send {typing:false} on stop.
  const pingTyping = useCallback((typing) => {
    if (!activeChatId) return;
    pingTyping._lastSent ??= 0;
    pingTyping._lastChat ??= null;
    const now = Date.now();
    if (typing) {
      if (pingTyping._lastChat === activeChatId
          && now - pingTyping._lastSent < 2000) return;
      pingTyping._lastSent = now;
      pingTyping._lastChat = activeChatId;
      api(`/api/chats/${activeChatId}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typing: true }),
      }).catch(() => {});
    } else {
      pingTyping._lastSent = 0;
      api(`/api/chats/${activeChatId}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typing: false }),
      }).catch(() => {});
    }
  }, [activeChatId]);

  // Unread badges: load on mount + every 8s + after sending. Cheap query.
  useEffect(() => {
    loadUnread();
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadUnread();
    }, 8000);
    return () => clearInterval(id);
  }, [loadUnread]);

  return {
    projects, project, members, chats, mode, activeTab, messages,
    activeChatId, user, allUsers, typingUsers, messagesLoading,
    threads, threadsLoading, customCategories, unread,
    setActiveTab, setMessages,
    refreshProjects, switchProject, enterGeneral, reloadMessages, pingTyping,
    loadThreads, markRead, loadUnread,
  };
}
