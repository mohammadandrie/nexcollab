// SSE consumer for /api/threads/:id/comment/stream.
// Renders staged bubbles per agent turn — each agent in a chain gets
// its own "Agent X is thinking…" placeholder, replaced by the final
// hydrated event when its run completes.
//
// Server event grammar (server/streamCommentDispatch.js):
//   user_saved → { event }                 (persisted user comment)
//   thinking   → { agent: {id, name, ...} }(agent picked, placeholder bubble)
//   completed  → { event }                 (one agent finished, replace placeholder)
//   error      → { detail, message }       (mark last thinking failed, stop)
//   done       → {}                        (loop exit)
//   heartbeat  → ignored

function parseSSE(buf) {
  const out = [];
  const chunks = buf.split(/\r?\n\r?\n/);
  const leftover = chunks.pop() ?? '';
  for (const chunk of chunks) {
    let event = 'message';
    let data = '';
    for (const line of chunk.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (data) out.push({ event, data });
  }
  return [out, leftover];
}

const ghostId = (agentId) => `thinking-agent-${agentId}`;

export async function consumeCommentStream(threadId, body, setEvents, tmpUserKey) {
  const r = await fetch(`/api/threads/${threadId}/comment/stream`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    window.dispatchEvent(new CustomEvent('nexcollab:unauthenticated'));
    throw new Error('unauthenticated');
  }
  if (!r.ok) {
    setEvents((prev) => prev.filter((e) => e._ghost_key !== tmpUserKey));
    throw new Error(`stream HTTP ${r.status}`);
  }

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let lastGhost = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const [events, leftover] = parseSSE(buf);
    buf = leftover;

    for (const evt of events) {
      let data; try { data = JSON.parse(evt.data); } catch { continue; }

      if (evt.event === 'user_saved') {
        // Promote optimistic ghost to real persisted shape
        setEvents((prev) => prev.map((e) => e._ghost_key === tmpUserKey
          ? { ...data.event, _ghost_key: undefined } : e));
      } else if (evt.event === 'thinking') {
        const ag = data.agent || {};
        const gk = ghostId(ag.id);
        lastGhost = gk;
        setEvents((prev) => [...prev, {
          _ghost_key: gk, kind: 'comment',
          event_id: gk, agent: ag, agent_id: ag.id,
          actor_id: null, ts: new Date(), content: '',
          streaming: true, thinking: true,
          role_at_post: ag.role || null,
        }]);
      } else if (evt.event === 'completed') {
        const ev = data.event || {};
        const gk = ghostId(ev.agent_id);
        lastGhost = null;
        setEvents((prev) => prev.map((e) => e._ghost_key === gk
          ? { ...ev, streaming: false, thinking: false } : e));
      } else if (evt.event === 'error') {
        if (lastGhost) {
          setEvents((prev) => prev.map((e) => e._ghost_key === lastGhost
            ? { ...e, streaming: false, error: true, thinking: false,
                content: `_⚠ ${data.message || data.detail || 'Agent failed'}_` }
            : e));
        }
        return;
      }
    }
  }
}
