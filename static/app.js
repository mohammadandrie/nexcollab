// Nexcollab frontend — vanilla JS, ~250 lines.
const $ = (id) => document.getElementById(id);
const state = {
  user: null, projects: [], project: null, members: [],
  chats: { private: null, all: null },
  active: 'private',          // 'private' | 'all'
  messages: [],
  shareMessageId: null,
};

// ---------- bootstrap ----------
async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (r.status === 401) { location.href = '/login'; throw new Error('unauthenticated'); }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function boot() {
  try { ({ user: state.user } = await api('/api/auth/me')); }
  catch { return; }

  renderUserBadge();

  const { projects } = await api('/api/projects');
  state.projects = projects;
  renderProjects();
  if (!projects.length) { $('messages').innerHTML = empty('Belum ada project. Klik "+ baru" di sidebar.'); }

  bindTabs();
  bindComposer();
  bindShareModal();
  $('logout-btn').addEventListener('click', logout);
  $('new-project-btn').addEventListener('click', createProjectFlow);

  if (projects.length) await switchProject(projects[0].id);
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login';
}

// ---------- rendering ----------
function escHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function mdLite(s) {
  // tiny markdown: bold **x**, italic _x_, inline code `x`, paragraphs.
  return escHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>')
    .split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
}
function empty(text) { return `<div class="text-center text-xs text-neutral-600 py-12">${text}</div>`; }

function renderUserBadge() {
  const u = state.user;
  $('user-badge').innerHTML = `
    <div class="hidden sm:flex items-center gap-2 text-xs">
      <span>${u.name}</span>
      <span class="role-${u.role} pill border text-[10px] rounded-full px-2 py-0.5
                   border">${u.role}</span>
    </div>
    <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
         style="background:${u.color}22;color:${u.color};border:1px solid ${u.color}55">
      ${u.avatar_letter}
    </div>`;
}

function renderMembers() {
  $('member-list').innerHTML = state.members.map(m => `
    <div class="flex items-center gap-2 text-xs">
      <div class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
           style="background:${m.color}22;color:${m.color};border:1px solid ${m.color}55">
        ${m.avatar_letter}
      </div>
      <span class="text-neutral-300">${m.name}</span>
      <span class="role-${m.role} ml-auto text-[9px] px-1.5 py-0.5 rounded border">${m.role}</span>
    </div>`).join('');
}

function renderProjects() {
  const list = $('project-list');
  if (!state.projects.length) {
    list.innerHTML = `<div class="text-[11px] text-neutral-600 italic">belum ada project</div>`;
    return;
  }
  list.innerHTML = state.projects.map(p => {
    const active = state.project && state.project.id === p.id;
    const cls = active
      ? 'bg-indigo-500/10 border-indigo-500/40 text-white'
      : 'border-transparent text-neutral-300 hover:bg-neutral-800/50';
    return `
      <button data-project-id="${p.id}"
              class="project-btn w-full text-left text-xs p-2 rounded-lg border ${cls}">
        <div class="flex items-center gap-1.5">
          <span class="text-neutral-500">▸</span>
          <span class="truncate">${escHtml(p.name)}</span>
        </div>
      </button>`;
  }).join('');
  list.querySelectorAll('.project-btn').forEach(btn => {
    btn.addEventListener('click', () => switchProject(parseInt(btn.dataset.projectId, 10)));
  });
}

async function switchProject(projectId) {
  const proj = state.projects.find(p => p.id === projectId);
  if (!proj) return;
  state.project = proj;
  $('project-name').textContent = proj.name;
  const detail = await api(`/api/projects/${projectId}`);
  state.members = detail.members;
  state.chats.private = detail.my_private_chat_id;
  state.chats.all     = detail.chat_all_id;
  renderProjects();
  renderMembers();
  await loadActiveChat();
}

async function createProjectFlow() {
  const name = prompt('Nama project baru:');
  if (!name || !name.trim()) return;
  const description = prompt('Deskripsi singkat (opsional):') || '';
  const { project_id } = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim(), description: description.trim() }),
  });
  const { projects } = await api('/api/projects');
  state.projects = projects;
  await switchProject(project_id);
}

function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(tab) {
  state.active = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('tab-active', on);
    b.classList.toggle('tab-inactive', !on);
  });
  if (tab === 'private') {
    $('chat-title').textContent = 'Chat Pribadi';
    $('chat-subtitle').textContent = 'Brainstorming privat dengan Hermes';
    $('composer-hint').textContent = 'Hermes akan jawab. Kalau hasilnya bagus, klik "Send to Chat All" buat share ke tim.';
  } else {
    $('chat-title').textContent = 'Chat All — decision log';
    $('chat-subtitle').textContent = 'Shared dengan semua anggota project';
    $('composer-hint').textContent = 'Pesan di sini langsung tampil ke semua anggota project.';
  }
  loadActiveChat();
}

