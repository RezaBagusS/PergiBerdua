# Daftar Fitur & Task List PergiBerdua

Dokumen ini berisi peta status fitur dan urutan eksekusi fitur lanjutan (*roadmap/backlog*) berdasarkan skala prioritas: **HIGH**, **MEDIUM**, **WEBSOCKET**, dan **LOW**.

---

## 📌 Ringkasan Status

| Status | Total Kategori | Keterangan |
| :--- | :---: | :--- |
| **Selesai (Completed)** | 6 Kategori | Fitur inti MVP sudah terimplementasi di kode |
| **Pending (HIGH)** | 4 Fitur | Prioritas utama untuk peningkatan fungsionalitas dan UX |
| **Pending (WEBSOCKET)** | 1 Fitur | Sinkronisasi realtime data antar-pasangan |
| **Pending (MEDIUM)** | 2 Fitur | Integrasi kanal sekunder dan pemulihan relasi |
| **Pending (LOW)** | 1 Fitur | Penyimpanan media dan galeri foto |

---

## ✅ 1. Fitur yang Sudah Selesai (Completed)

Semua fitur di bawah ini sudah selesai diimplementasikan di kode basis (`api/` dan `web/`):

### Autentikasi & Akun
- [x] Registrasi dan Login via OTP Email (kode 6 digit, masa berlaku 10 menit, proteksi maks 5 kali percobaan).
- [x] Username individu unik & validasi format karakter.
- [x] Session management berbasis HttpOnly cookie dan hashing token sesi.
- [x] Multi-device support (satu akun dapat dibuka di beberapa perangkat).

### Ruang Pasangan (Couple Space)
- [x] Pembuatan ruang pasangan dengan penamaan & tanggal jadian (opsional).
- [x] Pasangan kanonis (maksimal 2 anggota per ruang, 1 ruang aktif per akun).
- [x] Sistem undangan sekali pakai (berlaku 24 jam; generate undangan baru membatalkan yang lama).
- [x] Fitur Keluar dari Ruang (*Leave Room*):
  - [x] Pencabutan akses pihak yang keluar.
  - [x] Pembatalan semua reminder & link undangan aktif.
  - [x] Pengarsipan ruang untuk pihak yang tinggal (*read-only*).
  - [x] Pesan netral tanpa kebocoran data pribadi ke ruang baru.

### Wishlist & Kencan
- [x] Manajemen wishlist ide kencan (tambah, edit, hapus).
- [x] Kategorisasi, catatan, dan estimasi budget.
- [x] Pencarian & filter wishlist.
- [x] Penjadwalan kencan (tanggal & jam).
- [x] Pembatalan jadwal kencan.
- [x] Penandaan kencan selesai/dikunjungi (*mark visited*).

### Notifikasi & Worker Reminder
- [x] Pengaturan preferensi email per-individu (toggle on/off).
- [x] Background worker pengingat otomatis (jadwal H-1 dan H-2 jam sebelum kencan).
- [x] Mekanisme retry email gagal (maksimal 3 kali percobaan dengan jeda 5 menit).
- [x] Pelacakan status pengiriman email (*pending*, *sent*, *failed*).

### Frontend & Keamanan
- [x] Frontend React 19 + Next.js App Router + TypeScript strict.
- [x] BFF API Proxy allowlist (`/api/[...path]`) dengan CSP nonce.
- [x] Validasi payload & origin check di Next dan API.
- [x] Modal dialog native `<dialog>` dengan focus trap dan navigasi keyboard.

---

## 🚀 2. Fitur Belum Selesai (Berdasarkan Prioritas Eksekusi)

---

### 🔴 PRIORITAS: HIGH

#### Task 2.1: Magic-Link Login
> Mempermudah login tanpa harus menyalin/mengetik ulang kode OTP 6 digit.

