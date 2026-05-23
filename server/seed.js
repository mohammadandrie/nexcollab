// Idempotent seed: 5 team members + sample project + per-user general chats.
import { connect, cU, cP, cPM, cC, cA, nextId } from './db.js';
import { PERSONAS, SEED_AGENTS } from './agentPrompts.js';

const TEAM = [
  { username: 'tyo',    name: 'Tyo',    role: 'PM',  color: '#a78bfa', avatar_letter: 'T' },
  { username: 'hamfik', name: 'Hamfik', role: 'UX',  color: '#f472b6', avatar_letter: 'H' },
  { username: 'hari',   name: 'Hari',   role: 'DEV', color: '#34d399', avatar_letter: 'H' },
  { username: 'chalif', name: 'Chalif', role: 'DEV', color: '#34d399', avatar_letter: 'C' },
  { username: 'andre',  name: 'Andre',  role: 'QA',  color: '#fbbf24', avatar_letter: 'A' },
];

export async function seed() {
  await connect();

  for (const t of TEAM) {
    const exists = await cU().findOne({ username: t.username });
    if (!exists) {
      await cU().insertOne({ _id: await nextId('users'), ...t, photo_url: null });
    }
  }

  let proj = await cP().findOne({ name: 'Nexcollab Launch' });
  if (!proj) {
    proj = {
      _id: await nextId('projects'),
      name: 'Nexcollab Launch',
      description: 'Workspace tim untuk merilis Nexcollab — UI, backend, QA.',
      github_repo: '',
      github_branch: '',
      created_at: new Date(),
    };
    await cP().insertOne(proj);
  }

  const users = await cU().find({}, { projection: { _id: 1 } }).toArray();
  for (const u of users) {
    await cPM().updateOne(
      { project_id: proj._id, user_id: u._id },
      { $setOnInsert: { project_id: proj._id, user_id: u._id } },
      { upsert: true },
    );
  }

  // Chat All for the sample project.
  if (!await cC().findOne({ project_id: proj._id, kind: 'all' })) {
    await cC().insertOne({
      _id: await nextId('chats'), project_id: proj._id, kind: 'all', owner_id: null,
    });
  }

  for (const u of users) {
    if (!await cC().findOne({ project_id: proj._id, kind: 'private', owner_id: u._id })) {
      await cC().insertOne({
        _id: await nextId('chats'),
        project_id: proj._id, kind: 'private', owner_id: u._id,
      });
    }
    if (!await cC().findOne({ project_id: null, kind: 'general', owner_id: u._id })) {
      await cC().insertOne({
        _id: await nextId('chats'),
        project_id: null, kind: 'general', owner_id: u._id,
      });
    }
  }

  // Seed 5 default agents (one per team member). Idempotent: only insert
  // if no agent row exists for that owner_user_id yet. Re-seeding does
  // NOT overwrite user-edited persona/photo/color — that's by design.
  for (const entry of SEED_AGENTS) {
    const owner = await cU().findOne({ username: entry.username });
    if (!owner) continue;
    if (await cA().findOne({ owner_user_id: owner._id })) continue;
    const persona = PERSONAS[entry.persona];
    if (!persona) continue;
    await cA().insertOne({
      _id: await nextId('agents'),
      owner_user_id: owner._id,
      persona_key: entry.persona,
      role: persona.role,
      name: persona.name,
      photo_url: null,
      color: persona.color,
      system_prompt: persona.system_prompt,
      allowed_stages: persona.allowed_stages,
      model_override: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seed();
  console.log('seed: ok');
  process.exit(0);
}
