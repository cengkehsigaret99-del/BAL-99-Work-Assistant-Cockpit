-- PPIC Giling & Verpack source-qualified WORKING figures 25 Nov.
-- No payroll processing, WIP physical handoff, quality release or warehouse posting.
create or replace function ppic_private.publish_production_working_25nov()
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,ppic_private as $fn$
declare
 v_div text;v_ver text;v_file text;v_lib text;v_data jsonb;v_hash text;v_doc text;
 v_ref jsonb;v_fact jsonb;v_receiptid uuid;v_facts jsonb;v_ref_list jsonb:='[]'::jsonb;
 v_receipts jsonb:='[]'::jsonb;v_key text;v_total bigint;v_issues jsonb;
 v_summary jsonb;v_reportid uuid;
begin
 perform ppic_private.robot_assert_writable_period('2026-11');
 perform pg_advisory_xact_lock(hashtextextended('ppic:giling:verpack:25nov',0));
 for v_div in select x from (values('GILING'),('VERPACK')) d(x) loop
  if v_div='GILING' then
   v_ver:='V013';
   v_file:='PR_BAL_GILING_NOVEMBER_2026_V13_CUTOFF_25NOV_MUTASI_SALDO_BERAT_NOMINAL_OPEN_RECON.xlsx';
   v_lib:='libfile_fde3_f-f7e95db70db48191907cb528dd8d0daf_651490bce7948191a073e9ed83bb583b';
   v_data:=jsonb_build_object('reported_cumulative_batang',14259800,'working_wage_rp',570938200,
    'daily_25_candidate_batang',443300,'date_mapping_provisional',true,
    'old_control_row_stale_batang',13814000,'physical_stock_verified',false);
   v_total:=14259800;
  else
   v_ver:='V004';
   v_file:='PR_BAL_VERPACK_NOVEMBER_2026_CUTOFF_25NOV_V4.xlsx';
   v_lib:='libfile_fde3_f-171c5e8f60b88191a96a199aa336bbf3_651490bce7948191a073e9ed83bb583b';
   v_data:=jsonb_build_object('working_consolidated_pack',1018010,'production_25_pack',30000,
    'weekly_block_replacement',true,'qc_delivery_to_bj_verified',false,'physical_balance_verified',false);
   v_total:=1018010;
  end if;
  v_hash:=encode(extensions.digest('PPIC_PRODUCTION_NOV25_EXTRACT|'||v_lib||'|'||v_data::text,'sha256'),'hex');
  v_doc:='PPIC_202611_'||v_div||'_EXT_'||left(v_hash,17);
  if not exists(select 1 from ppic_private.working_ledger_promotion_receipts
    where period='2026-11' and division=v_div and extract_sha256=v_hash) then
   if exists(select 1 from ppic_private.source_registry
    where period='2026-11' and division=v_div and (cutoff at time zone 'Asia/Jakarta')::date>date'2026-11-25')
   then raise exception 'PRODUCTION_25_NEWER_SOURCE_CONFLICT';end if;
   v_ref:=jsonb_build_object('document_id',v_doc,'title',v_file,'date','2026-11-25',
     'version',v_ver,'source_hash_kind','NORMALIZED_TEXT_EXTRACT',
     'sha256',v_hash,'library_file_id',v_lib,
     'scope','Production WORKING / OPEN RECON, not physically approved stock or final payroll.');
   insert into ppic_private.source_registry(document_id,division,period,cutoff,version,sha256,reconciliation_status,access_class,private_locator)
   values(v_doc,v_div,'2026-11','2026-11-25 00:00:00+07',v_ver,v_hash,
    'OPEN RECON','CONFIDENTIAL','library-extract:'||v_lib);
   v_key:=case when v_div='GILING' then 'cumulative_output_batang' else 'cumulative_output_pack' end;
   v_facts:=jsonb_build_array(jsonb_build_object('key',v_key,'label','Produksi kerja kumulatif',
      'value',v_total,'unit',case when v_div='GILING' then 'batang' else 'pack' end,
      'scope',v_div||' November','source_sheet',case when v_div='GILING' then '01_MUTASI_HARIAN' else '01_HARIAN' end,
      'source_range',case when v_div='GILING' then 'B4:I28' else 'B4:Q29' end,'quality','REFERENCE',
      'note','Provisional working only. Daily dates/week replacements not final; not warehouse movement.'));
   v_issues:=jsonb_build_array(jsonb_build_object('code','PRODUCTION_RECON_UNFINISHED','severity','HIGH',
      'title',case when v_div='GILING' then 'Giling provisional dates and stale bottom row'
                   else 'Verpack handover and weekly replacement mismatch' end,
      'detail',case when v_div='GILING' then
       '23-25Nov dates are mapped from internal Excel 16-18Nov; bottom total row 13814000 is stale vs last running daily 14259800.'
       else 'Verpack consolidated 1018010 is weekly replacement, not additional to previous 988060. BJ25 physical QC/handover not confirmed.' end,
      'fact_keys',jsonb_build_array(v_key),
      'source_sheet',case when v_div='GILING' then '01_MUTASI_HARIAN' else '01_HARIAN' end,
      'source_range',case when v_div='GILING' then 'B25:I35' else 'B20:Q27' end));
   v_fact:=jsonb_build_object('schema_version','ppic-robot-facts-v1','division',v_div,
    'period','2026-11','cutoff','2026-11-25','version',v_ver,'source_sha256',v_hash,
    'facts',v_facts,'issues',v_issues);
   perform ppic_private.robot_record_source_facts(v_doc,v_hash,v_fact);
   insert into ppic_private.working_ledger_promotion_receipts(period,division,cutoff,extract_sha256,
     source_document_id,source_library_file_id,source_workbook_version,snapshot_ids,summary)
   values('2026-11',v_div,'2026-11-25',v_hash,v_doc,v_lib,v_ver,'[]'::jsonb,v_data)
   returning id into v_receiptid;
   v_receipts:=v_receipts||jsonb_build_array(jsonb_build_object('division',v_div,'status','WORKING_REFERENCE_UPDATED','id',v_receiptid));
  else
   v_receipts:=v_receipts||jsonb_build_array(jsonb_build_object('division',v_div,'status','NO_CHANGE'));
  end if;
  v_ref_list:=v_ref_list||jsonb_build_array(jsonb_build_object('document_id',v_doc,'title',v_file,
    'version',v_ver,'date','2026-11-25','source_hash_kind','NORMALIZED_TEXT_EXTRACT',
    'library_file_id',v_lib));
 end loop;
 if not exists(select 1 from ppic_private.report_snapshots
  where period='2026-11' and report_key='02' and version='V002') then
  v_summary:=jsonb_build_object(
  'notice','Giling/Verpack 25 November: working Giling 14259800 batang and Verpack 1018010 pack. Neither is confirmed physical WIP or finished goods.',
  'report_state','WORKING / OPEN RECON',
  'tables',jsonb_build_array(
  jsonb_build_object('title','Produksi Giling dan Verpack sampai 25 November',
   'headers',jsonb_build_array('Divisi','Kumulatif kerja','Satuan','Status'),
   'rows',jsonb_build_array(
    jsonb_build_array('GILING',14259800,'batang','PROVISIONAL date mapping'),
    jsonb_build_array('VERPACK',1018010,'pack','WORKING weekly-replacement'),
    jsonb_build_array('Saldo WIP fisik',null,'batang/pack','BELUM DITIMBANG / BELUM SERAH TERIMA'))),
  jsonb_build_object('title','Pemeriksaan proses',
   'headers',jsonb_build_array('Temuan','Nilai','Keputusan'),
   'rows',jsonb_build_array(
    jsonb_build_array('Giling 25 Nov hasil Rabu',443300,'Tanggal sumber 18 Nov; PROVISIONAL'),
    jsonb_build_array('Giling bottom total lama',13814000,'STALE CONTROL ROW; not closing'),
    jsonb_build_array('Verpack 25 Nov',30000,'Do not add to BJ again; BJ book already counts own receipts'),
    jsonb_build_array('Kualitas/serah terima WIP',null,'QC/physical proof MISSING')))),
  'disclaimer','Do not treat cumulative output as physical stock, net good yield, payroll payable, or direct warehouse addition.',
  'source_refs',v_ref_list);
  insert into ppic_private.report_snapshots(report_key,period,title,cutoff,version,status,basis,payload,source_refs)
  values('02','2026-11','WIP Giling–Verpack','2026-11-25','V002','OPEN RECON','MIXED',
   v_summary,v_ref_list) returning id into v_reportid;
 end if;
 return jsonb_build_object('ok',true,'status','WORKING_REFERENCE_UPDATED',
 'cutoff','2026-11-25','divisions',v_receipts,'physical_stock_or_payroll_posted',false);
end $fn$;
revoke all on function ppic_private.publish_production_working_25nov() from public,anon,authenticated,service_role;
