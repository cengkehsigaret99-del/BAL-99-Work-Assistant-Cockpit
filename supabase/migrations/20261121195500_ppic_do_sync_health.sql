-- PR BAL PPIC: read-only health status for automatic DO WORKING analytics.
-- Never modifies DO/SJ, Cukai, Barang Jadi, invoice, kas or closing.
create or replace function public.ppic_do_auto_sync_status(p_owner uuid,p_period text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,ppic_private
as $fn$
declare
 v_receipt ppic_private.do_auto_publish_receipts%rowtype;
 v_do ppic_private.do_customer_snapshots%rowtype;
 v_daily ppic_private.daily_ledger_snapshots%rowtype;
 v_report ppic_private.report_snapshots%rowtype;
 v_settings ppic_private.do_auto_publish_settings%rowtype;
 v_num_lines integer; v_num_sj integer; v_sum_pack bigint; v_sum_nominal bigint;
 v_daily_pack bigint; v_daily_nominal bigint;v_source_fact_pack numeric;v_source_fact_sales numeric;
 v_sj_last integer;v_sj_last_lines integer;
 v_bj_cutoff date;v_bj_pack numeric;
 v_checks jsonb:='[]'::jsonb;v_all boolean;v_name text; v_status text;
 v_source_exists boolean;v_fact_exists boolean;
begin
 if not exists(select 1 from ppic_private.owner_access o where o.owner_user_id=p_owner)
 then raise exception 'DO_SYNC_OWNER_DENIED' using errcode='42501';end if;
 if p_period is null or p_period!~'^20[0-9]{2}-(0[1-9]|1[0-2])$'
   or p_period<'2026-11' or p_period>to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'DO_SYNC_INVALID_PERIOD' using errcode='22023';end if;

 select * into v_settings from ppic_private.do_auto_publish_settings where id=1;
 select * into v_receipt from ppic_private.do_auto_publish_receipts
 where period=p_period order by source_cutoff desc,published_at desc,id desc limit 1;
 if not found then
  return jsonb_build_object('ok',true,'ready',false,'period',p_period,
   'configured',coalesce(v_settings.enabled,false),
   'latest',null);
 end if;
 select * into v_do from ppic_private.do_customer_snapshots where id=v_receipt.details_snapshot_id;
 select * into v_daily from ppic_private.daily_ledger_snapshots where id=v_receipt.daily_snapshot_id;
 select * into v_report from ppic_private.report_snapshots where id=v_receipt.report_snapshot_id;

 if v_do.id is not null and jsonb_typeof(v_do.rows)='array' then
  select count(*)::int,count(distinct (x->>'sj')::int),
    sum((x->>'pack')::bigint),sum((x->>'nominal')::bigint),
    max((x->>'sj')::int)
  into v_num_lines,v_num_sj,v_sum_pack,v_sum_nominal,v_sj_last
  from jsonb_array_elements(v_do.rows) x;
  select count(*)::int into v_sj_last_lines from jsonb_array_elements(v_do.rows) x
   where (x->>'sj')::int=v_sj_last;
 end if;
 if v_daily.id is not null and jsonb_typeof(v_daily.payload->'entries')='array' then
  select sum((x->>1)::bigint),sum((x->>2)::bigint)
  into v_daily_pack,v_daily_nominal from jsonb_array_elements(v_daily.payload->'entries') x;
 end if;
 select exists(select 1 from ppic_private.source_registry s
  where s.document_id=v_receipt.source_document_id
  and s.sha256=v_receipt.source_sha256 and s.period=v_receipt.period and s.division='DO')
 into v_source_exists;

 select exists(select 1 from ppic_private.robot_source_facts f
  where f.document_id=v_receipt.source_document_id and f.source_sha256=v_receipt.source_sha256)
 into v_fact_exists;
 select max((x->>'value')::numeric) filter (where x->>'key'='delivered_pack' and x->>'quality'='SOURCE'),
        max((x->>'value')::numeric) filter (where x->>'key'='working_sales_value' and x->>'quality'='REFERENCE')
 into v_source_fact_pack,v_source_fact_sales
 from ppic_private.robot_source_facts f
 cross join lateral jsonb_array_elements(coalesce(f.payload->'facts','[]'::jsonb)) x
 where f.document_id=v_receipt.source_document_id
   and f.source_sha256=v_receipt.source_sha256;

 with r as (
 select s.cutoff,s.fact_payload
 from ppic_private.robot_selected_sources(p_period) s where s.division='BARANG JADI'
 )
 select max(r.cutoff),max((x->>'value')::numeric) filter
   (where x->>'key'='book_delivery_pack' and x->>'quality'='SOURCE')
 into v_bj_cutoff,v_bj_pack
 from r cross join lateral jsonb_array_elements(coalesce(r.fact_payload->'facts','[]'::jsonb)) x;

 v_checks:=jsonb_build_array(
  jsonb_build_object('code','SOURCE_REGISTERED','pass',v_source_exists),
  jsonb_build_object('code','FACTS_MATCH','pass',v_fact_exists
   and v_source_fact_pack=v_receipt.total_pack
   and v_source_fact_sales=v_receipt.total_nominal),
  jsonb_build_object('code','FULL_DO_LINES','pass',v_do.id is not null
   and v_do.period=p_period and v_do.cutoff=v_receipt.source_cutoff
   and v_do.source_document_id=v_receipt.source_document_id
   and v_num_lines=v_receipt.total_lines and v_num_sj=v_receipt.total_sj
   and v_sum_pack=v_receipt.total_pack and v_sum_nominal=v_receipt.total_nominal),
  jsonb_build_object('code','DAILY_DO_TOTALS','pass',v_daily.id is not null
   and v_daily.cutoff=v_receipt.source_cutoff and v_daily.period=p_period
   and v_daily_pack=v_receipt.total_pack and v_daily_nominal=v_receipt.total_nominal),
  jsonb_build_object('code','REPORT_DO_09','pass',v_report.id is not null
   and v_report.report_key='09' and v_report.period=p_period
   and v_report.cutoff=v_receipt.source_cutoff
   and v_report.payload#>>'{tables,0,rows,0,1}'=v_receipt.total_sj::text
   and v_report.payload#>>'{tables,0,rows,4,1}'=v_receipt.total_pack::text
   and v_report.payload#>>'{tables,0,rows,5,1}'=v_receipt.total_nominal::text));
 v_all:=(select bool_and(x->>'pass'='true') from jsonb_array_elements(v_checks) x);
 -- The most recent period snapshots must still point to this precise publication.
 if v_all then
  v_all := v_do.id=(select id from ppic_private.do_customer_snapshots
      where period=p_period order by cutoff desc,created_at desc,id desc limit 1)
   and v_report.id=(select id from ppic_private.report_snapshots
      where period=p_period and report_key='09' order by cutoff desc,created_at desc,id desc limit 1)
   and v_daily.id=(select id from ppic_private.daily_ledger_snapshots
      where period=p_period and division='DO' order by cutoff desc,created_at desc,id desc limit 1);
 end if;
 v_status:=case when v_all then 'SYNCED_WORKING' else 'INTEGRITY_CHECK_FAILED' end;
 return jsonb_build_object('ok',true,'ready',true,'period',p_period,
  'configured',coalesce(v_settings.enabled,false),
  'latest',jsonb_build_object(
    'status',v_status,'schema_version','ppic-do-auto-sync-v1',
    'cutoff',v_receipt.source_cutoff,'published_at',v_receipt.published_at,
    'source_version',v_receipt.source_version,
    'report_version',v_receipt.analytics_version,
    'total_sj',v_receipt.total_sj,'total_lines',v_receipt.total_lines,
    'total_pack',v_receipt.total_pack,'total_nominal',v_receipt.total_nominal,
    'last_sj',v_sj_last,'last_sj_lines',v_sj_last_lines,
    'sample_source','WORKING_PRICE_NOT_FINAL_INVOICE',
    'checks',v_checks,'is_latest',v_all,
    'bj_source_cutoff',v_bj_cutoff,'bj_book_delivery_pack',v_bj_pack,
    'cross_division_state',case
       when v_bj_cutoff is null then 'BJ_SOURCE_MISSING'
       when v_bj_cutoff<>v_receipt.source_cutoff then 'CUTOFF_DIFFERENT'
       when v_bj_pack is null then 'BJ_BOOK_DELIVERY_MISSING'
       when v_bj_pack=v_receipt.total_pack then 'BOOK_MATCH_SAME_DATE'
       else 'BOOK_DIFFERENCE_SAME_DATE' end,
    'official_books_changed',false,
    'pending',jsonb_build_array(
      jsonb_build_object('code','BJ_QC_AND_CUTOFF','owner_role','Admin Barang Jadi / QC','description','Cocokkan dokumen SJ terbaru, mutasi buku Barang Jadi dan serah-terima fisik'),
      jsonb_build_object('code','KAS_INVOICE','owner_role','Admin Kas Bank / Customer','description','Rekonsiliasi nominal SJ terbaru dengan invoice dan alokasi pembayaran'),
      jsonb_build_object('code','CASH_AND_STOCK_NOT_POSTED','owner_role','Owner / PPIC','description','Tidak ada posting otomatis ke kas, stok fisik atau closing'))
  ));
end $fn$;

revoke all on function public.ppic_do_auto_sync_status(uuid,text) from public,anon,authenticated;
grant execute on function public.ppic_do_auto_sync_status(uuid,text) to service_role;
