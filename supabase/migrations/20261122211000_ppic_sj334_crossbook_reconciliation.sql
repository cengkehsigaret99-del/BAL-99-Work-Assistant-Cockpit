-- BAL PPIC, SJ334 cross-book reconciliation: private audit-only, append-only.
-- No source promotion, inventory movement, finance posting or settlement.
create table if not exists ppic_private.sj_crossbook_recon_snapshots (
 id uuid primary key default gen_random_uuid(),
 period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' and period>='2026-11'),
 sj_no integer not null check(sj_no between 1 and 99999999),
 cutoff date not null,
 do_source_sha256 text not null check(do_source_sha256 ~ '^[a-f0-9]{64}$'),
 bj_file_sha256 text not null check(bj_file_sha256 ~ '^[a-f0-9]{64}$'),
 kas_file_sha256 text not null check(kas_file_sha256 ~ '^[a-f0-9]{64}$'),
 audit_sha256 text not null check(audit_sha256 ~ '^[a-f0-9]{64}$'),
 audit_library_file_id text not null check(audit_library_file_id ~ '^libfile_[a-z0-9_-]{20,200}$'),
 source_provenance jsonb not null check(jsonb_typeof(source_provenance)='object'),
 book_checks jsonb not null check(jsonb_typeof(book_checks)='array' and jsonb_array_length(book_checks) between 1 and 20),
 summary jsonb not null check(jsonb_typeof(summary)='object'),
 cash_context jsonb not null check(jsonb_typeof(cash_context)='object'),
 exceptions jsonb not null check(jsonb_typeof(exceptions)='array'),
 status text not null default 'BOOK_MATCHED_CASH_OPEN'
  check(status in ('BOOK_MATCHED_CASH_OPEN','CROSSBOOK_DIFFERENCE')),
 write_scope text not null default 'ANALYTICS_ONLY'
  check(write_scope='ANALYTICS_ONLY'),
 created_at timestamptz not null default now(),
 unique(period,sj_no,do_source_sha256,bj_file_sha256,kas_file_sha256)
);
create index if not exists sj_crossbook_recon_period_idx
 on ppic_private.sj_crossbook_recon_snapshots(period,created_at desc);
alter table ppic_private.sj_crossbook_recon_snapshots enable row level security;
revoke all on ppic_private.sj_crossbook_recon_snapshots from public,anon,authenticated,service_role;

create or replace function public.ppic_sj_crossbook_reconciliation(p_owner uuid,p_period text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,ppic_private as $fn$
declare
 s ppic_private.sj_crossbook_recon_snapshots%rowtype;
 v_do_sha text;v_do_cutoff date;v_bj_cutoff date;v_bj_sha text;v_cash_cutoff date;
begin
 if not exists(select 1 from ppic_private.owner_access o where o.owner_user_id=p_owner)
 then raise exception 'RECON_OWNER_DENIED' using errcode='42501';end if;
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    or p_period<'2026-11' or p_period>to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'RECON_PERIOD_INVALID' using errcode='22023';end if;
 select * into s from ppic_private.sj_crossbook_recon_snapshots
 where period=p_period order by created_at desc,id desc limit 1;
 if not found then return jsonb_build_object('ok',true,'ready',false,'period',p_period,'latest',null);end if;
 select src.sha256,src.cutoff into v_do_sha,v_do_cutoff
 from ppic_private.robot_selected_sources(p_period) src where src.division='DO';
 select src.sha256,src.cutoff into v_bj_sha,v_bj_cutoff
 from ppic_private.robot_selected_sources(p_period) src where src.division='BARANG JADI';
 select src.cutoff into v_cash_cutoff from ppic_private.robot_selected_sources(p_period) src where src.division='KAS BANK';
 return jsonb_build_object('ok',true,'ready',true,'period',p_period,
  'latest',jsonb_build_object(
    'schema_version','ppic-sj-crossbook-v1','id',s.id,'created_at',s.created_at,
    'cutoff',s.cutoff,'sj_no',s.sj_no,'status',s.status,'write_scope',s.write_scope,
    'do_active_evidence_matches',v_do_sha=s.do_source_sha256 and v_do_cutoff=s.cutoff,
    'bj_book_is_current_in_ppic',v_bj_sha=s.bj_file_sha256 and v_bj_cutoff=s.cutoff,
    'bj_active_cutoff',v_bj_cutoff,'cash_active_cutoff',v_cash_cutoff,
    'summary',s.summary,'cash_context',s.cash_context,
    'checks',s.book_checks,'exceptions',s.exceptions,
    'source_provenance',jsonb_build_object(
      'do_sha256',s.do_source_sha256,'bj_sha256',s.bj_file_sha256,
      'kas_sha256',s.kas_file_sha256,'audit_sha256',s.audit_sha256),
    'finance_settlement_confirmed',false,
    'official_inventory_updated',false,
    'audit_evidence_kind','EXTERNAL_WORKBOOK_CHECKS'
  ));
end $fn$;
revoke all on function public.ppic_sj_crossbook_reconciliation(uuid,text) from public,anon,authenticated;
grant execute on function public.ppic_sj_crossbook_reconciliation(uuid,text) to service_role;
