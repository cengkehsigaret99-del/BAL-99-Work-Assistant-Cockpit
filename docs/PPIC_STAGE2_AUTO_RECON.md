# PPIC Tahap 2 — Rekonsiliasi Analitik Terjadwal

Tanggal desain: 21 November 2026. Khusus Control Tower PPIC BAL. Web SKT, Robot Cukai, Finance terpisah, buku transaksi, saldo resmi, payroll dan closing tidak diubah.

## Alur
1. Baca source registry, fakta terverifikasi dari ppic_private.robot_selected_sources(period), dan cakupan laporan aktif dari ppic_private.robot_context(period).
2. Terbitkan satu snapshot analitik append-only per evidence_hash ke ppic_private.stage2_review_snapshots dengan ppic_private.stage2_refresh(period). Hash sama = NO_CHANGE; tidak menggandakan data.
3. Simpan tanggal dan versi sumber terpisah dari laporan aktif. Arsip diterima tidak otomatis mengganti laporan aktif.
4. Rekonsiliasi buku: BJ opening+receipt-delivery=closing, DO delivery=BJ delivery (hanya cutoff sama), TSG opening+incoming-transfer=closing, Cukai opening+receipt-usage=closing.
5. Giling–Verpack–Barang Jadi memiliki satuan/cutoff tidak sama. Tanpa bukti serah-terima per SKU/lot, tandai NOT_COMPARABLE, bukan PASS.
6. Tampilkan konflik metadata SDM, keterlambatan laporan, material nol secara buku, saldo negatif BJ, pita belum tiba. PASS hanya kesesuaian buku, bukan konfirmasi fisik.

## Pengamanan
- Snapshot privat RLS ON tanpa client policies; tidak ada query langsung melalui frontend.
- ppic_private.stage2_refresh tersedia hanya untuk koneksi administrator, bukan browser.
- public.ppic_stage2_status(owner_id,period) dibatasi EXECUTE kepada service_role dan tetap mengecek owner_access.
- Edge Function ppic-stage2-status verify_jwt=true, Origin GitHub Pages persis, pemeriksaan token Owner, dan proyeksi field allowlist.
- Tidak tersedia posting stok, pembayaran, pengesahan gaji, CK1 atau closing melalui Tahap 2.

## Otomatisasi
Robot Manajer PPIC yang sudah ada menjalankan refresh sesudah sumber/fakta diperiksa. Status ANALYTICS_REFRESHED menyatakan hanya snapshot analitik berhasil disimpan; NO_CHANGE tidak membuat revisi baru. Readback wajib. Tidak ada jadwal baru.

## Batas dan next gate
- 7 arsip import masih ARCHIVE_ONLY dan tidak boleh diubah diam-diam menjadi laporan final.
- Snapshot laporan aktif baru boleh diperbarui sesudah mapping workbook per divisi, kontrol baris/nominal, bukti tanggal, uji nonduplikasi dan readback sumber.
- SDM Giling tanggal konflik harus dikoreksi sebelum payroll final.
- Giling ke Verpack ke BJ memerlukan serah terima per SKU/lot dan QC.
- Piutang memerlukan pembayaran yang dialokasikan ke SJ/invoice; saldo bank indikatif bukan uang bebas.

## Verifikasi
- node --test tests/ppic-stage2-status.test.mjs tests/ppic-stage2-ui.test.mjs
- python3 -m unittest discover -s tests -p ppic_health_check_test.py
- GitHub Actions BAL PPIC Stage2 Reconciliation QA dan browser sintetis Owner/mobile.
- Baca ulang snapshot: 10 divisi, 7 arsip, 5 checks, 10 warnings; status BLOCKED/OPEN_RECON pada pemeriksaan pertama.

Pengujian shell publik bukan bukti login Owner riil, dan otomatisasi hanya dijalankan selama layanan serta konektor tersedia.