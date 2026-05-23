// Agents — read-list + self-only edit of name/photo/color/system_prompt.
// Multi-agent kanban (mak): 1 agent per user, seeded by seed.js.
import { Router } from 'express';
import { cA, cU } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// GET /api/agents — list all 5 agents (public to logged-in users so the
// kanban thread modal can render avatars/names for any agent reply).
router.get('/agents', requireAuth, async (_req, res, next) => {
  try {
    const rows = await cA().find({}).sort({ _id: 1 }).toArray();
    const owners = await cU().find(
      { _id: { $in: rows.map((a) => a.owner_user_id) } },
      { projection: { _id: 1, name: 1, username: 1 } },
    ).toArray();
    const oMap = Object.fromEntries(owners.map((u) => [u._id, u]));
    res.json({
      agents: rows.map((a) => ({
        id: a._id,
        owner_user_id: a.owner_user_id,
        owner_name: oMap[a.owner_user_id]?.name ?? null,
        owner_username: oMap[a.owner_user_id]?.username ?? null,
        persona_key: a.persona_key,
        role: a.role,
        name: a.name,
        photo_url: a.photo_url,
        color: a.color,
        system_prompt: a.system_prompt,
        allowed_stages: a.allowed_stages,
      })),
    });
  } catch (e) { next(e); }
});

// PATCH /api/agents/:id — self-only edit. Owner can change name, photo_url,
// color, system_prompt. Cannot change role, allowed_stages, owner.
const ALLOWED_FIELDS = new Set(['name', 'photo_url', 'color', 'system_prompt']);

router.patch('/agents/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ detail: 'bad_id' });
    const agent = await cA().findOne({ _id: id });
    if (!agent) return res.status(404).json({ detail: 'agent_not_found' });
    if (agent.owner_user_id !== req.user._id) {
      return res.status(403).json({ detail: 'not_owner' });
    }

    const set = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!ALLOWED_FIELDS.has(k)) continue;
      if (k === 'name') {
        const s = String(v || '').trim().slice(0, 40);
        if (!s) return res.status(400).json({ detail: 'name_required' });
        set.name = s;
      } else if (k === 'system_prompt') {
        set.system_prompt = String(v || '').slice(0, 8000);
      } else if (k === 'color') {
        const s = String(v || '').trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) {
          return res.status(400).json({ detail: 'bad_color' });
        }
        set.color = s.toLowerCase();
      } else if (k === 'photo_url') {
        if (v == null || v === '') {
          set.photo_url = null;
        } else {
          const s = String(v);
          if (!s.startsWith('/uploads/')) {
            return res.status(400).json({ detail: 'bad_photo_url' });
          }
          set.photo_url = s;
        }
      }
    }
    if (Object.keys(set).length === 0) {
      return res.status(400).json({ detail: 'no_valid_fields' });
    }
    set.updated_at = new Date();
    await cA().updateOne({ _id: id }, { $set: set });
    const fresh = await cA().findOne({ _id: id });
    res.json({ agent: fresh });
  } catch (e) { next(e); }
});

export default router;
