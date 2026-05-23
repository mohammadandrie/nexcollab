// streamCommentDispatch — orchestrate the lifecycle of a comment+agent
// turn for SSE consumers. Mirrors the chat.js streaming pattern but
// adapted to thread events. Caller wires a writer fn; we emit:
//   user_saved      → user comment persisted, frontend can finalize ghost
//   thinking        → backend picked an agent, expect bubble placeholder
//   completed       → agent reply persisted (one event per agent in chain)
//   error           → unrecoverable; frontend marks last bubble failed
//   done            → loop exit (success or stuck)
import { cT, nextId } from './db.js';
import { dispatchAgentReply } from './agentDispatch.js';

// Append a user comment event to the thread. Returns the persisted event.
async function appendUserComment(threadId, user, content, attachments, replyToEventId) {
  const event_id = await nextId('thread_events');
  const ts = new Date();
  const ev = {
    event_id, kind: 'comment', actor_id: user._id, ts,
    content, attachments,
    reply_to_event_id: replyToEventId,
  };
  await cT().updateOne(
    { _id: threadId },
    { $push: { events: ev }, $set: { updated_at: ts } },
  );
  return ev;
}

// Orchestrate full comment+agent turn lifecycle. `emit(type, data)` is
// the SSE writer. Errors are caught and reported via emit('error').
export async function streamCommentDispatch({
  threadId, user, content, attachments, replyToEventId, emit,
}) {
  const userEv = await appendUserComment(
    threadId, user, content, attachments, replyToEventId,
  );
  emit('user_saved', { event: userEv });

  // onProgress is called per-agent-turn from inside dispatchAgentReply.
  // Translate runner kinds into SSE event names the client consumer
  // understands. Chain depth (multi-agent reply) flows here naturally
  // because dispatchAgentReply recurses with the same onProgress.
  const onProgress = (p) => {
    if (!p || !p.kind) return;
    if (p.kind === 'thinking') {
      emit('thinking', {
        agent: {
          id: p.agent._id, name: p.agent.name,
          color: p.agent.color, role: p.agent.role,
          photo_url: p.agent.photo_url || null,
        },
      });
    } else if (p.kind === 'completed') {
      // Hydrate agent metadata onto the event so client can render the
      // bubble identical to GET /threads/:id (CommentBubble reads ev.agent).
      const ev = {
        ...p.event,
        agent: {
          id: p.agent._id, name: p.agent.name,
          color: p.agent.color, role: p.agent.role,
          photo_url: p.agent.photo_url || null,
        },
      };
      emit('completed', { event: ev });
    }
  };

  try {
    await dispatchAgentReply(threadId, userEv, user, 0, onProgress);
  } catch (e) {
    emit('error', { detail: 'agent_dispatch_failed', message: String(e.message || e) });
  }
  emit('done', {});
}
