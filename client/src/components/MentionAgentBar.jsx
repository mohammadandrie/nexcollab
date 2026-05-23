// MentionAgentBar — small horizontal row of agent buttons. Click to
// trigger a one-shot mention via POST /api/threads/:id/mention/:agentId.
// Cross-stage rule (NOTE/ASK only) is enforced server-side.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

const ROLE_LABEL = { pm: 'PM', ux: 'UX', dev: 'Dev', qa: 'QA' };

export default function MentionAgentBar({ thread, onMentioned }) {
  const [agents, setAgents] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api('/api/agents')
      .then(({ agents }) => setAgents(agents || []))
      .catch(() => {});
  }, []);

  if (!thread || !agents.length) return null;
  if (thread.stage === 'done') return null;

  const toast = (kind, text) => window.dispatchEvent(
    new CustomEvent('nexcollab:toast', { detail: { kind, text } }),
  );

  async function mention(agent) {
    setBusyId(agent.id);
    try {
      const r = await api(`/api/threads/${thread.id}/mention/${agent.id}`, { method: 'POST' });
      toast('success', `${agent.name} reply: ${r.event.stance_tag}${r.isStageAgent ? '' : ' (cross-stage NOTE/ASK)'}`);
      onMentioned?.(r);
    } catch (e) {
      toast('error', `Mention gagal: ${e.message || e}`);
    } finally { setBusyId(null); }
  }

  return (
    <div className="px-3 py-2 border-t theme-border flex items-center gap-2 text-xs flex-wrap">
      <span className="theme-muted">@mention agent:</span>
      {agents.map((a) => (
        <button key={a.id}
          onClick={() => mention(a)}
          disabled={busyId === a.id}
          title={`${a.name} (${ROLE_LABEL[a.role] || a.role})`}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border theme-border
                     hover:bg-[color:var(--bg-2)] disabled:opacity-50 transition-colors">
          <Avatar photoUrl={a.photo_url} letter={(a.name || '?')[0]} color={a.color} size={16} />
          <span>{busyId === a.id ? '…' : a.name}</span>
        </button>
      ))}
    </div>
  );
}
