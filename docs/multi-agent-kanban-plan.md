# Nexcollab — Multi-Agent Kanban Chat All

Disimpan di sini biar nggak hilang antar sesi. Belum dieksekusi.
Pelengkap dari `workflow-upgrade-plan.md` (paket A/B/C/D) — paket
ini lebih besar dan menggantikan paradigma Chat All.

Konteks: 5 user (PM, UX, Dev×2, QA). /private tetap seperti sekarang.
Yang berubah: Chat All dari stream chat → kanban 7 kolom dengan
agent personal yang bisa diskusi otomatis sampai sepakat (DEAL).

## Mental model: 1 engine, 5 persona (bukan 5 Hermes)

Secara teknis tetap 1 engine Hermes (1 gateway 127.0.0.1:1430/v1,
1 model, 1 codepath). Yang berbeda cuma system prompt + identitas
saat dipanggil:

```
1 engine Hermes
    ├─ Pimpi   = system_prompt_pimpi  + name + photo + stage_perms
    ├─ Hamka   = system_prompt_hamka  + ...
    ├─ Hardev  = ...
    ├─ Chaldev = ...
    └─ Andra   = ...
```

Analogi: 1 aktor pakai 5 topeng + 5 naskah. Bukan 5 aktor.

Implikasi:
- Token cost proporsional ke jumlah LLM call (1 thread bisa 20-40
  call sampai DEAL). Di gateway lokal: gratis.
- Memory/VRAM: 0 tambahan, 1 model loaded.
- Update model: ganti 1 baris config, ga perlu sync 5 tempat.
- Per-agent model override (future): field `agent_model` di
  cAgents, default sama untuk semua.

## Pemetaan persona default

| User    | Role | Agent     | Default tone                              |
|---------|------|-----------|-------------------------------------------|
| Tyo     | PM   | Pimpi     | Framing, scope, prioritization            |
| Hamfik  | UX   | Hamka     | Flow, wireframe, advokat user             |
| Hari    | Dev  | Hardev    | Pragmatis, code-first, surgical           |
| Chalif  | Dev  | Chaldev   | Review-minded, testing, second opinion    |
| Andre   | QA   | Andra     | Paranoid, edge case, repro discipline     |

Nama + foto + warna avatar **bisa di-edit per user** via settings
modal di /private (self-only). Foto upload reuse `server/upload.js`
yang sudah ada, persist di `server/uploads/`, link di
`cAgents.photo_url`.

## Tujuh kolom kanban di Chat All

```
┌─────────┬───────┬───────┬───────┬───────┬────────┬───────┐
│ Backlog │ Open  │ UI/UX │  Dev  │  QA   │ P.Check│ Done  │
│  draft  │  PM   │  UX   │  Dev  │  QA   │   PM   │   ✓   │
└─────────┴───────┴───────┴───────┴───────┴────────┴───────┘
```

Card di kolom = thread. Header = role accountable.

### Stage ownership (siapa boleh approve handoff)

| Stage     | Owner stage           | Agent role-relevant |
|-----------|-----------------------|---------------------|
| Backlog   | bebas (draft)         | Pimpi (kalau ada)   |
| Open      | Tyo (PM)              | Pimpi               |
| UI/UX     | Hamfik (UX)           | Hamka, Pimpi (PM watcher) |
| Dev       | Hari + Chalif (2 dev) | Hardev, Chaldev     |
| QA        | Andre (QA)            | Andra               |
| P.Check   | Tyo (PM)              | Pimpi               |
| Done      | locked, archive       | -                   |

Done bisa di-reopen → kembali ke P.Check.

## Aturan agent bicara

Default: agent **silent** kalau bukan stage-nya.

Stage-current agent:
- Bebas diskusi: PROPOSE / AGREE / PUSHBACK / ASK / NOTE
- Boleh elaborate ke owner-nya (cooldown 60s biar ga spam)
- Counted ke DEAL detection

