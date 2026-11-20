# Automatic intake of prepared PPIC files

This workflow removes the download-and-upload step for prepared Excel outputs.
An independent ChatGPT Automation checks the private Control Tower register
hourly, retrieves new files through the authenticated Drive connector, and
submits a bounded import request. It does not depend on an open browser.

Only prepared `PPIC_UPLOAD` XLSX files registered as conversion candidates are
eligible. Each workbook must contain a `PPIC_UPLOAD` or `PETUNJUK_PPIC` metadata
sheet. The register supplies the exact category, version, period and source
cut-off. Reference dates are retained in the workbook; they do not replace the
book cut-off. The September closing remains outside this intake.

## Transfer and processing

1. Read the current register metadata and bounded candidate rows. Verify the
   filename, private folder, MIME type and size through Drive metadata.
2. Compare the expected SHA-256 with PPIC discovery/source receipts. An already
   registered file creates no second source document.
3. Fetch the raw XLSX using the authenticated Drive connector. Its temporary
   download URL is a private capability. Do not put it in a register cell,
   browser page, source repository, task prompt, diagnostic log or response.
4. Verify local bytes and build the manifest with `tools/ppic_auto_manifest.py`.
   Send input JSON on stdin; save generated JSON or SQL only in a private task
   working directory. The helper does not upload, modify or publish anything.
5. Call `ppic_private.enqueue_auto_import(manifest, temporary_url)` using the
   authorized database connector. The database generates a short-lived,
   job-specific nonce and dispatches the Edge worker through `pg_net`.
6. The worker verifies the nonce and claims the job once. It validates the
   transfer host, bounds file and ZIP sizes, checks the hash and workbook
   metadata, stores the XLSX in the existing private bucket, and registers it.
7. Read the final job and registry receipt before marking the register row as
   received. Preserve old versions, source rows and report snapshots.

## Status meanings

`IMPORTED` means the original file is in the private PPIC source archive.
`DUPLICATE` means the same verified file was already registered.
`FAILED` means the source was not confirmed; the old reports remain available.

The separate report status identifies what can be done with the source:

- `ARCHIVE_ONLY`: received as an operational source; not automatically posted
  into balances or report snapshots.
- `SUPERSEDED`: retained as history because a newer relevant source cut-off is
  already active.
- `REVIEW_REQUIRED`: received and waiting for the existing validated SDM
  processing flow, which can run automatically when the Owner logs in.
- `PROCESSED`: the exact source hash and division appear in the active SDM
  snapshot's accepted-source receipt.

Automatic intake does not label an archive as a refreshed report. Existing SDM
processing retains its Owner authorization, source selection, history and
cut-off safeguards. Only `ARCHIVE_ONLY` and `SUPERSEDED` automatic sources are
excluded from automatic SDM rebuilding; `REVIEW_REQUIRED` remains eligible.
Automatic-source receipts prevent aggregate Giling and Verpack files from
repeatedly triggering the SDM rebuild heuristic.

## Privileged operations

The migration provides administrator-only discovery, enqueue, heartbeat and
configuration functions in `ppic_private`. Worker RPCs have explicitly limited
execution privileges. The new worker authenticates its own one-time nonce;
existing user-facing functions keep their JWT and Owner checks.

The status endpoint is `ppic-auto-import-status`. It accepts only the verified
Owner session from the PPIC origin and returns metadata without transfer URLs,
nonces, storage credentials or file contents. The browser keeps the session in
memory, uses no-store requests, discards late responses after logout, and clears
the status panel when the session ends.

The optional `period` parameter selects a `YYYY-MM` period. The response includes
up to 80 recent jobs and a separate, complete source policy covering the latest
200 catalog entries. Report eligibility is recalculated against the active SDM
snapshot each time status is read. An unavailable, incomplete or wrong-period
policy pauses automatic rebuilding while existing reports remain visible.

The queue stores durable receipts. Its heartbeat expires stale capabilities.
For a retry after a temporary URL expires, obtain a fresh URL through the
official Drive connector and enqueue the same validated manifest. Never reuse
an expired URL or create a new fake file version to force a retry.

## Operation and rollback

Enable the configuration only after the separate PPIC Automation has been
created successfully and its identifier is recorded. `enabled` without a real
task is not proof that discovery runs. Check the latest heartbeat and receipts.

To pause intake, disable the PPIC configuration and its own Automation. This
does not delete sources or reports. A frontend rollback may restore the prior
public shell without modifying the private archive. Existing manual upload
remains available. Do not change the independent Web SKT automation.

The repository contains code and synthetic tests only. Operational files,
temporary transfer capabilities and actual job receipts belong in private
storage and must not be added to a public Git tree or Pages deployment.
