# BAL PPIC — Tema abu-abu tua / charcoal (24 November 2026)

## Perubahan visual
- **Warna dominan**: charcoal graphite. Background utama \`#151719\`, panel \`#25282C\`, area bertingkat \`#30343A\`, border \`#495057\`, teks \`#EDF0F1\`, muted \`#B4BCC3\`, aksen perak \`#DBE0E4\`.
- Mengganti dominasi biru/tosca sebelumnya pada body, header, kartu login, navigasi, dashboard, panel Robot, Stage 2/3, perencanaan produksi, status SKT, sinkronisasi DO, rekonsiliasi SJ334 dan Intelijen 23 November.
- Status penting **warning** (amber) dan **success** (hijau ringan) tetap bermakna. Warna aksen tidak dihapus secara membabi buta agar operator masih bisa membedakan prioritas dan risiko.
- Tema PWA pada Android diperbarui pada \`manifest.webmanifest\` serta \`meta[name=theme-color]\`. \`sw.js\` menggunakan cache baru agar stylesheet lama tidak tertahan oleh service worker.
- Mengikuti prinsip WCAG: kontras teks terang di permukaan gelap, focus-visible perak yang jelas, kontrol sentuh dan layout mobile tetap sama.
- Semua layout cetak / PDF \`@media print\` tetap putih dengan teks gelap agar tidak boros tinta.
- Logo resmi BAL tidak diganti.

## Batas teknis yang dijaga
Perubahan hanya HTML/stylesheet/manifest/service-worker dan pengujian tampilan di repositori Web PPIC. Tidak ada migrasi Supabase, pengubahan struktur data, update user/login, penghapusan dokumen, perubahan Cukai, jurnal, pembukuan DO, Barang Jadi, kas, payroll atau September LOCKED.

File sumber tema: \`ppic-charcoal-theme.css\` dimuat paling akhir agar mengatasi aturan warna inline lama; deploy Pages dan allowlist health check mengharuskan file ini ada. Jalankan \`BAL PPIC Charcoal Gray Theme QA\` sebelum penggabungan ke \`main\`: pengujian tampilan login desktop dan ponsel (mock Owner), warna CSS hasil komputasi, manifest PWA, printing putih, error JavaScript, dan logout. Uji mock Owner tidak setara dengan login nyata Owner.

## Rollback aman
Gunakan rollback GitHub release/commit ke \`main\` sebelumnya bila regresi visual; jangan menyentuh database. Karena style ditambahkan terpisah, pemulihan CSS dapat dilakukan tanpa perubahan data. Jika pengguna masih melihat warna lama, lakukan refresh ulang web/PWA supaya versi cache \`v69-charcoal-gray\` termuat.
