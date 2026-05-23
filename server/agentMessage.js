// agentMessage — execute ONE agent turn on a thread discussion.
// Build LLM messages (persona + transcript), call gateway, parse stance,
// persist as thread event with mak metadata. Returns the event.
import { cT, cA, cU, nextId } from './db.js';
import { chatComplete, chatCompleteStream } from './llm.js';
import { parseStance, stripStanceLine, isStanceAllowed } from './stanceParser.js';
import { parseTargetHint, resolveTargetAgent } from './agentResolver.js';

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

export async function runAgentTurn({ threadId, agentId, isStageAgent, triggerUser = null, replyToEventId = null, onProgress = null }) {
  const thread = await cT().findOne({ _id: threadId });
  if (!thread) throw new Error('thread_not_found');
  const agent = await cA().findOne({ _id: agentId });
  if (!agent) throw new Error('agent_not_found');
  // Emit thinking placeholder immediately so SSE consumers can render
  // an "Agent X is thinking..." bubble before the LLM call settles.
  if (onProgress) {
    try { onProgress({ kind: 'thinking', agent }); } catch {}
  }

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

  // Roster of all available agents so LLM knows valid @mention targets.
  const allAgents = await cA().find({}, { projection: { name: 1, role: 1, owner_user_id: 1 } }).toArray();
  const ownersById = Object.fromEntries(
    (await cU().find({}, { projection: { _id: 1, name: 1 } }).toArray()).map((u) => [u._id, u.name]),
  );
  const rosterLine = '\nAgent roster you may @mention:\n'
    + allAgents.filter((a) => a._id !== agent._id)
        .map((a) => `  - @${a.name} (role=${a.role.toUpperCase()}, owner=${ownersById[a.owner_user_id] || '?'})`)
        .join('\n');

  const sys = `${agent.system_prompt}\n\nThread: "${thread.title}"\nDescription: ${thread.description || '(none)'}\nCurrent stage: ${thread.stage || 'backlog'}\n${stageNote}${speakerLine}${rosterLine}`;

  const transcript = events.map((e) => fmtEvent(e, userMap, agentMap)).join('\n');
  const userMsg = transcript
    ? `Discussion so far:\n${transcript}\n\nPost your reply now. End with the stance tag on its own final line.`
    : 'Open the discussion. Propose the first concrete direction. End with 💡 PROPOSE #1 <summary> on its own final line.';

  let reply = '';
  if (onProgress) {
    // Token-level streaming so SSE consumer renders text as it arrives,
    // not just thinking → final dump. Aggregate locally for stance parse.
    for await (const chunk of chatCompleteStream([
      { role: 'system', content: sys },
      { role: 'user', content: userMsg },
    ], { maxTokens: 600 })) {
      if (chunk.type === 'delta') {
        reply += chunk.content;
        try { onProgress({ kind: 'delta', agent, delta: chunk.content }); } catch {}
      } else if (chunk.type === 'final' && chunk.content) {
        reply = chunk.content;
      }
    }
  } else {
    reply = await chatComplete([
      { role: 'system', content: sys },
      { role: 'user', content: userMsg },
    ], { maxTokens: 600 });
  }

  let stance = parseStance(reply);
  if (!isStanceAllowed(stance, isStageAgent)) {
    // Demote to NOTE so it can't sneak a PROPOSE/AGREE through.
    stance = { ...stance, tag: 'note', proposalRef: null };
  }

  // ROUTE_TO rewriter: if agent emitted "ROUTE_TO=<role> target=<owner>",
  // resolve the actual agent and replace placeholder with @AgentName.
  // Backend-controlled so LLM can't fabricate a target name.
  let bodyContent = stripStanceLine(reply) || reply;
  let routedToAgentId = null;
  const routeMatch = bodyContent.match(/ROUTE_TO=(\w+)(?:\s+target=([A-Z][a-zA-Z]+))?/);
  if (routeMatch) {
    const role = routeMatch[1];
    const ownerName = routeMatch[2] || null;
    const resolved = await resolveTargetAgent({
      role, ownerName, projectId: thread.project_id, excludeAgentId: agent._id,
    });
    if (resolved.agent) {
      routedToAgentId = resolved.agent._id;
      bodyContent = bodyContent.replace(routeMatch[0], `@${resolved.agent.name}`);
    } else {
      bodyContent = bodyContent.replace(routeMatch[0], `(target agent tidak ditemukan: ${resolved.error || 'unknown'})`);
    }
  }

  // DESC_UPDATE rewriter: if agent emitted a fenced description block,
  // apply it to thread.description and strip the block from body. Format:
  //   <<DESC_UPDATE>>
  //   <new full description text>
  //   <<END>>
  // Backend-controlled — only a stage agent (or PM cross-stage) can rewrite.
  let descUpdated = false;
  const descMatch = bodyContent.match(/<<DESC_UPDATE>>\s*([\s\S]*?)\s*<<END>>/);
  if (descMatch && (isStageAgent || agent.role === 'pm')) {
    const newDesc = String(descMatch[1] || '').trim().slice(0, 8000);
    if (newDesc) {
      await cT().updateOne(
        { _id: threadId },
        { $set: { description: newDesc, updated_at: new Date() } },
      );
      descUpdated = true;
    }
    bodyContent = bodyContent.replace(descMatch[0],
      descUpdated ? '_(description telah diupdate)_' : '_(desc update kosong, dilewati)_');
  }

  // Extract @AgentName tokens from final body for `mentions` metadata.
  const mentionTokens = [...bodyContent.matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase());
  const mentionedAgentIds = allAgents
    .filter((a) => mentionTokens.includes(String(a.name || '').toLowerCase()))
    .map((a) => a._id);

  const event_id = await nextId('thread_events');
  const ts = new Date();
  const ev = {
    event_id, kind: 'comment',
    actor_id: null, agent_id: agent._id,
    role_at_post: agent.role,
    stance_tag: stance.tag,
    proposal_ref: stance.proposalRef ?? null,
    ts,
    content: bodyContent,
    mentions: mentionedAgentIds,
    routed_to_agent_id: routedToAgentId,
    attachments: [], reply_to_event_id: replyToEventId,
  };
  await cT().updateOne(
    { _id: threadId },
    { $push: { events: ev }, $set: { updated_at: ts } },
  );
  if (onProgress) {
    try { onProgress({ kind: 'completed', agent, event: ev }); } catch {}
  }
  return ev;
}
