-- PPIC Stage 2: immutable, source-backed ANALYTICAL reviews.
-- No write to stock, DO, money, payroll, CK-1 or existing report snapshots.
create table if not exists ppic_private.stage2_review_snapshots (
  id uuid primary key default gen_random_uuid(),
  period text not null check (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' and period >= '2026-11'),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('OPEN_RECON','BLOCKED')),
  source_count integer not null check (source_count between 1 and 10),
  archived_source_count integer not null check (archived_source_count between 0 and 10),
  coverage jsonb not null check (jsonb_typeof(coverage)='array'),
  source_manifest jsonb not null check (jsonb_typeof(source_manifest)='array'),
  indicators jsonb not null check (jsonb_typeof(indicators)='object'),
  checks jsonb not null check (jsonb_typeof(checks)='array'),
  warnings jsonb not null check (jsonb_typeof(warnings)='array'),
  created_at timestamptz not null default now(),
  unique(period,evidence_hash)
);
create index if not exists stage2_review_snapshots_period_created_idx on ppic_private.stage2_review_snapshots(period,created_at desc);
alter table ppic_private.stage2_review_snapshots enable row level security;
revoke all on ppic_private.stage2_review_snapshots from public,anon,authenticated,service_role;

create or replace function ppic_private.stage2_metric_num(p_indicators jsonb,p_division text,p_key text)
returns numeric language sql stable security invoker
set search_path=pg_catalog,ppic_private
as $fn$
 select (x->>'value')::numeric
 from jsonb_array_elements(
  case when jsonb_typeof(p_indicators->p_division)='array' then p_indicators->p_division else '[]'::jsonb end
 ) x
 where x->>'key'=p_key and x->>'quality'='SOURCE' and jsonb_typeof(x->'value')='number'
 limit 1
$fn$;

create or replace function ppic_private.stage2_refresh(p_period text)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,ppic_private
as $fn$
declare
 v_ctx jsonb; v_hash text; v_enabled boolean; v_id uuid;
 v_sources jsonb:='[]'::jsonb; v_indicators jsonb:='{}'::jsonb; v_coverage jsonb;
 v_checks jsonb:='[]'::jsonb; v_warnings jsonb:='[]'::jsonb;
 v_metrics jsonb; v_doc_ids jsonb:='{}'::jsonb; v_dates jsonb:='{}'::jsonb;
 v_import_status text; v_report_status text; v_count integer:=0; v_archive integer:=0; v_blockers integer:=0;
 s record; c record; v_row jsonb; v_div text; v_book numeric; v_open numeric; v_in numeric; v_out numeric;
 v_do numeric; v_bj numeric; v_tsg numeric; v_pita numeric; v_material numeric;
 v_check_status text; v_status text;
begin
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_period < '2026-11'
 or p_period > to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'STAGE2_INVALID_PERIOD' using errcode='22023'; end if;
 select enabled into v_enabled from ppic_private.robot_config limit 1;
 if v_enabled is distinct from true then return jsonb_build_object('ok',false,'status','DISABLED','period',p_period); end if;
 v_ctx:=ppic_private.robot_context(p_period);
 v_hash:=v_ctx->>'evidence_hash';
 if v_hash is null or v_hash !~ '^[a-f0-9]{64}$' then
  raise exception 'STAGE2_EVIDENCE_MISSING' using errcode='22023'; end if;
 select id into v_id from ppic_private.stage2_review_snapshots where period=p_period and evidence_hash=v_hash limit 1;
 if found then
  return jsonb_build_object('ok',true,'status','NO_CHANGE','id',v_id,'period',p_period,'evidence_hash',v_hash);
 end if;
 v_coverage:=coalesce(v_ctx->'coverage','[]'::jsonb);
 if jsonb_typeof(v_coverage)<>'array' then raise exception 'STAGE2_COVERAGE_INVALID'; end if;
 for s in select * from ppic_private.robot_selected_sources(p_period) loop
  v_count:=v_count+1;
  select j.status,j.report_status into v_import_status,v_report_status
  from ppic_private.auto_import_jobs j
  where j.document_id=s.document_id and j.period=p_period and j.status in ('IMPORTED','DUPLICATE')
  order by j.completed_at desc nulls last limit 1;
  if v_import_status in ('IMPORTED','DUPLICATE') and v_report_status='ARCHIVE_ONLY' then v_archive:=v_archive+1; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
   'key',f->>'key','label',left(coalesce(f->>'label',''),130),
   'value',f->'value','unit',left(coalesce(f->>'unit',''),30),
   'quality',f->>'quality','scope',left(coalesce(f->>'scope',''),140),
   'source_sheet',left(coalesce(f->>'source_sheet',''),80),
   'source_range',left(coalesce(f->>'source_range',''),50),
   'document_id',s.document_id
  ) order by f->>'key'),'[]'::jsonb) into v_metrics
  from jsonb_array_elements(
   case when jsonb_typeof(s.fact_payload->'facts')='array' then s.fact_payload->'facts' else '[]'::jsonb end
  ) f
  where (s.division='GILING' and f->>'key' in ('cumulative_output_batang'))
     or (s.division='VERPACK' and f->>'key' in ('cumulative_output_pack'))
     or (s.division='BARANG JADI' and f->>'key' in ('book_opening_pack','book_receipt_pack','book_delivery_pack','book_closing_pack','reference_receipt_pack','indicative_closing_pack','sku_c_025_book_pack'))
     or (s.division='DO' and f->>'key' in ('delivered_pack','verified_receivable','working_sales_value'))
     or (s.division='TSG' and f->>'key' in ('book_opening_kg','book_incoming_kg','transferred_to_giling_kg','book_closing_kg'))
     or (s.division='CUKAI' and f->>'key' in ('book_opening_keping','book_receipt_keping','book_used_keping','book_closing_keping','factory_estimate_keping','not_arrived_keping'))
     or (s.division='KAS BANK' and f->>'key' in ('opening_balance','indicative_balance'))
     or (s.division='BAHAN BAKU' and f->>'key' in ('material_op_07_closing','partial_closing_reference_value'));
  v_indicators:=v_indicators||jsonb_build_object(s.division,v_metrics);
  v_doc_ids:=v_doc_ids||jsonb_build_object(s.division,s.document_id);
  v_dates:=v_dates||jsonb_build_object(s.division,s.cutoff::text);
  v_sources:=v_sources||jsonb_build_array(jsonb_build_object(
   'division',s.division,'document_id',s.document_id,'cutoff',s.cutoff,'version',s.version,
   'has_facts',s.fact_payload is not null,'archive_status',coalesce(v_import_status,'NOT_FROM_THIS_IMPORT_BATCH'),
   'report_status',coalesce(v_report_status,'REPORT_PROCESSED_SEPARATELY')));
  v_import_status:=null;v_report_status:=null;
 end loop;
 if v_count=0 then raise exception 'STAGE2_NO_VERIFIED_SOURCES'; end if;
 for c in select value as entry from jsonb_array_elements(v_coverage) loop
  v_row:=c.entry;v_div:=v_row->>'division';
  if v_row->>'report_status'='METADATA_CONFLICT' then
   v_blockers:=v_blockers+1;
   v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
    'code','METADATA_CONFLICT','severity','HIGH','division',v_div,
    'message','Tanggal atau identitas laporan aktif bertentangan dengan sumber; perlu koreksi, jangan finalkan payroll.',
    'source_cutoff',v_row->>'source_cutoff','report_cutoff',v_row->>'report_cutoff'));
  elsif coalesce(v_row->>'selection_status','')<>'READY' or coalesce((v_row->>'has_facts')::boolean,false)=false then
   v_blockers:=v_blockers+1;
   v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
    'code','FACTS_MISSING','severity','HIGH','division',v_div,
    'message','Sumber terpilih belum memiliki fakta yang dapat diverifikasi.'));
  elsif nullif(v_row->>'report_cutoff','') is null then
   v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
    'code','REPORT_NOT_AVAILABLE','severity','MEDIUM','division',v_div,
    'message','Sumber tersedia, tetapi laporan aktif yang sebanding belum tercatat.'));
  elsif (v_row->>'report_cutoff')::date < (v_row->>'source_cutoff')::date then
   v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
    'code','ACTIVE_REPORT_LAGS_SOURCE','severity','MEDIUM','division',v_div,
    'message','Cut-off laporan aktif lebih lama daripada data sumber terpilih. Arsip terbaru tidak otomatis mengganti snapshot resmi.',
    'source_cutoff',v_row->>'source_cutoff','report_cutoff',v_row->>'report_cutoff'));
  end if;
 end loop;
 -- Closing book reconciliations compare SOURCE facts from the SAME document.
 v_open:=ppic_private.stage2_metric_num(v_indicators,'BARANG JADI','book_opening_pack');
 v_in:=ppic_private.stage2_metric_num(v_indicators,'BARANG JADI','book_receipt_pack');
 v_out:=ppic_private.stage2_metric_num(v_indicators,'BARANG JADI','book_delivery_pack');
 v_book:=ppic_private.stage2_metric_num(v_indicators,'BARANG JADI','book_closing_pack');
 v_check_status:=case when v_open is null or v_in is null or v_out is null or v_book is null then 'INSUFFICIENT'
                      when v_open+v_in-v_out=v_book then 'PASS' else 'FAIL' end;
 v_checks:=v_checks||jsonb_build_array(jsonb_build_object('code','BJ_BOOK_MUTATION','state',v_check_status,'division','BARANG JADI',
  'message','Saldo awal + penerimaan buku - pengeluaran buku = saldo akhir buku; tidak membuktikan stok fisik.',
  'source_document_id',v_doc_ids->>'BARANG JADI','computed',case when v_check_status='INSUFFICIENT' then null else v_open+v_in-v_out end,'reported',v_book,'unit','pack'));
 if v_check_status='FAIL' then v_blockers:=v_blockers+1; end if;
 v_do:=ppic_private.stage2_metric_num(v_indicators,'DO','delivered_pack');
 v_bj:=ppic_private.stage2_metric_num(v_indicators,'BARANG JADI','book_delivery_pack');
 v_check_status:=case when v_do is null or v_bj is null then 'INSUFFICIENT'
                      when v_dates->>'DO' is distinct from v_dates->>'BARANG JADI' then 'DATE_MISMATCH'
                      when v_do=v_bj then 'PASS' else 'FAIL' end;
 v_checks:=v_checks||jsonb_build_array(jsonb_build_object('code','DO_BJ_DELIVERY_BOOK','state',v_check_status,'division','DO / BARANG JADI',
  'message','Perbandingan jumlah DO dan pengeluaran BJ hanya bila cut-off sama; bukan konfirmasi barang sudah diterima customer.',
  'source_document_ids',jsonb_build_array(v_doc_ids->>'DO',v_doc_ids->>'BARANG JADI'),'do_pack',v_do,'bj_pack',v_bj,'unit','pack'));
 if v_check_status='FAIL' then v_blockers:=v_blockers+1; end if;
 v_open:=ppic_private.stage2_metric_num(v_indicators,'TSG','book_opening_kg');
 v_in:=ppic_private.stage2_metric_num(v_indicators,'TSG','book_incoming_kg');
 v_out:=ppic_private.stage2_metric_num(v_indicators,'TSG','transferred_to_giling_kg');
 v_book:=ppic_private.stage2_metric_num(v_indicators,'TSG','book_closing_kg');
 v_check_status:=case when v_open is null or v_in is null or v_out is null or v_book is null then 'INSUFFICIENT'
                      when v_open+v_in-v_out=v_book then 'PASS' else 'FAIL' end;
 v_checks:=v_checks||jsonb_build_array(jsonb_build_object('code','TSG_BOOK_MUTATION','state',v_check_status,'division','TSG',
  'message','Transfer ke Giling mengurangi buku gudang TSG, tetapi bukan bukti konsumsi aktual Giling.',
  'source_document_id',v_doc_ids->>'TSG','computed',case when v_check_status='INSUFFICIENT' then null else v_open+v_in-v_out end,'reported',v_book,'unit','kg'));
 if v_check_status='FAIL' then v_blockers:=v_blockers+1; end if;
 v_open:=ppic_private.stage2_metric_num(v_indicators,'CUKAI','book_opening_keping');
 v_in:=ppic_private.stage2_metric_num(v_indicators,'CUKAI','book_receipt_keping');
 v_out:=ppic_private.stage2_metric_num(v_indicators,'CUKAI','book_used_keping');
 v_book:=ppic_private.stage2_metric_num(v_indicators,'CUKAI','book_closing_keping');
 v_check_status:=case when v_open is null or v_in is null or v_out is null or v_book is null then 'INSUFFICIENT'
                      when v_open+v_in-v_out=v_book then 'PASS' else 'FAIL' end;
 v_checks:=v_checks||jsonb_build_array(jsonb_build_object('code','CUKAI_BOOK_MUTATION','state',v_check_status,'division','CUKAI',
  'message','Persamaan saldo buku pita tidak membuktikan penerimaan fisik; pisahkan 600.000 keping belum tiba.',
  'source_document_id',v_doc_ids->>'CUKAI','computed',case when v_check_status='INSUFFICIENT' then null else v_open+v_in-v_out end,'reported',v_book,'unit','keping'));
 if v_check_status='FAIL' then v_blockers:=v_blockers+1; end if;
 v_checks:=v_checks||jsonb_build_array(jsonb_build_object('code','GILING_VERPACK_BJ_HANDOVER','state','NOT_COMPARABLE','division','GILING / VERPACK / BARANG JADI',
  'message','Hasil Giling (batang), Verpack (pack), penerimaan BJ, dan DO memiliki basis dan cut-off berbeda. Perlu serah-terima per SKU/lot, QC, rijek dan alokasi. Jangan membuat selisih palsu dari total kumulatif.'));
 v_material:=ppic_private.stage2_metric_num(v_indicators,'BAHAN BAKU','material_op_07_closing');
 if v_material=0 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','MATERIAL_BOOK_ZERO','severity','HIGH','division','BAHAN BAKU',
  'message','Saldo buku OPP PACK BAL9 tercatat 0; periksa barang pengganti, PO aktif dan opname fisik sebelum menyimpulkan produksi harus berhenti.')); end if;
 v_book:=ppic_private.stage2_metric_num(v_indicators,'BARANG JADI','sku_c_025_book_pack');
 if v_book<0 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','BJ_NEGATIVE_BOOK','severity','HIGH','division','BARANG JADI',
  'message','C-025 BAL9 bersaldo buku negatif; rekonsiliasi penerimaan, DO dan fisik sebelum alokasi.')); end if;
 v_pita:=ppic_private.stage2_metric_num(v_indicators,'CUKAI','not_arrived_keping');
 if v_pita>0 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','CUKAI_PITA_NOT_ARRIVED','severity','HIGH','division','CUKAI',
  'message','Ada pita tercatat dalam buku namun belum dikonfirmasi tiba di pabrik; jangan dianggap stok pita fisik siap pakai.')); end if;
 v_status:=case when v_blockers>0 then 'BLOCKED' else 'OPEN_RECON' end;
 insert into ppic_private.stage2_review_snapshots(period,evidence_hash,status,source_count,archived_source_count,
  coverage,source_manifest,indicators,checks,warnings)
 values(p_period,v_hash,v_status,v_count,v_archive,v_coverage,v_sources,v_indicators,v_checks,v_warnings)
 on conflict(period,evidence_hash) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from ppic_private.stage2_review_snapshots where period=p_period and evidence_hash=v_hash;
  return jsonb_build_object('ok',true,'status','NO_CHANGE','id',v_id,'period',p_period,'evidence_hash',v_hash);
 end if;
 return jsonb_build_object('ok',true,'status','ANALYTICS_REFRESHED','id',v_id,'period',p_period,
   'evidence_hash',v_hash,'source_count',v_count,'archived_source_count',v_archive,
   'checks_count',jsonb_array_length(v_checks),'warnings_count',jsonb_array_length(v_warnings),
   'business_status',v_status);
