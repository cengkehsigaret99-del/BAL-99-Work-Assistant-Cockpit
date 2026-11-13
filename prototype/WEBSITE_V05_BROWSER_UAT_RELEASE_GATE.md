# BAL PPIC — Preview Deployment Gate & Browser UAT
**Status:** STAGING DESIGN / NO-GO PRODUCTION / No Web SKT integration.

## Target
The standalone file `prototype/BAL_INTERACTIVE_WEBSITE_V05.html` is the candidate read-only interactive preview. It must not be merged to `main` or treated as a production website without explicit approval and UAT.

## Stage 1 — Visual QA
- Android viewport 360×800 and 412×915, desktop 1440×900.
- Tabs Dashboard, Data Explorer, Pusat Laporan respond.
- No horizontal overflow except tabular content where scrolling is intentional.
- Text readable, buttons at least 44px tall where practical, keyboard focus visible.

## Stage 2 — Functional QA
- Search by division/document, status filters, empty results, reset via page refresh.
- Drill-down opens metadata and never fabricates source links.
- All 13 report catalog entries selectable.
- CSV export opens in Excel with Indonesian characters intact.
- Print PDF from Pusat Laporan: A4 landscape, margins, no clipped columns, status/cutoff visible.

## Stage 3 — Privacy and data
- No real private BAL transactions in public repository.
- Read-only explorer; no transaction input and no Web SKT integration.
- When data bank goes live, API and documents must require authentication and per-role authorization.
- Each record needs immutable source ID, cutoff, version, checksum, reconciliation status and access class.
- Do not label DEMO preview as actual closing.

## Stage 4 — Release
- Test with browser screenshots and exported PDF/CSV artifacts.
- Approve design, security, and source provenance.
- Deploy only to separate staging, never overwrite existing GitHub Pages on main.
- Merge only after explicit review.

## Known limits
The third-party HTML preview URL is not an official deployment and has not been browser-verified. Browser UAT, print QA, and security review remain OPEN.
