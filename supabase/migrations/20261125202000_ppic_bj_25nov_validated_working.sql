-- Balanced 25-Nov Barang Jadi working ledger: only append after all 39 SKU and 41 DO lines are consistent.
create or replace function ppic_private.publish_bj_working_25nov(p_source jsonb)
returns jsonb
language plpgsql security invoker
set search_path=pg_catalog,ppic_private
as $fn$
declare
 v_hash text;v_doc text;v_version text:='V016';
 v_library text:='libfile_fde3_f-330599a18b508191bde36a4e381654bf_651490bce7948191a073e9ed83bb583b';
 v_ref jsonb;v_payload jsonb;v_p jsonb;v_daily_payload jsonb;v_report_payload jsonb;
 v_meta jsonb;v_m jsonb;v_e jsonb;v_daily jsonb;v_table_rows jsonb;
 v_sku_count int;v_receipt_count int;v_out_count int;v_negative int;v_mismatch int;
 v_open bigint;v_in bigint;v_out bigint;v_close bigint;v_nominal numeric;v_bj_id uuid;v_daily_id uuid;
 v_report_id uuid;v_sku text;v_facts jsonb;v_receipt_id uuid;v_do_count integer;
begin
 perform ppic_private.robot_assert_writable_period('2026-11');
 perform pg_advisory_xact_lock(hashtextextended('ppic:bj:working:25nov',0));
 if p_source is null or jsonb_typeof(p_source)<>'object'
   or jsonb_typeof(p_source->'skus')<>'array'
   or jsonb_typeof(p_source->'receipts')<>'array'
   or jsonb_typeof(p_source->'dispatches')<>'array'
   or jsonb_array_length(p_source->'skus')<>39
   or jsonb_array_length(p_source->'dispatches')<>41
   or jsonb_array_length(p_source->'receipts') not between 38 and 48
   or octet_length(p_source::text)>350000
 then raise exception 'BJ_25_INVALID_EXTRACT';end if;
 -- Validate row shapes, dates, units and prices before casting/comparison.
 if exists(select 1 from jsonb_array_elements(p_source->'skus')x
  where x->>'sku' !~ '^(C-[0-9]{3}|D-01|G-01)$'
   or x->>'opening' !~ '^-?[0-9]{1,10}$'
   or x->>'incoming' !~ '^[0-9]{1,10}$'
   or x->>'outgoing' !~ '^[0-9]{1,10}$'
   or x->>'closing' !~ '^-?[0-9]{1,10}$'
   or (x->>'carton_size' is not null and x->>'carton_size' !~ '^[0-9]{1,5}$')
   or (x->>'cost' is not null and x->>'cost' !~ '^[0-9]{1,8}([.][0-9]{1,8})?$')
   or length(coalesce(x->>'brand',''))>180)
 or exists(select 1 from jsonb_array_elements(p_source->'receipts') x
  where x->>'date' !~ '^2026-11-([0-2][0-9]|30)$'
   or x->>'sku' !~ '^(C-[0-9]{3}|D-01|G-01)$'
   or x->>'pack' !~ '^[1-9][0-9]{0,9}$')
 or exists(select 1 from jsonb_array_elements(p_source->'dispatches') x
  where x->>'date' !~ '^2026-11-([0-2][0-9]|30)$'
   or x->>'sku' !~ '^(C-[0-9]{3}|D-01|G-01)$'
   or x->>'sj' !~ '^[1-9][0-9]{0,8}$'
   or x->>'pack' !~ '^[1-9][0-9]{0,9}$')
 then raise exception 'BJ_25_INVALID_EXTRACT_FIELD';end if;
 select count(*),sum((x->>'opening')::bigint),sum((x->>'incoming')::bigint),
 sum((x->>'outgoing')::bigint),sum((x->>'closing')::bigint),
 sum((x->>'closing')::numeric*(nullif(x->>'cost',''))::numeric),
 count(*) filter (where (x->>'closing')::bigint<0)
 into v_sku_count,v_open,v_in,v_out,v_close,v_nominal,v_negative
 from jsonb_array_elements(p_source->'skus') x;
 if v_sku_count<>39 or v_open<>148210 or v_in<>1018110 or v_out<>756595 or v_close<>409725
   or v_negative<>3 or v_open+v_in-v_out<>v_close
 then raise exception 'BJ_25_BOOK_CONTROL_FAILED';end if;
 if exists(select 1 from jsonb_array_elements(p_source->'skus') x
    where (x->>'opening')::bigint+(x->>'incoming')::bigint-
      (x->>'outgoing')::bigint<>(x->>'closing')::bigint)
 then raise exception 'BJ_25_SKU_BALANCE_FAILED';end if;
 -- Every inbound/outbound event must add up to the *same SKU* card position.
 with receipts as(
 select x->>'sku' sku,sum((x->>'pack')::bigint) q from jsonb_array_elements(p_source->'receipts') x group by x->>'sku'
 ),dispatches as(
 select x->>'sku' sku,sum((x->>'pack')::bigint) q from jsonb_array_elements(p_source->'dispatches') x group by x->>'sku'
 ),sc as(
 select x->>'sku' sku,(x->>'incoming')::bigint incoming,(x->>'outgoing')::bigint outgoing from jsonb_array_elements(p_source->'skus')x
 )
 select count(*) into v_mismatch from sc left join receipts r using(sku) left join dispatches d using(sku)
 where sc.incoming<>coalesce(r.q,0) or sc.outgoing<>coalesce(d.q,0);
 if v_mismatch<>0 then raise exception 'BJ_25_EVENT_TO_SKU_MISMATCH';end if;
 -- Cross-division verification: full multiset of date/SJ/SKU/pack exactly equals newly published DO V016.
 with bj as(select x->>'date' day,x->>'sj' sj,x->>'sku' sku,(x->>'pack')::bigint pack from jsonb_array_elements(p_source->'dispatches')x),
 d as(select x->>'date' day,x->>'sj' sj,x->>'sku' sku,(x->>'pack')::bigint pack
      from ppic_private.do_customer_snapshots s,lateral jsonb_array_elements(s.rows)x
      where s.period='2026-11' and s.version='V016'),
 mm as((select * from bj except all select * from d) union all (select * from d except all select * from bj))
 select count(*) into v_mismatch from mm;
 if v_mismatch<>0 then raise exception 'BJ_25_DO_LINE_NOT_EQUAL';end if;
 select count(*) into v_do_count from ppic_private.do_customer_snapshots
 where period='2026-11' and version='V016' and cutoff='2026-11-25';
 if v_do_count<>1 then raise exception 'BJ_25_DO_SNAPSHOT_ABSENT';end if;

 v_hash:=encode(extensions.digest('BJ_NORMALIZED_EXTRACT|'||v_library||'|'||p_source::text,'sha256'),'hex');
 v_doc:='PPIC_202611_BARANG_JADI_EXT_'||left(v_hash,16);
 if exists(select 1 from ppic_private.working_ledger_promotion_receipts where period='2026-11'
   and division='BARANG JADI' and extract_sha256=v_hash) then
 return jsonb_build_object('ok',true,'status','NO_CHANGE','division','BARANG JADI',
   'cutoff','2026-11-25','extract_sha256',v_hash);end if;
 if exists(select 1 from ppic_private.finished_goods_snapshots
    where period='2026-11' and (version=v_version or cutoff>date '2026-11-25')) then
  raise exception 'BJ_25_NEWER_VERSION_CONFLICT';end if;
 v_ref:=jsonb_build_object('document_id',v_doc,'title','PR_BAL_BARANG_JADI_NOVEMBER_2026_V018_CUTOFF_25NOV_OPEN_RECON.xlsx',
 'version','V018','cutoff','2026-11-25','sha256',v_hash,'source_hash_kind','NORMALIZED_TEXT_EXTRACT',
 'library_file_id',v_library,'status','BUKU/OPEN_RECON','scope',
 'Verified extracted 39 SKU, 39 receipts and 41 DO lines against DO V016, not binary SHA, QC not confirmed');

 insert into ppic_private.source_registry(document_id,division,period,cutoff,version,sha256,reconciliation_status,access_class,private_locator)
 values(v_doc,'BARANG JADI','2026-11','2026-11-25 00:00:00+07','V018',v_hash,
   'OPEN RECON','CONFIDENTIAL','library-extract:'||v_library||';not-binary-sha256');
 v_facts:=jsonb_build_object('schema_version','ppic-robot-facts-v1','division','BARANG JADI',
 'period','2026-11','cutoff','2026-11-25','version','V018','source_sha256',v_hash,
 'facts',jsonb_build_array(
 jsonb_build_object('key','book_opening_pack','label','Saldo awal November','value',v_open,'unit','pack','scope','Barang Jadi buku','source_sheet','01_REKAP_39_SKU','source_range','B4:Z44','quality','SOURCE','note','Opening from October; no physical count approval'),
 jsonb_build_object('key','book_receipt_pack','label','Hasil masuk sampai 25 November','value',v_in,'unit','pack','scope','Barang Jadi buku','source_sheet','01_REKAP_39_SKU','source_range','B4:Z44','quality','SOURCE','note','Includes 30000 C003 on 25 Nov; not QC-available inventory'),
 jsonb_build_object('key','book_delivery_pack','label','Pengeluaran DO buku','value',v_out,'unit','pack','scope','Barang Jadi buku','source_sheet','03_MUTASI_SJ','source_range','B4:M46','quality','SOURCE','note','41 matching DO V016 rows; no duplicate SJ338'),
 jsonb_build_object('key','book_closing_pack','label','Saldo buku neto','value',v_close,'unit','pack','scope','Barang Jadi buku','source_sheet','01_REKAP_39_SKU','source_range','B44:Z44','quality','SOURCE','note','Neto includes three negative SKU totaling -455; not QC/free stock'),
 jsonb_build_object('key','book_closing_reference_value','label','Nilai persediaan kerja','value',round(v_nominal,2),'unit','Rp','scope','Barang Jadi buku','source_sheet','RANKING 25 NOV','source_range','B17:J19','quality','REFERENCE','note','Historical/proxy SKU costs, not November actual HPP'),
 jsonb_build_object('key','verified_free_stock_pack','label','Stok bebas QC sah','value',null,'unit','pack','scope','Barang Jadi buku','source_sheet','05_VALIDASI_SUMBER','source_range','B4:E18','quality','MISSING','note','QC physical count and 3 negative SKU unresolved')
 ),'issues',jsonb_build_array(
 jsonb_build_object('code','BJ_NEGATIVE_SKU','severity','HIGH','title','Three negative stock cards',
  'detail','C019 -5; C023 -230; C025 -220 pack, total -455. Not cleared by cross-SKU netting.',
  'fact_keys',jsonb_build_array('book_closing_pack','verified_free_stock_pack'),
  'source_sheet','RANKING 25 NOV','source_range','B13:J19'),
 jsonb_build_object('code','BJ_QC_NOT_CONFIRMED','severity','HIGH','title','Physical/QC stock not verified',
  'detail','Book movements are reconciled per SKU and DO; this is not a confirmed physically available-to-ship inventory.',
  'fact_keys',jsonb_build_array('book_closing_pack','verified_free_stock_pack'),
  'source_sheet','05_VALIDASI_SUMBER','source_range','B4:E18')));
 perform ppic_private.robot_record_source_facts(v_doc,v_hash,v_facts);

 with s as(select x from jsonb_array_elements(p_source->'skus') x)
 select jsonb_agg(jsonb_build_array(x->>'sku',x->>'brand',nullif(x->>'carton_size','')::numeric,
   nullif(x->>'cost','')::numeric,'BUKU / OPEN RECON',(x->>'opening')::bigint) order by x->>'sku') into v_m from s;
 with e as (
 select (x->>'date')::date dt, 'MASUK'::text kind,x->>'sku' sku,'BUKU GUDANG' ref,
  'VERPACK' customer,(x->>'pack')::bigint qty from jsonb_array_elements(p_source->'receipts')x
 union all
 select (x->>'date')::date dt,'KELUAR',x->>'sku','SJ'||(x->>'sj'),x->>'customer',
 (x->>'pack')::bigint from jsonb_array_elements(p_source->'dispatches')x
 )
 select jsonb_agg(jsonb_build_array(extract(day from dt)::int,kind,sku,ref,customer,qty)
   order by dt,kind,sku,ref) into v_e from e;
 v_meta:=jsonb_build_object('m',v_m,'e',v_e,'cutoff',25,
  'valuation','BUKU / OPEN RECON: biaya historis/proksi SKU, HPP final belum sah',
  'valid_through','2026-11-25','provenance',v_ref,
  'physical_stock_status','BELUM OPNAME/QC','source_kind','EXTRACTED_WORKBOOK');
 v_payload:=jsonb_build_object('codec','json-v1','data',v_meta);
 insert into ppic_private.finished_goods_snapshots(period,cutoff,version,status,payload,source_document_id)
 values('2026-11','2026-11-25',v_version,'OPEN RECON',v_payload,v_doc) returning id into v_bj_id;
 with e as (
 select (x->>'date')::date dt,(x->>'pack')::bigint qty,0::bigint outqty,
    0::numeric outval from jsonb_array_elements(p_source->'receipts')x
 union all
 select (x->>'date')::date dt,0::bigint,(x->>'pack')::bigint,0::numeric
 from jsonb_array_elements(p_source->'dispatches')x
 ),a as(
 select extract(day from dt)::int day_no,sum(qty) ins,sum(outqty) outs from e group by dt)
 select jsonb_agg(jsonb_build_array(day_no,ins,outs,null,null) order by day_no) into v_daily from a;
 v_daily_payload:=jsonb_build_object(
 'cols',jsonb_build_array('day','in_qty','out_qty','in_nominal','out_nominal'),
 'unit','pack','opening_qty',v_open,'opening_nominal',null,
 'entries',v_daily,'valid_through','2026-11-25','source_version','V018',
 'qty_basis','BUKU GUDANG / OPEN RECON NOT QC OR PHYSICAL',
 'nominal_basis','COST PROXY NOT CURRENT HPP','provenance',v_ref,
 'notes',jsonb_build_array('Opening 148210 + receipts 1018110 - DO 756595 = book 409725 pack.',
 '39 SKU, 41 SJ-SKU lines match DO V016; 3 negative SKU -455 pack.',
 'Absent dates in source are unknown, not proof of zero production.',
 'No physical warehouse delivery or outgoing stock was posted by PPIC.'));
 insert into ppic_private.daily_ledger_snapshots(period,division,cutoff,version,status,unit,
  valuation_basis,payload,source_document_ids)
 values('2026-11','BARANG JADI','2026-11-25',v_version,'OPEN RECON','pack',
  'BUKU / HARGA ACUAN, BUKAN HPP FINAL',v_daily_payload,jsonb_build_array(v_doc))
 returning id into v_daily_id;

 with r as(select x from jsonb_array_elements(p_source->'skus')x)
 select jsonb_agg(jsonb_build_array(x->>'sku',x->>'brand',
 (x->>'opening')::bigint,(x->>'incoming')::bigint,(x->>'outgoing')::bigint,
 (x->>'closing')::bigint,
 nullif(x->>'carton_size','')::int,
 case when coalesce((x->>'carton_size')::numeric,0)>0
      then round((x->>'closing')::numeric/(x->>'carton_size')::numeric,4) else null end,
 case when nullif(x->>'cost','') is not null then round((x->>'closing')::numeric*(x->>'cost')::numeric,2) else null end)
 order by (x->>'closing')::int desc,x->>'sku') into v_table_rows from r;
 v_report_payload:=jsonb_build_object(
 'notice','Barang Jadi 25 Nov: saldo buku 409725 pack; 148210 awal +1018110 masuk -756595 DO, 39 SKU. Bukan stok bebas QC.',
 'tables',jsonb_build_array(
 jsonb_build_object('title','Ringkasan Buku Barang Jadi','headers',jsonb_build_array('Indikator','Jumlah','Keterangan'),
   'rows',jsonb_build_array(
     jsonb_build_array('Saldo awal',v_open,'pack'),
     jsonb_build_array('Penerimaan November',v_in,'pack (includes 30000 C003 Nov25)'),
     jsonb_build_array('Pengeluaran DO',v_out,'pack; crosschecks 41 lines V016'),
     jsonb_build_array('Saldo buku 25 Nov',v_close,'pack; not QC'),
     jsonb_build_array('Nilai biaya acuan Rp',round(v_nominal,2),'not actual HPP'),
     jsonb_build_array('Stok bebas QC',null,'MISSING'),
     jsonb_build_array('SKU negatif',-455,'C019/C023/C025'))),
 jsonb_build_object('title','Mutasi Per SKU & Karton Ekuivalen',
  'headers',jsonb_build_array('SKU','Merek','Awal pack','Masuk pack','Keluar pack','Akhir pack','Pack/karton','Karton ekuivalen','Nilai Rp proksi'),
  'rows',v_table_rows)),
 'report_state','WORKING / OPEN RECON',
 'disclaimer','Saldo buku tidak sama dengan stok tersedia fisik. Nilai hanya historis/proksi. 3 SKU negatif.',
 'provenance',v_ref,'source_refs',jsonb_build_array(v_ref));
 insert into ppic_private.report_snapshots(report_key,period,title,cutoff,version,status,basis,payload,source_refs)
 values('12','2026-11','Inventory Turnover & Aging','2026-11-25',v_version,'OPEN RECON','MIXED',
  v_report_payload,jsonb_build_array(v_ref)) returning id into v_report_id;
 insert into ppic_private.working_ledger_promotion_receipts(period,division,cutoff,
   extract_sha256,source_document_id,source_library_file_id,source_workbook_version,
   snapshot_ids,summary)
 values('2026-11','BARANG JADI','2026-11-25',v_hash,v_doc,v_library,'V018',
   jsonb_build_array(v_bj_id,v_daily_id,v_report_id),
   jsonb_build_object('sku_count',39,'opening_pack',v_open,'received_pack',v_in,'delivered_pack',v_out,
      'closing_pack',v_close,'negative_sku_count',3,'cost_reference_rp',round(v_nominal,2),
      'do_line_diff',0,'qc_verified',false))
 returning id into v_receipt_id;
 return jsonb_build_object('ok',true,'status','WORKING_LEDGER_UPDATED',
 'division','BARANG JADI','receipt_id',v_receipt_id,'source_document_id',v_doc,
 'extract_sha256',v_hash,'cutoff','2026-11-25','version',v_version,
 'opening_pack',v_open,'incoming_pack',v_in,'outgoing_pack',v_out,
 'closing_pack',v_close,'negative_sku_count',v_negative,
 'do_mismatches',v_mismatch,'qc_approved',false,'official_inventory_posted',false);
end $fn$;
revoke all on function ppic_private.publish_bj_working_25nov(jsonb)
 from public,anon,authenticated,service_role;
