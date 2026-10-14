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

---

## Lembar UAT (User Acceptance Testing) & Manual Testing

Gunakan lembar kerja ini untuk melakukan pengetesan fungsional dan verifikasi alur bisnis aplikasi PergiBerdua secara manual. Centang `[x]` pada setiap skenario yang berhasil diverifikasi.

### 1. Autentikasi & Manajemen Sesi (Email OTP)
Fitur login tanpa kata sandi via kode 6-digit OTP, sesi HttpOnly cookie, dan pembatalan token.

#### Skenario Positif (+)
- [ ] **TC-AUTH-01 (Kirim OTP Baru):** Masukkan email valid (contoh: `user@example.com`), klik *Kirim Kode Masuk*. Sistem menampilkan form input 6 digit OTP dan email diterima di Mailpit (`http://localhost:8025`).
- [ ] **TC-AUTH-02 (Verifikasi OTP Sukses):** Masukkan kode 6 digit yang valid dari Mailpit. Pengguna berhasil login, cookie sesi tersimpan otomatis di browser, dan diarahkan ke Dashboard.
- [ ] **TC-AUTH-03 (Auto Create Profile):** Pengguna baru yang belum terdaftar otomatis dibuatkan profil default setelah verifikasi OTP pertama kali.
- [ ] **TC-AUTH-04 (Persistent Session):** Refresh halaman dashboard atau buka tab baru, pengguna tetap dalam status login tanpa perlu input OTP ulang.
- [ ] **TC-AUTH-05 (Logout Bersih):** Klik tombol *Keluar/Logout*. Sesi dihapus, cookie dibersihkan, dan halaman dialihkan kembali ke form login.

#### Skenario Negatif (-)
- [ ] **TC-AUTH-06 (Format Email Tidak Valid):** Masukkan format email salah (contoh: `user@`, `user.com`, `spasi kosong`). Form memunculkan validasi error dan tidak mengirim OTP.
- [ ] **TC-AUTH-07 (OTP Salah):** Masukkan 6 digit angka acak yang tidak sesuai. Sistem menolak dengan pesan error yang jelas dan tidak membuat sesi.
- [ ] **TC-AUTH-08 (OTP Expired):** Coba gunakan kode OTP setelah melewati batas kedaluwarsa (15 menit). Sistem menolak verifikasi.
- [ ] **TC-AUTH-09 (OTP Replay / Digunakan Ulang):** Masukkan kode OTP yang sudah pernah berhasil digunakan sebelumnya. Sistem menolak dengan alasan token sudah tidak aktif.
- [ ] **TC-AUTH-10 (Rate Limiting OTP):** Lakukan permintaan kirim OTP berulang kali dalam jeda waktu sangat singkat. Sistem membatasi request spam.
- [ ] **TC-AUTH-11 (Akses Rute Terproteksi Tanpa Sesi):** Buka URL langsung tanpa cookie login. Pengguna diarahkan kembali ke halaman login.

---

### 2. Ruang Pasangan & Sistem Undangan Berbasis Email
Fitur pembuatan ruang privat kencan, undang pasangan via email terdaftar, terima/tolak undangan, notifikasi penolakan ke pengirim, kapasitas maksimal 2 orang, serta proteksi keamanan dari berbagai edge cases (lubang sistem).

