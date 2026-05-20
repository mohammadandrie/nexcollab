// Runtime config. Loads .env (gitignored) before reading process.env.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Tiny .env loader (no extra dep). Skips comments + blanks.
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export const MONGO_URL = process.env.NEXCOLLAB_MONGO_URL
  || 'mongodb://127.0.0.1:27017';
export const MONGO_DB = process.env.NEXCOLLAB_MONGO_DB || 'nexcollab';

export const LLM_BASE_URL = process.env.NEXCOLLAB_LLM_BASE
  || 'http://127.0.0.1:1430/v1';
export const LLM_API_KEY = process.env.NEXCOLLAB_LLM_KEY || '';
export const LLM_MODEL = process.env.NEXCOLLAB_LLM_MODEL
  || 'kiro/claude-sonnet-4.6';

export const SESSION_SECRET = process.env.NEXCOLLAB_SECRET
  || 'dev-secret-change-me-please-this-is-not-production-grade-key';

export const HOST = process.env.NEXCOLLAB_HOST || '127.0.0.1';
export const PORT = parseInt(process.env.NEXCOLLAB_PORT || '8091', 10);
