-- BAL PPIC: append-only receipts for source-extract-verified WORKING reports.
-- This register is never a stock ledger; it makes retransmissions idempotent and auditable.
create table if not exists ppic_private.working_ledger_promotion_receipts (
 id uuid primary key default gen_random_uuid(),
 period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 division text not null check(division in ('DO','BARANG JADI','CUKAI','BAHAN BAKU','KAS BANK','GILING','VERPACK','TSG')),
 cutoff date not null,
 extract_sha256 text not null check(extract_sha256 ~ '^[a-f0-9]{64}$'),
 source_document_id text not null,
 source_library_file_id text not null,
 source_hash_kind text not null default 'NORMALIZED_TEXT_EXTRACT' check(source_hash_kind='NORMALIZED_TEXT_EXTRACT'),
 source_workbook_version text not null,
 snapshot_ids jsonb not null default '[]'::jsonb check(jsonb_typeof(snapshot_ids)='array'),
 summary jsonb not null check(jsonb_typeof(summary)='object'),
 status text not null default 'WORKING_OPEN_RECON' check(status='WORKING_OPEN_RECON'),
 official_cash_inventory_or_invoice_posted boolean not null default false check(not official_cash_inventory_or_invoice_posted),
 published_at timestamptz not null default now(),
 unique(period,division,extract_sha256)
);
create index if not exists working_ledger_promotion_receipts_division_idx
 on ppic_private.working_ledger_promotion_receipts(period,division,cutoff desc);
alter table ppic_private.working_ledger_promotion_receipts enable row level security;
revoke all on ppic_private.working_ledger_promotion_receipts from public,anon,authenticated,service_role;

-- Existing chart viewers support legacy zlib payloads; added json-v1 only after inspection of
-- workbook-derived rows and source-local identity. The validation of content is in the importer.
