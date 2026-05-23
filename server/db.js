// MongoDB layer. Numeric `_id` via counters collection for frontend compat.
import { MongoClient } from 'mongodb';
import { MONGO_URL, MONGO_DB } from './config.js';

const client = new MongoClient(MONGO_URL);
let _db = null;

export async function connect() {
  if (_db) return _db;
  await client.connect();
  _db = client.db(MONGO_DB);
  await ensureIndexes(_db);
  return _db;
}

export function getDb() {
  if (!_db) throw new Error('db not connected — call connect() first');
  return _db;
}

async function ensureIndexes(db) {
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('projects').createIndex({ name: 1 });
  await db.collection('project_members').createIndex(
    { project_id: 1, user_id: 1 }, { unique: true });
  await db.collection('project_members').createIndex({ user_id: 1 });
  await db.collection('chats').createIndex(
    { project_id: 1, kind: 1, owner_id: 1 }, { unique: true });
  await db.collection('messages').createIndex({ chat_id: 1, _id: 1 });
  await db.collection('threads').createIndex({ project_id: 1, status: 1, updated_at: -1 });
  await db.collection('threads').createIndex({ current_assignee_id: 1, status: 1 });
  await db.collection('chat_views').createIndex(
    { chat_id: 1, user_id: 1 }, { unique: true });
  await db.collection('chat_views').createIndex({ user_id: 1 });
}

// Auto-incrementing numeric IDs (frontend expects integers).
export async function nextId(name) {
  const db = getDb();
  const r = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return r.seq;
}

// Convenience accessors — keeps route code terse.
export const cU = () => getDb().collection('users');
export const cP = () => getDb().collection('projects');
export const cPM = () => getDb().collection('project_members');
export const cC = () => getDb().collection('chats');
export const cM = () => getDb().collection('messages');
export const cT = () => getDb().collection('threads');
export const cCV = () => getDb().collection('chat_views');