end $fn$;

create or replace function public.ppic_stage2_status(p_owner uuid,p_period text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,ppic_private
as $fn$
declare s ppic_private.stage2_review_snapshots%rowtype;
begin
 if not exists(select 1 from ppic_private.owner_access where owner_user_id=p_owner)
 then raise exception 'STAGE2_OWNER_DENIED' using errcode='42501'; end if;
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_period < '2026-11'
 or p_period > to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'STAGE2_INVALID_PERIOD' using errcode='22023'; end if;
 select * into s from ppic_private.stage2_review_snapshots
 where period=p_period order by created_at desc,id desc limit 1;
 if not found then return jsonb_build_object('ok',true,'period',p_period,'ready',false,'latest',null); end if;
 return jsonb_build_object('ok',true,'period',p_period,'ready',true,'latest',jsonb_build_object(
 'id',s.id,'schema_version','ppic-stage2-review-v1','evidence_hash',s.evidence_hash,
 'status',s.status,'source_count',s.source_count,'archived_source_count',s.archived_source_count,
 'coverage',s.coverage,'source_manifest',s.source_manifest,'indicators',s.indicators,
 'checks',s.checks,'warnings',s.warnings,'created_at',s.created_at));
end $fn$;

revoke all on function ppic_private.stage2_metric_num(jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function ppic_private.stage2_refresh(text) from public,anon,authenticated,service_role;
revoke all on function public.ppic_stage2_status(uuid,text) from public,anon,authenticated;
grant execute on function public.ppic_stage2_status(uuid,text) to service_role;
