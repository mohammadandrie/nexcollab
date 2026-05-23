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

// Resolve which agent(s) should reply to this event.
// Returns ordered list — multi-mention in one comment fires all sequentially.
function pickAgents(agents, ev, threadEvents, excludeAgentId) {
  const result = [];
  const seen = new Set();
  if (excludeAgentId != null) seen.add(excludeAgentId);
  // 1. Explicit @AgentName mention(s) in order, dedupe.
  const tokens = [...String(ev.content || '').matchAll(/@(\w+)/g)]
    .map((m) => m[1].toLowerCase());
  for (const tok of tokens) {
    const a = agents.find((x) =>
      String(x.name || '').toLowerCase() === tok && !seen.has(x._id));
    if (a) { result.push({ agent: a, reason: 'mention' }); seen.add(a._id); }
  }
  // 2. Reply context (only if no @mention triggered, to avoid double-fire).
  if (result.length === 0 && ev.reply_to_event_id != null) {
    const tgt = threadEvents.find((e) => e.event_id === ev.reply_to_event_id);
    if (tgt && tgt.agent_id != null && !seen.has(tgt.agent_id)) {
      const a = agents.find((x) => x._id === tgt.agent_id);
      if (a) result.push({ agent: a, reason: 'reply' });
    }
  }
  return result;
}

export async function dispatchAgentReply(threadId, triggerEvent, triggerActor, depth = 0, onProgress = null) {
  if (depth >= MAX_CHAIN_DEPTH) return null;
  const t = await cT().findOne({ _id: threadId });
  if (!t) return null;
  const agents = await cA().find({}).toArray();
  const excludeAgentId = triggerEvent.agent_id ?? null;

  const picks = pickAgents(agents, triggerEvent, t.events || [], excludeAgentId);
  if (picks.length === 0) return null;

  const stage = t.stage || 'backlog';
  const { runAgentTurn } = await import('./agentMessage.js');
  let lastEv = null;
  // Fire each picked agent sequentially. Each carries the same trigger
  // event as reply target so bubble shows quote-chain back to user msg.
  for (const pick of picks) {
    const isStageAgent = (STAGE_ROLES[stage] || []).includes(pick.agent.role);
    try {
      lastEv = await runAgentTurn({
        threadId, agentId: pick.agent._id, isStageAgent,
        triggerUser: triggerActor,
        replyToEventId: triggerEvent.event_id ?? null,
        onProgress,
      });
    } catch (e) {
      console.warn(`[mak] agent ${pick.agent.name} reply failed:`, e.message);
    }
  }
  if (!lastEv) return null;
  // Chain: did the new agent event itself mention another agent or
  // reply to one? If so, recurse. Pass NULL as triggerActor so the
  // next agent treats this as agent-to-agent (no human speaker).
  // Return the chain's last event if it fired, else this turn's event
  // (so caller always gets the most recent agent reply for UI).
  const chained = await dispatchAgentReply(threadId, lastEv, null, depth + 1, onProgress);
  return chained || lastEv;
}
