# PergiBerdua · Next.js + TypeScript

Migrasi frontend PergiBerdua dari vanilla JavaScript menjadi **React + Next.js App Router + TypeScript strict**. Docker Compose tetap disertakan.

**Scope migrasi:** seluruh frontend, komponen React, kontrak client API, konfigurasi Next, route handler proxy, dan CSP proxy menggunakan TypeScript. Backend bisnis dan worker email dari versi sebelumnya **tetap Node.js JavaScript (`api/*.mjs`)**, berjalan sebagai service terpisah. Ini bukan klaim konversi backend penuh ke TypeScript.

## Arsitektur

```text
Browser
  ↓ same-origin HTTP + HttpOnly session cookie
Next.js web (:3000)
  ├─ app/page.tsx → komponen React TypeScript
  ├─ app/api/[...path]/route.ts → API allowlist proxy
  └─ proxy.ts → nonce Content Security Policy
         ↓ internal Docker network only
Node API + email worker (:3000 internal)
  ├─ PostgreSQL :5432 (persistent volume)
  └─ SMTP → Mailpit :1025 (local email viewer :8025)
```

Hanya Next frontend dan Mailpit viewer yang dipetakan ke host, keduanya `127.0.0.1`. Database serta API tidak diekspos pada Compose default. Browser tidak menerima database password, SMTP password, atau `AUTH_SECRET`.

## Jalankan lokal

Butuh Docker Desktop / Docker Engine + Compose v2. Internet diperlukan pada build pertama untuk image dan npm dependency.

```sh
cd pergiberdua-nextjs
node setup.mjs
docker compose up --build -d
docker compose ps
```

`setup.mjs` membutuhkan Node 22+, membuat `.env` dengan secret acak, dan **tidak menimpa `.env` yang sudah ada**.

Tanpa Node di host, gunakan Linux/macOS:

```sh
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/app" -w /app node:22-alpine node setup.mjs
docker compose up --build -d
```

PowerShell: hilangkan `--user` dan gunakan `-v "${PWD}:/app"`. Atau salin `.env.example` ke `.env` dan isi dua secret secara manual. Jangan biarkan placeholder.

**Website:** http://localhost:3000  
**Email lokal:** http://localhost:8025

Konfigurasi default menangkap OTP dan reminder di Mailpit, bukan mengirimkannya ke internet. Mailpit viewer tidak memiliki login; jangan publikasikan port 8025.

## Coba sebagai pasangan

1. Daftar dengan username unik dan email contoh.
2. Ambil OTP dari Mailpit dan verifikasi.
3. Buat ruang, isi tanggal jadian bila diinginkan, dan buat tautan undangan.
4. Buka browser lain / jendela privat, daftar sebagai orang kedua.
5. Buka tautan undangan dalam browser orang kedua dan terima.
6. Tambah wishlist, jadwalkan pergi, cek pengingat di Akun & ruang.
7. Uji **Keluar dari ruang pasangan**, bukan sekadar **Keluar akun**. Ruang lama menjadi arsip bagi pihak yang tinggal; pihak keluar kehilangan akses.

OTP verifikasi berbeda dari kode/tautan undangan. Tanggal jadian hanya profil, bukan autentikasi. Satu akun boleh membuka beberapa perangkat, tetapi hanya satu ruang aktif. Maksimal dua anggota per ruang.

## Jika sudah menjalankan paket Docker sebelumnya

**Jangan menghapus volume database atau mengganti password database yang sudah diinisialisasi.**

1. Backup PostgreSQL dan catat Compose project name / nama volume yang sedang dipakai.
2. Dari folder proyek lama, jalankan `docker compose stop` untuk melepaskan port tanpa menghapus data.
3. Salin `.env` lama ke folder paket baru. Jangan generate password baru.
4. Gunakan **project name yang sama** saat menyalakan paket baru:

   ```sh
   docker compose -p NAMA_PROYEK_LAMA up --build -d
   ```

   Contoh default ketika folder lama bernama `pergiberdua-docker`: `-p pergiberdua-docker`. Jika sebelumnya memakai `COMPOSE_PROJECT_NAME` atau `-p`, gunakan nilai sebenarnya.

