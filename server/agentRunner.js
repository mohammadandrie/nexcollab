// agentRunner — orchestrate agent discussion on a thread until DEAL,
// STUCK, or a max-iter safety brake. Default trigger: human posts /
// stage transition. Each iteration picks the next role-relevant agent
// who hasn't yet AGREE'd the latest valid PROPOSE.
import { cT, cA } from './db.js';
import { runAgentTurn } from './agentMessage.js';
import { detectDeal, detectStuck } from './dealDetector.js';

// Stage → set of roles whose agents are role-relevant (count toward DEAL).
const STAGE_ROLES = {
  backlog: ['pm'],
  open:    ['pm'],
  uiux:    ['ux', 'pm'],   // PM watcher
  dev:     ['dev'],
  qa:      ['qa'],
  pcheck:  ['pm'],
  done:    [],
};

const SAFETY_MAX_ITER = 16;  // hard safety brake; STUCK detector handles
                              // the soft case before this kicks in.

async function getRelevantAgents(stage) {
  const roles = STAGE_ROLES[stage] || [];
  if (roles.length === 0) return [];
  return cA().find({ role: { $in: roles } }).toArray();
}

function pickNextAgent(agents, msgs, dealState) {
  // Prefer an agent who hasn't yet AGREE'd or PROPOSE'd the latest active
  // proposal. Fallback to first agent that hasn't spoken since last
  // human post.
  const latest = dealState.proposalNum;
  const ids = new Set(agents.map((a) => a._id));
  if (latest != null) {
    const acted = new Set();
    for (const m of msgs) {
      if (m.agent_id == null || !ids.has(m.agent_id)) continue;
      if ((m.stance_tag === 'agree' || m.stance_tag === 'propose')
          && m.proposal_ref === latest) {
        acted.add(m.agent_id);
      }
    }
    const remaining = agents.find((a) => !acted.has(a._id));
    if (remaining) return remaining;
  }
  // No active proposal yet OR all agents already acted: round-robin.
  const lastAgentId = [...msgs].reverse().find((m) => m.agent_id != null)?.agent_id;
  if (lastAgentId == null) return agents[0];
  const idx = agents.findIndex((a) => a._id === lastAgentId);
  return agents[(idx + 1) % agents.length];
}

export async function runAgentLoop(threadId) {
  for (let i = 0; i < SAFETY_MAX_ITER; i += 1) {
    const t = await cT().findOne({ _id: threadId });
    if (!t) return { reason: 'thread_gone', iters: i };
    const stage = t.stage || 'backlog';
    if (stage === 'done' || stage === 'backlog') return { reason: 'stage_inactive', iters: i };

    const agents = await getRelevantAgents(stage);
    if (agents.length === 0) return { reason: 'no_relevant_agents', iters: i };
    const relevantIds = agents.map((a) => a._id);

    const msgs = (t.events || []).filter((e) => e.kind === 'comment');
    const deal = detectDeal(msgs, relevantIds);
    if (deal.reached) {
      await cT().updateOne(
        { _id: threadId },
        { $set: { 'deal_state.status': 'deal',
                  'deal_state.last_proposal': deal.proposalNum,
                  'deal_state.agreed_by': deal.agreedBy,
                  'deal_state.at': new Date() } },
      );
      return { reason: 'deal', iters: i, proposal: deal.proposalNum };
    }
    if (detectStuck(msgs, relevantIds)) {
      await cT().updateOne(
        { _id: threadId },
        { $set: { 'deal_state.status': 'stuck', 'deal_state.at': new Date() } },
      );
      return { reason: 'stuck', iters: i };
    }

    const next = pickNextAgent(agents, msgs, deal);
    await runAgentTurn({ threadId, agentId: next._id, isStageAgent: true });
  }
  return { reason: 'safety_max', iters: SAFETY_MAX_ITER };
}
