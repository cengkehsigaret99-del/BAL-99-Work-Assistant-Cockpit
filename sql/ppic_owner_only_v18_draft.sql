-- BAL PPIC owner-only policy proposal; NOT applied to live database.
-- Store owner UUID privately after verifying the sole Supabase Auth identity.
-- No email, credentials or operational data are committed to GitHub.
begin;
create schema if not exists ppic_private;
revoke all on schema ppic_private from public, anon, authenticated;
create table if not exists ppic_private.owner_access (
  owner_user_id uuid primary key references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now()
);
revoke all on ppic_private.owner_access from public, anon, authenticated;
alter table ppic_private.owner_access enable row level security;
alter table ppic_private.owner_access force row level security;
-- Do not insert an owner until the actual Auth user ID is verified.
-- A separately privileged, audited server-side provisioning operation must
-- enforce exactly one row and prevent subsequent grants.
create table if not exists ppic_private.source_registry (
  id uuid primary key default gen_random_uuid(),
  document_id text not null unique,
  division text not null,
  period text not null,
  cutoff timestamptz not null,
  version text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  reconciliation_status text not null check (reconciliation_status in ('WORKING','OPEN RECON','RECONCILED','LOCKED')),
  access_class text not null check (access_class in ('INTERNAL','RESTRICTED','CONFIDENTIAL')),
  private_locator text not null,
  ingested_at timestamptz not null default now()
);
revoke all on ppic_private.source_registry from public, anon, authenticated;
alter table ppic_private.source_registry enable row level security;
alter table ppic_private.source_registry force row level security;
-- No client-facing GRANT or policy until a vetted private read API is ready.
commit;