5. Volume key tetap `postgres-data`, dan skema tabel tidak diubah oleh migrasi frontend ini. Verifikasi data terlebih dahulu sebelum membersihkan container lama.

Tanpa project name yang sama, Compose membuat volume baru dan tampak seperti database kosong. Database lama tidak otomatis hilang. **Jangan gunakan `docker compose down -v`** kecuali memang ingin menghapus database.

## Development dengan hot reload

Node 22+ di host diperlukan.

```sh
node setup.mjs
docker compose -f compose.yaml -f compose.dev.yaml up --build -d db mailpit api
cp web/.env.example web/.env.local
npm --prefix web install
npm --prefix web run dev
```

Jangan menjalankan service `web` Compose di port yang sama saat memakai Next dev server. Override dev hanya membuka API pada `127.0.0.1:3001`. Next dev tetap pada port 3000.

Frontend memiliki client boundary pada `components/PergiBerdua.tsx`, sementara layout dan page memakai App Router. Tidak memakai `innerHTML` / `dangerouslySetInnerHTML`; React melakukan escaping teks. UI state dan payload API memiliki tipe terpisah. Modal menggunakan native `<dialog>` dengan focus trap browser, judul aksesibel, Escape, dan pemulihan fokus.

## Skrip

```sh
# Setelah npm --prefix web install:
npm run typecheck
npm run build
npm --prefix web run test:proxy

# Unit domain API tanpa dependency:
npm test

# Stack Docker nyata sudah berjalan; database disposable:
npm run test:integration

# Browser test terhadap Next yang sudah hidup; API dimock:
cd web
npx playwright install chromium
npm run test:ui
```

`test:integration` membuat akun/ruang contoh. Jangan jalankan pada database produksi. `web/tests/ui-smoke.mjs` memakai `TEST_ORIGIN` opsional dan menulis screenshot ke `web/test-results/`.

## Fitur yang dipertahankan

- Registrasi dan login OTP email individual; kode 10 menit, maksimum lima percobaan.
- Username individu unik; pasangan username kanonis dan unik.
- Undangan sekali pakai, 24 jam; undangan baru membatalkan sebelumnya.
- Maksimal dua anggota per ruang, satu ruang aktif per akun.
- Wishlist, pencarian, kategori, budget, catatan, edit/hapus, jadwal, pembatalan, kunjungan.
- Preferensi email individu, worker H-1 dan dua jam sebelumnya, status pengiriman.
- Keluar dari pasangan mencabut akses, membatalkan reminder/undangan, mengarsipkan untuk pihak yang tinggal.
- Pemberitahuan netral ke pihak yang tinggal, tanpa memindahkan data lama ke ruang baru.
- Database persistent; beberapa perangkat untuk akun sama diperbolehkan.

## Batas fitur

- **WhatsApp belum terintegrasi.**
- Magic-link login belum dibuat; MVP memilih OTP dari standar “OTP atau magic link”.
- Tidak ada digest mingguan, jam tenang, favorit, upload foto, atau sinkronisasi realtime. Muat ulang untuk perubahan pasangan.
- Tidak ada perubahan username, penghapusan akun, export data pribadi, atau pemulihan email hilang.
- Pasangan username yang pernah memiliki ruang tidak bisa membuat pasangan identik lagi. Restore arsip / kembali bersama memerlukan fitur terpisah.
- Pengingat yang waktunya terlewat tidak dibuat. Preferensi off membatalkan job saat jatuh tempo, tidak menghidupkannya lagi saat on.
- SMTP `sent` berarti diterima server SMTP, bukan jaminan dibaca. Retry gagal maksimum tiga kali dengan jeda lima menit; crash dapat menyebabkan duplikasi karena SMTP dan SQL tidak atomik.
- API dan worker memakai satu advisory lock untuk mutasi ruang. Cocok untuk MVP kecil; perlu perbaikan granularitas untuk skala besar.
- Pemulihan autentikasi, keamanan akun, delivery email, dan lifecycle data tetap perlu review sebelum publik.

