// agentDispatch — smart agent-trigger dispatcher.
// Triggers an agent reply when:
//   1. comment.content contains @AgentName (explicit mention), OR
//   2. comment.reply_to_event_id points to an agent's earlier event
//      (reply context = agent is being addressed by reply)
// Runs the agent, then RECURSIVELY checks the new event for the same
// triggers (depth-capped chain). Excludes the just-replying agent so
// it can't re-trigger itself.
import { cT, cA } from './db.js';

const STAGE_ROLES = {
  backlog: ['pm'], open: ['pm'], uiux: ['ux', 'pm'],
  dev: ['dev'], qa: ['qa'], pcheck: ['pm'], done: [],
};

const MAX_CHAIN_DEPTH = 4;  // agent-to-agent chain hard cap

// Resolve which agent (if any) should reply to this event.
function pickAgent(agents, ev, threadEvents, excludeAgentId) {
  // 1. Explicit @AgentName mention(s) in content. Pick first match
  //    that isn't the just-replying agent.
  const tokens = [...String(ev.content || '').matchAll(/@(\w+)/g)]
    .map((m) => m[1].toLowerCase());
  for (const tok of tokens) {
    const a = agents.find((x) =>
      String(x.name || '').toLowerCase() === tok && x._id !== excludeAgentId);
    if (a) return { agent: a, reason: 'mention' };
  }
  // 2. Reply context: ev replies to an event whose author is an agent.
  if (ev.reply_to_event_id != null) {
    const tgt = threadEvents.find((e) => e.event_id === ev.reply_to_event_id);
    if (tgt && tgt.agent_id != null && tgt.agent_id !== excludeAgentId) {
      const a = agents.find((x) => x._id === tgt.agent_id);
      if (a) return { agent: a, reason: 'reply' };
    }
  }
  return null;
}

export async function dispatchAgentReply(threadId, triggerEvent, triggerActor, depth = 0) {
  if (depth >= MAX_CHAIN_DEPTH) return null;
  const t = await cT().findOne({ _id: threadId });
  if (!t) return null;
  const agents = await cA().find({}).toArray();
  const excludeAgentId = triggerEvent.agent_id ?? null;

  const pick = pickAgent(agents, triggerEvent, t.events || [], excludeAgentId);
  if (!pick) return null;

  const stage = t.stage || 'backlog';
  const isStageAgent = (STAGE_ROLES[stage] || []).includes(pick.agent.role);
  const { runAgentTurn } = await import('./agentMessage.js');
  let newEv;
  try {
    newEv = await runAgentTurn({
      threadId, agentId: pick.agent._id, isStageAgent,
      triggerUser: triggerActor,
      replyToEventId: triggerEvent.event_id ?? null,
    });
  } catch (e) {
    console.warn(`[mak] agent ${pick.agent.name} reply failed:`, e.message);
    return null;
  }
  // Chain: did the new agent event itself mention another agent or
  // reply to one? If so, recurse. Pass NULL as triggerActor so the
  // next agent treats this as agent-to-agent (no human speaker).
  return dispatchAgentReply(threadId, newEv, null, depth + 1);
}
