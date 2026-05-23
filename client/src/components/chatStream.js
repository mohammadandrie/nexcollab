// SSE consumer for the streaming chat endpoint.
// Reads /api/chats/:id/stream and mutates the messages list in place via
// the provided setMessages updater. The temporary 'thinking' bubble morphs
// into a streaming bubble as deltas arrive, then is REPLACED (not appended)
// by the final persisted assistant_message row in the SSE 'final' event.
//
// Event grammar (from server/routes/chat.js):
//   user_saved  → { user_message_id }
//   thinking    → { msg }
//   heartbeat   → { ts }                    (ignored client-side; just keeps socket warm)
//   delta       → { content }               (token chunk)
//   retry       → { attempt, delay_ms }     (transient gateway retry)
//   final       → { assistant_message }     (persisted final row, or null)
//   error       → { detail, message, retryable }
//
// On error, we mutate the placeholder into an error bubble carrying the
// retry payload (chatId + body) so the UI can offer a Retry button.

function parseSSE(buf) {
  // Yields { event, data } objects from a raw text buffer of SSE bytes.
  // Returns [parsed events array, leftover buffer string]. Per spec, events
  // are separated by blank lines; lines starting with 'event:' name the type
  // and 'data:' carry the payload. We accept LF and CRLF.
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

export async function consumeChatStream(chatId, body, setMessages,
                                        tmpUserId, expectsLLM) {
  const r = await fetch(`/api/chats/${chatId}/stream`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    window.dispatchEvent(new CustomEvent('nexcollab:unauthenticated'));
    throw new Error('unauthenticated');
  }
  if (!r.ok) {
    setMessages((prev) => prev.map((m) => m.id === 'thinking'
      ? { ...m, streaming: false, error: true,
          content: `_Stream failed: HTTP ${r.status}_`,
          retryPayload: { chatId, body }, expectsLLM }
      : m));
    throw new Error(`stream HTTP ${r.status}`);
  }

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let acc = '';
  let sawDelta = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const [events, leftover] = parseSSE(buf);
    buf = leftover;

    for (const evt of events) {
      let data;
      try { data = JSON.parse(evt.data); } catch { continue; }

      if (evt.event === 'user_saved') {
        // Promote the optimistic tmp-user bubble to a real id so reply-to
        // and dedup against polled messages work correctly.
        setMessages((prev) => prev.map((m) => m.id === tmpUserId
          ? { ...m, id: data.user_message_id }
          : m));
      } else if (evt.event === 'thinking') {
        if (!expectsLLM) continue;
        setMessages((prev) => prev.map((m) => m.id === 'thinking'
          ? { ...m, content: `_${data.msg || 'Hermes is thinking…'}_`,
              streaming: true }
          : m));
      } else if (evt.event === 'retry') {
        setMessages((prev) => prev.map((m) => m.id === 'thinking'
          ? { ...m, content: `_Retrying… (attempt ${data.attempt})_`,
              streaming: true }
          : m));
      } else if (evt.event === 'delta') {
        sawDelta = true;
        acc += data.content || '';
        setMessages((prev) => prev.map((m) => m.id === 'thinking'
          ? { ...m, content: acc, streaming: true, error: false }
          : m));
      } else if (evt.event === 'final') {
        const am = data.assistant_message;
        if (!am) {
          // Plain post in Chat All without @hermes — just drop the placeholder.
          setMessages((prev) => prev.filter((m) => m.id !== 'thinking'));
        } else {
          // REPLACE the placeholder with the persisted final row, never
          // append a second bubble. This is the key UX requirement.
          setMessages((prev) => prev.map((m) => m.id === 'thinking'
            ? { id: am.id, role: 'assistant', content: am.content,
                attachments: am.attachments || [], author_id: null,
                reply_to_id: am.reply_to_id, streaming: false, error: false }
            : m));
        }
      } else if (evt.event === 'error') {
        // Keep the partial content if we got any deltas, but clearly mark
        // it as an error and surface a Retry button. Don't auto-promote
        // partial → final; user explicitly opts in via Retry.
        setMessages((prev) => prev.map((m) => m.id === 'thinking'
          ? { ...m,
              streaming: false, error: true,
              content: sawDelta && acc
                ? acc + `\n\n_⚠ Stream cut off: ${data.message || data.detail}_`
                : `_⚠ ${data.message || data.detail || 'Stream failed'}_`,
              retryPayload: { chatId, body }, expectsLLM,
            }
          : m));
        return;
      }
    }
  }
}

// Convenience: re-run a failed stream for an error bubble. Removes the
// error placeholder, inserts a fresh thinking bubble, then re-streams.
export async function retryChatStream(errBubble, setMessages, user) {
  if (!errBubble?.retryPayload) return;
  const tmpUserId = 'tmp-retry-' + Date.now();
  setMessages((prev) => prev.filter((m) => m.id !== errBubble.id));
  setMessages((prev) => [...prev, { id: 'thinking', role: 'assistant',
    content: '_Retrying…_', author_id: null, streaming: true }]);
  try {
    await consumeChatStream(
      errBubble.retryPayload.chatId,
      errBubble.retryPayload.body,
      setMessages, tmpUserId, errBubble.expectsLLM ?? true,
    );
  } catch (e) { console.error('retry failed', e); }
}
