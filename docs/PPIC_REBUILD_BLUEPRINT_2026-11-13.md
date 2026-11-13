# Rencana Perombakan PPIC Control Tower BAL — DRAFT
Tanggal: 13 November 2026. Status: DESIGN ONLY / NO DEPLOY.
**Keputusan:** Control Tower ini mandiri, tanpa integrasi dengan Web SKT.

## Kondisi repositori (audit teknis awal)
- Repositori mengandung banyak berkas HTML, JavaScript, dan CSV historis; `app.js` memakai data baseline lama.
- GitHub Pages melakukan deploy otomatis dari `main`; tidak cocok untuk data transaksi internal yang sensitif.
- Repositori ini publik. **Jangan pernah commit payroll, piutang, pemasok, data produksi rinci, nomor rekening, atau bukti internal ke GitHub publik.**
- Rencana ini tidak mengubah file produksi maupun workflow aktif.

## Target arsitektur mandiri
1. Antarmuka PPIC internal: Giling, WIP, Verpack, Barang Jadi, Bahan Baku, Cukai, DO, Kas, BOM, HPP, Supply–Demand dan executive dashboard.
2. API terautentikasi dan basis data privat: `event`, `event_line`, `approval`, `reversal`, `source_document`, `stock_lot`, `cost_batch`, `period_close`.
3. Posting atomik dan append-only: setiap event menghasilkan mutasi berpasangan dengan audit trail; tidak menghapus histori.
4. Kontrol sebelum posting: validasi SKU, lot, HJE, UOM, stok, nomor dokumen, idempotensi, periode, serta pemeriksa yang berbeda dari pengusul.
5. HPP absorption/full costing; pisahkan tarif BOP provisional dari realisasi; hindari biaya WIP dan pita cukai dihitung dua kali.
6. Laporan snapshot versioned; ekspor Excel/PDF resmi; arsip dapat dikendalikan lewat mekanisme tersendiri dan hak akses terpisah.

## Risiko hasil QA V10
- Gate posting berbasis rumus belum mengecek kecukupan stok WIP dan pita.
- Kolom otorisasi nonkosong belum dapat membuktikan identitas/role penyetuju.
- Pemeriksaan duplikasi terbatas pada ID input, belum fingerprint dokumen lintas import.
- Reversal transaksi belum diwujudkan sebagai posting terotorisasi.
- Ledger biaya belum otomatis terikat ke ledger kuantitas.
- Identitas lot dan SKU WIP perlu validasi fisik sebelum digunakan.
- UAT Excel runtime, backup/restore, security, dan closing gate belum PASS.

## Tahapan
P0. Freeze baseline, inventaris, klasifikasi data dan backup.
P1. Master data, kontrak API, skema lot/SKU/HJE/customer.
P2. Ledger atomik, approval, reversal, idempotensi, aturan saldo dan unit tests.
P3. BOM aktual/standar, MPS/MRP, HPP dan cash planning.
P4. Exception monitoring, audit, laporan dan closing gate.
P5. Staging, end-to-end UAT, role/bypass tests, rollback, lalu review release.

## Batas mandat saat ini
- Dokumen ini berada di branch perencanaan terpisah.
- **Tidak ada perubahan pada main, tidak ada deploy, dan tidak ada integrasi Web SKT.**
- Jangan menggabungkan PR sampai desain, keamanan, UAT, dan pemisahan data telah disetujui.
