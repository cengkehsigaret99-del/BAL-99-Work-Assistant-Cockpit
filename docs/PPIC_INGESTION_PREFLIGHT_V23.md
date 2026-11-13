# BAL PPIC V2.3 — Source ingestion preflight

This release implements **local preflight only**, not file ingestion. No source files or private manifests are committed to the public GitHub repository.

## Procedure
1. Receive original source file through an authorized private channel.
2. Create a private manifest conforming to `schemas/ppic-source-manifest-v1.schema.json`, with SHA-256 of the immutable original bytes.
3. Run `node tools/ppic-preflight.cjs /private/path/file.csv /private/path/manifest.json`.
4. On PASS, reconcile Excel, check cutoff and cross-division totals, record exceptions and approvals.
5. Only after an authorized private storage and server-side ingestion service exists may an approved operator register the document in Supabase.
6. Website continues to display only authorized metadata; no raw source files, hashes, storage paths, payroll or customer details.

## Database safeguards
On `ppic_private.source_registry`: unique SHA-256, document ID pattern, period format and version format are enforced by database constraints, in addition to existing unique document ID and RLS. These constraints were applied and verified against an empty registry.

## Status
**PRE-FLIGHT READY, INGESTION NOT DEPLOYED.** No private upload endpoint or write permission for website clients. No production BAL document ingested. No Web SKT integration.
