# BAL-99 Mobile Super Compact Evaluation

Tanggal: 2026-05-25
Status: FINAL AWAL / PERLU UJI HP

## Masalah yang ditemukan
Pada tampilan HP, bagian atas halaman BAL-99 terlalu tinggi karena kombinasi:
- header/topbar masih membawa logo, judul, subjudul, dan top-meta
- top-meta berisi banyak link cepat
- mobile quick menu berada tepat di bawah header
- tombol favorit mobile cukup banyak

Akibatnya konten utama terlihat terlalu bawah dan terasa seperti memakan setengah halaman.

## Prinsip desain HP final
BAL-99 mobile memakai prinsip: One-screen first decision.

Saat dibuka di HP, yang harus cepat terlihat:
1. Logo kecil
2. Nama sistem ringkas
3. Dropdown menu kerja
4. Konten utama

Bukan header panjang, bukan daftar link, dan bukan dashboard desktop yang dikecilkan.

## Update yang sudah dilakukan
File `bal99-executive-theme.css` sudah diperbarui dengan Mobile Super Compact Mode.

Perubahan utama:
- topbar sticky dipadatkan menjadi sekitar 46px
- logo dikecilkan menjadi 32px
- subjudul brand disembunyikan di HP
- top-meta disembunyikan total di HP
- mobile quick menu dipadatkan
- tombol favorit mobile dibuat horizontal scroll
- ticker disembunyikan di HP
- page-head, card, dan table toolbar dibuat lebih compact

## Kriteria uji HP
Buka `index.html?v=supercompact1` dari HP dan cek:

| Area | Target |
|---|---|
| Header | Tidak lebih dari ±1 baris tinggi utama |
| Logo | Kecil, tidak dominan |
| Top-meta | Tidak terlihat di HP |
| Dropdown menu | Muncul dekat atas, mudah dipilih |
| Tombol favorit | Satu baris geser samping |
| Konten utama | Sudah terlihat tanpa scroll panjang |
| Dashboard Ringkas | Bisa dibuka normal |
| Status Hari Ini | Bisa dibuka normal |
| Scorecard Borongan | Bisa dibuka normal |

## Nilai kalibrasi mobile
Sebelum compact: ±680-700
Compact fix pertama: ±820
Super Compact Mode: ±845-860
Target setelah uji screenshot dan fine-tuning: ±880

## Keputusan praktis
Jika setelah uji masih terasa tinggi, tahap berikutnya adalah Ultra Compact Mode:
- header hanya logo kecil + teks BAL-99
- mobile quick menjadi satu dropdown saja
- tombol favorit disembunyikan menjadi menu geser bawah

## Catatan aman
Update ini hanya visual CSS. Tidak mengubah:
- app.js
- index.html
- CSV produksi
- rumus
- localStorage
- data lama
