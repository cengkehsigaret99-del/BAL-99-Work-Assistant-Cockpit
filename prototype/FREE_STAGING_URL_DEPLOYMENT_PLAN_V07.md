# BAL PPIC — Rencana Alamat Gratis dan Deployment Aman

## Pilihan tahap awal
- Target repository terpisah: `BAL-PPIC-Control-Tower` (nama target, **belum dibuat**).
- Target alamat GitHub Pages setelah repo terpisah dibuat dan Pages diaktifkan: `https://cengkehsigaret99-del.github.io/BAL-PPIC-Control-Tower/` (**calon URL, belum aktif/terverifikasi**).
- Situs lama `BAL-99-Work-Assistant-Cockpit` telah memiliki Pages; **jangan ubah** konfigurasi Pages atau branch deploy situs lama.
- Kode demo staging berasal dari artefak build SUCCESS: https://github.com/cengkehsigaret99-del/BAL-99-Work-Assistant-Cockpit/actions/runs/43340735472.
- Sumber single-file: `prototype/BAL_INTERACTIVE_WEBSITE_V05.html`; salin sebagai `index.html` di root repository baru.

## Cara menerbitkan setelah repository baru tersedia
1. Buat repository baru `BAL-PPIC-Control-Tower` di akun GitHub yang sama.
2. Unggah `index.html` hasil staging ke root repository baru.
3. Settings > Pages > Build and deployment > Deploy from a branch > `main` > `/(root)`.
4. Tunggu status deployment sukses; buka URL Pages yang dikonfirmasi GitHub, uji di Android/desktop.
5. Lakukan verifikasi visual dan cetak manual sebelum menganggap staging lulus.

## Keamanan
- GitHub Pages publik, **bukan tempat untuk data BAL yang privat**.
- Tidak boleh mengunggah data Kas, Payroll, Piutang, customer, dan dokumen operasional ke repo publik.
- Login HTML/JavaScript saja tidak memberikan proteksi pada data statis yang diunggah ke Pages.
- Bank data asli membutuhkan hosting/backend privat, autentikasi server-side, RBAC, audit log, dan akses dokumen terotorisasi.
- Tidak ada integrasi Web SKT.

## Status
Alamat target masih rencana, **bukan domain yang dibeli** atau situs yang sudah diterbitkan. Jangan mengklaim deployment sebelum repo baru, Pages, dan URL berhasil diverifikasi.
