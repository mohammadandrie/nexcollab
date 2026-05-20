// Runtime config for the Express server. Reuses the FastAPI-era SQLite file.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

export const DB_PATH = process.env.NEXCOLLAB_DB
  || path.join(DATA_DIR, 'nexcollab.sqlite3');

export const LLM_BASE_URL = process.env.NEXCOLLAB_LLM_BASE
  || 'http://127.0.0.1:1430/v1';
export const LLM_API_KEY = process.env.NEXCOLLAB_LLM_KEY
  || 'enx-99758b6c349c05e5baeda243107a091e2fa03cb75be0d7374f852fc7c41e4b7e';
export const LLM_MODEL = process.env.NEXCOLLAB_LLM_MODEL
  || 'kiro/claude-sonnet-4.6';

export const SESSION_SECRET = process.env.NEXCOLLAB_SECRET
  || 'dev-secret-change-me-please-this-is-not-production-grade-key';

export const HOST = process.env.NEXCOLLAB_HOST || '127.0.0.1';
export const PORT = parseInt(process.env.NEXCOLLAB_PORT || '8091', 10);