Agent dari stage lain:
- Cuma masuk kalau **di-@mention** oleh human atau agent lain
- Reply hanya tag 📝 NOTE atau ❓ ASK (diskusi only)
- **Ga boleh PROPOSE / AGREE** (ga counted ke DEAL)
- **Ga eksekusi** — Hardev ga drop kode pas stage UI/UX, Andra
  ga bikin test plan pas stage Dev, dst.

Setelah reply 1x, agent stage-luar silent lagi sampai dipanggil
ulang atau stage berpindah.

## Stance tag (wajib tiap reply agent)

| Tag           | Arti                                              |
|---------------|---------------------------------------------------|
| 💡 PROPOSE    | Usulan baru atau amendment ke proposal terakhir   |
| 👍 AGREE      | Setuju ke proposal #N (sebut nomornya)            |
| 👎 PUSHBACK   | Ga setuju + alasan                                |
| ❓ ASK        | Minta klarifikasi (ga maju, ga mundur)            |
| 📝 NOTE       | Info tambahan, ga ngambil stance                  |

Server parse tag dari output LLM. Kalau tag missing → reject &
retry sekali. Kalau tetap missing → fallback NOTE.

## DEAL detection

Tujuan: agent diskusi bebas sampai sepakat, ga ada turn cap, ga
ada timer.

```
DEAL = proposal terakhir (PROPOSE #N) dapat 👍 AGREE dari
       SEMUA agent role-relevant stage-current
```

Contoh stage UI/UX:
- Role-relevant = Hamka (UX) + Pimpi (PM watcher)
- DEAL = Hamka 👍 #N AND Pimpi 👍 #N (proposal sama)

Saat DEAL detected:
1. Agent owner stage post auto-summary block
2. Description auto-update (snapshot diff jelas)
3. Loop diskusi berhenti
4. Footer thread aktifin tombol "Approve stage X"

Human reply kapan saja → counted juga (parsing optional, atau
tombol stance manual di composer).

## Stuck detector (ON)

Trigger: 3 turn berturut tanpa PROPOSE baru dan tanpa AGREE.

Effect: agent owner stage post pesan ⚠ STUCK ke discussion:

```
💭 Pimpi · ⚠ STUCK
Diskusi muter di concern X tanpa proposal konkret. Butuh input
human untuk break tie:
  - Hamka concern: ...
  - Hardev concern: ...
@humans pilih satu atau kasih arah lain.
```

Bukan stop. Begitu human reply, panel resume tanpa reset turn count.
Tujuan: protect dari ASK→ASK loop.

## Description evolution

Description thread = versioned (history kekal).

Tiga jalur update:

1. **Auto on DEAL** (utama): saat DEAL detected, agent owner stage
   rewrite seluruh desc berdasarkan proposal final + amendments.
   Diff di-display, di-log.
2. **Manual propose** (escape hatch): tombol "✏ Propose desc edit"
   di header thread. Human atau agent isi diff, butuh majority
   human current-stage approve untuk apply.
3. **Lock saat handoff**: snapshot per stage disimpan di
   `description_locks[stage]`. Stage berikutnya baca lock terakhir
   sebagai source of truth.

## Stage approval (handoff antar kolom)

- Tetap **manual** human current-stage klik tombol "Approve"
- Butuh **semua** stakeholder current-stage approve (Dev = 2 orang)
- Setelah approve:
  - Card auto-pindah ke kolom berikutnya
  - Description di-freeze (snapshot ke locks)
  - Agent role baru auto-greet baca handoff note dari stage
    sebelumnya
- PM bisa drag manual untuk override (force move)

## Apa yang human lihat di thread

```
┌─ Thread #14 — ... ──── [stage] ──┐
│ ✓ DEAL · disepakati 5 agent ─────│
│ ┌─ description versi terbaru ─┐  │
│ │ ...                         │  │
│ │ Approval stage UI/UX:       │  │
│ │   ✓ Hamfik   ◯ Tyo (1 sisa) │  │
│ └─────────────────────────────┘  │
│ [✓ Approve & ship] [⤴ Reopen]    │
│                                  │
│ ▸ Lihat transcript (14 pesan) ── │
└──────────────────────────────────┘
```

