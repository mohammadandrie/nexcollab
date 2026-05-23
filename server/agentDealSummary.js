// agentDealSummary — when a thread reaches DEAL, ask the stage's lead
// agent to rewrite the description into a clean, final spec that
// reflects the agreed proposal + amendments. Persists the new
// description and snapshots the old one into description_history.
import { cT, cA } from './db.js';
import { chatComplete } from './llm.js';

// Pick the "lead" agent of a stage to do the rewrite. For multi-agent
// stages we pick the first role-relevant one; the result is the same
// because we feed all transcript context regardless.
const STAGE_LEAD_ROLE = {
  open: 'pm', uiux: 'ux', dev: 'dev', qa: 'qa', pcheck: 'pm',
};

export async function rewriteDescriptionOnDeal(threadId) {
  const thread = await cT().findOne({ _id: threadId });
  if (!thread) return null;
  const stage = thread.stage || 'backlog';
  const leadRole = STAGE_LEAD_ROLE[stage];
  if (!leadRole) return null;
  const lead = await cA().findOne({ role: leadRole });
  if (!lead) return null;

  const events = (thread.events || []).filter((e) => e.kind === 'comment');
  const transcript = events
    .map((e) => `[${e.role_at_post || 'human'}/${e.stance_tag || 'msg'}] ${e.content || ''}`)
    .join('\n');

  const sys = `${lead.system_prompt}\n\nDEAL has been reached on this thread. Rewrite the description into a clean, final spec that reflects the AGREED proposal and any accepted amendments. Keep it concise — what + why + scope. No stance tag, no commentary, just the new description text.`;
  const user = `Thread title: ${thread.title}\nCurrent description:\n${thread.description || '(empty)'}\n\nDiscussion transcript:\n${transcript}\n\nWrite the new description now.`;

  let newDesc;
  try {
    newDesc = await chatComplete([
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ], { maxTokens: 800 });
  } catch (e) {
    console.warn('[mak] deal summary llm fail:', e.message);
    return null;
  }
  newDesc = String(newDesc || '').trim();
  if (!newDesc) return null;

  const now = new Date();
  const oldDesc = thread.description || '';
  const histEntry = {
    version: (thread.version || 0) + 1, ts: now,
    by_id: lead._id, by_kind: 'agent',
    source: 'deal_rewrite', from_stage: stage,
    prev_content: oldDesc,
  };
  await cT().updateOne(
    { _id: threadId },
    {
      $set: { description: newDesc, updated_at: now },
      $push: { description_history: histEntry },
      $inc: { version: 1 },
    },
  );
  return { newDesc, oldDesc };
}
