# Hasil verifikasi

## Dijalankan di lingkungan pembuatan

1. **TypeScript strict untuk komponen React dan `web/lib`: lulus.**
   Menggunakan compiler dan React type definitions yang tersedia. Typecheck ini tidak mencakup type generation Next atau import `next/*`, karena Next tidak terinstal.
2. **Unit domain API: 8/8 lulus.**
   Validasi email/username, canonical pair, OTP/HMAC, session token, tanggal, budget, jadwal/reminder.
3. **Unit proxy: 7/7 lulus.**
   Source route handler ditranspile lalu dijalankan dengan Web Request/Response dan `fetch` tiruan. Menguji allowlist, origin, content type, ukuran body, forwarding cookie/status, query, dan upstream failure.
4. **React UI smoke: lulus dengan API tiruan.**
   TSX React dibundle dengan esbuild sebagai test harness terpisah, bukan `next build`. Menguji registrasi/OTP, create room, undangan, tambah/schedule/kunjungan, cari, menu, email toggle, profil, dan logout.
5. **Desktop 1440×1000 dan mobile 390×844 ditinjau.**
   Tidak ada exception JavaScript pada alur smoke, tidak ada horizontal overflow pada viewport mobile yang diuji.
6. **Syntax Node API dan browser test: lulus.**

## Belum dijalankan

- `npm install` untuk dependency Next/React dari manifest ini.
- Full project `tsc` dengan types Next dan `next build`.
- Runtime Next App Router, hydration React 19, middleware/proxy CSP, cookie forwarding lewat server Next sungguhan.
- Docker image build / Compose startup.
- PostgreSQL, Mailpit, dan integration test stack nyata.
- SMTP internet / WhatsApp / pengujian performa / audit keamanan independen.

**Alasan:** sandbox tidak memiliki akses internet; Docker dan Next.js tidak tersedia. Hasil React harness + unit proxy **tidak sama dengan end-to-end stack production**. Runtime React harness memakai runtime React tersedia, bukan hasil dependency install dari manifest.

## Acceptance di mesin developer

1. Install dependencies, periksa advisory framework terbaru, generate lockfile, lalu audit.
2. `npm run typecheck` dan `npm run build`.
3. `docker compose up --build -d` dan pastikan empat service sehat/berjalan.
4. `npm run test:integration` memakai database disposable.
5. `npm --prefix web run test:proxy`.
6. Setelah Playwright Chromium tersedia, `npm --prefix web run test:ui` terhadap Next yang hidup.
7. Periksa console browser untuk hydration/CSP errors. Login, refresh, logout, dan pergantian ruang harus berfungsi lewat cookie HttpOnly pada origin Next.
8. Uji manual OTP salah/expired/replay, undangan concurrent, anggota ketiga, revocation saat sesi lama masih terbuka, readonly archive, reschedule saat worker aktif.
9. Uji restart, backup/restore, SMTP mati, gagal antrean, dan prefers-reduced-motion.
10. Pastikan database dan Mailpit tidak terbuka ke internet sebelum deployment.
