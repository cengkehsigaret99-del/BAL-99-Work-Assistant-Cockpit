# V04 — Report & Print Engine QA
Status: PROTOTYPE CODE WRITTEN / BROWSER AND PRINT UAT NOT RUN / NO DEPLOY.

## Scope implemented
- A4 print stylesheet with portrait/landscape selection.
- Print/PDF via browser print dialog (not server-generated PDF).
- Read-only synthetic fixtures for three report formats: stock card, WIP, gap register.
- Filters: report, period label, SKU, status; export **filtered CSV**, UTF-8 BOM.
- Header, report title, status, source classification, version, and footer.
- No actual BAL operational data; no Web SKT; no write API or transactions.

## Acceptance test cases
1. Select each report and check columns, count, and numeric formatting.
2. Filter SKU/status, export CSV, verify exported rows match preview.
3. Print portrait/landscape on Chrome desktop and Android; check page overflow and repeated headers.
4. Verify Indonesian UTF-8 in CSV.
5. Check empty result and keyboard accessibility.
6. Check all displayed data explicitly marked DEMO.
7. Before live: enforce server-side authorization, private source manifest, immutable source snapshots, and provenance per row.
8. Add real XLSX export and server-side PDF generation only after secure data API is available.

## Known limitations
- Browser print output is not a validated production PDF.
- The selected period is a report label, not a real date filter because fixtures are synthetic.
- CSV is not XLSX. No actual Excel export is claimed.
- BAL logo asset is not bundled; text letterhead placeholder is used.
- No QA PASS claimed until runtime tests.