#### Skenario Positif (+)
- [ ] **TC-ROOM-01 (Buat Ruang Baru):** Pengguna (User A) dapat membuat ruang baru dengan mengisi nama ruang dan tanggal jadian (opsional). Ruang aktif terbentuk dengan status `1/2 Anggota`.
- [ ] **TC-ROOM-02 (Undang Pasangan via Email):** Di tab *Akun & ruang*, klik *Undang pasangan via email*, masukkan email User B yang sudah terdaftar. Undangan terkirim dan status ruang menampilkan *Menunggu tanggapan dari [email User B]*.
- [ ] **TC-ROOM-03 (Banner Undangan Masuk User B):** Saat User B login ke aplikasinya, muncul banner undangan di beranda: *"[User A] mengundangmu untuk bergabung ke ruang [Nama Ruang]"* dengan tombol *Terima undangan* dan *Tolak undangan*.
- [ ] **TC-ROOM-04 (User B Menerima Undangan):** User B mengklik *Terima undangan*. Keduanya langsung berada di ruang yang sama dengan status `2/2 Anggota`, dan seluruh wishlist kencan tersinkronisasi.
- [ ] **TC-ROOM-05 (User A Menerima Notifikasi Diterima):** User A melihat pemberitahuan akun di beranda bahwa User B telah menerima undangan dan bergabung.
- [ ] **TC-ROOM-06 (User B Menolak Undangan):** User B mengklik *Tolak undangan*. Undangan dibatalkan dan banner undangan masuk hilang dari layar User B.
- [ ] **TC-ROOM-07 (User A Menerima Notifikasi Penolakan):** Saat undangan ditolak oleh User B, User A otomatis mendapatkan notifikasi di beranda: *"[User B] menolak undangan untuk bergabung ke ruang... Kamu dapat mengundang pengguna lain."*
- [ ] **TC-ROOM-08 (Batalkan Undangan Sebelum Ditanggapi):** User A dapat membatalkan undangan yang sedang pending kapan saja dengan menekan tombol *Batalkan undangan*.
- [ ] **TC-ROOM-09 (Hapus Ruang Solo Tanpa Pasangan):** Jika User A keluar saat masih sendirian (belum pernah ada pasangan yang masuk/bergabung), ruangan beserta seluruh isinya langsung dihapus seutuhnya dari database (bukan diarsipkan). User A kembali ke status awal tanpa riwayat ruang dan bebas membuat ruang baru dari nol.
- [ ] **TC-ROOM-10 (Keluar Saat Sudah Berpasangan):** Jika salah satu pasangan keluar dari ruang yang sudah berpasangan, status ruang diubah menjadi arsip hanya-baca (`archived`) untuk pasangan yang ditinggalkan, notifikasi dikirimkan, dan antrean pengingat dibatalkan.

#### Skenario Negatif (-)
- [ ] **TC-ROOM-11 (Email Pasangan Belum Terdaftar):** User A mengundang email yang belum memiliki akun PergiBerdua. Sistem menolak dengan pesan error: *"Email belum terdaftar sebagai pengguna PergiBerdua. Minta pasanganmu membuat akun terlebih dahulu."*
- [ ] **TC-ROOM-12 (Mengundang Email Sendiri):** User A memasukkan alamat email miliknya sendiri ke form undangan. Sistem menolak dengan pesan error: *"Tidak dapat mengundang email sendiri."*
- [ ] **TC-ROOM-13 (Mengundang User yang Sudah Punya Ruang Aktif):** User A mengundang User B yang saat ini sudah tergabung di ruang aktif lain. Sistem menolak dengan pesan: *"Pengguna ini sudah memiliki ruang aktif bersama pasangan lain."*
- [ ] **TC-ROOM-14 (Kapasitas Maksimal 2 Orang):** Mencoba mengundang orang ketiga ke dalam ruang yang sudah beranggotakan 2 orang. Sistem menolak dengan pesan: *"Ruang sudah berisi dua anggota."*
- [ ] **TC-ROOM-15 (Menerima Undangan Saat Masih Punya Ruang Aktif):** Pengguna yang sudah punya ruang aktif mencoba menerima undangan baru. Tombol dinonaktifkan dengan peringatan harus keluar dari ruang lama terlebih dahulu.

---

### 3. Wishlist Ide Kencan
Fitur katalog ide tempat kencan bersama, kategori, estimasi budget, tautan peta, dan pengelolaan status.

#### Skenario Positif (+)
- [ ] **TC-WISH-01 (Tambah Ide Tempat Baru):** Tambahkan tempat dengan mengisi nama tempat, kategori (Cafe, Kuliner, Wisata, Outdoor, dll.), estimasi budget, catatan, dan link Google Maps. Data muncul di daftar wishlist.
- [ ] **TC-WISH-02 (Edit Informasi Tempat):** Ubah nama, kategori, catatan, atau estimasi harga dari tempat yang sudah ada. Perubahan tersimpan dengan tepat.
- [ ] **TC-WISH-03 (Filter Kategori & Pencarian):** Filter daftar berdasarkan kategori tertentu atau cari berdasarkan nama tempat. Tampilan daftar sesuai filter.
- [ ] **TC-WISH-04 (Hapus Ide Tempat):** Hapus tempat yang tidak diinginkan dari wishlist. Tempat terhapus dari daftar.
- [ ] **TC-WISH-05 (Buka Tautan Google Maps):** Klik tautan peta pada kartu tempat, browser membuka link lokasi pada tab baru secara aman (`rel="noopener noreferrer"`).

