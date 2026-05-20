# Nexcollab

Internal team workspace untuk enowX. UI mirip ChatGPT, engine Hermes Agent, multi-user role-aware.

Live: https://nexcollab.maxndre.com

## Konsep
- Tiap **Project** punya **Chat Pribadi** per anggota (privat dengan Hermes) plus satu **Chat All** (decision log shared).
- Tombol **"Send to Chat All"** mempromosikan pesan dari chat pribadi ke Chat All.
- Tim default: Tyo (PM), Hamfik (UX), Hari & Chalif (Dev), Andre (QA).

## Stack
- Backend: Express + better-sqlite3 (`server/`)
- Frontend: React + Vite + Tailwind (`client/`)
- LLM: OpenAI-compatible Hermes gateway (`http://127.0.0.1:1430/v1`)

## Run locally

```bash
# 1. Backend (Express)
cd server && npm install && cd ..
node server/index.js          # port 8091

# 2. Frontend (Vite dev server, separate terminal)
cd client && npm install && npm run dev    # port 5173, proxies /api → 8091

# 3. Production build
cd client && npm run build    # writes to client/dist/
node server/index.js          # serves API + built React
```

Lalu buka http://localhost:8091 (production) atau http://localhost:5173 (dev).

## Env vars (opsional)
- `NEXCOLLAB_LLM_BASE` — base URL gateway (default `http://127.0.0.1:1430/v1`)
- `NEXCOLLAB_LLM_KEY` — API key gateway
- `NEXCOLLAB_LLM_MODEL` — default `kiro/claude-sonnet-4.6`
- `NEXCOLLAB_SECRET` — session signing key
- `NEXCOLLAB_DB` — path SQLite (default `data/nexcollab.sqlite3`)

## File map
- `server/index.js` — Express app entry
- `server/db.js` — better-sqlite3 + schema
- `server/seed.js` — bootstrap users, project, chats
- `server/llm.js` — OpenAI-compat client (Hermes gateway)
- `server/auth.js` — signed cookie session
- `server/routes/{auth,projects,chat}.js` — REST endpoints
- `client/src/App.jsx` — root, login/workspace switch
- `client/src/components/` — Workspace, Sidebar, ChatView, modals, etc.
- `client/src/api.js` — fetch wrapper + tiny markdown
