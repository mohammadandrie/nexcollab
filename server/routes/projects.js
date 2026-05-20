// Project + chat listing/creation routes (MongoDB).
import { Router } from 'express';
import { cP, cPM, cC, cU, cM, nextId } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// Normalize: add id alias for frontend compatibility.
const withId = (doc) => doc ? ({ ...doc, id: doc._id }) : doc;

router.get('/projects', requireAuth, async (req, res, next) => {
  try {
    const memberships = await cPM().find({ user_id: req.user._id })
      .project({ project_id: 1 }).toArray();
    const ids = memberships.map((m) => m.project_id);
    const rows = await cP().find({ _id: { $in: ids } })
      .sort({ _id: 1 }).toArray();
    res.json({ projects: rows.map(withId) });
  } catch (e) { next(e); }
});

router.get('/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const proj = await cP().findOne({ _id: projectId });
    if (!proj) return res.status(404).json({ detail: 'project_not_found' });

    const member = await cPM().findOne({ project_id: projectId, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });

    const memberRows = await cPM().find({ project_id: projectId })
      .project({ user_id: 1 }).toArray();
    const userIds = memberRows.map((m) => m.user_id);
    const members = await cU().find({ _id: { $in: userIds } })
      .project({ _id: 1, username: 1, name: 1, role: 1, color: 1, avatar_letter: 1, photo_url: 1 })
      .sort({ _id: 1 }).toArray();

    const priv = await cC().findOne({
      project_id: projectId, kind: 'private', owner_id: req.user._id,
    });
    const chatAll = await cC().findOne({ project_id: projectId, kind: 'all' });

    res.json({
      project: withId(proj),
      members: members.map(withId),
      my_private_chat_id: priv?._id ?? null,
      chat_all_id: chatAll?._id ?? null,
    });
  } catch (e) { next(e); }
});

router.post('/projects', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const memberIds = Array.isArray(req.body?.member_ids) ? req.body.member_ids : null;
    if (!name) return res.status(400).json({ detail: 'name_required' });

    const projectId = await nextId('projects');
    await cP().insertOne({
      _id: projectId, name, description,
      github_repo: '', github_branch: '',
      created_at: new Date(),
    });

    let ids;
    if (memberIds) {
      ids = new Set(memberIds);
    } else {
      const all = await cU().find({}, { projection: { _id: 1 } }).toArray();
      ids = new Set(all.map((u) => u._id));
    }
    ids.add(req.user._id);

    for (const uid of ids) {
      await cPM().updateOne(
        { project_id: projectId, user_id: uid },
        { $setOnInsert: { project_id: projectId, user_id: uid } },
        { upsert: true },
      );
    }
    await cC().insertOne({
      _id: await nextId('chats'),
      project_id: projectId, kind: 'all', owner_id: null,
    });
    for (const uid of ids) {
      await cC().insertOne({
        _id: await nextId('chats'),
        project_id: projectId, kind: 'private', owner_id: uid,
      });
    }
    res.json({ ok: true, project_id: projectId });
  } catch (e) { next(e); }
});

router.patch('/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const member = await cPM().findOne({ project_id: projectId, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });

    const update = {};
    for (const k of ['name', 'description', 'github_repo', 'github_branch']) {
      if (k in (req.body || {})) {
        const v = String(req.body[k] ?? '').trim();
        if (k === 'name' && !v) return res.status(400).json({ detail: 'name_required' });
        update[k] = v;
      }
    }
    if (!Object.keys(update).length) return res.status(400).json({ detail: 'no_fields' });
    await cP().updateOne({ _id: projectId }, { $set: update });
    const updated = await cP().findOne({ _id: projectId });
    res.json({ ok: true, project: withId(updated) });
  } catch (e) { next(e); }
});

router.delete('/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const member = await cPM().findOne({ project_id: projectId, user_id: req.user._id });
    if (!member) return res.status(403).json({ detail: 'not_a_member' });

    const chatIds = (await cC().find({ project_id: projectId })
      .project({ _id: 1 }).toArray()).map((c) => c._id);
    await cM().deleteMany({ chat_id: { $in: chatIds } });
    await cC().deleteMany({ project_id: projectId });
    await cPM().deleteMany({ project_id: projectId });
    await cP().deleteOne({ _id: projectId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
