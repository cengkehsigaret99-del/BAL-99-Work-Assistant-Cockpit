# BAL PPIC V1.5 — Private Bank Data Contract

## Boundary
The existing GitHub Pages site is a **public presentation shell**, not a private data bank. No operational upload, employee payroll, cash/bank, customer AR, invoice, or source documents may be committed to the public repository or published as Pages artifacts.

## Source of truth and provenance
Each authorized source file gets a manifest record validated against `schemas/ppic-source-manifest-v1.schema.json`.
- `document_id`: stable opaque ID; do not encode personal identifiers.
- `sha256`: digest of immutable original file bytes for deduplication and integrity.
- `version` and `supersedes_document_id`: corrections are additive, not destructive.
- `period`, `cutoff`, `ingested_at`: separate accounting period, effective data cut-off, and ingestion time.
- `reconciliation_status`: WORKING / OPEN RECON / RECONCILED / LOCKED.
- `access_class`: internal authorization tier; never use as public security alone.
- `source_locator`: private authenticated storage reference; never publish publicly.

## Proposed flow
1. User uploads operational source to chat.
2. Assistant inventories, verifies, reconciles, and produces versioned Excel.
3. Store original and Excel in authorized private Drive, register version and cutoff.
4. Private ingestion service verifies checksums and access permissions, then stores immutable source and curated analytical tables.
5. Authenticated read-only API serves allowed, role-filtered reports; public shell must not embed API secrets or raw data.
6. Print preview/PDF and WhatsApp sharing must respect document classification; no public URLs for confidential documents.

## Required access rules
- Viewer: reports explicitly granted.
- Analyst: permitted detail and lineage, no source mutation.
- Admin: source registration and metadata correction through separate controlled ingestion pipeline.
- Owner: approval and access to sensitive reports according to policy.
- All access and exports logged; server enforces authorization.
- A public JavaScript login screen alone is **not** sufficient protection.

## Gate before connection
- [ ] Select private hosting and identity provider
- [ ] Create authenticated server-side read API
- [ ] Implement row/document-level access control
- [ ] Enforce immutable original archive and SHA-256
- [ ] Confirm source lineage, version/cutoff, and duplicate handling
- [ ] Test restricted payroll, bank, and AR access
- [ ] Test signed PDF delivery and expiry
- [ ] Complete reconciliation UAT with authorized nonpublic data

## Current status
**CONTRACT ONLY**. No private database, ingestion pipeline, or authenticated API is deployed. GitHub Pages remains read-only with honest empty states. No Web SKT integration.
