# BAL PPIC — QA Tahap 5 (13 November 2026)

**Status keseluruhan: PARTIAL STATIC PASS / UAT NOT RUN / NO-GO DEPLOY.**

## Pemeriksaan yang telah dilakukan melalui GitHub connector
| Area | Hasil | Batasan |
|---|---|---|
| 4 halaman HTML | PASS statis: file ada, `lang=id`, aturan cetak tersedia | Belum render di browser |
| Label DEMO/PROTOTYPE | PASS statis pada 4 halaman | Belum review visual |
| 3 JavaScript | PASS statis: memakai `textContent` | Belum runtime |
| Akses jaringan langsung pada 3 JS | Tidak ditemukan `fetch(...)` | Bukan audit keamanan menyeluruh |
| Print/PDF | CSS print ditemukan | Belum tes A4 atau Android |
| CSV | Kode ekspor ditemukan | Belum uji file hasil ekspor |
| Filter dan navigasi | Handler ditemukan | Belum uji interaksi nyata |
| Data bank privat | Belum dibuat | Tidak ada data BAL live |
| XLSX dan PDF server-side | Belum dibuat | Print browser/CSV saja |

## CI
Ditambahkan `.github/workflows/ppic-prototype-qa.yml` dan `prototype/qa-static-v05.cjs`.
Saat pemeriksaan, belum ada GitHub Actions run yang tercatat untuk branch ini. **Tidak ada klaim CI PASS.**

## UAT wajib sebelum release
1. Uji Chrome Android dan desktop: buka empat halaman, filter, keyboard, hasil kosong, ekspor CSV.
2. Bandingkan CSV dengan tabel hasil filter.
3. Cetak A4 portrait/landscape ke PDF; periksa header, tabel, nomor halaman, batas potong.
4. Uji aksesibilitas, viewport 360px, kontras, ukuran target sentuh.
5. Audit privacy: semua data privat harus di belakang autentikasi; GitHub Pages publik hanya untuk kode/demo.
6. Audit manifest sumber, checksum, akses dokumen, cut-off, versi dan status.
7. Tinjau 13 laporan untuk validitas total dan asal dokumen sebelum menampilkan data aktual.

**Keputusan:** belum boleh merge ke main atau deploy sebagai sistem operasional. Tidak ada integrasi Web SKT.
