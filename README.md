# Nexcollab

Internal team workspace untuk enowX. UI mirip ChatGPT, engine Hermes Agent, multi-user role-aware.

Live: https://nexcollab.maxndre.com

## Konsep
- Tiap **Project** punya **Chat Pribadi** per anggota (privat dengan Hermes) plus satu **Chat All** (decision log shared).
- Tombol **"Send to Chat All"** mempromosikan pesan dari chat pribadi ke Chat All.
- Tim default: Tyo (PM), Hamfik (UX), Hari & Chalif (Dev), Andre (QA).

## Stack
- Backend: FastAPI + SQLite (`backend/`)
- Frontend: vanilla JS + Tailwind CDN (`static/`)
- LLM: OpenAI-compatible Hermes gateway (`http://127.0.0.1:1430/v1`)

## Run locally

```bash
python3 -m venv .venv
.venv/bin/pip install fastapi 'uvicorn[standard]' httpx itsdangerous python-multipart
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8091
```

Lalu buka http://localhost:8091

## Env vars (opsional)
- `NEXCOLLAB_LLM_BASE` — base URL gateway (default `http://127.0.0.1:1430/v1`)
- `NEXCOLLAB_LLM_KEY` — API key gateway
- `NEXCOLLAB_LLM_MODEL` — default `kiro/claude-sonnet-4.6`
- `NEXCOLLAB_SECRET` — session signing key
- `NEXCOLLAB_DB` — path SQLite (default `data/nexcollab.sqlite3`)

## File map
- `backend/main.py` — FastAPI app
- `backend/db.py` — SQLite schema + helpers
- `backend/seed.py` — bootstrap users, project, chats
- `backend/llm.py` — OpenAI-compat client
- `backend/auth.py` — cookie session
- `backend/routes_*.py` — auth, projects, chat
- `static/login.html`, `static/app.html`, `static/app.js` — UI
- `static/mockup.html`, `static/docs.html` — mockup statis & dokumentasi