#### Skenario Negatif (-)
- [ ] **TC-WISH-06 (Input Nama Tempat Kosong):** Coba submit form tambah tempat dengan nama kosong atau hanya spasi. Sistem menampilkan validasi error wajib diisi.
- [ ] **TC-WISH-07 (Format URL Peta Tidak Valid):** Masukkan string sembarangan pada kolom tautan peta (bukan skema URL http/https). Form memberi peringatan format URL tidak valid.
- [ ] **TC-WISH-08 (Budget Negatif):** Coba masukkan nilai budget bertanda minus. Sistem menolak atau membulatkan ke nilai valid 0.
- [ ] **TC-WISH-09 (Akses Wishlist Antar-Ruang Berbeda):** Coba akses atau manipulasi ID wishlist milik ruang pasangan lain. API menolak dengan status unauthorized/forbidden (403/404).

---

### 4. Perencanaan & Penjadwalan Kencan
Fitur menjadwalkan kencan untuk tempat tertentu pada tanggal yang disepakati, serta menandai kunjungan yang sudah terlaksana.

#### Skenario Positif (+)
- [ ] **TC-PLAN-01 (Jadwalkan Tanggal Kencan):** Pilih tempat dari wishlist, pilih tanggal rencana di masa depan (contoh: akhir pekan ini), dan simpan. Status tempat berubah dari `wishlist` menjadi `scheduled` dan muncul di tab *Rencana*.
- [ ] **TC-PLAN-02 (Ubah Tanggal Kencan Terjadwal):** Ganti tanggal rencana kencan yang sudah terjadwal ke tanggal baru yang valid. Kalender rencana terupdate.
- [ ] **TC-PLAN-03 (Tandai Kunjungan Selesai / Dikunjungi):** Klik *Tandai Selesai / Dikunjungi* pada tempat yang sudah didatangi. Status berubah menjadi `visited` dan masuk ke daftar riwayat/kenangan.
- [ ] **TC-PLAN-04 (Kembalikan ke Wishlist):** Batalkan jadwal tempat yang belum sempat dikunjungi agar kembali menjadi `wishlist` murni tanpa tanggal.

#### Skenario Negatif (-)
- [ ] **TC-PLAN-05 (Jadwalkan Tanggal Masa Lalu):** Coba masukkan tanggal rencana yang sudah lewat hari kemarin saat pertama kali menjadwalkan. Sistem memberi validasi peringatan tanggal tidak boleh di masa lampau.

---

### 5. Penjadwalan Ulang Otomatis (Automatic Rescheduling)
Fitur deteksi otomatis rencana kencan yang terlewat (missed date) dan penanganan interaktif bagi pasangan.

#### Skenario Positif (+)
- [ ] **TC-RESCHED-01 (Deteksi Otomatis Jadwal Terlewat):** Tempat kencan berstatus `scheduled` yang tanggal rencananya sudah lewat hari secara otomatis ditandai berstatus `missed`.
- [ ] **TC-RESCHED-02 (Banner Peringatan Tanggal Terlewat):** Muncul banner/pemberitahuan oranye/merah di Dashboard yang memberitahukan pasangan bahwa terdapat kencan yang terlewat.
- [ ] **TC-RESCHED-03 (Dialog Aksi Penjadwalan Ulang):** Klik tombol *Jadwalkan Ulang* pada banner atau kartu tempat. Muncul dialog modal penjadwalan ulang interaktif.
- [ ] **TC-RESCHED-04 (Pilih Tanggal Baru Berhasil):** Di dalam dialog, pilih tanggal baru di masa depan lalu klik konfirmasi. Status tempat kembali menjadi `scheduled` dengan tanggal baru dan banner peringatan hilang.
- [ ] **TC-RESCHED-05 (Opsi Kembalikan ke Wishlist):** Di dalam dialog penjadwalan ulang, pilih opsi *Kembalikan ke Wishlist*. Status tempat berubah menjadi `wishlist` tanpa tanggal terjadwal.
- [ ] **TC-RESCHED-06 (Opsi Tandai Sebagai Sudah Dikunjungi):** Jika kencan ternyata terlaksana namun lupa dicatat, pilih opsi *Tandai Sudah Dikunjungi*. Status tempat berubah menjadi `visited`.

