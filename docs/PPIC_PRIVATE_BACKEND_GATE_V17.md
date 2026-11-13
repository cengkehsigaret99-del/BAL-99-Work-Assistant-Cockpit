# BAL PPIC V1.7 — Private Backend Readiness Gate

## Observed connected infrastructure
Supabase project `BalestariProject` (`jryfozndxpjymggevkgq`) exists but is **INACTIVE** as checked on 13 November 2026. Do not assume it is safe, available, or intended for PPIC. No SQL migrations, storage bucket, API key, or user permissions were changed.

## Security-first architecture
- Public GitHub Pages remains a presentation shell. No private data or secret keys in source, Pages, JavaScript, public CSV, or public PDF URLs.
- Private API should be hosted separately behind verified authentication and authorization. Validate access per document, division, classification and user identity on **server**.
- Read-only endpoints: `GET /v1/me`, `GET /v1/reports`, `GET /v1/reports/:id`, `GET /v1/sources/:id`, `POST /v1/reports/:id/export` (generates authorized PDF, never mutates operational transactions).
- Private ingestion is separate from website: upload via chat → validated Excel → approved private storage → checksum/manifest → curated read model → API.
- Exports must use expiring authorized links, with server-side audit trail; WhatsApp should share the downloaded PDF via device share sheet, not a publicly accessible private document URL.
- No integration with Web SKT.

## Required gates
1. Confirm a dedicated private hosting/database project and owner/admin access.
2. Activate it, check region, backups, audit logs, RLS and auth provider.
3. Design roles: Owner, Admin, Analyst, Viewer; deny by default; restrict cash/payroll/AR.
4. Add immutable original storage and manifest SHA-256 checks.
5. Apply and verify RLS using separate authorized and unauthorized test users.
6. Implement read-only API with pagination, audit logging, strict export authorization.
7. Connect public website only after authentication and penetration/UAT checks.
8. Confirm private source lineage against Excel before displaying any real figures.

## Current status
**NO-GO LIVE DATA.** This is an implementation gate document, not a running backend. Connected Supabase project is INACTIVE; no activation or schema changes have been made.
