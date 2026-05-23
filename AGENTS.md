# Nexcollab — AI agent context

Pinned context untuk Hermes / AI coding agent. Di-load otomatis saat
sesi dimulai dari directory ini. Tujuannya: tidak perlu rediscover
struktur tiap sesi, tidak perlu numpuk konteks di chat history.

## Apa itu nexcollab

Workspace tim enowX (5 orang: Tyo PM, Hamfik UX, Hari & Chalif Dev,
Andre QA). UI custom mirip ChatGPT, engine Hermes Agent, multi-user
role-aware. Live di nexcollab.maxndre.com.

Workflow per project: Chat Pribadi (private brainstorm dengan Hermes)
→ tombol "Send to Chat All" → Chat All (decision log shared dengan
team). Tiap project punya thread (lifecycle open/assigned/review/done).

Ideal handoff chain (target experience, sebagian belum diimplementasi —
detail di docs/workflow-upgrade-plan.md):

    PM /private  ──► Chat All  ──► UX /private  ──► Chat All
                                                         │
                                                         ▼
    Done ◄── QA /private ◄── Chat All ◄── Dev /private ◄┘

Tiap role bawa kerjaan ke /private masing-masing untuk
brainstorm/eksekusi dengan Hermes, lalu dorong ke /Chat All sebagai
decision log shared. Susulan dari role manapun ditambahkan ke thread
existing, bukan thread baru.

## Stack

- Server: Express + MongoDB di `server/`, port 127.0.0.1:8091
- Client: React + Vite di `client/`, build → `client/dist/`
- Reverse proxy: Caddy → nexcollab.maxndre.com
- Service: systemd `nexcollab.service` (ExecStart pakai absolute nvm
  node path)
- DB: MongoDB lokal, helpers `cC` (chats), `cM` (messages), `cP`
  (projects), `cPM` (project_members), `cT` (threads), `cU` (users)
  di `server/db.js`
- LLM gateway: 127.0.0.1:1430/v1 (enowxai/kiro), model
  kiro/claude-sonnet-4.6 untuk chat reply, gateway timeout di
  `~/.hermes/config.yaml`

## Layout penting

```
client/src/
  App.jsx                     auth gate
  api.js                      fetch wrapper + mdLite() renderer
  components/
    Workspace.jsx             shell, project switching, modal mount
    useChatState.js           per-fetch seq guard, polling, threads/categories
    ChatView.jsx, ChatComposer.jsx, MessageBubble.jsx
    ThreadList.jsx, ThreadDetailModal.jsx, CommentBubble.jsx
    ConfirmModal.jsx          replace window.confirm (variant danger/warning/primary)
    Toast.jsx                 global event-driven (window 'nexcollab:toast')
    ImagePreviewModal.jsx     event 'nexcollab:preview-image'

server/routes/
  threads.js                  CRUD thread, optimistic concurrency via if_version
  chat.js, projects.js, auth.js, upload.js, github.js, typing.js
```

## Konvensi yang harus dipatuhi

- File edit: surgical patch, hindari `write_file` file existing.
  Pakai `patch` tool dengan `old_string`/`new_string` minimal.
- Confirmation: SELALU `<ConfirmModal />`, JANGAN `window.confirm`.
- User feedback: pakai `toast.success/error/info` dari `Toast.jsx`.
- Project scoping: query/mutation/state SELALU scope by `projectId`.
  Lihat seq guard di `loadThreads` dan polling effect di
  `useChatState.js`. Reset state transient saat project switch
  (lihat Workspace effect on `[s.mode, s.project?.id]`).
- Optimistic concurrency: PATCH `/api/threads/:id` kirim `if_version`,
  server return 409 `version_conflict` kalau stale.
- Description thread: paste image = inline embed via mdLite,
  paste non-image / 📎 button = file attachment. Lihat
  `onDescPaste` di ThreadDetailModal.jsx.

## Build & deploy

```bash
cd client && npm run build
sudo systemctl restart nexcollab.service
sudo systemctl status nexcollab.service
sudo journalctl -u nexcollab.service -f       # tail log
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8091/
```

## Test akun

5 user seed di `server/seed.js`. Login langsung pilih avatar di
homepage (no password di prototype). Jangan add password flow di
prototype kecuali diminta eksplisit.

## Plan / roadmap

`docs/workflow-upgrade-plan.md` — paket A/B/C/D untuk upgrade
workflow handoff PM→UX→Dev→QA, global inbox, lane explicit, susulan
first-class. Belum dieksekusi, simpan untuk sesi mendatang.

## Skill terkait

- `software-development/surgical-edits` — chunked file modification
- `software-development/openai-compat-vision-input` — vision input
  via OpenAI-compat backend
- `devops/caddy-cloudflare-subdomain` — provision subdomain
- `devops/cloudflare-zone-hardening` — Cloudflare hardening

## Anti-pattern (jangan dilakukan)

- ❌ `window.confirm()` / `window.alert()` / `window.prompt()`
- ❌ `write_file` ke component yang sudah ada (pakai `patch`)
- ❌ Query thread tanpa filter `project_id`
- ❌ Mutation thread tanpa kirim `if_version` untuk PATCH
- ❌ Dump full file via `read_file` saat hanya butuh 1 region (pakai
  `offset`/`limit` atau `search_files`)
