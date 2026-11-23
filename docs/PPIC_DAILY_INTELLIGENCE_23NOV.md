# BAL PPIC · Cross-division operational intelligence · 23 November 2026

**Working / Open Recon / read-only.** This is a private Owner summary of current evidence, not the official source ledger, not an invoice, not a bank statement, not a physical warehouse count, and not a production stop instruction. All previous official records and September 2026 LOCKED are preserved.

## Source hierarchy used

1. **Actually inspected original XLSX files** are trusted only for the rows and cells inspected. Stored with SHA256 in \`ppic_private.chat_update_candidates\` as PENDING_RECON; no replay into official stock/tax books. Original BJ \`05. BARANG JADI OKTOBER (4)(1).xlsx\` SHA \`f50cc755c0b0ae15ae9a81dabd54ed459a19d0efbde7720980281b268175461d\`; BB original 23Nov \`11. NOVEMBER - BAHAN BAKU (4).xlsx\` SHA \`020a248ed1972141198c39f9f3df5f1f546a8ca193e6a43e8ffce6172db32c10\`; baseline (5) \`87c6c61d0ebd77e83e71d52257b3eef1060ab021115bcbbbbd57237da987cc44\`; original Pita \`11. PEMAKAIAN PITA NOVEMBER  2026 - (4).xlsx\` SHA \`cd607c94646de7084b3b2cca5e7778537ad68f5b75cde1c9bff97d22bd5a7dfd\`.
2. **Generated/reconciled source workbooks** are references whose derivation is checked against originals where possible; these are not standalone physical confirmations. BJ V016 candidate 23Nov, Kas V20 (dashboard still internally says V19), DO V13 multidimensional derivation, Cukai report23Nov, BB reconciled 71 codes.
3. **Connected original Google Sheet** PMS/PSP/MMB V6, read \`PMS_PAYMENT_23NOV\` (BRI ref 3081001, 15:06:50 WIB, Rp1.2bn) separate from 13Nov ref 3085001; BANK MATCH OPEN.
4. **Web SKT admin status** mirror \`BAL-MIRROR-9cce2246759205dacb05582ce96d5a98a04f391f38f65e487fb34abe5478a26b\`: 159 latest current forms, no whole DB history. Giling, TSG, BJ 23Nov DIAJUKAN, BB usage23Nov TERCATAT. These statuses are *not* ledger postings.
5. **PPIC actually active source/report** still older for many divisions: DO up to21Nov / web V015, BJ source18Nov, Giling20Nov, Verpack20Nov, Cukai20Nov, BB20Nov, TSG18Nov, Kas20Nov. Stage2 / planning flags remain OPEN RECON/HOLD_DATA. The independent Robot Cukai official snapshot is 21Nov 685145 keping; 23Nov source book 650145 keping is not yet imported there.

## Candidate figures and non-duplication
- DO: **24 SJ, 621995 packs, Rp4474760000 work price** through 21Nov, no new proven DO since. Derivative V13 does not replace Owner-approved source DO V12; SJ334 4000 pack is already counted.
- BJ: original + candidate working ledger: opening148210 + receipts954910 – DO621995 = **481125 pack 23Nov book closing**. New production receipt C-036 36000 on21Nov and C-033 35000 on23Nov **once only**. Three negative SKU: C-019 –5, C-023 –230, C-025 –220 (total –455), and QC/physical available-to-promise unverified. Value Rp3396468073.31532 is an October proxy.
- Cukai: primary pita book23Nov **650145 keping**, including 35000 HJE10325 use 23Nov, HJE positions 325090 / 286400 / 38655. Factory estimate50145, based on 600000 not confirmed physically received; never call opname. Independent Robot Cukai official21Nov 685145 and PPIC active old20Nov 721145 require reconciled promotion, not an extra stamp deduction.
- BB: 23Nov originals (4) + (5) baseline show A-01 441000 pcs, A-03 38000 pcs, PC-01 35000 keping; 71 quantity-code balances match within these two original books. **Do not subtract PC-01 and HJE10325 another time**; different opening HJE/card balances PC-01 +50, PC-02 –370, PC-03 +400 compared to Cukai remain OPEN RECON; nominal remains unconfirmed.
- Kas: V20-derived book indicative **Rp4185199078.42** including BRI identified receipts, but not current bank actual/free cash. The source title and dashboard V19 disagree. Transfers into **rekening penampung** are not BCA BAL receipts. PMS new deposit23Nov Rp1200000000 in connected Drive Sheet, BANK MATCH OPEN, distinct from 13Nov. No customer allocation or settlement claim.
- Giling: latest quantified working output21Nov 12884100 rods, 23Nov submitted form no verified output. Verpack last quantified21Nov 833660 packs, no 23Nov form (not zero). TSG book 2790kg up to18Nov; submitted form23Nov V5 not final. SDM pay/attendance metadata remains open.

## DB and web architecture
- \`ppic_private.daily_source_intelligence_snapshots\`: private append-only by period, date and canonical source fingerprint; RLS on and direct anon/authenticated/service table privileges revoked.
- \`ppic_private.daily_intelligence_record(...)\`: administrator-only validated intake; aborts on changed SKT mirror and PPIC evidence hash; idempotent \`NO_CHANGE\` repeat. Never mutates transaction ledgers.
- \`public.ppic_daily_intelligence_status(owner_id,period)\`: service-role-only Owner access check; only safe structured summary.
- \`ppic-daily-intelligence\` Edge JWT-enabled exact-Origin POST with allowlisted projection; no raw accounts, signatures, identities, XLSX bytes, private locators or API keys in browser.
- Public sanitized GitHub Pages adds **Inteligensi Operasional — 23 November** panel with 7 KPIs, 11 source cards, 12 risks, and 7 actions; style light turquoise, accessible only after existing Owner login. A button fills an analysis question; Owner must click submit, no auto posting.
- Current accepted snapshot: ID \`3fdb9048-1653-4f9f-ac27-efd2b0fb1569\`, fingerprint \`acbde9bc54192fa2563611302b43963b86bb21c085c4d9077cf7805305788653\`, 11 division groups, 7 KPIs, 12 risks; successfully read back with \`skt_revision_current:true\` and \`ppic_evidence_current:true\`.
- If a newer verified source arrives, create a new snapshot, preserve previous one. Existing PPIC :40 hourly robot may update the working summary if and only if it has actually read all new source facts and has a valid evidence hash. Reporting an old snapshot as current after a source revision change is forbidden.

## Outstanding management decisions
P1 — inspect QC and certify free BJ per SKU; resolve three negative SKU; confirm Cukai physical locations and HJE card mismatches; bank-match PMS 23Nov and customer invoice allocations; reconcile 23Nov SKT submitted forms with approved final reports; correct Kas V20 internal title/coverage discrepancy.
P2 — verify new WIP handovers and payroll dates; don't estimate unavailable 23Nov Giling/Verpack/TSG figures; close the SJ334 invoice/payment/POD gate.

Tests: \`node --test tests/ppic-daily-intelligence.test.mjs\` and \`tests/ppic-daily-intelligence.spec.cjs\` in \`BAL PPIC Daily Intelligence QA\`. Synthetic browser does not establish a real Owner login.
