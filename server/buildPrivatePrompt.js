// buildPrivatePrompt — private-chat system prompt rooted in the user's
// own agent persona instead of generic Hermes. Falls back to the legacy
// buildSystemPrompt only if the user has no agent row (shouldn't happen
// post-seed, but kept as a defensive path).
import { cA } from './db.js';
import { buildSystemPrompt } from './llm.js';
import { buildThreadBundle } from './buildThreadBundle.js';

export async function buildPrivatePrompt(user, project, linkedThreadId = null) {
  const projectName = project?.name || 'Nexcollab';
  const projectDesc = project?.description || '';
  const agent = await cA().findOne({ owner_user_id: user._id });
  if (!agent) {
    return buildSystemPrompt(user.name, user.role, projectName, projectDesc);
  }
  // Prepend persona, then context about who's talking + project.
  const base = [
    agent.system_prompt,
    '',
    `You are now in a 1:1 private chat with ${user.name} (${user.role}).`,
    `They own you — talk to them like a trusted colleague who shares`,
    `your perspective on craft. Stay in your role lane (do not pretend`,
    `to be another role's agent).`,
    '',
    `Project: ${projectName}`,
    projectDesc ? `Description: ${projectDesc}` : null,
    '',
    `Note: in private chat there is NO stance tag and NO thread`,
    `discussion protocol. Just have a normal conversation.`,
  ].filter((x) => x !== null).join('\n');
  if (linkedThreadId == null) return base;
  const bundle = await buildThreadBundle(linkedThreadId);
  return bundle ? `${base}\n${bundle}` : base;
}
