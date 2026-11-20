# BAL PPIC Robot — Evidence-Gated Production and Delivery Plan (Stage 3B)

## What was built
An Owner-only analytical planning view on the existing GitHub Pages BAL PPIC Control Tower, backed by a dedicated private Supabase Edge Function and append-only reconciliation snapshot. This is not a replacement for Web SKT and is not a transaction-writing ERP.

It combines:
1. Current accepted PPIC facts from \`ppic_private.robot_selected_sources(period)\` with an evidence hash from \`ppic_private.robot_context(period)\`.
2. The latest accepted Stage 3 decision snapshot tied to the same evidence hash and latest GPT briefing.
3. The **metadata only** from the Web SKT connected \`bal_mirror_manifest(month)\`: current form counts, capture time, revision hash and explicit scope. No compressed mirror, attachments, employee identity or raw transactions are imported as operational movements.

The SKT mirror's \`COMPLETE_CURRENT_FORMS\` means latest/current forms only, **not a full database history** and not a statement of validated customer demand. The 7 current customer-order forms in the 20/21 Nov observation are not proven firm orders. No co-realization or allocation forms in the mirror likewise does **not** establish that no deliveries or allocations exist elsewhere.

## Database design
- \`ppic_private.skt_form_observations\` stores the latest validated SKT manifest metadata with a unique \`(period, content_revision)\`. A second observation of the same revision returns \`NO_CHANGE\`; raw mirror content is not stored.
- \`ppic_private.plan_readiness_snapshots\` is append-only, keyed by \`(period, evidence_hash, decision_snapshot_id, skt_revision)\`, with seven proof gates, provenance facts, optional strictly gated per-SKU proposals and role-based next actions.
- \`ppic_private.record_skt_form_observation(period,revision,captured_at,counts,scope)\` validates the revision, count schema, and \`current_forms_only / latest_versions_only / no_reimport_as_transactions\`. Call only from an authorized administrator after actually retrieving the current SKT manifest.
- \`ppic_private.plan_refresh(period)\` returns \`READINESS_REFRESHED\` or \`NO_CHANGE\` after an actual readback. It does **not** post stock, prepare payroll, run a delivery, pay invoices, place PO, issue excise stamps, or close any period.
- \`public.ppic_plan_status(owner_id,period)\` is service-role only and checks Owner access. The Edge Function \`ppic-plan-status\` requires Supabase auth JWT plus strict Origin. It emits only safe allowlisted fields; raw source locators and keys are never exposed to GitHub Pages.

## Seven proof gates
1. **Firm demand by SKU.** Validated customer order, item/SKU, quantity, delivery date and allocation status. A count of order forms is not sufficient.
2. **QC-released, free stock per SKU.** Must exclude reserved, returned, defective and unreceived packs; monthly book stock is not available-to-promise stock.
3. **Full verified BOM and physical materials.** Must cover every component for the SKU and exclude tentative PO deliveries. One zero-stock material is a review trigger, not an automatic factory shutdown decision.
4. **Excise physically in factory by HJE.** Excludes any stamps outside factory or not received; projected factory stamps are still estimates.
5. **WIP handover by lot and SKU.** Giling batang, Verpack pack and Barang Jadi receipts are different units/stages; no subtraction of cumulative production without conversion/transfer/QC evidence.
6. **Effective crew and machine capacity.** Requires verified daily data, roster, shifts and corrected source metadata before payroll or capacity-based allocation.
7. **Free cash and committed spend.** Indicative bank balances are not disposable cash; collect bank reconciliation and due commitments.

When any key evidence is missing, return \`HOLD_DATA\` with actionable follow-up tasks; **do not turn unknown into zero** and do not emit a numeric target as a commitment. A missing SKU plan is not zero production and does not authorize a holiday.

## Future per-SKU planning contract
If PPIC verified-source extraction later provides these five exact SOURCE-quality, nonnegative pack facts for the **same cutoff date** for a SKU \`c_NNN\`:
- DO: \`firm_order_sku_c_NNN_pack\`
- Barang Jadi: \`ready_unallocated_sku_c_NNN_pack\`
- Bahan Baku: \`material_cover_verified_sku_c_NNN_pack\`
- Cukai: \`pita_cover_verified_sku_c_NNN_pack\`
- Verpack: \`effective_capacity_verified_sku_c_NNN_pack\`

Then the robot can compute a *proposal only*:
- Proposed shipment pack = min(firm_order_pack, ready_unallocated_pack)
- Proposed make pack = min(max(firm_order_pack - ready_unallocated_pack, 0), material_cover_pack, pita_cover_pack, effective_capacity_pack)

If any fact is missing, not SOURCE, in a different unit, or has a mismatched cutoff date, the SKU returns HOLD instead of any invented numeric proposal. The formulas do not approve shipments or assign a production shift. Owner confirmation and actual operational posting remain independent.

## Autonomy and scheduled refresh
After each **existing** Robot Manajer PPIC cycle:
1. Fetch a new mirror manifest from the authorized Web SKT connector. If unavailable, skip the SKT metadata update and do not claim fresh SKT data.
2. Compare period/revision; call the private SKT observation function only when new/recent metadata is verified.
3. Verify new PPIC source imports and Stage 2/Stage 3 analysis. Do **not** call plan_refresh with stale Stage 3 decisions.
4. Call \`ppic_private.plan_refresh(period)\`, read the response, and compare with \`public.ppic_plan_status(owner,period)\` using an authorized admin connector.
5. Record a safe run receipt: \`PLAN_READINESS_REFRESHED\`, \`NO_CHANGE\`, or a truthful \`WAITING\`/failed status. Only notify Owner for a materially new blocker or changed verified SKU proposal, not every hour.

Do not create a duplicate scheduled task; preserve September 2026 locked closing and existing PPIC/Web SKT/Web Cukai/Web Finance roles.

## QA and release
- \`node --test tests/ppic-plan-status.test.mjs tests/ppic-stage3-status.test.mjs tests/ppic-stage2-status.test.mjs\`
- \`node --check ppic-plan-ui.js\`
- Playwright \`tests/ppic-plan.spec.cjs\`: Owner login, no invented targets, stale data banner, mobile, no silent GPT command submission, logout clearing private text.
- GitHub Action \`BAL PPIC Evidence-Gated Planning QA\`; GitHub Pages allowlisted shell only, with matching service-worker and public health-check assets.
- Privilege checks: \`ppic_private\` RLS on, no anon/authenticated RPC execute, Edge Function JWT verification true.
- Synthetic tests do not prove a real Owner browser login; report live UAT separately when observed.

## Current November working observation
At the first accepted observation, Web SKT mirror revision prefix \`BAL-MIRROR-977538d3\` covered 150 current-form documents, including 7 order forms, but no validated per-SKU firm demand quantities. PPIC \`ready_for_delivery_pack\` was MISSING; material coverage 63 codes incomplete, excise had 600,000 stamps not confirmed as physically received; Giling-to-Verpack handovers and effective staff capacity remained unverified. Accordingly the first plan receipt was \`HOLD_DATA\`, 7 proof gates, 0 qualified quantitative SKU proposals. This is a *correct conservative result*, not evidence of zero production or zero orders.
