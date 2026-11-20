# BAL PPIC — Tahap 3 Pusat Keputusan Operasional

## Authority and scope
This Stage 3 panel is a **private, read-only managerial decision-support layer**. It does not replace Web SKT, the Cukai Robot, Finance, or the actual stock/DO/payroll/cukai ledgers. All decision items remain \`USULAN\`; no button approves payroll, pays suppliers, dispatches goods, posts stock movements, binds orders or closes a period.

The panel combines two independently verified sources:
1. The newest accepted private GPT briefing in \`ppic_private.robot_briefings\` (the actual GPT reasoning and source-key citations).
2. The current Stage 2 source-backed reconciliation snapshot in \`ppic_private.stage2_review_snapshots\` (book equations, cutoff conflicts and warning signals).

They must have the **same** current \`evidence_hash\`, or Stage 3 returns \`WAITING_GPT_BRIEF\`, \`WAITING_STAGE2\`, or \`STALE_EVIDENCE\` and does not publish a new decision. The selected source documents and each fact key are verified against \`ppic_private.robot_selected_sources(period)\`. Missing fact values remain missing, and a decision referring to those facts is gated \`BUTUH_VERIFIKASI\`. A high severity Stage 2 warning linked to a decision's division also gates the action.

## Persistence and no-duplicate contract
\`ppic_private.stage3_refresh(period)\` creates **append-only** \`ppic_private.stage3_decision_snapshots\`; unique identity is \`period + evidence_hash + briefing_id + stage2_id\`. A retry on unchanged evidence returns \`NO_CHANGE\` and the existing snapshot ID. The function calls the existing Stage 2 reconciliation refresh, verifies all current citations, classifies every GPT suggestion, selects up to three focus decisions and retains the other proposals for further review. A new briefing revision may create a new immutable decision revision even if the evidence hash did not change.

The snapshot stores: analysis-as-of date **separately** from the new snapshot creation time, decisions with rank/priority/confidence/kind/justification/consequence/proposed role/data limitations, references (document ID + fact keys), high-priority risk context, and unresolved evidence gates. This is not a numeric production target calculation. Any proposed quantity or capacity must be derived from valid firm orders, physically available and allocated goods, material BOM, WIP/handovers, excise physically at the factory, actual effective labor days and reconciled cash; otherwise report what is missing.

## Private read path
\`public.ppic_stage3_status(owner_id,period)\` is a service-role-only RPC verifying the configured Owner ID. It has explicit \`evidence_current\` boolean that compares the saved decision hash **and latest briefing ID** with current PPIC evidence. Historical decisions never masquerade as current if a source or briefing changed. \`ppic-stage3-status\` Edge Function validates exact Origin and a Supabase Owner bearer token, reads the RPC, and projects an allowlist of fields; it uses \`Cache-Control: no-store\`. The public GitHub Pages release includes only generic HTML/CSS/JS and synthetic fixtures, never source workbooks, API secrets, signed URLs or employee details.

The interface shows the three focus proposals prominently with \`USULAN\` status, source references, risk signals and the reason for any evidence gate. Other proposals and warning registers are in expandable sections. "Minta analisis lanjutan" **only pre-fills** the existing GPT question form; the Owner must still press "Kirim ke GPT". This is not an order or a transactional action.

## Scheduled robot
The existing hourly **Robot Manajer PPIC** task should call \`ppic_private.stage3_refresh(period)\` **after** source discovery, accepted facts, Stage 2 refresh, and a successful current GPT briefing comparison/publication. Verify the returned status and read back the current decision snapshot via authorized admin SQL. If the briefing is stale or not yet available, leave last historical decisions clearly marked stale and log \`WAITING\`, not success. If the evidence hash and briefing are unchanged, return \`NO_CHANGE\` and do not send duplicate notifications. Do not introduce another automation.

The first cut-off remains November 2026, WORKING / OPEN RECON. September 2026 LOCKED is untouched. The timestamp of a new Stage 3 snapshot is not the cutoff of the original factory source.

## Verification
- SQL: \`select ppic_private.stage3_refresh('2026-11')\` returned \`DECISIONS_REFRESHED\` with 6 items, 3 focus cards and current evidence hash; rerun returned \`NO_CHANGE\` with the same ID.
- Database access: RLS on, public/anon/authenticated cannot directly access private Stage 3 RPC or table; only the authenticated Owner via the service-role Edge Function can request a projected snapshot.
- Tests: \`node --test tests/ppic-stage3-status.test.mjs\`, browser \`tests/ppic-stage3.spec.cjs\`, and the GitHub \`BAL PPIC Stage 3 Decision Center QA\` workflow.
- Release: after QA passes, deploy only the public allowlisted site and confirm public asset integrity. A public shell check does not establish a successful live Owner session.

Do not claim the bot has unrestricted access to "all ChatGPT"; discovery continues to depend on authorized connected sources.
