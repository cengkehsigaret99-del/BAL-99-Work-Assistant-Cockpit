# BAL PPIC — Web SKT source freshness watch

This release adds a **read-only, Owner-only** comparison of operational form status from the connected Web SKT admin monitor against selected source and active report cutoffs in the existing Web PPIC. It does **not** merge the websites, replay the SKT mirror as transactions, or automatically release materials, stock, wages, cash, shipments or tax data.

## Verified source receipts

Read the authorized \`bal_mirror_manifest(month)\` first. The source has \`schema=BAL_WEB_MIRROR_V1\`, a content revision hash, capture time and explicit \`COMPLETE_CURRENT_FORMS\` scope. That scope means the current/latest form version only, **not** a full ledger, all historical records, attachments, or approved firm orders.

After confirming its \`content_revision\` exists in \`ppic_private.skt_form_observations\`, read \`bal_input_status(business_date)\` for the latest two actual business dates. The source is \`BAL_INPUT_MONITOR_V1\` and must be \`ok=true\` and \`partial=false\`. Do not infer holiday or no production when a daily form is absent.

Store only an allowlist from each of the monitor's 12 divisions:
- \`division\` (an internal category code)
- \`status\` (as returned; do not normalize DRAF to accepted)
- \`report_date\` (the source business date)
- \`last_saved_at\` (actual save timestamp)
- \`document_count\` and \`transaction_count\` (counts only)
- \`document_state\` and \`document_version\` of the active form
- \`source_complete\` (provider completeness, not an approved balance)

Never store employee names, account IDs, form/document IDs, raw attachments, text fields from SKT, addresses, customer identifiers or transaction details in the freshness table.

\`ppic_private.record_skt_division_status(period, revision, business_date, checked_at, rows)\` validates each entry, date boundary and checked revision. The table is **append-only** and unique by period, mirror revision and business date. A duplicate call returns \`NO_CHANGE\`, and an unknown revision is rejected. This is a read receipt, **not** an import job or an operational update.

The endpoint \`public.ppic_skt_freshness_status(owner_id, period)\` is service-role-only and verifies the configured PPIC Owner, then reads the latest three daily status receipts for the latest mirror revision and current PPIC \`robot_context(period).coverage\`.

\`ppic-skt-watch-status\` is a JWT-verified private Supabase Edge Function. It enforces an exact allowed Origin and projects only known safe fields. The public GitHub Pages repository includes only generic page code and synthetic fixtures.

## Owner interface

The section **“Perbandingan Web SKT ↔ Web PPIC”** appears within the existing Robot Manajer page after Owner login. It shows:
- Number of forms whose **last observed** version is DRAF, DIAJUKAN, DISETUJUI or TERCATAT within the stored date window
- Which division has a form with what business date and actual last-saved timestamp
- PPIC \`source_cutoff\` **separate from** \`report_cutoff\`
- Why a form is on hold, pending approval, recorded, or approved; approval does not prove physical delivery, stock/QC or finance reconciliation
- A controlled “Minta GPT analisis selisih data” button that only fills the existing question box and does not submit it or execute actions

When today has no form but the previous day has an approved or submitted form, the interface displays that latest form and explicitly notes that absence today is **not evidence of a production holiday**.

## Automatic refresh contract

In the **existing** hourly PPIC robot job:
1. Fetch current SKT manifest; compare revision to the last recorded observation. Record new manifest metadata only if changed and validated.
2. Fetch \`bal_input_status\` for the latest two actual business dates, requiring complete responses and matching month. Record each via \`ppic_private.record_skt_division_status\` using safely escaped SQL literals.
3. Verify the stored receipts by reading back the Owner status endpoint using the administrative Supabase connection; record minimal \`CHECK\` heartbeat without sensitive details. No new automation is required.
4. Compare with PPIC source/report dates. A new SKT DRAF, DIAJUKAN or TERCATAT can be marked as a lead but does not mutate a PPIC report.
5. Only after separately verified source facts, quotation/firm order and other evidence are available may the existing Stage 2 reconciliation, Stage 3 decisions or evidence-based plan be revised. Do not invent order quantities or alter historical closing.

If a source cannot be read or is partial, report \`PARTIAL\`/\`UNAVAILABLE\`, keep the previous receipt as historical evidence and do not claim a new real-time observation. Unchanged SKT revision returns \`NO_CHANGE\`.

## Tests and release

- RLS is enabled on \`ppic_private.skt_division_status_snapshots\`; anon/authenticated cannot access private table or read RPC.
- \`node --test tests/ppic-skt-watch-status.test.mjs tests/ppic-plan-status.test.mjs\`
- Playwright \`tests/ppic-skt-watch.spec.cjs\` covers TSG DRAF, previously approved Giling, no automatic GPT submission, cleanup at logout and responsive mobile layout.
- Public release must pass complete allowlist, service-worker cache revision, basic and production asset hashes. A GitHub Pages shell test alone does not prove a genuine Owner login.