- [ ] **Backend (API)**:
  - [ ] Tambahkan skema token magic link di database dengan hashing (SHA-256) dan waktu kedaluwarsa (15 menit).
  - [ ] Endpoint pembuatan magic link: `POST /api/auth/magic-link/request`.
  - [ ] Endpoint verifikasi token: `GET /api/auth/magic-link/verify?token=...`.
  - [ ] Integrasikan pengiriman email template magic link dengan URL callback terenkripsi.
- [ ] **Frontend (Next.js)**:
  - [ ] UI opsi "Kirim Magic Link" di halaman login/registrasi.
  - [ ] Halaman callback `/auth/verify` untuk memproses token dan redirect ke dashboard.
  - [ ] Penanganan state token kedaluwarsa/tidak valid dengan pesan informatif.

---

#### Task 2.2: Fitur Ekstra Wishlist & Kencan
> Memperkaya interaksi pemilihan ide kencan dan fleksibilitas jadwal.

- [ ] **Item Favorit**:
  - [ ] Tambahkan kolom `is_favorite` (boolean) pada tabel wishlist/ideas.
  - [ ] Endpoint `PATCH /api/ideas/:id/favorite` untuk toggle favorit.
  - [ ] Filter tab "Favorit" di antarmuka wishlist dan ikon bintang interaktif.
- [ ] **Weekly Digest**:
  - [ ] Buat cron worker mingguan (setiap awal pekan) untuk mengumpulkan agenda kencan minggu berjalan.
  - [ ] Template email ringkasan rencana kencan & ide wishlist acak yang belum terealisasi.
  - [ ] Toggle preferensi langganan "Weekly Digest" di menu pengaturan akun.
- [ ] **Quiet Hours (Jam Tenang)**:
  - [ ] Pengaturan rentang jam tenang (misal: 22.00 - 07.00) di preferensi user.
  - [ ] Worker reminder menunda pengiriman notifikasi jika waktu jatuh tempo berada di jam tenang hingga jam tenang berakhir.

---

#### Task 2.3: Manajemen Akun Lanjutan
> Pengelolaan profil mandiri, pemenuhan privasi data, dan kontrol akun.

- [ ] **Ubah Username**:
  - [ ] Endpoint `PATCH /api/user/username` dengan validasi keunikan username dan pembaruan pasangan kanonis.
  - [ ] Form edit username di profil pengguna.
- [ ] **Hapus Akun (Delete Account)**:
  - [ ] Kebijakan *cascading deletion* atau anonimisasi jika akun masih dalam ruang aktif.
  - [ ] Konfirmasi keamanan ganda (masukkan email/konfirmasi OTP) sebelum penghapusan.
  - [ ] Pembersihan token sesi dan data autentikasi.
- [ ] **Ekspor Data Pribadi (Export Data)**:
  - [ ] Endpoint `GET /api/user/export` untuk mengunduh seluruh data (wishlist, histori kencan, riwayat ruang) dalam format JSON/CSV.
- [ ] **Pemulihan Email Hilang / Ubah Email**:
  - [ ] Alur verifikasi identitas ke email lama dan email baru sebelum pemindahan akun.

---

#### Task 2.4: Penjadwalan Ulang Otomatis (Automatic Rescheduling)
> Penanganan kencan dan reminder yang terlewat waktunya secara cerdas.

- [x] **Deteksi Jadwal Terlewat (*Missed Dates*)**:
  - [x] Worker terjadwal dan query room otomatis mendeteksi agenda yang melewati batas waktu tanpa ditandai visited.
  - [x] Status otomatis berubah menjadi `missed` dan mail job terlewat dibatalkan.
- [x] **Saran Jadwal Ulang**:
  - [x] Banner interaktif di dashboard tab rencana: "Ada rencana kencan yang terlewat, mau dijadwalkan ulang?".
  - [x] Quick-action tombol "Jadwalkan ulang ↻" dan modal dengan waktu WIB baru.
- [x] **Penyelarasan Worker Reminder**:
  - [x] Otomatis meregenerasi job pengingat (H-1 & H-2 jam) saat tanggal baru ditentukan.

---

### 🌐 PRIORITAS: WEBSOCKET / REALTIME

