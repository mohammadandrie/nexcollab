// One-shot: dedupe threads.views[] so each user_id appears at most once,
// keeping the most recent last_seen and the earliest first_seen.
import { connect, cT } from './db.js';

await connect();
const rows = await cT().find({ views: { $exists: true, $ne: [] } }).toArray();
let touched = 0;
for (const t of rows) {
  const byUser = new Map();
  for (const v of t.views || []) {
    if (!v || v.user_id == null) continue;
    const cur = byUser.get(v.user_id);
    if (!cur) { byUser.set(v.user_id, { ...v }); continue; }
    if (new Date(v.last_seen) > new Date(cur.last_seen)) cur.last_seen = v.last_seen;
    if (new Date(v.first_seen) < new Date(cur.first_seen)) cur.first_seen = v.first_seen;
  }
  const deduped = [...byUser.values()];
  if (deduped.length !== (t.views || []).length) {
    await cT().updateOne({ _id: t._id }, { $set: { views: deduped } });
    touched += 1;
  }
}
console.log(`dedupe-views: ${touched} thread(s) updated of ${rows.length} scanned.`);
process.exit(0);
