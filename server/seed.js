// Idempotent seed: 5 team members + sample project + per-user general chats.
import { db, get, run } from './db.js';

const TEAM = [
  ['tyo',    'Tyo',    'PM',  '#a78bfa', 'T'],
  ['hamfik', 'Hamfik', 'UX',  '#f472b6', 'H'],
  ['hari',   'Hari',   'DEV', '#34d399', 'H'],
  ['chalif', 'Chalif', 'DEV', '#34d399', 'C'],
  ['andre',  'Andre',  'QA',  '#fbbf24', 'A'],
];

export function seed() {
  const tx = db.transaction(() => {
    for (const [u, n, r, c, l] of TEAM) {
      run(
        `INSERT OR IGNORE INTO users(username,name,role,color,avatar_letter)
         VALUES (?,?,?,?,?)`,
        u, n, r, c, l,
      );
    }

    let proj = get('SELECT id FROM projects WHERE name = ?', 'Nexcollab Launch');
    let projectId = proj?.id;
    if (!projectId) {
      const r = run(
        `INSERT INTO projects(name,description) VALUES (?,?)`,
        'Nexcollab Launch',
        'Workspace tim untuk merilis Nexcollab — UI, backend, QA.',
      );
      projectId = r.lastInsertRowid;
    }

    const users = db.prepare('SELECT id FROM users').all();
    for (const u of users) {
      run(
        `INSERT OR IGNORE INTO project_members(project_id,user_id) VALUES (?,?)`,
        projectId, u.id,
      );
    }

    run(
      `INSERT OR IGNORE INTO chats(project_id,kind,owner_id) VALUES (?,?,NULL)`,
      projectId, 'all',
    );
    for (const u of users) {
      run(
        `INSERT OR IGNORE INTO chats(project_id,kind,owner_id) VALUES (?,?,?)`,
        projectId, 'private', u.id,
      );
      run(
        `INSERT OR IGNORE INTO chats(project_id,kind,owner_id)
         VALUES (NULL,'general',?)`,
        u.id,
      );
    }
  });
  tx();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
  console.log('seed: ok');
}
