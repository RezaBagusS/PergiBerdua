# Panduan Lingkungan & Deployment (Environments Guide)

Proyek **PergiBerdua** menggunakan arsitektur **Fullstack Next.js** (Frontend + API dalam satu aplikasi) dengan pembagian lingkungan sebagai berikut:

| Branch | Environment | Host Platform | Arsitektur | Tujuan |
| :--- | :--- | :--- | :--- | :--- |
| `dev` | **Local Development** | Mesin Lokal (Docker + Host) | Next.js (port 3000) + PostgreSQL & Mailpit (Docker) | Pengembangan fitur aktif & debug lokal |
| `stg` | **Staging / Testing** | **Vercel** (Fullstack Web + API) | Next.js di Vercel + Cloud PostgreSQL (Neon/Supabase) | Pengujian fungsionalitas & QA |
| `main` | **Production** | VPS (Docker Compose Standalone) | Container Next.js + PostgreSQL + Nginx SSL | Rilis live untuk pengguna publik |

---

## 1. Local Development (`dev`)

Branch ini digunakan untuk coding dan pengujian di komputer pengembang.

### Arsitektur Lokal
- **PostgreSQL & Mailpit:** Dijalankan via Docker Compose (`compose.dev.yaml` membuka port `5432` dan `8025`).
- **Next.js (Web + API):** Dijalankan di host (`http://localhost:3000`) dengan hot-reload langsung terhubung ke database lokal.

### Cara Menjalankan di Lokal:

1. **Jalankan Layanan Database & Mailpit di Docker:**
   ```bash
   # Buat file .env di root jika belum ada:
   node setup.mjs

   # Nyalakan PostgreSQL dan Mailpit:
   docker compose -f compose.yaml -f compose.dev.yaml up -d db mailpit
   ```

2. **Setup File Environment Frontend:**
   Salin `web/.env.development.example` ke `web/.env.local`:
   ```bash
   cp web/.env.development.example web/.env.local
   ```
   *(Pastikan password database di `DATABASE_URL` sesuai dengan `POSTGRES_PASSWORD` di file `.env` root).*

3. **Install Dependencies & Jalankan Next.js:**
   ```bash
   npm --prefix web install
   npm --prefix web run dev
   ```

* **Akses Lokal:**
  * Website & API: `http://localhost:3000`
  * Mailpit (Cek OTP email): `http://localhost:8025`

---

## 2. Staging / Testing di Vercel (`stg`)

Branch ini dideploy ke **Vercel** sebagai satu aplikasi **Fullstack (Frontend + API)**.

### Arsitektur Staging:
- **Web & API:** Berjalan di Vercel Serverless Function.
- **Database:** PostgreSQL Cloud Serverless (rekomendasi gratis: [Neon.tech](https://neon.tech) atau [Supabase](https://supabase.com)).
- **Email Reminder:** Dijalankan otomatis oleh **Vercel Cron** setiap 10 menit (`/api/cron/reminders` terdaftar di `vercel.json`).

### Setup Vercel Project:
1. Hubungkan repository GitHub `RezaBagusS/PergiBerdua` ke Vercel.
2. Atur **Production Branch** atau **Preview Branch** ke **`stg`**.
3. Di Vercel Dashboard (*Project Settings -> Environment Variables*), tambahkan variabel berikut:

| Variable Key | Contoh Nilai | Keterangan |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgres://user:pass@ep-staging.neon.tech/pergiberdua?sslmode=require` | Connection string PostgreSQL cloud |
| `AUTH_SECRET` | `rahasia-minimal-32-karakter-acak-untuk-stg` | Kunci enkripsi sesi & OTP |
| `APP_ORIGIN` | `https://pergiberdua-stg.vercel.app` | URL domain Vercel staging |
| `COOKIE_SECURE` | `true` | Wajib `true` (HTTPS) |
| `SMTP_HOST` | `smtp.resend.com` | Host SMTP provider |
| `SMTP_PORT` | `465` | Port SMTP |
| `SMTP_SECURE` | `true` | SSL/TLS |
| `SMTP_USER` | `resend` | Username SMTP |
| `SMTP_PASS` | `re_your_api_key_here` | Password/API key SMTP |
| `MAIL_FROM` | `PergiBerdua Staging <hello@domainanda.com>` | Alamat pengirim email |
| `APP_MODE` | `production` | Mode produksi |

---

## 3. Production di VPS (`main`)

Dijalankan di VPS menggunakan Docker Compose mandiri:
* Next.js berjalan dalam container Docker production.
* Database PostgreSQL persistent volume di VPS.
* Nginx / Caddy untuk reverse proxy dan sertifikat SSL Let's Encrypt.
