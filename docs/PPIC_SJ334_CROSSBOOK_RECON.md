# BAL PPIC · SJ334 cross-book reconciliation (DO, Barang Jadi, Kas)

This is a **private, append-only analytical reconciliation**, not an inventory, accounting, or customer settlement posting.

## Sources reopened and verified
All figures below were checked from the actual uploaded XLSX workbooks:
- \`PR_BAL_DO_NOVEMBER_2026_V12_CUTOFF_21NOV_HARGA_VALIDASI_KAS_V16_OPEN_RECON.xlsx\` · SHA256 \`255e14a1dfbe47ec894e06b95902adb08196aa524ed0dfa2038ca4f3184c1b7d\` · sheet \`01 DETAIL SJ\`, 37 lines, row 38 SJ334.
- \`BAL_BARANG_JADI_NOVEMBER_2026_V015_CUTOFF_21NOV(1).xlsx\` · SHA256 \`8f0c6098de89ee77ea075842e25e69c3fab06b308c2f145dfddeca00d26d48fd\` · \`03_MUTASI_SJ\` rows 7–43 and \`05_REKONSILIASI\` rows 8–21.
- \`PR_BAL_KAS_BANK_NOVEMBER_2026_V16_KONSOLIDASI_CUSTOMER_21NOV_OPEN_RECON.xlsx\` · SHA256 \`e0752fdb683ef4ade8ac7ea72053df5ee05ee2bfd8dfa05fcfe08bd147acd079\` · \`14 DO per SJ\` rows 5–27, \`03 Penampung\`, \`09 Piutang DO\`, \`10 Alokasi Aji\`, and \`19 Konsolidasi Customer\`.

The evidence workbook \`BAL_REKONSILIASI_SJ334_DO_BJ_KAS_21NOV2026_WORKING_OPEN_RECON.xlsx\` is saved in BAL ChatGPT Library at \`/PR_BAL_CONTROL_TOWER_2026/NOVEMBER_2026_INBOX/\`. Its SHA256 is \`dc6a365aa0e187739b1b8d0bd4cbc1ccb555802db14fa8ed8da07026b66d4cb9\`. This does not prove a copy was uploaded to Google Drive.

## Conclusive analytical findings
- All **37** DO detail lines matched all **37** BJ lines by SJ+SKU, business date, customer and pack. Total 24 SJ and 621,995 packs in each. No duplicate SJ334 is needed.
- SJ334 (21 Nov) is one row: customer Tri Sukma Aji, SKU C-036, NEW 16 (800) KUNING, 4,000 packs / 5 cartons, working unit price Rp8,500, working DO value Rp34,000,000. The BJ book's cost reference is Rp30,113,000; this is not an approved November HPP and no margin/profit is certified.
- BJ book: opening 148,210 + November receipts 883,910 – DO dispatches 621,995 = closing **410,125 packs**. SJ334 is **already included** in dispatches. No additional stock reduction.
- Kas V16 DO-value reference contains **23 SJ** (311–333), **617,995 packs** and **Rp4,440,760,000** working value. These 23 all match DO V12 working price reference. SJ334 is absent, hence the extra Rp34,000,000 difference in **DO-value coverage**, not a cash or outstanding-debt reconciliation.
- Tri Sukma Aji working DO increased from Rp187,900,000 (five SJ) to Rp221,900,000 (six SJ). Kas V16 has evidence of Rp108,000,000 aggregate Aji transfers to a **penampung** account; these funds are not automatically BCA BAL receipts. Kas V16 explicitly references SJ319 Rp27,200,000 and SJ325 Rp20,825,000, but no specific SJ334 allocation; do not net unallocated transfers against SJ334 without proof. No definitive \`PAID\` / \`UNPAID\` statement is warranted.
- Negative BJ SKU positions C-019 –5, C-023 –230, C-025 –220 pack total –455 remain separate. No cross-SKU netting. QC/available-to-promise still unverified.

## Supabase receipt
The analysis was recorded in \`ppic_private.sj_crossbook_recon_snapshots\` as a private, append-only receipt with source hashes, bounded summary, checks and the evidence-Library file reference. Unique identity: \`period + SJ + DO/BJ/Kas SHA256\`. Current record ID \`96fa0259-770f-4c06-be8f-5a993c93ffcb\`, status \`BOOK_MATCHED_CASH_OPEN\`.

\`public.ppic_sj_crossbook_reconciliation(owner_id, period)\` is service-role-only and checks Owner access. It returns explicit \`do_active_evidence_matches\`, \`bj_book_is_current_in_ppic\` flags and active-source cutoffs. **The selected PPIC BJ source is still 18 November**; the 21 November BJ workbook was validated independently but not promoted into the official PPIC source ledger. Finance remains OPEN RECON; no invoice, posting, payment, CK-1 or closed period was changed.

\`ppic-sj-recon-status\` Edge Function verifies a real Supabase Owner session, exact Origin, and permits only one period parameter. Its JSON projection excludes unrecognized fields, bank account information, source private locators and raw workbook rows. The GitHub Pages panel renders text nodes, never injected HTML. Repeated reads do not generate stock or payment transactions.

## Practical next steps
1. Admin DO/Logistik: collect proof of shipment and signed proof of customer delivery for SJ334, and validate invoice price basis.
2. Admin Kas/Finance: find remittance linked **specifically** to SJ334 and map transfers/DP by SJ without assuming cash received in BAL's bank.
3. Admin BJ/QC: register and verify the newer 21 Nov physical/QC evidence, reconcile C-019/C-023/C-025 and promote only properly checked source versions.
4. Owner/PPIC: leave Stage 3 production planning \`HOLD_DATA\` until actual free stock and firm-order quantities can be trusted.

## QA
- Database: recorded 1 snapshot, Owner RPC readback passed; RLS enabled and direct anon/authenticated execute denied.
- Browser and gateway tests: \`tests/ppic-sj-crossbook-status.test.mjs\`, \`tests/ppic-sj-crossbook.spec.cjs\`, GitHub Action \`BAL PPIC SJ334 Cross-Book Reconciliation QA\`.
- Synthetic browser test does not constitute an observed live Owner login. Public shell health is separate from authenticated data verification.