DEAL block di atas, transcript expandable. 80% kasus human tinggal
klik Approve tanpa baca transcript.

## Pemetaan ke existing

| Sekarang                       | Sesudah                          |
|--------------------------------|----------------------------------|
| Chat All = chat panjang        | Chat All = kanban 7 kolom        |
| Threads list di sidebar        | Hilang / jadi filter "my cards"  |
| `thread.status` (4 nilai)      | `thread.stage` (7 nilai)         |
| `current_assignee_id`          | `current_stage` + `stage_owners[]`|
| `description` (free text)      | versioned + `description_locks`  |
| Comments per thread            | Discussion + agent participants  |
| /private brainstorm            | Tetap, + tombol "Push to thread" |

## Schema changes

### `cT` (threads) tambah

```js
stage:              'backlog'|'open'|'uiux'|'dev'|'qa'|'pcheck'|'done'
stage_owners:       { open: [user_id], uiux: [...], ... }
approvals:          [{ user_id, stage, ts }]
description_locks:  { open: snapshot, uiux: snapshot, ... }
description_history:[{ version, ts, by_id, by_kind, content, source }]
deal_state:         { last_proposal: int, agreed_by: [agent_id], at: ts }
agent_participants: [{ agent_id, last_post_at }]
```

### `cM` (messages) tambah

```js
agent_id:      nullable     // siapa agent yg ngomong
role_at_post:  pm|ux|dev|qa|null
stance_tag:    propose|agree|pushback|ask|note
proposal_ref:  int          // nomor proposal yg di-AGREE/PUSHBACK
```

### `cAgents` (collection baru, atau field di `cU`)

```js
_id, owner_user_id, name, photo_url, color,
role, system_prompt, allowed_stages: [...],
model_override: nullable
```

Recommended: collection terpisah supaya agent bisa di-disable /
swap tanpa nyentuh row user.

## Endpoint baru

```
GET  /api/projects/:id/board              render 7 kolom
POST /api/threads/:id/replies             post pesan (human/agent)
POST /api/threads/:id/desc/propose        usul ubah desc
POST /api/threads/:id/desc/apply          apply diff
POST /api/threads/:id/approve             stage approval
POST /api/threads/:id/mention             trigger agent reply by mention
POST /api/threads/:id/run                 trigger agent loop (sampai DEAL)
GET  /api/agents                          list 5 persona
PATCH /api/agents/:id                     edit name/photo/color/prompt
                                          (self-only via owner_user_id)
```

## UI baru / extend

| Komponen                | Status   | Fungsi                          |
|-------------------------|----------|---------------------------------|
| `KanbanBoard.jsx`       | baru     | replace ChatView at /chat-all   |
| `ThreadCard.jsx`        | baru     | mini card di kolom              |
| `ThreadDetailModal.jsx` | extend   | tambah DEAL block + transcript  |
| `DescriptionEditor.jsx` | baru     | versioned, propose-apply        |
| `ApprovalFooter.jsx`    | baru     | per-stage tombol approve        |
| `DealBlock.jsx`         | baru     | ringkasan deal di atas thread   |
| `AgentSettingsModal.jsx`| baru     | edit name/photo/color (self)    |
| `StanceBadge.jsx`       | baru     | render 5 stance tag             |

Yang TIDAK berubah: `if_version` optimistic concurrency,
`ConfirmModal`, `Toast`, SSE thinking indicator (reuse buat agent
reply), /private flow, auth, project scoping.

## Engine agent (server)

```
server/agents.js          5 persona definition + lookup helper
server/agentRunner.js     loop diskusi sampai DEAL / STUCK
server/llm.js             extend: buildAgentPrompt, stance parser
server/stanceParser.js    parse tag dari output LLM, fallback NOTE
server/dealDetector.js    cek DEAL state per thread
```

