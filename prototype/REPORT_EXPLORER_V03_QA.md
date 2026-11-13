# BAL PPIC Report Explorer — Tahap 3
Status: PROTOTYPE IMPLEMENTED / UAT BROWSER BELUM DILAKUKAN / NO DEPLOY.

## Ruang lingkup
- Katalog lengkap 13 laporan PPIC (sesuai rangkaian yang telah disepakati).
- Pilih laporan, pencarian, filter kelompok, detail ruang lingkup, kategori sumber.
- Tombol cetak PDF melalui dialog browser dan ekspor **metadata katalog** CSV.
- Tidak ada data finansial/operasional riil yang dimuat ke repositori publik.
- Tidak ada form input transaksi, integrasi Web SKT, atau perubahan source data.
- File baru terisolasi di `prototype/`, branch `plan/ppic-control-tower-rebuild-2026-11`.

## QA yang harus dijalankan sebelum dianggap lulus
1. Buka halaman HTML melalui server statis agar file JS termuat; verifikasi 13 laporan muncul.
2. Pilih setiap laporan; cek nomor, nama, ruang lingkup, dan kategori sumber.
3. Cari nama dan filter kelompok; uji hasil kosong dan navigasi keyboard.
4. Uji print A4 portrait, multi-halaman, Android/desktop, termasuk identitas dan status preview.
5. Uji CSV UTF-8 di Excel; pastikan hanya metadata, bukan data transaksi.
6. Lakukan audit keamanan sebelum menghubungkan bank data privat.
7. Buat lapisan API read-only terautentikasi dan manifest sumber berversi sebelum menampilkan angka live.

## Batasan
Ini **bukan** 13 laporan yang sudah terisi atau mesin PDF/Excel final. Data bank, drill-down sampai bukti sumber, dan Excel detail masih tahap selanjutnya. Tidak ada klaim PASS UAT.
