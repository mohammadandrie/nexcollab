// dealDetector — given a thread's discussion messages and the set of
// role-relevant agents for the current stage, determine if a DEAL has
// been reached.
//
// Rules:
//   - DEAL = the LATEST PROPOSE #N has been AGREED by every role-relevant
//     agent for this stage. Order doesn't matter; only the set of agents
//     that AGREE'd #N counts.
//   - PUSHBACK on #N invalidates that proposal — search backward for the
//     most recent unblocked PROPOSE.
//   - Cross-stage agents (NOTE / ASK only) are ignored entirely.
//
// Inputs:
//   messages: [{ agent_id, stance_tag, proposal_ref, role_at_post, ... }]
//   relevantAgentIds: Set<int>  — agents accountable for this stage's DEAL
//
// Output:
//   { reached: bool, proposalNum: int|null, agreedBy: int[] }

export function detectDeal(messages, relevantAgentIds) {
  const relevant = new Set(relevantAgentIds || []);
  if (relevant.size === 0) return { reached: false, proposalNum: null, agreedBy: [] };

  const ms = (messages || []).filter((m) => m.agent_id != null);
  // Pick latest valid PROPOSE: highest proposal_ref that has not been
  // PUSHBACK'd by any relevant agent.
  const pushedBack = new Set();
  for (const m of ms) {
    if (m.stance_tag === 'pushback' && relevant.has(m.agent_id)
        && Number.isFinite(m.proposal_ref)) {
      pushedBack.add(m.proposal_ref);
    }
  }
  let latest = null;
  for (const m of ms) {
    if (m.stance_tag !== 'propose' || !Number.isFinite(m.proposal_ref)) continue;
    if (pushedBack.has(m.proposal_ref)) continue;
    if (latest == null || m.proposal_ref > latest) latest = m.proposal_ref;
  }
  if (latest == null) return { reached: false, proposalNum: null, agreedBy: [] };

  const agreedSet = new Set();
  for (const m of ms) {
    if (m.stance_tag === 'agree' && relevant.has(m.agent_id)
        && m.proposal_ref === latest) {
      agreedSet.add(m.agent_id);
    }
  }
  // The proposer's own PROPOSE counts as their AGREE on it.
  for (const m of ms) {
    if (m.stance_tag === 'propose' && m.proposal_ref === latest
        && relevant.has(m.agent_id)) {
      agreedSet.add(m.agent_id);
    }
  }
  const reached = relevant.size > 0 && [...relevant].every((id) => agreedSet.has(id));
  return { reached, proposalNum: latest, agreedBy: [...agreedSet] };
}

// detectStuck — 3 consecutive turns from relevant agents with no PROPOSE
// and no AGREE means we're spinning on ASK/NOTE/PUSHBACK loop.
export function detectStuck(messages, relevantAgentIds) {
  const relevant = new Set(relevantAgentIds || []);
  const recent = (messages || [])
    .filter((m) => m.agent_id != null && relevant.has(m.agent_id))
    .slice(-3);
  if (recent.length < 3) return false;
  return recent.every((m) => m.stance_tag !== 'propose' && m.stance_tag !== 'agree');
}