`agentRunner.js` flow:
1. Trigger: human reply, @mention, atau stage transition
2. Loop:
   - Pilih agent role-relevant berikutnya yg belum AGREE proposal terakhir
   - Build prompt: persona + handoff note + transcript + stance instruction
   - Call LLM, parse stance, simpan ke cM
   - Cek DEAL → kalau yes, post summary + update desc, exit loop
   - Cek STUCK (3 turn no PROPOSE/AGREE) → post ⚠ STUCK, exit loop
   - Lanjut ke agent berikutnya
3. Exit kalau human interrupt (deteksi via polling new human msg)

## Fase eksekusi (estimasi 4–5 hari)

### Fase 1 — Schema + seed (0.5 hari)
- Migrasi `cT` (stage field), `cM` (agent fields)
- Buat collection `cAgents`, seed 5 persona default
- Backfill thread existing → stage default berdasarkan
  `status` lama (open→open, assigned→stage role assignee, dst.)

### Fase 2 — Kanban UI read-only (1 hari)
- `KanbanBoard.jsx` + `ThreadCard.jsx`
- Drag manual buat PM (tanpa approval flow dulu)
- Sidebar update (Threads list jadi filter)
- `AgentSettingsModal.jsx` — edit name/photo/color/prompt

### Fase 3 — Approval + auto-handoff (1 hari)
- `ApprovalFooter.jsx`
- Stage transition logic (server)
- `description_locks` snapshot saat handoff
- Optimistic concurrency via `if_version`

### Fase 4 — Agent diskusi + DEAL detection (1.5–2 hari)
- `agents.js` + `agentRunner.js`
- Stance tag parsing + fallback
- DEAL detector + auto-summary
- Stuck detector
- @mention cross-stage (NOTE/ASK only)
- Auto-update description on DEAL
- SSE indicator integration

## Keputusan yang sudah fixed

- ✓ /private tetap, ga diubah
- ✓ Chat All jadi kanban 7 kolom
- ✓ 5 agent personal (1 user 1 agent), 1 engine + 5 persona
- ✓ Agent silent kalau bukan stage-nya, kecuali di-mention
- ✓ Mention dari luar stage = NOTE/ASK only (diskusi, bukan eksekusi)
- ✓ DEAL detection, ga ada turn cap
- ✓ Stuck detector ON (raise ke human, ga stop)
- ✓ Description auto-evolve saat DEAL
- ✓ Stage approval tetap manual human
- ✓ Nama + foto + warna agent bisa di-edit per user (self-only)

## Open question (di-resolve saat eksekusi)

- Persona system prompt awal — draft saat Fase 1, di-tune lewat
  testing real
- Format auto-summary block saat DEAL — coba 2-3 layout, pilih
  yang paling readable
- Cooldown owner-elaborate (60s default) — adjust kalau noisy
- Apakah agent boleh @mention agent lain (cross-stage) — default
  iya, sama rule-nya kayak human mention
- Migration plan untuk thread existing (status → stage mapping)
  — detailkan saat Fase 1

## Resume protocol (sesi koding terputus)

Kalau sesi koding terputus di tengah (API limit, internet mati,
context full, browser ditutup), cara lanjutin:

### Mekanisme penyimpanan progress

1. **Checklist di doc ini** (lihat "Execution tracker" bawah) —
   tiap task selesai, agent patch `[ ]` → `[x]` plus catatan
   commit SHA. Ini single source of truth.
2. **Git commit per task** — branch `feature/multi-agent-kanban`,
   tiap task = 1 commit kecil. Pesan commit format:
   `[mak] fase N · <task>` (mak = multi-agent kanban).
3. **Session transcript** — otomatis di Hermes session DB, bisa
   di-recall via `session_search "nexcollab multi-agent"`.

### Cara user lanjutin di sesi baru

