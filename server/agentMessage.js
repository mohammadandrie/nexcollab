// agentMessage — execute ONE agent turn on a thread discussion.
// Build LLM messages (persona + transcript), call gateway, parse stance,
// persist as thread event with mak metadata. Returns the event.
import { cT, cA, cU, nextId } from './db.js';
import { chatComplete } from './llm.js';
import { parseStance, stripStanceLine, isStanceAllowed } from './stanceParser.js';

// Build a transcript line from a thread event for LLM context.
function fmtEvent(ev, userMap, agentMap) {
  if (ev.agent_id != null) {
    const a = agentMap[ev.agent_id];
    const tag = a ? `[${a.name} (agent · ${a.role.toUpperCase()})]` : '[agent]';
    return `${tag} ${ev.content || ''}`;
  }
  if (ev.actor_id == null) return `[Hermes] ${ev.content || ''}`;
  const u = userMap[ev.actor_id];
  const who = u ? `${u.name} (${u.role})` : 'unknown';
  return `[${who}] ${ev.content || ''}`;
}

export async function runAgentTurn({ threadId, agentId, isStageAgent, triggerUser = null, replyToEventId = null }) {
  const thread = await cT().findOne({ _id: threadId });
  if (!thread) throw new Error('thread_not_found');
  const agent = await cA().findOne({ _id: agentId });
  if (!agent) throw new Error('agent_not_found');

  // Hydrate authors so transcript is readable.
  const events = (thread.events || []).filter((e) => e.kind === 'comment' || e.kind === 'create');
  const uIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))];
  const aIds = [...new Set(events.map((e) => e.agent_id).filter(Boolean))];
  const [users, agents] = await Promise.all([
    uIds.length ? cU().find({ _id: { $in: uIds } }).toArray() : [],
    aIds.length ? cA().find({ _id: { $in: aIds } }).toArray() : [],
  ]);
  const userMap = Object.fromEntries(users.map((u) => [u._id, u]));
  const agentMap = Object.fromEntries(agents.map((a) => [a._id, a]));

  const stageNote = isStageAgent
    ? `You ARE accountable for stage "${thread.stage}". You may PROPOSE/AGREE/PUSHBACK/ASK/NOTE.`
    : `You are NOT in stage "${thread.stage}" — you were @mentioned. Reply ONLY with NOTE or ASK. No code/wireframes/test plans.`;

  const speakerLine = triggerUser
    ? `\nThe user currently speaking to you is ${triggerUser.name} (${triggerUser.role}). Address them by name when greeting; do NOT address other people from the transcript as if they just spoke.`
    : '';

  const sys = `${agent.system_prompt}\n\nThread: "${thread.title}"\nDescription: ${thread.description || '(none)'}\nCurrent stage: ${thread.stage || 'backlog'}\n${stageNote}${speakerLine}`;

  const transcript = events.map((e) => fmtEvent(e, userMap, agentMap)).join('\n');
  const userMsg = transcript
    ? `Discussion so far:\n${transcript}\n\nPost your reply now. End with the stance tag on its own final line.`
    : 'Open the discussion. Propose the first concrete direction. End with 💡 PROPOSE #1 <summary> on its own final line.';

  const reply = await chatComplete([
    { role: 'system', content: sys },
    { role: 'user', content: userMsg },
  ], { maxTokens: 600 });

  let stance = parseStance(reply);
  if (!isStanceAllowed(stance, isStageAgent)) {
    // Demote to NOTE so it can't sneak a PROPOSE/AGREE through.
    stance = { ...stance, tag: 'note', proposalRef: null };
  }

  const event_id = await nextId('thread_events');
  const ts = new Date();
  const ev = {
    event_id, kind: 'comment',
    actor_id: null, agent_id: agent._id,
    role_at_post: agent.role,
    stance_tag: stance.tag,
    proposal_ref: stance.proposalRef ?? null,
    ts,
    content: stripStanceLine(reply) || reply,
    attachments: [], reply_to_event_id: replyToEventId,
  };
  await cT().updateOne(
    { _id: threadId },
    { $push: { events: ev }, $set: { updated_at: ts } },
  );
  return ev;
}
