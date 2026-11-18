# BAL PPIC V1.8 — Owner-only access implementation gate

## Confirmed instruction
Exactly one owner identity is authorized for BAL PPIC. The owner's email was confirmed in chat and is intentionally **not written into this public repository**.

## Project condition
Supabase project `BalestariProject` is still `COMING_UP`. A read-only `SELECT 1` failed. **No SQL in this branch has been executed against Supabase.**

## Rules
1. Verify the actual Auth user's UUID via a private administrative channel; email alone is not sufficient for an RLS identity.
2. Disable public signups in Supabase Auth before any private data ingestion.
3. Allow one UUID only, using a private server-managed allowlist and a unique-singleton provisioning constraint/transaction.
4. Require verified authentication, server-side authorization, RLS, and private storage for all operational data.
5. Public GitHub Pages stays an unauthenticated shell with **no private data**; a visual login gate is not data security.
6. No public signed links to confidential PDF; file sharing remains explicit and initiated by the Owner.
7. Existing users in an existing Supabase project must be reviewed before granting anything; do not assume this project is empty.
8. Do not change existing tables, Auth providers, or project-wide settings without checking for other workloads.

## Draft SQL
`sql/ppic_owner_only_v18_draft.sql` defines private schema and deny-by-default source registry. It grants **no client access** and seeds **no Owner**, so it cannot by itself enable login or data access.

## Acceptance tests before go-live
- Authenticated owner can access only the permitted PPIC reports.
- Another authenticated account receives 403/empty result.
- Unauthenticated requests receive 401/empty result.
- Attempts to query source_registry through public Data API are denied.
- Owner cannot modify operational source records from the read-only website.
- Private source checksum, version and cutoff match the Excel register.
- Export access is audited and cannot be reused after expiry.

**Current gate: NO-GO until database ACTIVE, owner UUID verified, Auth configured, and live access tests PASS.**