## Keamanan dan konfigurasi

- Request browser tetap same-origin `/api/*`; tujuan upstream fixed pada `API_INTERNAL_URL`, tidak ditentukan oleh input pengguna.
- Route handler hanya menerima endpoint allowlist, mempertahankan status backend, cookie HttpOnly, dan `no-store`.
- Origin POST diperiksa di Next serta API; JSON body dibatasi 16 KiB.
- Request-time rendering + CSP nonce untuk script Next. `style-src` mengizinkan inline style demi kompatibilitas; script tidak memakai `unsafe-inline`.
- Authorization tetap dilakukan API untuk setiap operasi ruang. Menyembunyikan tombol di UI bukan kontrol akses.
- Token sesi/undangan di-hash, OTP di-HMAC; data autentikasi tidak disimpan di localStorage.
- **Rate limit IP saat ini konservatif:** karena request melewati Next, API melihat IP service Next. Kuota IP bisa berbagi untuk semua pengguna. Email rate limit tetap per-email. Jangan mempercayai `X-Forwarded-For` mentah; pasang trusted edge limit sebelum deployment publik.
- `APP_ORIGIN` harus sama persis dengan origin browser; sesuaikan juga bila `PORT` diubah.
- `.env` root untuk Compose. `web/.env.local` hanya untuk Next dev di host, tidak untuk secrets database.
- Production memerlukan HTTPS, `COOKIE_SECURE=true`, `APP_MODE=production`, provider SMTP sungguhan, backup/restore, audit keamanan, dan kebijakan privasi/data.

## Dependency dan status keamanan

Manifest Next menggunakan minimum `^16.3.8`, React `^19.2.0`, TypeScript `^5.9.3`. Ini rentang versi, **bukan lockfile reproducible**.

Referensi Next:

- https://nextjs.org/blog/september-2026-security-release
- https://nextjs.org/blog

Sumber resmi mengumumkan update keamanan tambahan untuk 14 Oktober 2026. **Jangan menganggap versi minimum paket ini sebagai jaminan aman untuk production.** Periksa advisory terbaru pada saat instalasi, pilih rilis patched, jalankan audit, hasilkan dan commit lockfile.

```sh
npm --prefix web install --package-lock-only
npm --prefix api install --package-lock-only
npm --prefix web audit
npm --prefix api audit
```

Sesudah lockfile tersedia dan diverifikasi, ubah Dockerfile masing-masing menjadi `COPY package*.json ./` + `npm ci` (API: `npm ci --omit=dev`). Pin image digest juga. Tidak ada lockfile buatan atau hasil instalasi yang dikarang dalam paket ini.

## Struktur

```text
pergiberdua-nextjs/
├── compose.yaml                 web + api + postgres + mailpit
├── compose.dev.yaml             API localhost:3001 untuk Next dev
├── setup.mjs                    Generate secret acak
├── .env.example
├── web/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   ├── globals.css
│   │   └── api/[...path]/route.ts
│   ├── components/              React TSX: auth, dashboard, modal, artwork
│   ├── lib/                     Typed client API, model, format helpers
│   ├── proxy.ts                 Next 16 CSP proxy
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── Dockerfile               Multi-stage, standalone, non-root
│   └── tests/                   Proxy unit + UI smoke
├── api/
│   ├── server.mjs               API bisnis dan worker sebelumnya
│   ├── domain.mjs
│   ├── schema.sql
│   ├── Dockerfile
│   └── test/
└── TESTING.md                   Batas hasil uji yang sebenarnya
```

Paket ini memperbarui **source website**, bukan artifact prototype ClickUp. Tidak ada deployment publik dilakukan.
