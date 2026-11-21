# PPIC DO: owner-preauthorized automatic working analytics

**Authorized by Owner, 21 November 2026.** This is a verified-DO **analytical report** publisher for the existing private PPIC Control Tower. It does **not** execute business transactions in Web SKT, Finance, Cukai or inventory ledgers.

## Verified first publication

The exact ChatGPT Library source file:
- \`PR_BAL_DO_NOVEMBER_2026_V12_CUTOFF_21NOV_HARGA_VALIDASI_KAS_V16_OPEN_RECON.xlsx\`
- SHA-256 \`255e14a1dfbe47ec894e06b95902adb08196aa524ed0dfa2038ca4f3184c1b7d\`
- Library reference \`libfile_fde3_f-053ae174d6308191a838135efcf996fb_651490bce7948191a073e9ed83bb583b\`
- Period November 2026, cutoff 21 Nov, 24 distinct SJ, 37 SJ/SKU lines, 620,180 regular and 1,815 sample packs, 621,995 packs total, Rp4,474,760,000 working total.

Before publication the source and its exact Library binary were hash-matched, all 36 historical SJ311–333 lines were compared against the prior V014 analytic detail on SJ/SKU/qty/working unit price/nominal (0 discrepancies), and the only new SJ334 line was 4,000 C-036 packs @ Rp8,500 for Rp34,000,000. Sample lines remained at Rp0. The Owner had explicitly accepted DO V12 as the working baseline; OPEN RECON remains for invoices, allocations, POD, disputed SJ and final receivables.

Supabase returned:
- \`ANALYTICS_UPDATED\`, receipt \`1177e170-7d87-4e90-aeb2-508863225a6d\`
- Web PPIC internal report/snapshot version \`V015\` (different numbering from source workbook V12), cutoff 21 Nov 2026
- Source registry \`PPIC_202611_DO_255e14a1dfbe47ec\`, file pointer \`library-file:libfile_fde3_f-053ae174d6308191a838135efcf996fb_651490bce7948191a073e9ed83bb583b\`
- \`ppic_private.do_customer_snapshots\` 37 lines/24 SJ/621,995 packs/Rp4,474,760,000
- \`ppic_private.daily_ledger_snapshots\` 21 Nov 4,000 packs/Rp34,000,000. Missing 19/20 Nov **not** treated as zero.
- \`public.ppic_reports_owner_view\` report 09 latest V015.
- The source must remain accessible through the Library connector; it is **not** an object stored in the Supabase Storage bucket merely because the source registry has a Library file pointer.

## Future unattended execution

The existing hourly \`Robot Manajer PPIC\` automation is the only scheduler. The saved task is explicitly authorized to poll accessible ChatGPT Library and PPIC bank/source catalogs for new owner-approved DO working files; when a verified new source appears, it must extract the actual workbook before calling the publisher—no assumption from a filename or upload notification.

\`ppic_private.do_auto_publish_settings\` has enabled=true, publishing_scope=WORKING_ANALYTICS_ONLY, owner_preapproved_working_imports=true. All private tables have RLS and no anon/authenticated direct write privileges.

Use \`ppic_private.do_auto_publish_validated(period,cutoff,source_version,sha256,library_id,filename,full_source_rows_json,expected_json,validation_note)\` only with actual validated source bytes. Required \`expected_json\`: source SHA independently verified, Owner preauthorization, 1-to-1 counts of SJ, rows, pack, and nominal. The function validates every row, sample/regular pricing, historical conservation, periods and dates, creates append-only source facts/DO detail/daily report-09 snapshots, and writes one unique SHA receipt in the same transaction.

On identical source SHA returns \`NO_CHANGE\`, not a duplicate. A previously published SJ/SKU with changed price/quantity cannot silently overwrite history: it returns \`HISTORICAL_RECON_REQUIRED\`; investigate and document adjustment before a corrected source is published. Never publish an \`ARCHIVE_ONLY\` source as \`FINAL\` because user asks for fewer prompts.

The **instant** update in this conversation was performed in a live tool session. The recurring hourly automation can check without another user message, but Library uploads have **no confirmed real-time webhook** to Supabase. Do not claim that a file entered into ChatGPT will update Supabase at the exact instant of upload when no automation is running. A direct web uploader could implement a separate provider callback later, subject to security tests and user authorization.

## Verification and boundaries

- \`public.ppic_reports_owner_view\` is the read projection actually fetched by \`auth.js\`, sorted by \`created_at.desc\`.
- DB readback confirmed V015, 21 Nov cutoff, 24 SJ, 37 lines, 621,995 packs, Rp4,474,760,000; previous V014 preserved; manual rerun with the same verified source returned \`NO_CHANGE\`.
- \`ppic_private.stage2_refresh('2026-11')\` was rerun after updating the source, producing a new evidence hash and BLOCKED/OPEN RECON checks because BJ/DO cutoffs differ. Stage 3 briefing with the old hash remains historical until a **new current** GPT briefing is verified. Do not paper over this discrepancy or automatically deduct Barang Jadi.
- No bank movement, Kas Bank, invoice, official receivable, Web SKT SJ transaction, Cukai or BJ physical stock posting occurred.
- LOCKED September 2026 is out of scope and protected.

## Code and migration

- \`20261121184000_ppic_do_auto_working.sql\` adds the private setting, append-only receipt table and publisher.
- \`20261121184500_ppic_do_auto_sampel_kind.sql\` applies a parser fix for BAL's native \`SAMPEL\` category and preserves its 1,815 packs.
- Both migrations have already been applied to the active Supabase project. Repository snapshots should match the deployed definitions.
