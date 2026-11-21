# BAL PPIC — DO automated WORKING sync and Owner health check

## Scope

The Owner has authorized DO working reports that pass source validation to update Web PPIC analytical views without an additional chat instruction. This authorization is **not** consent for posting physical stock, sending SJ, finalizing customer invoices, paying suppliers, changing cash balances, payroll, tax, or any LOCKED closing.

The DO auto-publisher already in production writes an append-only atomic receipt together with source facts, the detailed DO snapshot, daily DO ledger, and report 09. The source version and the derived web-report version can differ: for accepted input 21 November 2026, source DO \`V012\` yielded web analytical report \`V015\`.

## Current proven receipt

- Latest DO cutoff: 21 November 2026
- Status: WORKING / OPEN RECON
- 24 unique SJ, 37 SJ/SKU lines, 621,995 pack, Rp4,474,760,000 **harga kerja**
- Latest SJ: SJ334, one line, 4,000 pack and Rp34,000,000
- The 36 original lines in 18 November V014 were preserved without price, SKU, SJ or quantity divergence
- Source file SHA: \`255e14a1dfbe47ec894e06b95902adb08196aa524ed0dfa2038ca4f3184c1b7d\`
- Auto-publish receipt ID \`1177e170-7d87-4e90-aeb2-508863225a6d\`
- No official inventory, Kas Bank, invoices, payment allocations, or Cukai were posted

Repeated publication with the same validated SHA returns \`NO_CHANGE\`, not another 621,995-pack movement. Data from a new file must be verified against its actual bytes, period, version, SJ lines, price basis, and past line conservation; the SQL parameter \`sha_verified\` is an administrator attestation and cannot independently inspect a Library file. This is a scheduled, connector-mediated workflow, **not a zero-latency file-upload webhook**. If the connected executor cannot read the source or it does not pass validation, it must hold rather than pretend to sync.

## Health verification

New RPC \`public.ppic_do_auto_sync_status(p_owner,period)\` is readable only by service_role and explicitly verifies PPIC Owner. It compares the latest publication receipt with:

1. Source registry entry with the same verified SHA
2. Robot facts \`delivered_pack\` and working sale value
3. All DO/SJ detail rows (SJ count, line count, pack, nominal)
4. Daily DO ledger aggregate totals
5. Report 09 summary totals and cutoff

All five must pass and the receipt must point to the **latest** DO detail, daily and report snapshots before returning \`SYNCED_WORKING\`. A mismatch returns \`INTEGRITY_CHECK_FAILED\`, never a success facade.

Cross-division reconciliation is deliberately separate. The current Barang Jadi selected source has 18 November cutoff and 617,995 packs of book delivery, while the DO report includes 21 November and 621,995 packs. The 4,000-pack difference is exactly SJ334, but the cutoff differs, so Stage 2 properly labels \`DATE_MISMATCH\`; it does not assert a physical stock discrepancy. Barang Jadi sources with newer cutoff must be verified and reconciled independently; no duplicate stock deduction.

The \`ppic-do-sync-health\` Edge Function requires an actual owner JWT, enforces exact GitHub Pages Origin, and projects only allowlisted summary status. It has no mutation action or file upload endpoint. The public site only contains HTML, CSS, and JavaScript; secrets and customer-sensitive workbook rows are never embedded.

## Owner dashboard and automation

The existing Robot Manajer area includes the new **Status Sinkronisasi DO Otomatis** panel. Owner sees last source version, web report version, cutoff, timestamp, 24 SJ, pack, nominal, latest SJ, five integrity tests and the open BJ/Kas reconciliation tasks. Clicking “Periksa status” **only reads** the persisted receipt; it does not replay any SJ or trigger an unverified posting.

The existing hourly PPIC robot automation should use this health check after each accepted new DO source. If any check fails, alert the Owner with the safe code, place the candidate on hold and preserve the prior valid snapshot. If all checks pass, report \`SYNCED_WORKING\` and issue no duplicate notification on unchanged SHA. Keep September 2026 LOCKED.

## Tests

- SQL readback of the live Owner health RPC showed all five checks true, \`SYNCED_WORKING\`, and \`CUTOFF_DIFFERENT\` for BJ 18 vs DO 21 November.
- RLS remains enforced and \`anon\`/\`authenticated\` have no direct execute grant on the read RPC.
- Node tests \`tests/ppic-do-sync-health.test.mjs\`, synthetic Owner/mobile browser tests \`tests/ppic-do-sync-health.spec.cjs\` and GitHub Actions \`BAL PPIC DO Auto Sync Health QA\`.
- Synthetic UAT is not a real logged-in Owner session. Real use should be reported as confirmed only after actually observed.