```
cd ~/nexcollab-prototype             # auto-load AGENTS.md
cat docs/multi-agent-kanban-plan.md  # lihat checklist
git log --oneline -20                # lihat commit terakhir
git status                           # cek WIP yg belum commit
```

Atau cukup bilang ke agent: **"lanjut nexcollab kanban"** —
saya akan auto-jalankan 3 perintah di atas, summarize sampai mana,
lalu lanjut dari `[ ]` pertama.

### Aturan agent saat eksekusi

- Setelah tiap task selesai DAN dites: commit, lalu patch checklist
  di doc dengan `[x] · <task> · <sha7>`.
- Kalau task setengah jalan, jangan biarkan WIP lama tanpa commit.
  Pakai commit `wip:` boleh, lebih baik daripada hilang.
- Kalau ketemu blocker, tulis di section "Blocker log" bawah dengan
  tanggal + ringkasan, jangan cuma di chat.
- Tiap akhir fase: smoke test manual + 1 commit "fase N done".

## Execution tracker

Status: belum mulai. Update checkbox + commit SHA tiap task done.

### Fase 1 — Schema + seed

- [x] Buat collection `cAgents` di db.js (helper + ensureIndex)  · a4199df
- [x] Migration: tambah field `stage`, `stage_owners`, `approvals`,
      `description_locks`, `description_history`, `deal_state`,
      `agent_participants` ke cT  · 4204cd0
- [ ] Migration: tambah field `agent_id`, `role_at_post`,
      `stance_tag`, `proposal_ref` ke cM  *(deferred ke Fase 4 saat
      cM benar-benar di-pakai untuk discussion message)*
- [x] Backfill thread existing: `status` lama → `stage` baru
      (open→open, assigned→uiux, review→pcheck, done→done,
      else→backlog)  · 4204cd0 · executed: 12 rows backfilled
- [x] Seed 5 persona default di cAgents (Pimpi/Hamka/Hardev/Chaldev/Andra)  · 572678f
- [x] Draft system prompt 5 persona (file `server/agentPrompts.js`)  · eaa634d
- [x] Smoke test: query cAgents, cek 5 row + linkage ke owner_user_id
      → 5/5 ok, threads by stage: open=6, uiux=3, pcheck=3
- [x] Fase 1 done — commit, tag, update tracker

### Fase 2 — Kanban UI read-only

- [x] `KanbanBoard.jsx` + `ThreadCard.jsx` (7 kolom, render cT.stage)  · 9bcea1b · 08ad1cf
- [x] Endpoint `GET /api/projects/:id/board`  · 709f0c0
- [x] Drag manual untuk PM (PATCH stage, optimistic concurrency)  · 26113b4 · 6d027c7 · 2e1e810 · 48cd3b9
- [ ] Sidebar update: Threads list jadi filter "my cards"  *(deferred — Threads list masih ada di sidebar, belum jadi filter; lanjut di Fase 3 atau iterasi UI berikutnya)*
- [x] `AgentSettingsModal.jsx` — edit name/photo/color/prompt (self-only)  · f1e7090
- [x] Endpoint `GET /api/agents` + `PATCH /api/agents/:id`  · a9f7cd2 · 43d3f71
- [x] Wire 🤖 Agent button di TopBar  · ece5a48
- [x] Smoke test: drag card, cek persist + render visual
      → board render 7 kolom, 6 cards di Open, drag PM open→uiux ok (version 1),
        modal Agent settings load Pimpi persona dengan field lengkap
- [x] Fase 2 done — commit, tag, update tracker

### Fase 3 — Approval + auto-handoff

