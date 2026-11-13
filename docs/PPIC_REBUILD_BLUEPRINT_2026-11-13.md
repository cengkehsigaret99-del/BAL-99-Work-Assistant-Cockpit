# Rencana Perombakan BAL PPIC Control Tower — DRAFT (13 November 2026)

**Status:** DESIGN ONLY / NO DEPLOY / NO DATA MIGRATION.  
**Target:** aplikasi BAL PPIC & Cost Control yang **mandiri**, tanpa integrasi ke Web SKT. Repositori lama `BAL-99-Work-Assistant-Cockpit` tetap dipertahankan sebagai arsip sampai migrasi lulus uji.

## Temuan audit awal

- Repository saat ini berisi **527 entri pohon Git** (file dan folder), termasuk banyak halaman HTML/JS dan CSV historis.
- `app.js` masih memakai beberapa CSV baseline Mei 2026 dan memuat konfigurasi tampilan terkait cutoff Mei.
- Workflow `.github/workflows/deploy-pages.yml` melakukan deploy GitHub Pages otomatis hanya dari branch `main`.
- Ini adalah **situs statis**, bukan bukti bahwa sudah tersedia server transaksional, kontrol akses berbasis peran, ledger immutable, atau database operasional.
- Repo saat ini **public**: hindari menaruh informasi payroll, piutang, transaksi pelanggan, nomor rekening, atau data pabrik sensitif ke root GitHub Pages.

## Arsitektur target (bukan Web SKT)

1. **Aplikasi internal**: dashboard eksekutif, PPIC, Supply–Demand, Giling, WIP, Verpack, Barang Jadi, DO/SJ, Bahan Baku, TSG, Cukai, Keuangan, BOM/HPP dan exception.
2. **API internal terautentikasi**: validasi schema, aturan posting, kunci idempotensi, pemeriksaan saldo per SKU/lot/HJE, approval dual-control.
3. **Basis data transaksi**: tabel append-only untuk `event`, `event_line`, `approval`, `reversal`, `source_document`, `stock_lot`, `cost_batch`, `cost_component`, `period_close`. Bukan CSV statis sebagai buku besar transaksi.
4. **Lapisan laporan**: snapshot periode, versioned source, provenance/lineage, ledger kuantitas dan nilai, MPS/MRP, full costing, closing gate.
5. **Ekspor dan arsip**: Excel/PDF resmi, manifest asal dokumen, versi/cut-off, sinkronisasi ke penyimpanan pusat hanya melalui konektor resmi yang disetujui.
6. **Deployment**: staging dan production terpisah, CI test, backup terenkripsi, restore test, approval release. Jangan gunakan workflow GitHub Pages publik untuk data privat.

## Invarian akuntansi dan operasional

- Satuan: WIP batang; Barang Jadi pack; pita keping; bahan baku sesuai UOM per SKU.
- Satu event PACKING_SELESAI: WIP keluar, Barang Jadi masuk, pita dipakai **sekali**; dokumen DO tidak mengurangi pita lagi.
- Saldo tidak boleh diposting negatif kecuali jurnal koreksi dengan otorisasi khusus.
- `event_id` dan `source_fingerprint` unik; import ulang bersifat idempotent.
- Persetujuan berdasarkan identitas pengguna yang terautentikasi; pengusul berbeda dari penyetuju.
- Koreksi memakai reversal yang menunjuk event asal; histori tidak dihapus.
- Opening per 12-11-2026 = baseline kerja, bukan transaksi baru; November WORKING / OPEN RECON; periode September LOCKED.
- Khoirul Soleh/PMS Padang alias satu customer induk, dokumen per-SJ tetap terpisah.
- Konflik SJ322 Fahat/Mamat dipertahankan sebagai dua transaksi fisik, nomor administratif perlu koreksi.
- WIP Coklat 99 = 522 tray × 1.500 = 783.000 batang, SKU/lot dan alokasinya perlu verifikasi.
- HPP absorption/full costing: BOP **5% provisional** dari biaya langsung eligible, bukan tambahan otomatis ke HPP historis; harus diganti dengan BOP aktual.
- Buku pita per HJE dipisahkan dari CK-1 dipesan/belum lunas, dan dari stok fisik pabrik.

## Hambatan QA V10 yang harus ditutup terlebih dahulu

| Area | Risiko yang ditemukan | Kriteria penerimaan |
|---|---|---|
| Posting event | Rumus V04 menerima `VERIFIED` dan teks otorisasi nonkosong tanpa pemeriksaan saldo | Tolak WIP/pita yang kurang; validasi qty, SKU, cutoff |
| Otorisasi | Persetujuan berupa sel teks | Identitas role + audit log + tanda tangan server |
| Duplikasi | Hanya cek ID pada 30 baris input aktif | Fingerprint sumber lintas import/periode |
| Pemisahan lot | WIP opening belum dipetakan ke SKU final | Kuantitas lot valid; transfer sesuai SKU/HJE |
| Koreksi | Reversal belum diimplementasikan sebagai transaksi | Posting pembalik atomik dan terotorisasi |
| Nilai | Cost ledger belum otomatis menautkan posting kuantitas | Satu batch menghasilkan jurnal kuantitas dan biaya seimbang |
| Closing | Invoice/BOP/selisih sumber masih OPEN | Closing gate PASS dan review akuntansi |

## Tahapan implementasi

**P0 — Audit & Freeze.** Tag commit baseline, backup repo, inventaris modul, data classification, bekukan rilis main.

**P1 — Data contract.** Master SKU/HJE/UOM, customer alias, lot, source-document IDs, immutable transaction schema dan migrasi sampel.

**P2 — Ledger & approval.** Atomic posting, idempotensi, reversal, saldo per lot/HJE, role-based approval dan unit tests.

**P3 — Costing & planning.** BOM standar/aktual, MPS/MRP, overhead provisional/aktual, batch cost, HPP, aging, cash forecast.

**P4 — Dashboard & exception.** UI mobile/desktop, status bukti, audit trail, pemisahan nilai aktual versus estimasi.

**P5 — UAT & deployment.** Uji duplikasi, saldo negatif, cutoff, role bypass, rollback, PDF/cetak, backup restore, staging sebelum production.

## Batas perubahan saat ini

- Dokumen ini **hanya rancangan** di branch `plan/ppic-control-tower-rebuild-2026-11`.
- Tidak mengubah source code, data, file CSV, workflow deployment, atau branch `main`.
- Tidak menjalankan migrasi data atau menghubungkan ke Web SKT.
- Implementasi database dan server internal dipilih setelah audit keamanan dan kebutuhan infrastruktur.

## Sumber

- Workbook BAL PPIC Control Tower V10 (cut-off 12 November 2026), termasuk V03–V10.
- `app.js`, `README.txt`, dan `.github/workflows/deploy-pages.yml` pada repo ini.
