# Robot Cukai → PPIC

PPIC reads the official Robot Cukai publication directly through the authenticated `public.ppic_cukai_source(p_period)` RPC. The RPC derives the caller from `auth.uid()` and checks the existing PPIC Owner access table. It has no client-provided owner ID and cannot mutate source transactions.

## Source and backend

The prerequisite is the Robot Cukai canonical publication migration (`bal_cukai_robot.read_publication(text)`, `published_snapshots`, and the independent recovery/projection functions). Apply that prerequisite before `supabase/migrations/20261125151737_ppic_cukai_canonical_source.sql`.

The source insert trigger publishes only the newly accepted snapshot. It does not call the PPIC adapter or acquire PPIC/status locks. Two independent backend jobs must be scheduled every minute:

- `bal_cukai_robot.retry_publications()` repairs missed canonical publications and records canonical recovery status.
- `bal_cukai_robot.retry_ppic_publications()` calls `project_publication(period)`, which invokes `ppic_private.sync_cukai_publication(period)` for the current publication and records PPIC projection status.

The jobs run in separate transactions. A PPIC timeout or failure cannot roll back the canonical publication, interrupt SKT's direct read, or prevent the source snapshot from being accepted. The next PPIC job retries the current revision. The PPIC migration adds a narrowly scoped, non-login reader role and a private Owner guard; its adapter:

- Refuses a stale canonical source.
- Applies the entire revision in one transaction and records a unique receipt.
- Appends source facts, report 05, and period control snapshots without posting inventory movements.
- Selects the canonical Cukai receipt for planning even when a newer source revision corrects an older cut-off.
- Preserves all non-Cukai source selection and previous records.

Both backend jobs operate independently of an open browser. PPIC's browser reads the canonical publication directly; it does not wait for the PPIC planning projection job. It refreshes its authorized source every 60 seconds while visible and on returning to the page. It keeps the last successfully read revision on transient errors and shows the error rather than replacing balances with zero.

## UI and outputs

`cukai-sync.js` validates publication identity, quantities, arithmetic, pool IDs, and per-day usage. Different pools with the same HJE remain separate. A daily usage row with an ambiguous HJE remains unallocated; it is shown only in the all-pool view and never assigned to a pool by guesswork.

The module replaces the Cukai portion of the existing daily/report projections in memory. A delayed response from an older PPIC report endpoint cannot overwrite the canonical source. Other divisions are preserved. Report 05, Info Harian, and the Cukai preview use the same publication identity.

The canonical preview keeps the revision and filters selected when it opens, even if a later refresh arrives. It includes the snapshot ID, source hash, publication hash, cut-off, and source status.

Daily receipt dates and physical stock counts are unavailable in canonical schema v1. A period control balance is shown only at its cut-off; earlier daily balances remain unknown. Unknown usage remains `null`. Carton capacity is withheld until a verified conversion master is present.

## Session and public assets

Owner credentials and tokens remain in memory in the existing authentication module. Logout, expired authorization, and a new login invalidate pending source responses and clear private UI state. The service worker caches only the public application shell. The Pages deployment allowlist includes `cukai-sync.js`, never operational source payloads or test fixtures.

## Verification

Synthetic quantities are limited to `tests/fixtures/cukai-synthetic.cjs`.

```sh
node --test tests/ppic-cukai-source.test.cjs tests/ppic-cukai-auth.test.cjs tests/ppic-cukai-period-total.test.cjs tests/ppic-v60-robot-auth.test.cjs tests/ppic-v53-sync-auth.test.cjs tests/ppic-v50-daily-data.test.cjs tests/ppic-working-ledger25.test.mjs
npm install --prefix /tmp/ppic-cukai-qa --no-save jsdom@26.1.0
NODE_PATH=/tmp/ppic-cukai-qa/node_modules node --test tests/ppic-cukai-dom.test.cjs
python3 -m unittest discover -s tests -p ppic_health_check_test.py
```

The DOM harness exercises the complete current HTML and scripts with mocked authenticated endpoints, including the automatic timer, late legacy responses, PDF pinning, network failure, and logout races. It does not claim visual browser validation or live Owner login.
