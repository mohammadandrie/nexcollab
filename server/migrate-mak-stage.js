// One-shot migration: backfill `stage` and related multi-agent kanban
// fields on existing thread documents. Idempotent — only updates rows
// missing the new fields. Safe to re-run.
//
// Mapping from legacy `status` → new `stage`:
//   open      → open      (PM still framing)
//   assigned  → uiux      (default first hop after PM); admin can drag
//   review    → pcheck    (PM final check before done)
//   done      → done
//   (else)    → backlog
//
// Run: `node server/migrate-mak-stage.js` from project root.

import { connect, cT, getDb } from './db.js';

const STATUS_TO_STAGE = {
  open: 'open',
  assigned: 'uiux',
  review: 'pcheck',
  done: 'done',
};

async function migrate() {
  await connect();
  const rows = await cT().find({ stage: { $exists: false } }).toArray();
  console.log(`migrate-mak-stage: ${rows.length} thread(s) need backfill`);

  let touched = 0;
  for (const t of rows) {
    const stage = STATUS_TO_STAGE[t.status] ?? 'backlog';
    await cT().updateOne(
      { _id: t._id },
      {
        $set: {
          stage,
          stage_owners: {},
          approvals: [],
          description_locks: {},
          description_history: [],
          deal_state: { status: 'idle', last_proposal: 0, agreed_by: [] },
          agent_participants: [],
          version: 0,
        },
      },
    );
    touched += 1;
  }
  console.log(`migrate-mak-stage: backfilled ${touched} row(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