async function loadActiveChat() {
  const chatId = state.chats[state.active];
  $('messages').innerHTML = empty('memuat…');
  const { messages } = await api(`/api/chats/${chatId}/messages`);
  state.messages = messages;
  renderMessages();
}

function renderMessages() {
  const box = $('messages');
  if (!state.messages.length) {
    box.innerHTML = empty(state.active === 'private'
      ? 'Mulai percakapan dengan Hermes…'
      : 'Belum ada keputusan yang di-share di project ini.');
    return;
  }
  box.innerHTML = state.messages.map(m => bubble(m)).join('');
  box.querySelectorAll('[data-share-id]').forEach(btn => {
    btn.addEventListener('click', () => openShareModal(parseInt(btn.dataset.shareId, 10)));
  });
  box.scrollTop = box.scrollHeight;
}

function bubble(m) {
  const isAssistant = m.role === 'assistant';
  const wrapCls = isAssistant ? 'hermes-bubble' : 'user-bubble';
  const author = isAssistant
    ? { name: 'Hermes', color: '#818cf8', letter: '✦', role: 'AI' }
    : { name: m.author_name || '—', color: m.author_color || '#888',
        letter: m.author_letter || '?', role: m.author_role || '' };

  const canShare = state.active === 'private';
  const shareBtn = canShare ? `
    <button data-share-id="${m.id}"
            class="text-[10px] text-indigo-300 hover:text-indigo-200 mt-1.5">
      ↗ Send to Chat All
    </button>` : '';

  return `
    <div class="flex gap-2 ${isAssistant ? '' : 'flex-row-reverse'}">
      <div class="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
           style="background:${author.color}22;color:${author.color};border:1px solid ${author.color}55">
        ${author.letter}
      </div>
      <div class="${wrapCls} rounded-xl px-3 py-2 max-w-[85%] sm:max-w-[75%]">
        <div class="flex items-center gap-2 text-[10px] text-neutral-500 mb-0.5">
          <span class="font-medium" style="color:${author.color}">${author.name}</span>
          ${author.role ? `<span class="opacity-70">· ${author.role}</span>` : ''}
        </div>
        <div class="markdown text-sm text-neutral-200">${mdLite(m.content)}</div>
        ${shareBtn}
      </div>
    </div>`;
}

// ---------- composer ----------
function bindComposer() {
  const form = $('composer');
  const ta = $('composer-text');
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    ta.value = ''; ta.style.height = 'auto';
    $('send-btn').disabled = true;
    await sendMessage(text);
    $('send-btn').disabled = false;
    ta.focus();
  });
}

async function sendMessage(text) {
  const chatId = state.chats[state.active];
  // Optimistic user bubble.
  state.messages.push({
    id: 'tmp-' + Date.now(), role: 'user', content: text,
    author_id: state.user.id, author_name: state.user.name,
    author_color: state.user.color, author_letter: state.user.avatar_letter,
    author_role: state.user.role,
  });
  if (state.active === 'private') {
    state.messages.push({ id: 'thinking', role: 'assistant',
                          content: '_Hermes mengetik…_', author_id: null });
  }
  renderMessages();
  try {
    await api(`/api/chats/${chatId}/messages`, {
      method: 'POST', body: JSON.stringify({ content: text }),
    });
  } catch (e) { console.error(e); }
  await loadActiveChat();
}

// ---------- share modal ----------
function bindShareModal() {
  $('share-cancel').addEventListener('click', closeShareModal);
  $('share-confirm').addEventListener('click', confirmShare);
  $('share-modal').addEventListener('click', e => {
    if (e.target.id === 'share-modal') closeShareModal();
  });
}
function openShareModal(messageId) {
  state.shareMessageId = messageId;
  const m = state.messages.find(x => x.id === messageId);
  $('share-preview').innerHTML = mdLite(m ? m.content : '');
  $('share-headline').value = '';
  $('share-modal').classList.remove('hidden');
}
function closeShareModal() {
  state.shareMessageId = null;
  $('share-modal').classList.add('hidden');
}
async function confirmShare() {
  const id = state.shareMessageId;
  if (!id) return;
  const note = $('share-headline').value.trim() || null;
  await api(`/api/messages/${id}/share`, {
    method: 'POST', body: JSON.stringify({ note }),
  });
  closeShareModal();
  switchTab('all');
}

boot();
