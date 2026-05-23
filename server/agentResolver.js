// agentResolver — backend resolver for routing targets.
// Given a hint like "PM", "agentnya Agung", "dev agent from Hari", returns
// the concrete agent doc. Project membership of the owner is enforced.
import { cA, cU, cPM } from './db.js';

const ROLE_ALIASES = {
  pm: ['pm', 'product manager', 'project manager', 'manager', 'pemilik produk'],
  ux: ['ux', 'designer', 'desain', 'ui'],
  dev: ['dev', 'developer', 'engineer', 'programmer', 'coder', 'pengembang'],
  qa: ['qa', 'quality assurance', 'tester'],
};

function normalizeRole(token) {
  const lo = String(token || '').toLowerCase().trim();
  if (!lo) return null;
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.some((a) => lo === a)) return role;
  }
  return null;
}

// Parse a free-text routing hint into a target spec.
// Examples:
//   "tanya PM"                       → { role:'pm' }
//   "tanya agentnya Agung"           → { ownerName:'Agung' }
//   "ask the dev agent from Hari"    → { role:'dev', ownerName:'Hari' }
export function parseTargetHint(text) {
  const t = String(text || '');
  let role = null;
  for (const [r, aliases] of Object.entries(ROLE_ALIASES)) {
    for (const a of aliases) {
      if (new RegExp(`\\b${a}\\b`, 'i').test(t)) { role = r; break; }
    }
    if (role) break;
  }
  let ownerName = null;
  const m = t.match(/(?:agentnya|dari|owner|punya|milik|of|from)\s+([A-Z][a-zA-Z]+)/);
  if (m) ownerName = m[1];
  return { role, ownerName };
}

export async function resolveTargetAgent({ role, ownerName, projectId, excludeAgentId }) {
  const filter = {};
  if (role) {
    const normalized = normalizeRole(role) || String(role).toLowerCase();
    filter.role = normalized;
  }
  let candidates = await cA().find(filter).toArray();
  if (excludeAgentId != null) {
    candidates = candidates.filter((a) => a._id !== excludeAgentId);
  }
  if (candidates.length === 0) {
    return { error: role ? `No agent with role ${role}` : 'No agents matched' };
  }
  if (ownerName) {
    const ownerLo = String(ownerName).toLowerCase();
    const owners = await cU().find({}, { projection: { _id: 1, name: 1, username: 1 } }).toArray();
    const owner = owners.find((u) =>
      u.name.toLowerCase().includes(ownerLo) || u.username.toLowerCase() === ownerLo);
    if (owner) candidates = candidates.filter((a) => a.owner_user_id === owner._id);
  }
  if (projectId && candidates.length > 1) {
    const memberships = await cPM().find({ project_id: projectId }).toArray();
    const memberIds = new Set(memberships.map((m) => m.user_id));
    candidates = candidates.filter((a) => memberIds.has(a.owner_user_id));
  }
  if (candidates.length === 0) return { error: 'No matching agent in this project' };
  if (candidates.length === 1) return { agent: candidates[0], reason: 'unique' };
  return { agent: candidates[0], reason: 'first_of_many', candidates };
}
