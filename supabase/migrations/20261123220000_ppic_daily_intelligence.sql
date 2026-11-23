-- BAL PPIC · read-only daily cross-division intelligence, source-qualified.
-- Does not overwrite source_registry, inventory, finance, payroll, excise or September closing.
create table if not exists ppic_private.daily_source_intelligence_snapshots (
 id uuid primary key default gen_random_uuid(),
 period text not null check (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' and period >= '2026-11'),
 as_of date not null,
 source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
 skt_revision text not null check (skt_revision ~ '^BAL-MIRROR-[a-f0-9]{64}$'),
 ppic_evidence_hash text not null check (ppic_evidence_hash ~ '^[a-f0-9]{64}$'),
 source_rows jsonb not null check (jsonb_typeof(source_rows)='array' and jsonb_array_length(source_rows) between 1 and 16),
 kpi_rows jsonb not null check (jsonb_typeof(kpi_rows)='array' and jsonb_array_length(kpi_rows) between 1 and 16),
 exceptions jsonb not null check (jsonb_typeof(exceptions)='array' and jsonb_array_length(exceptions) between 1 and 30),
 next_actions jsonb not null check (jsonb_typeof(next_actions)='array' and jsonb_array_length(next_actions) between 1 and 20),
 write_scope text not null default 'READ_ONLY_WORKING_REFERENCES'
  check(write_scope='READ_ONLY_WORKING_REFERENCES'),
 state text not null default 'WORKING_OPEN_RECON'
  check(state='WORKING_OPEN_RECON'),
 created_at timestamptz not null default now(),
 unique(period,as_of,source_fingerprint)
);
create index if not exists daily_source_intelligence_snapshots_period_idx
 on ppic_private.daily_source_intelligence_snapshots(period,as_of desc,created_at desc);
alter table ppic_private.daily_source_intelligence_snapshots enable row level security;
revoke all on ppic_private.daily_source_intelligence_snapshots from public,anon,authenticated,service_role;

create or replace function ppic_private.daily_intelligence_record(
 p_period text,p_date date,p_skt_revision text,p_ppic_hash text,
 p_sources jsonb,p_kpis jsonb,p_exceptions jsonb,p_actions jsonb
) returns jsonb
language plpgsql security invoker
set search_path=pg_catalog,ppic_private as $fn$
declare v_fingerprint text;v_id uuid;v_skt_rev text;v_hash text;
 i jsonb;v_keys text[]:=array[]::text[];v_quality text;
begin
 if p_period is null or p_period!~'^20[0-9]{2}-(0[1-9]|1[0-2])$'
 or p_period<'2026-11' or p_period>to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 or p_date is null or to_char(p_date,'YYYY-MM')<>p_period
 or p_date>timezone('Asia/Jakarta',now())::date
 or p_skt_revision is null or p_skt_revision!~'^BAL-MIRROR-[a-f0-9]{64}$'
 or p_ppic_hash is null or p_ppic_hash!~'^[a-f0-9]{64}$'
 or p_sources is null or jsonb_typeof(p_sources)<>'array'
 or jsonb_array_length(p_sources) not between 1 and 16
 or p_kpis is null or jsonb_typeof(p_kpis)<>'array'
 or jsonb_array_length(p_kpis) not between 1 and 16
 or p_exceptions is null or jsonb_typeof(p_exceptions)<>'array'
 or jsonb_array_length(p_exceptions) not between 1 and 30
 or p_actions is null or jsonb_typeof(p_actions)<>'array'
 or jsonb_array_length(p_actions) not between 1 and 20
 or octet_length((p_sources||p_kpis||p_exceptions||p_actions)::text)>180000
 then raise exception 'PPIC_DAILY_DATA_INVALID' using errcode='22023';end if;
 select content_revision into v_skt_rev from ppic_private.skt_form_observations
 where period=p_period order by created_at desc,id desc limit 1;
 v_hash:=ppic_private.robot_context(p_period)->>'evidence_hash';
 if v_skt_rev is distinct from p_skt_revision or v_hash is distinct from p_ppic_hash
 then return jsonb_build_object('ok',false,'status','STALE_SOURCE_REVISION','period',p_period);end if;
 for i in select value from jsonb_array_elements(p_sources) loop
  if jsonb_typeof(i)<>'object'
   or coalesce(i->>'division','')!~'^[A-Z][A-Z0-9_ ]{1,30}$'
   or i->>'division'=any(v_keys)
   or coalesce(i->>'source_status','') not in
      ('ACTIVE_WORKING','CANDIDATE_OPEN_RECON','SOURCE_VERIFIED_OPEN_RECON',
       'SKT_DIAJUKAN','SKT_TERCATAT','LAST_WORKING','METADATA_CONFLICT',
       'BANK_MATCH_OPEN','OPEN_RECON','SOURCE_MISSING')
   or coalesce(i->>'basis','') not in ('ACTIVE_REPORT','ORIGINAL_XLSX','DERIVED_WORKBOOK','WEB_SKT_FORM','GOOGLE_SHEET','CONNECTED_ROBOT')
   or (i->>'book_cutoff' is not null and (i->>'book_cutoff')!~'^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$')
   or (i->>'active_cutoff' is not null and (i->>'active_cutoff')!~'^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$')
   or jsonb_typeof(i->'metrics') is distinct from 'array'
   or jsonb_array_length(i->'metrics')>15
  then raise exception 'PPIC_DAILY_SOURCE_ROW_INVALID' using errcode='22023';end if;
  v_keys:=array_append(v_keys,i->>'division');
 end loop;
 v_fingerprint:=encode(extensions.digest(
  jsonb_build_object('period',p_period,'date',p_date,'skt_rev',p_skt_revision,
    'ppic_hash',p_ppic_hash,'sources',p_sources,'kpi',p_kpis,
    'exceptions',p_exceptions,'actions',p_actions)::text,'sha256'),'hex');
 select id into v_id from ppic_private.daily_source_intelligence_snapshots
  where period=p_period and as_of=p_date and source_fingerprint=v_fingerprint;
 if found then return jsonb_build_object('ok',true,'status','NO_CHANGE','period',p_period,'id',v_id,'source_fingerprint',v_fingerprint);end if;
 insert into ppic_private.daily_source_intelligence_snapshots(
  period,as_of,source_fingerprint,skt_revision,ppic_evidence_hash,
  source_rows,kpi_rows,exceptions,next_actions)
 values(p_period,p_date,v_fingerprint,p_skt_revision,p_ppic_hash,p_sources,p_kpis,p_exceptions,p_actions)
 on conflict(period,as_of,source_fingerprint) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from ppic_private.daily_source_intelligence_snapshots
  where period=p_period and as_of=p_date and source_fingerprint=v_fingerprint;
  return jsonb_build_object('ok',true,'status','NO_CHANGE','period',p_period,'id',v_id);
 end if;
 return jsonb_build_object('ok',true,'status','WORKING_REFERENCE_UPDATED','period',p_period,
  'as_of',p_date,'id',v_id,'source_fingerprint',v_fingerprint,'division_count',jsonb_array_length(p_sources),
  'risk_count',jsonb_array_length(p_exceptions),'official_ledgers_changed',false);
end $fn$;

create or replace function public.ppic_daily_intelligence_status(p_owner uuid,p_period text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,ppic_private as $fn$
declare v ppic_private.daily_source_intelligence_snapshots%rowtype;
 v_skt_rev text;v_hash text;
begin
 if not exists(select 1 from ppic_private.owner_access a where a.owner_user_id=p_owner)
 then raise exception 'PPIC_DAILY_OWNER_DENIED' using errcode='42501';end if;
 if p_period is null or p_period!~'^20[0-9]{2}-(0[1-9]|1[0-2])$'
 or p_period<'2026-11' or p_period>to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'PPIC_DAILY_INVALID_PERIOD' using errcode='22023';end if;
 select * into v from ppic_private.daily_source_intelligence_snapshots
  where period=p_period order by as_of desc,created_at desc,id desc limit 1;
 if not found then return jsonb_build_object('ok',true,'period',p_period,'ready',false,'latest',null);end if;
 select content_revision into v_skt_rev from ppic_private.skt_form_observations
  where period=p_period order by created_at desc,id desc limit 1;
 v_hash:=ppic_private.robot_context(p_period)->>'evidence_hash';
 return jsonb_build_object('ok',true,'period',p_period,'ready',true,'latest',jsonb_build_object(
  'schema_version','ppic-daily-intelligence-v1',
  'id',v.id,'as_of',v.as_of,'state',v.state,'write_scope',v.write_scope,
  'created_at',v.created_at,'source_fingerprint',v.source_fingerprint,
  'skt_revision_current',v_skt_rev=v.skt_revision,
  'ppic_evidence_current',v_hash=v.ppic_evidence_hash,
  'active_source_coverage',coalesce(ppic_private.robot_context(p_period)->'coverage','[]'::jsonb),
  'source_rows',v.source_rows,'kpi_rows',v.kpi_rows,
  'exceptions',v.exceptions,'next_actions',v.next_actions,
  'posting_done',false));
end $fn$;
revoke all on function ppic_private.daily_intelligence_record(text,date,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ppic_daily_intelligence_status(uuid,text) from public,anon,authenticated;
grant execute on function public.ppic_daily_intelligence_status(uuid,text) to service_role;
