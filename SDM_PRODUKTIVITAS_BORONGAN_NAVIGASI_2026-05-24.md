# SDM Produktivitas Borongan BAL-99

Status: FINAL KONSEP AWAL / AMAN OPERASIONAL

## Tujuan
Modul SDM Produktivitas Borongan dibuat untuk mengubah kontrol upah menjadi kontrol produktivitas berbasis kualitas.

Fokus penilaian:
- Produktivitas output
- Kualitas hasil
- Disiplin
- Kerapian kerja
- Kerja sama tim
- Rijek dan ulang kerja
- Pembinaan mandor
- Keputusan insentif yang lebih adil

## Modul yang sudah tersedia
1. `template_penilaian_karyawan_borongan_bal99.csv`
   - Template input data mandor/karyawan.

2. `contoh_penilaian_karyawan_borongan_bal99.csv`
   - CSV contoh untuk uji scorecard.

3. `penilaian-karyawan-borongan.html`
   - Halaman konsep scorecard.

4. `penilaian-karyawan-borongan-v2.html`
   - Kalkulator scorecard CSV.

5. `scorecard-borongan-premium-print.html`
   - Halaman uji premium print, ranking, keputusan praktis, dan cetak report.

6. `penilaian-karyawan-borongan-print.css`
   - Print CSS khusus report borongan.

7. `penilaian-karyawan-borongan-premium.js`
   - Layer ranking dan keputusan praktis.

8. `kontrol-upah-produksi.html`
   - Modul pendukung untuk kontrol upah giling dan verpack.

## Urutan kerja praktis
1. Download template CSV.
2. Isi data aktual dari mandor.
3. Buka halaman Premium Print.
4. Upload CSV aktual.
5. Cek kartu ringkasan, rekap mandor, detail karyawan, ranking, dan keputusan praktis.
6. Cetak report mingguan.
7. Gunakan hasil sebagai bahan pembinaan dan insentif.

## Aturan keputusan
- Jika mayoritas kategori A/B: ritme produksi bisa dipertahankan atau dinaikkan bertahap.
- Jika kategori C/D/E dominan: jangan naikkan target dulu.
- Jika rijek naik: cek bahan, alat, instruksi, dan kelelahan tim.
- Jika output tinggi tetapi kualitas turun: jangan beri bonus penuh.
- Jika karyawan A konsisten: bisa jadi contoh ritme atau kandidat leader kecil.
- Jika karyawan E: jangan tempatkan di bagian kritis dulu.

## Bahasa evaluasi
Gunakan bahasa:
- Perlu dicek
- Perlu distabilkan
- Perlu pendampingan
- Perlu arahan mandor
- Belum cocok di bagian kritis
- Layak menjadi contoh

Hindari bahasa:
- Malas
- Gagal
- Buruk
- Tidak becus
- Bikin rugi

## Kalibrasi kerja
Sebelum scorecard: 560-600
Setelah scorecard V2: 720-740
Setelah premium print: 770-790
Target setelah data aktual dan integrasi menu utama: 800+

## Keputusan praktis berikutnya
Masukkan link `scorecard-borongan-premium-print.html` ke halaman navigasi utama BAL-99 setelah uji manual selesai.
