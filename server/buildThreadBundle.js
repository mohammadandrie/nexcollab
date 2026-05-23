// buildThreadBundle — compose a compact context bundle from a thread for
// injection into private-chat system prompt. Returns plain text (LLM-ready).
import { cT, cA, cU } from './db.js';

const STAGE_LABEL = {
  backlog: 'Backlog', open: 'Open (PM)', uiux: 'UI/UX',
  dev: 'Dev', qa: 'QA', pcheck: 'P.Check', done: 'Done',
};

export async function buildThreadBundle(threadId) {
  const t = await cT().findOne({ _id: threadId });
  if (!t) return null;

  // Hydrate authors for transcript readability.
  const events = (t.events || []).filter((e) => e.kind === 'comment');
  const uIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))];
  const aIds = [...new Set(events.map((e) => e.agent_id).filter(Boolean))];
  const [users, agents] = await Promise.all([
    uIds.length ? cU().find({ _id: { $in: uIds } }).toArray() : [],
    aIds.length ? cA().find({ _id: { $in: aIds } }).toArray() : [],
  ]);
  const uMap = Object.fromEntries(users.map((u) => [u._id, u]));
  const aMap = Object.fromEntries(agents.map((a) => [a._id, a]));

  const last = events.slice(-12).map((e) => {
    if (e.agent_id != null) {
      const ag = aMap[e.agent_id];
      const tag = ag ? `Agent ${ag.name} (${ag.role.toUpperCase()})` : 'Agent';
      return `[${tag} · ${e.stance_tag || 'msg'}] ${String(e.content || '').slice(0, 280)}`;
    }
    const u = uMap[e.actor_id];
    return `[${u ? `${u.name} (${u.role})` : 'unknown'}] ${String(e.content || '').slice(0, 280)}`;
  });

  const openQuestions = events
    .filter((e) => e.stance_tag === 'ask')
    .slice(-5)
    .map((e) => `  - ${String(e.content || '').replace(/\s+/g, ' ').slice(0, 160)}`);

  const lines = [
    '\n=== Linked thread context ===',
    `Thread #${t._id}: ${t.title}`,
    `Stage: ${STAGE_LABEL[t.stage] || t.stage || 'backlog'}`,
    `Deal state: ${t.deal_state?.status || 'idle'}`,
    '',
    'Description:',
    String(t.description || '(empty)').slice(0, 1200),
  ];
  if (openQuestions.length) lines.push('', 'Open questions:', ...openQuestions);
  if (last.length) lines.push('', 'Recent discussion (truncated):', ...last);
  lines.push('=== End linked thread ===');
  return lines.join('\n');
}
