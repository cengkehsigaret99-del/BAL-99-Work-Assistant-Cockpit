-- PPIC Stage3C: append-only read-only observation of SKT form status by division.
-- Does not ingest SKT transactions, approved payroll or business ledger entries.
create table if not exists ppic_private.skt_division_status_snapshots (
 id uuid primary key default gen_random_uuid(),
 period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' and period>='2026-11'),
 content_revision text not null check(content_revision ~ '^BAL-MIRROR-[a-f0-9]{64}$'),
 business_date date not null,
 checked_at timestamptz not null,
 source_kind text not null default 'SKT_ADMIN_INPUT_MONITOR' check(source_kind='SKT_ADMIN_INPUT_MONITOR'),
 rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows) between 1 and 15),
 created_at timestamptz not null default now(),
 unique(period,content_revision,business_date)
);
create index if not exists skt_division_status_snapshots_period_idx on ppic_private.skt_division_status_snapshots(period,business_date desc,created_at desc);
alter table ppic_private.skt_division_status_snapshots enable row level security;
revoke all on ppic_private.skt_division_status_snapshots from public,anon,authenticated,service_role;

create or replace function ppic_private.record_skt_division_status(
 p_period text,p_revision text,p_business_date date,p_checked_at timestamptz,p_rows jsonb
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,ppic_private as $fn$
declare
 v_row jsonb;v_arr jsonb:='[]'::jsonb; v_ids text[]:=array[]::text[];
 v_id uuid; v_div text; v_status text; v_doc_state text; v_count integer; v_tx integer;v_version integer;
 v_latest_saved timestamptz; v_report_date date;
begin
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    or p_period<'2026-11' or p_period>to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
    or p_revision is null or p_revision !~ '^BAL-MIRROR-[a-f0-9]{64}$'
    or p_business_date is null or p_business_date::text not like p_period||'%'
    or p_business_date>timezone('Asia/Jakarta',now())::date
    or p_checked_at is null or p_checked_at>now()+interval '5 minutes'
    or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 15
 then raise exception 'SKT_DAILY_STATUS_INVALID' using errcode='22023';end if;
 if not exists(select 1 from ppic_private.skt_form_observations s where s.period=p_period and s.content_revision=p_revision)
 then raise exception 'SKT_UNKNOWN_MIRROR_REVISION' using errcode='22023';end if;
 select id into v_id from ppic_private.skt_division_status_snapshots
 where period=p_period and content_revision=p_revision and business_date=p_business_date;
 if found then return jsonb_build_object('ok',true,'status','NO_CHANGE','id',v_id,'period',p_period,'business_date',p_business_date);end if;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(v_row)<>'object'
     or exists(select 1 from jsonb_object_keys(v_row) key
       where key not in ('division','status','report_date','last_saved_at','document_count','transaction_count','document_state','document_version','source_complete'))
  then raise exception 'SKT_DAILY_ROW_FIELDS_INVALID' using errcode='22023';end if;
  v_div:=v_row->>'division';v_status:=v_row->>'status';v_doc_state:=v_row->>'document_state';
  if v_div not in ('giling','tsg','verpack','barang_jadi','sdm_giling','sdm_verpack',
                    'bb_po','bb_receipt','bb_usage','surat_jalan','customer_orders','cukai_pita')
     or v_div=any(v_ids) or v_status is null or v_status !~ '^[A-Z_]{3,45}$'
     or v_row->>'source_complete' not in ('true','false')
  then raise exception 'SKT_DAILY_ROW_VALUE_INVALID' using errcode='22023';end if;
  v_ids:=array_append(v_ids,v_div);
  if v_doc_state is not null and (v_doc_state !~ '^[A-Z_]{3,35}$')
  then raise exception 'SKT_DOCUMENT_STATE_INVALID' using errcode='22023';end if;
  if (v_row->>'document_count') is null or (v_row->>'document_count') !~ '^[0-9]{1,5}$'
     or (v_row->>'transaction_count') is null or (v_row->>'transaction_count') !~ '^[0-9]{1,6}$'
  then raise exception 'SKT_COUNTS_INVALID' using errcode='22023';end if;
  v_count:=(v_row->>'document_count')::integer;v_tx:=(v_row->>'transaction_count')::integer;
  if v_count>10000 or v_tx>100000 then raise exception 'SKT_COUNTS_TOO_BIG';end if;
  if v_row->>'document_version' is not null then
   if (v_row->>'document_version')!~ '^[0-9]{1,5}$' then raise exception 'SKT_VERSION_INVALID';end if;
   v_version:=(v_row->>'document_version')::integer;
  else v_version:=null;end if;
  if v_row->>'report_date' is not null then
   if (v_row->>'report_date')!~ '^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$'
   then raise exception 'SKT_REPORT_DATE_INVALID';end if;
   v_report_date:=(v_row->>'report_date')::date;
   if v_report_date>p_business_date then raise exception 'SKT_REPORT_DATE_IN_FUTURE';end if;
  else v_report_date:=null;end if;
  if v_row->>'last_saved_at' is not null then
    v_latest_saved:=(v_row->>'last_saved_at')::timestamptz;
    if v_latest_saved>p_checked_at+interval '5 minutes' then raise exception 'SKT_SAVED_AFTER_CHECK';end if;
  else v_latest_saved:=null;end if;
  v_arr:=v_arr||jsonb_build_array(jsonb_build_object(
   'division',v_div,'status',v_status,'report_date',v_report_date,
   'last_saved_at',v_latest_saved,'document_count',v_count,'transaction_count',v_tx,
   'document_state',v_doc_state,'document_version',v_version,
   'source_complete',(v_row->>'source_complete')::boolean));
 end loop;
 insert into ppic_private.skt_division_status_snapshots(period,content_revision,business_date,checked_at,rows)
 values(p_period,p_revision,p_business_date,p_checked_at,v_arr)
 on conflict(period,content_revision,business_date) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from ppic_private.skt_division_status_snapshots
    where period=p_period and content_revision=p_revision and business_date=p_business_date;
  return jsonb_build_object('ok',true,'status','NO_CHANGE','id',v_id,'period',p_period,'business_date',p_business_date);
 end if;
 return jsonb_build_object('ok',true,'status','OBSERVED','id',v_id,'period',p_period,
   'business_date',p_business_date,'divisions',jsonb_array_length(v_arr));
end $fn$;

create or replace function public.ppic_skt_freshness_status(p_owner uuid,p_period text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,ppic_private as $fn$
declare v_revision text;v_capture timestamptz;v_counts jsonb;v_ctx jsonb;v_statuses jsonb;
begin
 if not exists(select 1 from ppic_private.owner_access where owner_user_id=p_owner)
 then raise exception 'SKT_WATCH_OWNER_DENIED' using errcode='42501';end if;
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
   or p_period<'2026-11' or p_period>to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'SKT_WATCH_INVALID_PERIOD' using errcode='22023';end if;
 select s.content_revision,s.captured_at,s.counts into v_revision,v_capture,v_counts
  from ppic_private.skt_form_observations s where s.period=p_period
  order by s.created_at desc,s.id desc limit 1;
 if not found then return jsonb_build_object('ok',true,'ready',false,'period',p_period,'latest',null);end if;
 select coalesce(jsonb_agg(jsonb_build_object('business_date',q.business_date,'checked_at',q.checked_at,
  'rows',q.rows) order by q.business_date desc),'[]'::jsonb) into v_statuses
  from (select business_date,checked_at,rows from ppic_private.skt_division_status_snapshots
   where period=p_period and content_revision=v_revision order by business_date desc limit 3) q;
 v_ctx:=ppic_private.robot_context(p_period);
 return jsonb_build_object('ok',true,'ready',true,'period',p_period,'latest',jsonb_build_object(
  'schema_version','ppic-skt-freshness-v1','revision',v_revision,'captured_at',v_capture,
  'counts',v_counts,'status_receipts',v_statuses,'ppic_coverage',coalesce(v_ctx->'coverage','[]'::jsonb),
  'ppic_evidence_hash',v_ctx->>'evidence_hash'));
end $fn$;

revoke all on function ppic_private.record_skt_division_status(text,text,date,timestamptz,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ppic_skt_freshness_status(uuid,text) from public,anon,authenticated;
grant execute on function public.ppic_skt_freshness_status(uuid,text) to service_role;
