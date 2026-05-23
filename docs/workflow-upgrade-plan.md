# Nexcollab — Rencana Workflow Upgrade

Disimpan di sini biar nggak hilang antar sesi. Belum dieksekusi.
Konteks: 5 orang (PM/UX/Dev×2/QA), parallel, multi-project, susulan
masuk di tengah hari.

## Masalah yang akan diatasi

1. Inbox per-project bikin macet kalau project banyak. Tiap orang harus
   klik project A→B→C buat tau "ada apa untuk gw hari ini".
2. Status `open/assigned/review/done` nggak first-class buat handoff
   PM→UX→Dev→QA. Hari (Dev) liat thread di Chat All, nggak tau ini
   gilirannya atau masih di Hamfik.
3. Susulan ambigu — Tyo nambah requirement di /private, kirim ke All:
   thread baru atau comment di thread existing? Tergantung mood.
4. Notif lemah. Polling 4s sudah ada tapi cuma update list, nggak
   bunyiin badge global lintas project.

## Paket A — Global inbox

Topbar atau sidebar atas: "📥 3 buat kamu" gabungan semua thread
cross-project yang nunggu user aktif. Klik → flat list dengan label
project di tiap item.

## Paket B — Status lane explicit per-role (struktur dasar)

Ganti `open/assigned/review/done` jadi explicit lane:
`open → ux → dev → qa → done`. Field baru `current_lane`.

Saat user klik "Mark my part done" → muncul picker next-lane (default
auto: ux→dev→qa→done). Thread otomatis pindah lane → masuk inbox
member lane berikutnya.

Migrasi: existing thread `assigned` → infer dari assignee.role,
existing `review` → drop ke lane berikutnya.

## Paket C — Realtime notifikasi lane shift

Pakai polling 4s yang sudah ada. Kalau diff antara hasil polling ke-N
dan ke-(N-1) ada thread baru masuk lane user → dispatch toast +
update badge global.

## Paket D — Susulan first-class

Di composer "Send to Chat All" tambah toggle:
- [ ] thread baru
- [ ] tambah ke thread existing (dropdown thread project ini)

Kalau pilih existing → POST sebagai comment, bukan promote-update,
dengan label "susulan dari PM" atau sejenisnya.

## Urutan eksekusi

B (struktur) → A (consume) → C (notif) → D (UI). B paling besar
(server schema + UI), C paling kecil. Total estimate ~6-8 jam kerja
intensif kalau dipecah per phase.

## Catatan

- Konsep ini sudah didiskusikan, user setuju. Tinggal eksekusi kapan
  prioritasnya tepat.
- Sebelum gas: pastikan timeout/abort issue Hermes sudah selesai —
  scope segini tanpa konteks bersih = abort risk tinggi.
