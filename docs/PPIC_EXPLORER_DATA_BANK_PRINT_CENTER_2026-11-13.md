# PPIC Control Tower BAL — Operational Explorer, Data Bank & Report Center
**Architecture revision: 13 November 2026 — DESIGN ONLY / NO DEPLOY**

## Keputusan owner
PPIC Control Tower BAL **BUKAN sistem input transaksi operasional**. Produk ini adalah **penjelajah operasional, bank data, analitik lintas divisi, dan pusat cetak laporan**. Tidak ada integrasi dengan Web SKT. Jangan membuat modul entry Giling, Verpack, DO, Kas, Cukai, atau bahan baku dalam aplikasi ini.

## Arsitektur target
1. **Source ingestion read-only**: pembacaan sumber yang telah disetujui (file Excel/PDF dan dokumen resmi), dengan manifest sumber, checksum, tanggal cut-off, versi, status, dan provenance. Impor data adalah pekerjaan pipeline administrator terkontrol, **bukan input transaksi melalui UI**.
2. **Data bank privat**: arsip raw immutable + tabel analitik terstandardisasi (dimensi SKU, merek, HJE, customer alias, tanggal, lot; fakta produksi, WIP, kemasan, barang jadi, pita, bahan, DO, piutang, kas). Simpan data sensitif pada storage privat dengan autentikasi, tidak di GitHub Pages publik.
3. **Explorer**: filter dan drill-down per tanggal, divisi, SKU, merek, HJE, customer, lot, SJ, CK-1, sumber, status rekonsiliasi; selalu tautkan ringkasan ke bukti asal.
4. **Analytic engine**: PPIC, Supply–Demand, MPS/MRP, BOM standar/aktual, HPP full costing, inventory aging, kapasitas, payroll estimate, cash forecast, gap, exception. Proyeksi harus berlabel estimasi, tidak menyamar sebagai realisasi.
5. **Report & Print Center**: daftar laporan 01–13 dan ringkasan eksekutif, PDF siap cetak, Excel dengan detail dan formula bila sesuai, layout A4 portrait/landscape, nomor halaman, logo BAL, tanggal/cut-off, versi, klasifikasi, status WORKING/OPEN RECON. Preview sebelum cetak, ekspor berdasarkan filter, batch export, dan arsip snapshot yang reproducible.
6. **Governance**: tidak mengubah sumber asli; data Web SKT tidak diintegrasikan; November OPEN RECON; closing September LOCKED; koreksi sumber ditampilkan sebagai revisi berversi, tidak menimpa arsip.

## Katalog cetak prioritas
01 Supply–Demand SKU; 02 WIP Giling–Verpack; 03 MPS; 04 MRP; 05 Kontrol Pita per HJE; 06 BOM standar vs aktual; 07 HPP full costing; 08 Proyeksi Kas; 09 DO/Piutang; 10 Kapasitas & Bottleneck; 11 Gap Antardivisi; 12 Inventory Turnover & Aging; 13 Simulasi Optimasi; 14 Executive Summary; 15 Kartu Stok & Ledger; 16 Laporan Rekonsiliasi Sumber.

## Kriteria penerimaan laporan cetak
- PDF dibuka dan dicetak benar pada Android/desktop, tanpa tombol mati.
- Filter laporan sesuai data yang tampil, total konsisten dengan detail, tidak menggandakan SJ/dokumen.
- Format rupiah, pack, batang, tray, karton, keping, lembar, kg jelas; HJE tidak disamakan dengan omzet.
- Status estimasi, aktual, OPEN RECON, dan LOCKED ditampilkan tanpa memalsukan validitas.
- Nomor halaman, tanggal ekspor, cut-off, sumber, checksum/versi dan identitas laporan tercantum.
- Hak akses menghalangi pembukaan/ekspor payroll, piutang, dan kas oleh pengguna yang tidak berwenang.
- Hasil ekspor dapat direproduksi dari snapshot sumber yang sama.

## Rencana implementasi
P0 audit repositori publik dan inventaris source; P1 skema bank data dan manifest; P2 explorer read-only; P3 engine analitik; P4 print center dan template; P5 QA akses/rekonsiliasi/print; P6 staging dan approval release.

**Batas mandat:** rancangan saja di branch non-main; tidak ada perubahan produksi, deploy, migrasi data, atau integrasi Web SKT.
