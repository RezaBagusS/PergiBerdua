# Panduan Lingkungan (Environments Guide)

Proyek **PergiBerdua** menggunakan alur kerja multi-branch dengan pembagian lingkungan sebagai berikut:

| Branch | Environment | Host Platform | Tujuan |
| :--- | :--- | :--- | :--- |
| `dev` | **Local Development** | Mesin Lokal (Docker + Host) | Pengembangan fitur aktif & debug lokal |
| `stg` | **Staging / Testing** | **Vercel** (Frontend) + Cloud Server (Backend) | Pengujian fungsionalitas & QA |
| `main` | **Production** | VPS (Docker Compose Standalone) | Rilis live untuk pengguna publik |

---

## 1. Local Development (`dev`)

Branch ini digunakan untuk coding dan testing di komputer pengembang.

### Arsitektur Lokal
- **Database & Mailpit:** Dijalankan via Docker Compose (`compose.yaml`).
- **Backend API:** Port `3001` (melalui `compose.dev.yaml`).
- **Frontend Next.js:** Dijalankan di host (`http://localhost:3000`) dengan hot reload.

### Konfigurasi File Environment
1. **Root `.env`** (untuk Docker Compose):
   Salin dari `.env.example` atau jalankan `node setup.mjs`.
   ```env
   POSTGRES_PASSWORD=generate-random-password
   AUTH_SECRET=generate-random-secret
   APP_ORIGIN=http://localhost:3000
   COOKIE_SECURE=false
   PORT=3000
   SMTP_HOST=mailpit
   SMTP_PORT=1025
   SMTP_SECURE=false
   MAIL_FROM=PergiBerdua <hello@pergiberdua.local>
   APP_MODE=development
   ```

2. **Frontend `web/.env.local`** (untuk Next dev server):
   Salin dari `web/.env.development.example`:
   ```env
   API_INTERNAL_URL=http://127.0.0.1:3001
   APP_ORIGIN=http://localhost:3000
   COOKIE_SECURE=false
   ```

### Cara Menjalankan di Lokal:
```bash
# 1. Jalankan layanan pendukung di Docker
docker compose -f compose.yaml -f compose.dev.yaml up --build -d db mailpit api

# 2. Jalankan Next.js frontend di host
npm --prefix web install
npm --prefix web run dev
```

---

## 2. Staging / Testing on Vercel (`stg`)

Branch ini dideploy ke **Vercel** untuk testing online.

### Setup Vercel Project:
1. Hubungkan repository GitHub `RezaBagusS/PergiBerdua` ke Vercel.
2. Atur **Production Branch** atau **Preview Branch** ke `stg`.
3. Jika ditanyakan **Root Directory**, Anda dapat memilih `web` (atau biarkan default dengan file `vercel.json` di root).
4. Tambahkan **Environment Variables** di Vercel Dashboard (*Project Settings -> Environment Variables*):

| Variabel | Contoh Nilai | Deskripsi |
| :--- | :--- | :--- |
| `API_INTERNAL_URL` | `https://api-staging.domainanda.com` | URL endpoint backend API staging Anda |
| `APP_ORIGIN` | `https://pergiberdua-stg.vercel.app` | URL domain Vercel staging Anda |
| `COOKIE_SECURE` | `true` | Wajib `true` karena Vercel menggunakan HTTPS |

> **Catatan Staging API:**
> Backend API Node.js dan PostgreSQL membutuhkan server mandiri (misal: VPS Staging, Railway, atau Render). Next.js di Vercel berfungsi sebagai BFF (Backend-for-Frontend) yang meneruskan request `/api/*` secara aman ke `API_INTERNAL_URL`.

---

## 3. Production (`main`)
*(Akan disetup saat siap rilis)*
- Menggunakan VPS dengan Docker Compose mandiri (`compose.yaml`).
- HTTPS dengan reverse proxy (Nginx / Caddy), `COOKIE_SECURE=true`, dan provider SMTP sungguhan.
