BAL-99 v17.3 - Saldo CK4 Sebelum CK1

Upload semua file di root repository GitHub BAL-99. Jangan upload folder.

Update utama:
1. Saldo CK4 aktif memakai saldo pita sebelum CK1 ditambahkan.
2. Saldo aktif per 18 Mei:
   - PITA 99 & 77: 74.700 keping
   - PITA REFILL: 9.970 keping
   - PITA 16: 118.200 keping
3. Tambahan CK1 tetap ditampilkan sebagai proyeksi/arsip, bukan saldo CK4 aktif.
4. Data giling tetap sampai 18 Mei dari baseline BAL-77.
5. Data verpack tetap mengikuti baseline v17.2; file pacing yang dikirim hanya memuat detail sampai 08 Mei sehingga tidak menambah verpack baru.


=== v17.4 BAL PRINT STYLE STANDARD ===
- Menu Laporan / Cetak ditambahkan.
- Semua halaman detail memakai header cetak resmi saat tombol Cetak PDF/JPG dipakai.
- Style cetak mengikuti karakter BAL: biru tua, emas, putih, logo resmi, box ringkasan, tabel detail, catatan kontrol.
- Filter tanggal, search, minggu borongan, dan download CSV per menu tetap aktif.


=== UPDATE v17.5 — WORK ASSISTANT COCKPIT 00-06 + GPT PROMPT CENTER ===
Fungsi:
- Menambahkan Work Assistant Cockpit sebagai meja kerja pribadi BAL + GPT Plus.
- Menambahkan struktur folder kerja GPT 00-06.
- Menambahkan Prompt Center untuk copy prompt siap pakai.
- Menambahkan Catatan Keputusan, Tindak Lanjut, SOP Kerja AI, dan Data Integrity Checklist.
- Tidak menghapus menu inti produksi, gudang, cukai, pasar, HPP, keuangan, dan cetak.
- Tetap multi-file tanpa folder, siap upload ke root GitHub.

Cara pakai:
1. Buka Work Assistant Cockpit.
2. Pilih folder kerja atau copy prompt cepat.
3. Buka menu data terkait dan filter tanggal/minggu bila perlu.
4. Download CSV hasil filter.
5. Paste prompt ke GPT Plus dan upload CSV bila perlu.
6. Catat keputusan di Catatan Keputusan dan arsip final ke folder 06.


v17.6 MOBILE OPERATIONAL QA
- Ditambahkan dropdown menu khusus HP agar aplikasi mudah dijalankan dari layar kecil.
- Sidebar disembunyikan di HP dan diganti Pilih Menu Kerja.
- Tombol dibuat full-width di HP agar mudah disentuh.
- Filter tanggal/search/download CSV tetap aktif di setiap menu.
- Tabel detail tetap bisa digeser horizontal di HP.
- Core data dan struktur menu v17.5 tidak diubah.


=== v17.7 Operational UX & Data Type Fix ===
- Perbaikan format invoice agar no_invoice tidak berubah menjadi rupiah.
- Sortir dan filter tanggal memakai parser tanggal khusus.
- Tombol Detail dipindah ke kiri agar nyaman di HP.
- Menu favorit HP ditambahkan.
- Download CSV hasil filter memakai UTF-8 BOM agar aman di Excel.
- Cache busting app.js/style.css menggunakan ?v=17_7.
- Dashboard menegaskan perbedaan tanggal data giling vs verpack dan posisi CK4 sebelum/sesudah CK1.
