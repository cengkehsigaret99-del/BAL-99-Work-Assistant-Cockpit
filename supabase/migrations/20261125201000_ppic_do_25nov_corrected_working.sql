-- BAL PPIC controlled DO version correction (Owner confirmed on 25 Nov).
-- Input: V15 workbook "PR_BAL_DO_NOVEMBER_2026_V15_CUTOFF_25NOV_SJ334_338_OPEN_RECON(1).xlsx"
-- Validates previously accepted V015 full history; SJ334 old -> SJ338 once.
-- Does not issue real SJ, book cash, settle receivables or alter stock.
create or replace function ppic_private.publish_do_working_25nov()
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,ppic_private as $fn$
declare
 v_old ppic_private.do_customer_snapshots%rowtype;
 v_old334 jsonb;v_old332 jsonb;
 v_rows jsonb;v_hash text;v_doc text;v_ref jsonb;
 v_status text;v_version text:='V016';
 v_count int;v_sj int;v_pack bigint;v_nominal bigint;v_sample bigint;v_priced int;
 v_facts jsonb;v_tables jsonb;v_payload jsonb;v_sj_rows jsonb;v_customer_rows jsonb;
 v_sku_rows jsonb;v_area_rows jsonb;v_hje_rows jsonb;v_daily_rows jsonb;
 v_snapid uuid;v_dailyid uuid;v_reportid uuid;v_receipt uuid;
 v_library text:='libfile_fde3_f-13bb1ac99de881918cb11c2847668e5e_651490bce7948191a073e9ed83bb583b';
 v_filename text:='PR_BAL_DO_NOVEMBER_2026_V15_CUTOFF_25NOV_SJ334_338_OPEN_RECON(1).xlsx';