- [x] `ApprovalFooter.jsx` (tombol approve per stage)  · 51361ac
- [x] Endpoint `POST /api/threads/:id/approve`  · 94e3a27
- [x] Stage transition logic + snapshot ke `description_locks`  · 94e3a27
- [x] Optimistic concurrency via `if_version`  · 94e3a27
- [ ] Auto-greet handoff note dari agent role baru  *(deferred ke Fase 4 — butuh agentRunner.js untuk generate greet)*
- [x] Expose stage/approvals/locks di GET /threads/:id  · 5f985ee
- [x] Wire ApprovalFooter ke ThreadDetailModal  · 2dc8428 · eec7c75
- [x] Smoke test: approve UI/UX → card pindah ke Dev + lock snapshot
      → uji 1: Hamfik UX approve thread #8 uiux→dev (version 2) ok
      → uji 2: Tyo PM approve thread #5 open→uiux (version 1) ok
      → footer render: "Stage: Open (PM) · Approve 0/1 · Menunggu PM"
        untuk DEV viewer, "✓ Approve PM" untuk PM viewer
- [x] Fase 3 done — commit, tag, update tracker

### Fase 4 — Agent diskusi + DEAL detection

- [x] `server/agents.js` — definisi 5 persona + lookup  *(implemented as agentPrompts.js + cAgents collection di Fase 1)*
- [x] `server/stanceParser.js` — parse 5 stance tag, fallback NOTE  · 64 lines
- [x] `server/dealDetector.js` — cek DEAL state per thread  · 70 lines
- [x] `server/agentRunner.js` — loop diskusi sampai DEAL/STUCK  · 87 lines
- [x] `server/agentMessage.js` — single agent turn + stance enforcement  · 78 lines
- [x] `server/agentDealSummary.js` — auto-rewrite description on DEAL  · 61 lines
- [x] Endpoint `POST /api/threads/:id/run` (trigger loop)  · fire-and-forget bg
- [ ] Endpoint `POST /api/threads/:id/mention` (manual mention)  *(deferred — /run + cross-stage rule sudah cukup untuk MVP, mention sebagai escape hatch belum dibutuhkan)*
- [x] @mention cross-stage rule (NOTE/ASK only)  *(enforced di agentMessage.js via isStanceAllowed — demote ke NOTE kalau cross-stage agent pakai PROPOSE/AGREE)*
- [x] Auto-update description on DEAL  *(rewriteDescriptionOnDeal di agentRunner DEAL branch)*
- [x] Stuck detector + UI banner  *(detectStuck di dealDetector + deal_state.status='stuck' badge di ApprovalFooter)*
- [ ] SSE indicator integration  *(deferred — polling 10x@3s sudah render reply tanpa manual refresh; SSE jadi optimisasi Fase 5)*
- [x] 🤖 Run agents button + deal-state pill di ApprovalFooter
- [x] Smoke test: trigger diskusi end-to-end, verify DEAL detection
      → uji 1: thread #4 (open/PM) → DEAL #1 (Pimpi propose+agree, single-agent stage)
      → uji 2: thread #5 (open/PM) → DEAL #1 (3 events: 2 ASK + 1 PROPOSE)
      → uji 3: thread #10 (pcheck/PM) → DEAL + description auto-rewritten ke
        spec final terstruktur (#1 Overview, #2 Goals, #3 Pages, #4 Notification,
        wireframe ASCII), prev_content tersimpan di description_history
- [x] Fase 4 done — commit, tag, update tracker

## Blocker log

Tulis di sini kalau ada hal yg perlu di-resolve sebelum bisa lanjut.
Format: `YYYY-MM-DD · <fase> · <ringkasan> · status`

(kosong)

## Hubungan ke paket A/B/C/D

Paket ini **menggantikan paket B** (status lane explicit) — lane
sekarang jadi 7-stage kanban, lebih lengkap.

Paket A (global inbox) tetap relevan, tinggal di-build di atas
schema baru: query thread cross-project di mana
`stage_owners[current_stage]` include user.

Paket C (notif realtime) tetap relevan, butuhnya malah lebih besar
karena ada agent activity yg perlu di-surface.

Paket D (susulan first-class) ter-cover otomatis: susulan masuk
sebagai discussion message di thread existing, bukan thread baru.