#### Task 3.1: Sinkronisasi Realtime (WebSocket)
> Pembaruan data dua arah secara instan antara layar pasangan tanpa perlu refresh manual.

- [ ] **Arsitektur Realtime**:
  - [ ] Setup WebSocket server / SSE (Server-Sent Events) terautentikasi pada service backend.
  - [ ] Ruang channel berbasis `space_id` (hanya anggota ruang terverifikasi yang dapat *subscribe*).
- [ ] **Event-Driven Mutasi**:
  - [ ] Broadcast event saat salah satu pasangan:
    - Menambah/mengedit/menghapus ide wishlist.
    - Menjadwalkan atau membatalkan tanggal kencan.
    - Menandai kencan selesai (*visited*).
    - Memperbarui profil/ruang.
- [ ] **Integrasi Klien (Next.js)**:
  - [ ] React hook `useSpaceSubscription(spaceId)` untuk mendengarkan perubahan realtime.
  - [ ] Optimistic UI update dan pembaruan state lokal otomatis tanpa reload browser.
  - [ ] Indikator status koneksi (online/offline indicator).

---

### 🟠 PRIORITAS: MEDIUM

#### Task 4.1: Integrasi WhatsApp
> Notifikasi alternatif cepat selain email melalui WhatsApp Business API / Provider Gateway.

- [ ] **Integrasi Gateway WhatsApp**:
  - [ ] Integrasi provider WA gateway (Fonnte / Twilio / WhatsApp Cloud API).
  - [ ] Validasi dan normalisasi format nomor telepon Indonesia (`+62` / `08xx`).
- [ ] **Pesan Transaksional & Reminder**:
  - [ ] Pengiriman OTP via WhatsApp sebagai alternatif email.
  - [ ] Notifikasi undangan ruang via WhatsApp link.
  - [ ] Notifikasi pengingat kencan H-1 & H-2 jam langsung ke WhatsApp masing-masing pasangan.
- [ ] **Preferensi Kanal**:
  - [ ] Pengaturan pilihan kanal notifikasi: [ ] Email [ ] WhatsApp [ ] Keduanya.

---

#### Task 4.2: Fitur Balikan / Restore Hubungan
> Memberikan kesempatan pasangan yang pernah berpisah untuk memulihkan ruang atau memulai kembali.

- [ ] **Logika Domain & Database**:
  - [ ] Mengizinkan pasangan dengan relasi kanonis yang sama untuk mengaktifkan kembali ruang arsip atau membuat ruang baru setelah disepakati kedua belah pihak.
  - [ ] Mekanisme persetujuan ganda (*mutual consent*): Pihak A mengajukan permintaan restore/rujuk, Pihak B menerima konfirmasi.
- [ ] **Manajemen Data**:
  - [ ] Opsi memilih: "Mulai dari awal (ruang baru)" atau "Buka kembali arsip lama (wishlist & histori tetap ada)".
- [ ] **Antarmuka UI**:
  - [ ] Tampilan undangan khusus rekonsiliasi dengan konfirmasi keamanan.

---

### 🟢 PRIORITAS: LOW

#### Task 5.1: Media & Foto (Galeri Kenangan)
> Dokumentasi visual untuk melengkapi ide tempat dan kencan yang sudah terlaksana.

- [ ] **Storage & Backend**:
  - [ ] Setup Object Storage (MinIO / Cloudflare R2 / AWS S3) untuk upload file.
  - [ ] Validasi jenis file (JPEG/PNG/WebP), kompresi otomatis, dan batasan ukuran (maks 5MB).
  - [ ] Endpoint upload aman dengan signed URL atau multipart upload.
- [ ] **Fitur Galeri Kencan**:
  - [ ] Lampiran foto referensi pada ide wishlist kencan.
  - [ ] Upload foto kenangan setelah kencan ditandai sebagai *visited* (Album Kencan Berdua).
- [ ] **UI Galeri**:
  - [ ] Komponen lightbox viewer dan thumbnail carousel di detail kencan.