begin
 perform ppic_private.robot_assert_writable_period('2026-11');
 perform pg_advisory_xact_lock(hashtextextended('ppic:do:2026-11:25:corrected',0));
 select * into v_old from ppic_private.do_customer_snapshots
 where period='2026-11' and version='V015';
 if not found or v_old.cutoff<>date '2026-11-21'
    or jsonb_array_length(v_old.rows)<>37
 then raise exception 'DO_25_HISTORY_MISSING_OR_CHANGED';end if;
 select x into v_old334 from jsonb_array_elements(v_old.rows) x
 where x->>'sj'='334' and x->>'sku'='C-036';
 select x into v_old332 from jsonb_array_elements(v_old.rows) x
 where x->>'sj'='332' and x->>'sku'='C-022';
 if v_old334 is null or v_old332 is null
 or (v_old334->>'pack')::int<>4000 or (v_old334->>'price')::int<>8500
 or (v_old334->>'nominal')::bigint<>34000000
 or v_old334->>'date'<>'2026-11-21'
 then raise exception 'DO_25_CORRECTION_PRECONDITION_FAILED';end if;

 -- Old 334 is renamed to 338, unchanged shipment/date/price/quantity.
 -- Source V15 adds 334=Khoirul 128,800; 335=Kasyful 200; 336=Indra 1,600; 337=Tri 4,000.
 with c as (
   select case when x->>'sj'='334'
     then x||jsonb_build_object('sj',338,'basis','NOMOR_PENGGANTI_DIKONFIRMASI',
       'source_ref','01 DETAIL SJ!A44:O44',
       'source_note','Owner confirmed 25 Nov: old SJ334 Tri -> SJ338; no duplicate')
     else x end as j
   from jsonb_array_elements(v_old.rows) x
 ), n as (
   select j from c
   union all select v_old334||jsonb_build_object(
     'sj',334,'date','2026-11-25','customer','KHOIRUL SOLEH',
     'destination','KHOIRUL SOLEH','area','PMS (belum terverifikasi)',
     'pack',128800,'price',8400,'nominal',1081920000,
     'basis','HARGA_HISTORIS_KERJA','source_ref','01 DETAIL SJ!A40:O40',
     'source_note','Owner confirmed SJ334 Khoirul, journal row 523')
   union all select v_old332||jsonb_build_object(
     'sj',335,'date','2026-11-25','pack',200,'price',10500,'nominal',2100000,
     'basis','HARGA_HISTORIS_KERJA','source_ref','01 DETAIL SJ!A41:O41',
     'source_note','Journal row 524')
   union all select v_old334||jsonb_build_object(
     'sj',336,'date','2026-11-25','customer','INDRA SANTOSO',
     'destination','INDRA SANTOSO','area','Area belum terverifikasi',
     'pack',1600,'price',8500,'nominal',13600000,
     'basis','HARGA_DIKONFIRMASI','source_ref','01 DETAIL SJ!A42:O42',
     'source_note','User confirmed price Rp8,500/pack, journal row 525')
   union all select v_old334||jsonb_build_object(
     'sj',337,'date','2026-11-25','customer','TRI SUKMA AJI',
     'destination','TRI SUKMA AJI','area','Mojokerto (referensi lama)',
     'pack',4000,'price',8500,'nominal',34000000,
     'basis','HARGA_HISTORIS_KERJA','source_ref','01 DETAIL SJ!A43:O43',
     'source_note','Journal row 526, no invoice final')
 )
 select jsonb_agg(j order by (j->>'sj')::int,j->>'sku')
 into v_rows from n;
 select count(*),count(distinct (x->>'sj')::int),
   sum((x->>'pack')::bigint),sum((x->>'nominal')::bigint),
   sum(case when x->>'kind' in ('SAMPEL','SAMPLE') then (x->>'pack')::bigint else 0 end),
   count(*) filter(where x->>'kind'='REGULER' and coalesce((x->>'price')::numeric,0)<=0)
 into v_count,v_sj,v_pack,v_nominal,v_sample,v_priced
 from jsonb_array_elements(v_rows) x;
 if v_count<>41 or v_sj<>28 or v_pack<>756595 or v_nominal<>5606380000
 or v_sample<>1815 or v_priced<>0
 or (select count(*) from jsonb_array_elements(v_rows)x where x->>'sj'='338')<>1
 or (select count(*) from jsonb_array_elements(v_rows)x where x->>'sj'='334' and x->>'customer'='KHOIRUL SOLEH'
   and (x->>'pack')::int=128800 and (x->>'price')::int=8400)<>1
 then raise exception 'DO_25_CONTROL_TOTAL_FAILED';end if;
 if exists(select 1 from jsonb_array_elements(v_rows)x
   where (x->>'nominal')::numeric<>(x->>'pack')::numeric*(x->>'price')::numeric
   or (x->>'date')::date>date '2026-11-25'
   or to_char((x->>'date')::date,'YYYY-MM')<>'2026-11')
 then raise exception 'DO_25_ROW_VALIDATION_FAILED';end if;

 v_hash:=encode(extensions.digest(
   'EXTRACT_JSON_NOT_BINARY_XLSX_SHA256|'||v_library||'|'||v_rows::text,'sha256'),'hex');
 v_doc:='PPIC_202611_DO_EXT_'||left(v_hash,18);
 if exists (select 1 from ppic_private.working_ledger_promotion_receipts
    where period='2026-11' and division='DO' and extract_sha256=v_hash) then
    return jsonb_build_object('ok',true,'status','NO_CHANGE','division','DO',
       'cutoff','2026-11-25','extract_sha256',v_hash);end if;
 if exists(select 1 from ppic_private.do_customer_snapshots
  where period='2026-11' and (version=v_version or cutoff>date'2026-11-25')) then
   raise exception 'DO_25_CONFLICT_WITH_EXISTING_NEWER_VERSION';end if;
 v_ref:=jsonb_build_object('document_id',v_doc,'title',v_filename,'date','2026-11-25',
   'version','V015','sha256',v_hash,'source_hash_kind','NORMALIZED_TEXT_EXTRACT',
   'library_file_id',v_library,'scope',
   'Verified 41 extracted workbook rows, source V15, Owner corrected SJ334/SJ338, OPEN RECON. Not XLSX byte SHA.');
 insert into ppic_private.source_registry(document_id,division,period,cutoff,version,
  sha256,reconciliation_status,access_class,private_locator)
 values(v_doc,'DO','2026-11','2026-11-25 00:00:00+07', 'V015',
  v_hash,'OPEN RECON','CONFIDENTIAL','library-extract:'||v_library||';not-binary-sha256');

 v_facts:=jsonb_build_object('schema_version','ppic-robot-facts-v1',
  'division','DO','period','2026-11','cutoff','2026-11-25','version','V015','source_sha256',v_hash,
  'facts',jsonb_build_array(
   jsonb_build_object('key','delivery_note_count','label','Surat Jalan unik','value',28,'unit','SJ','scope','DO November working','source_sheet','01 DETAIL SJ','source_range','B4:O45','quality','SOURCE','note','SJ334 Khoirul 25Nov; SJ338 replaces old SJ334 Tri; not double counted. Extract-only hash.'),
   jsonb_build_object('key','transaction_line_count','label','Baris SJ / SKU','value',41,'unit','baris','scope','DO November working','source_sheet','01 DETAIL SJ','source_range','B4:O45','quality','SOURCE','note','41 source rows from owner-confirmed V15.'),
   jsonb_build_object('key','delivered_pack','label','Pengeluaran DO buku','value',756595,'unit','pack','scope','DO November working','source_sheet','01 DETAIL SJ','source_range','B4:O45','quality','SOURCE','note','Book dispatch, not proof of physical customer receipt.'),
   jsonb_build_object('key','regular_pack','label','Pengeluaran reguler','value',754780,'unit','pack','scope','DO November working','source_sheet','03 PER MEREK','source_range','B4:J14','quality','SOURCE','note','Does not include 1,815 sample packs.'),
   jsonb_build_object('key','sample_pack','label','Pengeluaran sampel','value',1815,'unit','pack','scope','DO November working','source_sheet','03 PER MEREK','source_range','B4:J14','quality','SOURCE','note','Samples zero DO sales value.'),
   jsonb_build_object('key','working_sales_value','label','Nilai penjualan DO harga kerja','value',5606380000,'unit','Rp','scope','DO November working','source_sheet','01 DETAIL SJ','source_range','B4:O45','quality','REFERENCE','note','Historical prices; not final invoices, receivables or cash.'),
   jsonb_build_object('key','verified_receivable','label','Piutang terverifikasi','value',null,'unit','Rp','scope','DO November working','source_sheet','10 PIUTANG CUSTOMER','source_range','B4:L26','quality','MISSING','note','Different invoice dates, allocations and account statements; no consolidated proof.')
  ),'issues',jsonb_build_array(
   jsonb_build_object('code','SJ334_SJ338_RENUMBER','severity','HIGH','title','Corrected DO identity',
   'detail','SJ334 belongs to Khoirul 128800 pack (25 Nov), previous SJ334 Tri 4000 pack moved to SJ338 (21 Nov) once; underlying 36 other historic SJ/SKU lines conserved.',
   'fact_keys',jsonb_build_array('delivery_note_count','delivered_pack'),
   'source_sheet','11 REKON PERUBAHAN','source_range','B4:M10'),
   jsonb_build_object('code','WORKING_PRICE_NOT_RECEIVABLE','severity','MEDIUM','title','Invoice/cash allocations still open',
   'detail','Working DO Rp5.60638bn must not be called paid or debt; SJ328 allocation and customer POD/invoice remain OPEN RECON.',
   'fact_keys',jsonb_build_array('working_sales_value','verified_receivable'),
   'source_sheet','10 PIUTANG CUSTOMER','source_range','B4:L26')
  ));
 perform ppic_private.robot_record_source_facts(v_doc,v_hash,v_facts);

 insert into ppic_private.do_customer_snapshots(period,cutoff,version,status,source_document_id,rows)
 values('2026-11','2026-11-25',v_version,'OPEN RECON',v_doc,v_rows) returning id into v_snapid;

 with d as(select (x->>'date')::date dt,(x->>'pack')::bigint qty,(x->>'nominal')::bigint val
    from jsonb_array_elements(v_rows)x),
 a as (select extract(day from dt)::int day_no,sum(qty) qty,sum(val) val from d group by dt)
 select jsonb_agg(jsonb_build_array(day_no,qty,val,0) order by day_no) into v_daily_rows from a;
 v_payload:=jsonb_build_object('cols',jsonb_build_array('day','out_qty','out_nominal','unpriced_qty'),
   'unit','pack','entries',v_daily_rows,'opening_qty',null,'opening_nominal',null,
   'valid_through','2026-11-25',
   'source_document_id',v_doc,
   'qty_basis','DO BOOK dispatch only (not inventory or customer POD)',
   'nominal_basis','WORKING SALES PRICE (not final invoice, receivable or cash)',
   'notes',jsonb_build_array('28 SJ, 41 lines, 756595 packs, 5606380000 Rupiah work price.',
     'Old SJ334 Tri moved to SJ338; new SJ334 Khoirul 128800. No 4000-pack duplicate.',
     'Dates without transactions are unknown, not guaranteed zero.','No official finance or physical stock posted.'),
   'provenance',v_ref);
 insert into ppic_private.daily_ledger_snapshots(period,division,cutoff,version,status,unit,
  valuation_basis,payload,source_document_ids)
 values('2026-11','DO','2026-11-25',v_version,'OPEN RECON','pack',
  'HARGA JUAL KERJA, BUKAN PIUTANG FINAL',v_payload,jsonb_build_array(v_doc))
 returning id into v_dailyid;
 with d as (select (x->>'sj')::int sj,x->>'date' dt,
  x->>'customer' customer,(x->>'pack')::bigint qty,(x->>'nominal')::bigint val
  from jsonb_array_elements(v_rows)x),
 a as (select sj,min(dt) dt,min(customer) customer,sum(qty) qty,sum(val) val from d group by sj)
 select jsonb_agg(jsonb_build_array(sj,dt,customer,qty,val) order by sj)
 into v_sj_rows from a;
 with d as(select (x->>'sj')::int sj,x->>'customer' customer,(x->>'pack')::bigint qty,
  (x->>'nominal')::bigint val from jsonb_array_elements(v_rows)x),
 a as(select customer,count(distinct sj) sj,sum(qty) qty,sum(val) val from d group by customer)
 select jsonb_agg(jsonb_build_array(customer,sj,qty,val) order by qty desc,customer)
 into v_customer_rows from a;
 with d as(select x->>'sku' sku,x->>'brand' brand,(x->>'pack')::bigint qty,
  (x->>'nominal')::bigint val from jsonb_array_elements(v_rows)x),
 a as(select sku,min(brand) brand,sum(qty) qty,sum(val) val from d group by sku)
 select jsonb_agg(jsonb_build_array(sku,brand,qty,val) order by qty desc,sku)
 into v_sku_rows from a;
 with d as(select x->>'area' area,(x->>'pack')::bigint qty,
  (x->>'nominal')::bigint val from jsonb_array_elements(v_rows)x),
 a as(select area,sum(qty) qty,sum(val) val from d group by area)
 select jsonb_agg(jsonb_build_array(area,qty,val) order by qty desc,area)
 into v_area_rows from a;
 with d as(select (x->>'hje')::int hje,(x->>'pack')::bigint qty,
  (x->>'nominal')::bigint val from jsonb_array_elements(v_rows)x),
 a as(select hje,sum(qty) qty,sum(val) val from d group by hje)
 select jsonb_agg(jsonb_build_array(hje,qty,val) order by hje)
 into v_hje_rows from a;

 v_tables:=jsonb_build_array(
 jsonb_build_object('title','Ringkasan DO November 2026','headers',jsonb_build_array('Indikator','Jumlah','Status'),
 'rows',jsonb_build_array(
  jsonb_build_array('SJ unik',v_sj,'Pengeluaran buku'),
  jsonb_build_array('Baris SKU',v_count,'Sumber DO V15'),
  jsonb_build_array('Pack reguler',v_pack-v_sample,'Kerja'),
  jsonb_build_array('Pack sampel',v_sample,'Tidak ditagih'),
  jsonb_build_array('TOTAL PACK',v_pack,'Tidak dikurangi lagi dari BJ'),
  jsonb_build_array('TOTAL NOMINAL DO KERJA Rp',v_nominal,'Bukan piutang/kas final'),
  jsonb_build_array('Saldo piutang final',null,'BELUM TERVERIFIKASI'),
  jsonb_build_array('Cut-off','2026-11-25','OPEN RECON'))),
 jsonb_build_object('title','Rekap per Surat Jalan','headers',jsonb_build_array('SJ','Tanggal','Customer','Pack','Nominal kerja Rp'),'rows',v_sj_rows),
 jsonb_build_object('title','Rekap per Customer','headers',jsonb_build_array('Customer','SJ','Pack','Nominal kerja Rp'),'rows',v_customer_rows),
 jsonb_build_object('title','Rekap per SKU','headers',jsonb_build_array('SKU','Merek','Pack','Nominal kerja Rp'),'rows',v_sku_rows),
 jsonb_build_object('title','Rekap per Area Kerja','headers',jsonb_build_array('Area','Pack','Nominal kerja Rp'),'rows',v_area_rows),
 jsonb_build_object('title','Rekap per HJE','headers',jsonb_build_array('HJE','Pack','Nominal DO Rp'),'rows',v_hje_rows),
 jsonb_build_object('title','Nomor SJ yang dikoreksi','headers',jsonb_build_array('SJ','Customer','Pack','Nilai Rp','Status'),
 'rows',jsonb_build_array(
 jsonb_build_array('334','KHOIRUL SOLEH',128800,1081920000,'New confirmed owner 25 Nov'),
 jsonb_build_array('338','TRI SUKMA AJI',4000,34000000,'Replaces old SJ334 (21 Nov), once only'),
 jsonb_build_array('335','KASYFUL QULUB',200,2100000,'Working price'),
 jsonb_build_array('336','INDRA SANTOSO',1600,13600000,'User confirmed price'),
 jsonb_build_array('337','TRI SUKMA AJI',4000,34000000,'Working price')))
 );
 v_payload:=jsonb_build_object(
  'notice','DO November 25: 28 SJ, 41 lines, 756595 pack, Rp5.606.380.000 working price (OPEN RECON). Old SJ334 Tri corrected to SJ338; new SJ334 Khoirul.',
  'tables',v_tables,'report_state','WORKING / OPEN RECON',
  'disclaimer','Harga kerja tidak sama dengan nilai HJE, invoice final, kas diterima atau piutang disahkan. Proof of delivery dan alokasi customer belum lengkap.',
  'source_refs',jsonb_build_array(v_ref),
  'provenance',jsonb_build_object('source',v_ref,'method','APPEND_ONLY_RENUMBER_AND_NEW_SJ','cash_posted',false,'physical_stock_posted',false),
  'missing_inputs',jsonb_build_array('SJ334 Khoirul PMS/PSP area','SJ328 allocation','POD SJ334-338','Bank/invoice customer matching'));
 insert into ppic_private.report_snapshots(report_key,period,title,cutoff,version,status,basis,payload,source_refs)
 values('09','2026-11','DO, Piutang & Forecast','2026-11-25',v_version,'OPEN RECON','MIXED',v_payload,jsonb_build_array(v_ref))
 returning id into v_reportid;

 insert into ppic_private.working_ledger_promotion_receipts(period,division,cutoff,
 extract_sha256,source_document_id,source_library_file_id,source_workbook_version,
 snapshot_ids,summary)
 values('2026-11','DO','2026-11-25',v_hash,v_doc,v_library,'V015',
 jsonb_build_array(v_snapid,v_dailyid,v_reportid),
 jsonb_build_object('sj',v_sj,'lines',v_count,'pack',v_pack,'nominal',v_nominal,
 'source_hash_kind','NORMALIZED_TEXT_EXTRACT','official_ledgers_posted',false,
 'sj334_owner','KHOIRUL SOLEH','old_sj334_reassigned_to',338))
 returning id into v_receipt;
 return jsonb_build_object('ok',true,'status','WORKING_LEDGER_UPDATED',
  'source_document_id',v_doc,'source_extract_sha256',v_hash,'receipt_id',v_receipt,
  'cutoff','2026-11-25','report_version',v_version,
  'sj',v_sj,'lines',v_count,'pack',v_pack,'working_nominal_rp',v_nominal,
  'old_shipments_double_counted',false,'cash_or_physical_inventory_posted',false);
end $fn$;
revoke all on function ppic_private.publish_do_working_25nov() from public,anon,authenticated,service_role;
