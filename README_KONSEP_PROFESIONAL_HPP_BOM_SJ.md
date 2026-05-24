# BAL-99 — Konsep Profesional HPP, BOM, dan HPP per Surat Jalan

Tanggal update: 2026-05-24
Status: VALID FINAL DATA HPP TAHAP 1 / BELUM LABA-RUGI FINAL

## 1. Tujuan Modul

Modul ini menambahkan lapisan costing profesional ke BAL-99:

**BOM → HPP per brand_code → Mapping SJ → HPP per Surat Jalan → Margin Kotor**

Modul ini tidak mengganti modul produksi. Modul produksi tetap membaca:

**Giling → WIP → Verpack → Barang Jadi → Pita/CK4C → SJ/DO → Piutang**

## 2. Prinsip Manufaktur

1. Giling adalah WIP, bukan barang jadi.
2. Verpack adalah dasar barang jadi dan pemakaian pita/CK4C.
3. Surat Jalan adalah dasar pengeluaran barang dan piutang.
4. BOM/HPP adalah dasar estimasi biaya produk.
5. HPP per SJ adalah dasar estimasi margin kotor, bukan laba-rugi final.

## 3. Kunci Kalibrasi HPP

- Isi 12 memakai BOF/MBOF 25%.
- Isi 16 memakai BOF/MBOF 22,5%.
- Refill memakai BOF/MBOF 25%.
- BOF/MBOF dihitung dari nilai TSG bersih + Ambree.
- BOF/MBOF tidak dihitung dari total HPP agar tidak double count.
- TSG tidak memakai susut terpisah jika BOF/MBOF sudah aktif.

## 4. Status Normal dan Lembur

HPP membedakan status produksi:

- NORMAL memakai upah normal.
- LEMBUR memakai upah lembur.

Jika status produksi pada SJ belum jelas, admin wajib memberi catatan. Jangan otomatis membaca margin sebagai final.

## 5. Batasan Tahap 1

Modul HPP tahap 1 belum memuat:

- FIFO per batch barang jadi.
- Overhead pabrik final.
- BDP / Barang Dalam Proses akuntansi final.
- Alokasi biaya umum.
- Laba-rugi audit final.

Karena itu, output modul ini adalah **margin kotor tahap 1**, bukan laba-rugi final.

## 6. Struktur Folder

### 01_master_hpp_bom
Berisi master HPP dan BOM:

- config merek
- master bahan
- assembly BOM
- HPP ringkasan
- template DO HPP
- pending overhead/BDP
- log kalibrasi

### 02_hpp_per_surat_jalan
Berisi kontrol HPP per Surat Jalan:

- ringkasan HPP
- mapping SJ ke brand_code
- template SJ HPP
- rule engine
- validasi admin

## 7. Risiko Utama

1. Salah mapping nama barang di SJ ke brand_code.
2. Salah memilih status NORMAL atau LEMBUR.
3. SJ historis/catch-up dibaca dobel sebagai piutang.
4. HPP tahap 1 dibaca sebagai laba-rugi final.
5. Overhead dan BDP belum masuk perhitungan.

## 8. Cara Pakai Admin

1. Buka `hpp-bom-sj.html`.
2. Cek HPP ringkasan per brand_code.
3. Cek mapping nama SJ ke brand_code.
4. Input atau cek template SJ HPP.
5. Pastikan status NORMAL/LEMBUR benar.
6. Baca margin kotor.
7. Jika margin negatif atau tidak wajar, beri status PERLU_CEK.

## 9. Keputusan Praktis

Modul ini boleh dipakai untuk:

- estimasi HPP per pack,
- estimasi HPP per karton,
- HPP per Surat Jalan,
- margin kotor tahap 1,
- evaluasi harga jual awal.

Modul ini belum boleh dipakai untuk:

- laba-rugi final,
- laporan akuntansi final,
- keputusan audit pajak/cukai final,
- FIFO batch tanpa data batch barang jadi.
