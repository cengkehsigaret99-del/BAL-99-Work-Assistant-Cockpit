# BAL PPIC — Staging Release Package V06

## Verified build
- GitHub Actions run: https://github.com/cengkehsigaret99-del/BAL-99-Work-Assistant-Cockpit/actions/runs/43340735472
- Conclusion: SUCCESS.
- Artifact: `bal-ppic-staging-preview`, contains `index.html` copied from `prototype/BAL_INTERACTIVE_WEBSITE_V05.html`.
- Browser UAT run: https://github.com/cengkehsigaret99-del/BAL-99-Work-Assistant-Cockpit/actions/runs/43339925594 — SUCCESS.
- Artifact is a static DEMO; it is not a public hosted URL.

## Cara membuka paket staging (tanpa mengubah situs aktif)
1. Buka halaman run build di atas.
2. Pada bagian **Artifacts**, unduh `bal-ppic-staging-preview` (memerlukan akses GitHub).
3. Ekstrak arsip, lalu buka `index.html` di Chrome/Edge desktop. Untuk uji Android, layani file dari HTTPS staging privat atau server lokal yang dapat diakses perangkat.
4. Jangan gunakan data operasional privat pada hosting publik.

## Deployment staging terpisah — prasyarat
- Pilih hostname terpisah, misalnya subdomain khusus staging milik BAL; **contoh nama bukan URL aktif**.
- Pilih host privat atau terlindung autentikasi; jangan menimpa GitHub Pages existing dari `main`.
- Konfigurasikan akses admin, audit log, HTTPS, cache, backup, dan kontrol peran.
- Setelah hostname dan hosting disetujui, pasang artefak `index.html` ke target staging, jalankan UAT manual Android dan desktop.
- Jangan menyatakan DEPLOYED sebelum URL benar-benar aktif dan terverifikasi.

## Tahap berikutnya — private data bank
Skema minimal manifest:
```json
{
  "document_id": "opaque-id",
  "division": "Barang Jadi",
  "period": "YYYY-MM",
  "cutoff": "ISO-8601",
  "version": "V001",
  "source_kind": "XLSX",
  "sha256": "64 lowercase hex chars",
  "reconciliation_status": "WORKING",
  "access_class": "INTERNAL",
  "source_uri": "private authenticated locator"
}
```
Validasi: checksum, akses berbasis peran, lineage, immutable original, duplicate fingerprint, status OPEN RECON/LOCKED, dan larangan input transaksi di UI.

## Release gates
- [x] Static QA workflow successful
- [x] Chromium automated browser workflow successful
- [x] Isolated staging package workflow successful
- [ ] Manual Android visual UAT
- [ ] Manual PDF layout review
- [ ] Private hosting & staging URL verified
- [ ] Authentication & authorization
- [ ] Live source reconciliation
- [ ] Owner release approval

**Decision: NO-GO production.** No integration with Web SKT, no merge to `main`.