#### Skenario Negatif (-)
- [ ] **TC-RESCHED-07 (Jadwalkan Ulang dengan Tanggal Lampau):** Pada modal penjadwalan ulang, coba pilih tanggal yang juga sudah lewat. Sistem menolak dan mewajibkan tanggal masa depan.

---

### 6. Notifikasi & Pengingat Email
Pengiriman notifikasi email otomatis ke inbox pengguna dan pasangan.

#### Skenario Positif (+)
- [ ] **TC-NOTIF-01 (Email OTP Masuk Cepat):** Email verifikasi OTP terkirim ke Mailpit dalam waktu kurang dari 3 detik dengan subjek dan kode yang jelas.
- [ ] **TC-NOTIF-02 (Email Pengingat Kencan H-1):** Worker otomatis mendeteksi kencan terjadwal untuk esok hari dan mengirimkan email pengingat kencan ke kedua pasangan.
- [ ] **TC-NOTIF-03 (Tracking Log Email):** Setiap pengiriman email tercatat rapi di tabel log database dengan status `sent`.

#### Skenario Negatif (-)
- [ ] **TC-NOTIF-04 (Penanganan SMTP Down):** Simulasikan SMTP tidak dapat dijangkau. Sistem menangani error dengan graceful logging tanpa membuat crash web server utama.

---

### 7. Fitur Web Admin Portal (`/admin`)

Portal terpusat untuk monitoring KPI aplikasi, audit user & room pasangan, serta inspeksi antrean & eksekusi worker background email.

#### Skenario Positif (+)
- [ ] **TC-ADMIN-01 (Login Admin Berhasil):** Buka `http://localhost:3000/admin`, masukkan master key `admin12345`. Login berhasil dan langsung diarahkan ke Dashboard dengan sesi cookie tersimpan.
- [ ] **TC-ADMIN-02 (Metrik KPI Live Realtime):** Dashboard menampilkan ringkasan metrik akurat (Total Users, Total Rooms, Rekomendasi Tempat, Email Jobs, dan Pending Queue).
- [ ] **TC-ADMIN-03 (Manajemen & Filter User):** Tab "Users" menampilkan daftar pengguna terdaftar lengkap dengan status, tanggal dibuat, serta fitur pencarian/filter nama/email/telepon yang responsif.
- [ ] **TC-ADMIN-04 (Monitoring Ruang Pasangan):** Tab "Rooms" menampilkan daftar room aktif, kode room, tanggal jadian/anniversary, serta partner yang terhubung.
- [ ] **TC-ADMIN-05 (Antrean Email & Trigger Worker Manual):** Tab "Email Jobs" menampilkan riwayat antrean email reminder. Tombol *"Jalankan Worker Sekarang"* berhasil memproses email reminder pending dan menampilkan notifikasi sukses/jumlah terproses.
- [ ] **TC-ADMIN-06 (Logout Admin):** Menekan tombol logout membersihkan sesi `pb_admin_session` dan mengembalikan admin ke halaman login terlindungi.

#### Skenario Negatif (-)
- [ ] **TC-ADMIN-07 (Login Kunci Rahasia Salah):** Masukkan password sembarang (misal `salah123`). Sistem menampilkan pesan error "Kunci rahasia admin salah" dan menolak akses.
- [ ] **TC-ADMIN-08 (Proteksi Akses Tanpa Sesi):** Akses langsung ke API `/api/admin/stats` atau `/api/admin/users` tanpa login mengembalikan status `401 Unauthorized`.

