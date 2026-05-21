README CK4C UPLOAD CUKAI - BAL-99

Tujuan:
Menyiapkan file CSV upload CK4C sesuai template CK4 22 kolom.

Sumber data:
- Hanya dari browse_verpack.csv / hasil verpack official harian.
- Tidak mengambil data dari giling, DO/SJ, piutang, stock pasar, PO, atau pembayaran.

File utama:
1. ck4c_upload_cukai.csv
   - File upload cukai 22 kolom.
   - Saat ini berisi 21 baris valid mapping.

2. ck4c_upload_cukai_validation.csv
   - File cek PASS/PENDING sebelum upload.
   - Memastikan jumlah kolom, jumlah baris, total kemasan, total isi, dan sumber data.

3. ck4c_hold_mapping_cukai.csv
   - Baris yang ditahan karena master merek/HJE belum valid.
   - Saat ini Cengkeh Biru 77 isi 12 dan 16 masih DATA BELUM VALID.

4. master_ck4c_merek_hje.csv
   - Master mapping dari nama merek aplikasi ke format cukai.

5. browse_ck4c_detail.csv
   - Tampilan internal CK4C per tanggal, nomor dokumen, merek, HJE, jumlah kemasan, jumlah isi, dan status mapping.

Halaman cek:
- ck4c-upload-cukai.html

Aturan penting:
- Jangan upload file ck4c_upload_cukai.csv sebelum cek mapping SEQ MEREK, NAMA MEREK, HJE, NO KEP, TGL KEP, dan ID MEREK DETAIL.
- Baris yang masuk hold mapping tidak boleh dipaksa masuk CSV upload.
- TUD tidak memakai pita dan jumlah kemasan berpita harus 0.
- File ini masih VALID AWAL / CEK SEBELUM UPLOAD, bukan VALID FINAL.

Status saat ini:
- CSV upload valid mapping: 21 baris.
- Baris hold mapping: 4 baris.
- Total upload valid: 503.750 kemasan / 6.906.200 batang.
- Total hold: 5.200 kemasan / 75.200 batang.

Keputusan praktis:
Gunakan paket ini untuk cek teknis CK4C upload cukai. Jangan jadikan final upload sebelum mapping Cengkeh Biru dan data cukai resmi dikunci.
