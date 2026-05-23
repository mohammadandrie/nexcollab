// agentHandoffGreet — when a stage transition completes, ask the new
// stage's lead agent to post a brief greeting that summarizes what
// they're picking up from the previous stage. Fire-and-forget; failure
// non-fatal. Posts as kind='comment' with stance_tag='note'.
import { cT, cA, nextId } from './db.js';
import { chatComplete } from './llm.js';

const STAGE_LEAD_ROLE = {
  open: 'pm', uiux: 'ux', dev: 'dev', qa: 'qa', pcheck: 'pm',
};

export async function postHandoffGreet(threadId, fromStage, toStage) {
  if (toStage === 'done' || toStage === 'backlog') return null;
  const leadRole = STAGE_LEAD_ROLE[toStage];
  if (!leadRole) return null;
  const lead = await cA().findOne({ role: leadRole });
  if (!lead) return null;

  const thread = await cT().findOne({ _id: threadId });
  if (!thread) return null;

  const sys = `${lead.system_prompt}\n\nA stage handoff just happened: ${fromStage} → ${toStage}. You are picking this thread up. Post a SHORT greeting (2-3 sentences max) that: (1) acknowledges what was decided in the prior stage, (2) states what your stage will focus on. End with 📝 NOTE on its own final line. Do NOT propose or agree yet — just orient the team.`;
  const user = `Thread: ${thread.title}\nDescription:\n${thread.description || '(empty)'}\n\nPost your handoff note now.`;

  let reply;
  try {
    reply = await chatComplete([
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ], { maxTokens: 300 });
  } catch (e) {
    console.warn('[mak] handoff greet failed:', e.message);
    return null;
  }
  reply = String(reply || '').trim();
  if (!reply) return null;

  const event_id = await nextId('thread_events');
  const ts = new Date();
  const ev = {
    event_id, kind: 'comment',
    actor_id: null, agent_id: lead._id,
    role_at_post: lead.role,
    stance_tag: 'note', proposal_ref: null, ts,
    content: reply, attachments: [], reply_to_event_id: null,
  };
  await cT().updateOne(
    { _id: threadId },
    { $push: { events: ev }, $set: { updated_at: ts } },
  );
  return ev;
}
