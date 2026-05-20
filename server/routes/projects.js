// Project + chat listing/creation routes.
import { Router } from 'express';
import { db, all, get, run } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/projects', requireAuth, (req, res) => {
  const rows = all(
    `SELECT p.id, p.name, p.description
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ?
     ORDER BY p.id`,
    req.user.id,
  );
  res.json({ projects: rows });
});

router.get('/projects/:id', requireAuth, (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const proj = get('SELECT * FROM projects WHERE id = ?', projectId);
  if (!proj) return res.status(404).json({ detail: 'project_not_found' });

  const member = get(
    'SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',
    projectId, req.user.id,
  );
  if (!member) return res.status(403).json({ detail: 'not_a_member' });

  const members = all(
    `SELECT u.id, u.username, u.name, u.role, u.color, u.avatar_letter
     FROM users u JOIN project_members pm ON pm.user_id = u.id
     WHERE pm.project_id = ? ORDER BY u.id`,
    projectId,
  );
  const priv = get(
    `SELECT id FROM chats WHERE project_id=? AND kind='private' AND owner_id=?`,
    projectId, req.user.id,
  );
  const chatAll = get(
    `SELECT id FROM chats WHERE project_id=? AND kind='all'`,
    projectId,
  );

  res.json({
    project: proj,
    members,
    my_private_chat_id: priv?.id ?? null,
    chat_all_id: chatAll?.id ?? null,
  });
});

router.post('/projects', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const memberIds = Array.isArray(req.body?.member_ids) ? req.body.member_ids : null;
  if (!name) return res.status(400).json({ detail: 'name_required' });

  const tx = db.transaction(() => {
    const r = run(
      'INSERT INTO projects(name,description) VALUES (?,?)',
      name, description,
    );
    const projectId = r.lastInsertRowid;

    const ids = new Set(memberIds ?? all('SELECT id FROM users').map((u) => u.id));
    ids.add(req.user.id);

    for (const uid of ids) {
      run(
        'INSERT OR IGNORE INTO project_members(project_id,user_id) VALUES (?,?)',
        projectId, uid,
      );
    }
    run(
      `INSERT INTO chats(project_id,kind,owner_id) VALUES (?,?,NULL)`,
      projectId, 'all',
    );
    for (const uid of ids) {
      run(
        `INSERT INTO chats(project_id,kind,owner_id) VALUES (?,?,?)`,
        projectId, 'private', uid,
      );
    }
    return projectId;
  });

  const projectId = tx();
  res.json({ ok: true, project_id: projectId });
});

export default router;
