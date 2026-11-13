# QA V02 — Read-only Data Bank Explorer

Status: IMPLEMENTED PROTOTYPE / BROWSER UAT NOT RUN / NO DEPLOY.

## Scope
- Separate static prototype `data-bank-v02.html` + `data-bank-v02.js`.
- Eight **synthetic** sample documents, explicitly labeled DEMO. No real BAL financial, employee, supplier, or customer data.
- Search all fields; filter by division, status, month; reset; table count.
- Export filtered rows as CSV UTF-8 BOM, print filtered table via browser.
- DOM populated with `textContent` to avoid HTML injection in displayed values.
- No network calls, no forms for transaction entry, no persistence, no Web SKT.

## QA checklist for next phase
1. Android browser: open local/static preview and test filters and reset.
2. Verify CSV encoding and Indonesian characters in Excel.
3. Verify A4 landscape print, page breaks, and PDF export on Android/desktop.
4. Verify empty filter result, search case handling, keyboard focus.
5. Define **private** manifest schema: document_id, division, period, cutoff, version, source_kind, source_uri (authorized only), sha256, reconciliation_status, access_class.
6. Before live data: implement authentication and authorization on server; do not expose private manifests to public GitHub Pages.
7. Test document lineage and duplicate fingerprints on **synthetic** fixtures first.

No tests above are claimed PASS without browser execution. No change to main or deployment.
