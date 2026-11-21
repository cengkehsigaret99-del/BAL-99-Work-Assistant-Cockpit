-- Preserve native BAL SAMPEL kind in DO analytics and include its 1815 packs.
create or replace function ppic_private.do_auto_publish_validated(
 p_period text,p_cutoff date,p_source_version text,p_sha text,p_library_id text,
 p_filename text,p_rows jsonb,p_expected jsonb,p_validation_note text
) returns jsonb
language plpgsql security invoker
set search_path=pg_catalog,ppic_private
as $fn$
declare
 c ppic_private.do_auto_publish_settings%rowtype;
 v_prev ppic_private.do_customer_snapshots%rowtype;
 v_doc text; v_version text; v_version_num integer; v_rec ppic_private.do_auto_publish_receipts%rowtype;
 v_lines integer;v_pack bigint;v_nom bigint;v_sj integer;v_regular bigint;v_sample bigint;v_unpriced bigint;
 v_historical_diff int;v_hist_count int;
 v_line record;v_fact jsonb;v_fact_payload jsonb;v_issues jsonb:='[]'::jsonb;
 v_ref jsonb;v_payload jsonb;v_tables jsonb;
 v_doid uuid;v_daily_id uuid;v_report_id uuid;
 v_daily_entries jsonb;
 v_sj_rows jsonb;v_customer_rows jsonb;v_sku_rows jsonb;v_area_rows jsonb;v_hje_rows jsonb;
begin
 select * into c from ppic_private.do_auto_publish_settings where id=1;
 if not found or not c.enabled or not c.owner_preapproved_working_imports
 or not c.require_verified_source_sha or not c.require_prior_line_conservation then
  return jsonb_build_object('ok',false,'status','AUTO_PUBLISH_DISABLED');
 end if;
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
  or p_period<'2026-11' or p_period>to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
  or p_cutoff is null or to_char(p_cutoff,'YYYY-MM')<>p_period
  or p_cutoff>timezone('Asia/Jakarta',now())::date
  or p_source_version is null or p_source_version!~ '^V[0-9]{3,}$'
  or p_sha is null or p_sha!~ '^[a-f0-9]{64}$'
  or p_library_id is null or p_library_id!~ '^libfile_[A-Za-z0-9_-]{20,180}$'
  or p_filename is null or length(p_filename)>220 or p_filename!~ '^[^\r\n]+[.]xlsx$'
  or p_rows is null or jsonb_typeof(p_rows)<>'array'
  or jsonb_array_length(p_rows) not between 1 and 1500 or octet_length(p_rows::text)>1048576
  or p_expected is null or jsonb_typeof(p_expected)<>'object'
  or p_expected->>'sha_verified' is distinct from 'true'
  or p_expected->>'owner_preapproved' is distinct from 'true'
  or coalesce(p_validation_note,'')='' or length(p_validation_note)>600
 then raise exception 'DO_AUTO_SOURCE_INVALID' using errcode='22023';end if;

 perform ppic_private.robot_assert_writable_period(p_period);
 perform pg_advisory_xact_lock(hashtextextended('ppic:do:auto:'||p_period,0));
 select * into v_rec from ppic_private.do_auto_publish_receipts where source_sha256=p_sha;
 if found then return jsonb_build_object('ok',true,'status','NO_CHANGE','receipt_id',v_rec.id,
  'period',p_period,'source_sha256',p_sha,'report_version',v_rec.analytics_version);end if;
 select * into v_prev from ppic_private.do_customer_snapshots where period=p_period
  order by cutoff desc,created_at desc,id desc limit 1;
 if found and p_cutoff<v_prev.cutoff then
  return jsonb_build_object('ok',false,'status','OLDER_THAN_ACTIVE','active_cutoff',v_prev.cutoff);
 end if;

 for v_line in select x.value as j from jsonb_array_elements(p_rows) x loop
  if jsonb_typeof(v_line.j)<>'object'
    or (v_line.j->>'sj')!~ '^[0-9]{1,8}$'
    or (v_line.j->>'pack')!~ '^[1-9][0-9]{0,9}$'
    or (v_line.j->>'price')!~ '^[0-9]{1,10}$'
    or (v_line.j->>'nominal')!~ '^[0-9]{1,13}$'
    or (v_line.j->>'date')!~ '^20[0-9]{2}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$'
    or (v_line.j->>'date')::date>p_cutoff
    or to_char((v_line.j->>'date')::date,'YYYY-MM')<>p_period
    or coalesce(v_line.j->>'sku','')!~ '^C-[0-9]{3}$'
    or coalesce(v_line.j->>'kind','') not in ('REGULER','SAMPEL','SAMPLE')
    or coalesce(v_line.j->>'hje','')!~ '^[0-9]{4,6}$'
    or coalesce(v_line.j->>'customer','')=''
    or length(coalesce(v_line.j->>'customer',''))>150
    or length(coalesce(v_line.j->>'area',''))>150
    or length(coalesce(v_line.j->>'brand',''))>200
    or (v_line.j->>'nominal')::numeric<>
       (v_line.j->>'pack')::numeric*(v_line.j->>'price')::numeric
    or (v_line.j->>'kind' in ('SAMPEL','SAMPLE') and (v_line.j->>'price')::numeric<>0)
    or (v_line.j->>'kind'='REGULER' and (v_line.j->>'price')::numeric=0)
  then raise exception 'DO_AUTO_LINE_INVALID' using errcode='22023';end if;
 end loop;

 with l as (select x.value j from jsonb_array_elements(p_rows) x)
 select count(*),sum((j->>'pack')::bigint),sum((j->>'nominal')::bigint),
  count(distinct j->>'sj'),sum(case when j->>'kind'='REGULER' then (j->>'pack')::bigint else 0 end),
  sum(case when j->>'kind' in ('SAMPEL','SAMPLE') then (j->>'pack')::bigint else 0 end)
 into v_lines,v_pack,v_nom,v_sj,v_regular,v_sample from l;
 if (p_expected->>'lines')::int is distinct from v_lines
  or (p_expected->>'sj')::int is distinct from v_sj
  or (p_expected->>'pack')::bigint is distinct from v_pack
  or (p_expected->>'nominal')::bigint is distinct from v_nom
 then raise exception 'DO_AUTO_EXPECTED_TOTAL_MISMATCH' using errcode='22023';end if;

 -- All already-published transactions must still be represented by an identical
 -- SJ/SKU/pack/price/nominal line. This prevents accidental replay and silent repricing.
 if v_prev.id is not null then
  with old as (
   select y->>'sj' sj,y->>'sku' sku,y->>'pack' qty,y->>'price' price,y->>'nominal' nominal
   from jsonb_array_elements(v_prev.rows) y
  ), newrows as (
   select y->>'sj' sj,y->>'sku' sku,y->>'pack' qty,y->>'price' price,y->>'nominal' nominal
   from jsonb_array_elements(p_rows) y
  ), miss as (select * from old except all select * from newrows)
  select count(*) into v_historical_diff from miss;
  if v_historical_diff<>0 then
   return jsonb_build_object('ok',false,'status','HISTORICAL_RECON_REQUIRED',
     'mismatches',v_historical_diff,'active_version',v_prev.version);
  end if;
 end if;

 select max((substring(version from 2))::integer) into v_version_num
 from (
   select version from ppic_private.do_customer_snapshots where period=p_period and version~'^V[0-9]+$'
   union all select version from ppic_private.daily_ledger_snapshots where period=p_period and division='DO' and version~'^V[0-9]+$'
   union all select version from ppic_private.report_snapshots where period=p_period and report_key='09' and version~'^V[0-9]+$'
 ) versions;
 v_version:='V'||lpad((coalesce(v_version_num,0)+1)::text,3,'0');
 v_doc:='PPIC_202611_DO_'||left(p_sha,16);
 v_ref:=jsonb_build_object('document_id',v_doc,'title',p_filename,
   'sha256',p_sha,'date',p_cutoff,'source_kind','CHATGPT_LIBRARY',
   'library_file_id',p_library_id,'scope','OWNER PREAPPROVED · WORKING ANALYTICS ONLY; cash/invoice remain unreconciled');

 insert into ppic_private.source_registry(document_id,division,period,cutoff,version,sha256,
   reconciliation_status,access_class,private_locator)
 values(v_doc,'DO',p_period,(p_cutoff::text||' 00:00:00+07')::timestamptz,
   p_source_version,p_sha,'OPEN RECON','CONFIDENTIAL','library-file:'||p_library_id)
 on conflict(sha256) do nothing;
 if not exists(select 1 from ppic_private.source_registry
  where document_id=v_doc and sha256=p_sha and division='DO'
   and period=p_period and version=p_source_version)
 then raise exception 'DO_AUTO_SOURCE_REGISTRY_CONFLICT';end if;

 v_fact:=jsonb_build_array(
 jsonb_build_object('key','source_data_cutoff','label','Cutoff data DO','value',p_cutoff::text,
   'unit','tanggal','scope','DO November working','source_sheet','00 DASHBOARD','source_range','B3','quality','SOURCE','note','Tanggal isi workbook, bukan bukti fisik pelanggan'),
 jsonb_build_object('key','delivery_note_count','label','Total SJ unik','value',v_sj,
   'unit','SJ','scope','DO November working','source_sheet','00 DASHBOARD','source_range','B5','quality','SOURCE','note','SJ311–334 unik; konflik SJ tetap terbuka'),
 jsonb_build_object('key','transaction_line_count','label','Baris SJ/SKU','value',v_lines,
   'unit','baris','scope','DO November working','source_sheet','00 DASHBOARD','source_range','B6','quality','SOURCE','note','Tidak diposting ulang sebagai transaksi stok'),
 jsonb_build_object('key','delivered_pack','label','Total pengeluaran DO/SJ','value',v_pack,
   'unit','pack','scope','DO November working','source_sheet','00 DASHBOARD','source_range','B7','quality','SOURCE','note','Buku DO; jangan samakan dengan barang diterima customer'),
 jsonb_build_object('key','regular_pack','label','Pack reguler','value',v_regular,
   'unit','pack','scope','DO November working','source_sheet','00 DASHBOARD','source_range','B8','quality','SOURCE','note','Hanya pack reguler'),
 jsonb_build_object('key','sample_pack','label','Pack sampel','value',v_sample,
   'unit','pack','scope','DO November working','source_sheet','00 DASHBOARD','source_range','B9','quality','SOURCE','note','Sampel gratis Rp0'),
 jsonb_build_object('key','working_sales_value','label','Nominal DO harga kerja','value',v_nom,
   'unit','Rp','scope','DO November working','source_sheet','00 DASHBOARD','source_range','B12','quality','REFERENCE','note','Kas Bank V16 harga kerja; bukan invoice final/piutang'),
 jsonb_build_object('key','verified_receivable','label','Saldo piutang disahkan','value',null,
   'unit','Rp','scope','DO November working','source_sheet','00 DASHBOARD','source_range','B14','quality','MISSING','note','Belum ada saldo awal, alokasi pembayaran/invoice yang memenuhi syarat'),
 jsonb_build_object('key','firm_order_pack','label','Pesanan firm ke depan','value',null,
   'unit','pack','scope','DO November working','source_sheet','00 DASHBOARD','source_range','B14','quality','MISSING','note','Riwayat SJ bukan pesanan firm'));
 v_fact_payload:=jsonb_build_object('schema_version','ppic-robot-facts-v1',
  'division','DO','period',p_period,'cutoff',p_cutoff::text,'version',p_source_version,
  'source_sha256',p_sha,'facts',v_fact,'issues',v_issues);
 perform ppic_private.robot_record_source_facts(v_doc,p_sha,v_fact_payload);

 insert into ppic_private.do_customer_snapshots(period,cutoff,version,status,source_document_id,rows)
 values(p_period,p_cutoff,v_version,'OPEN RECON',v_doc,p_rows)
 returning id into v_doid;

 with l as (
 select (x->>'date')::date d,(x->>'pack')::bigint pack,(x->>'nominal')::bigint nominal
 from jsonb_array_elements(p_rows) x
 ), agg as (
 select extract(day from d)::int day_no,sum(pack) pack,sum(nominal) nominal from l group by d
 )
 select coalesce(jsonb_agg(jsonb_build_array(day_no,pack,nominal,0) order by day_no),'[]'::jsonb)
 into v_daily_entries from agg;

 v_payload:=jsonb_build_object(
  'cols',jsonb_build_array('day','out_qty','out_nominal','unpriced_qty'),
  'unit','pack','opening_qty',null,'opening_nominal',null,
  'entries',v_daily_entries,
  'valid_through',p_cutoff::text,
  'source_version',p_source_version,'source_document_id',v_doc,
  'qty_basis','DO/SJ BOOK OUTPUT ONLY; NOT WAREHOUSE INVENTORY',
  'nominal_basis','WORKING PRICE PER PACK FROM OWNER CONFIRMED V12; NOT FINAL INVOICE',
  'notes',jsonb_build_array(
   format('%s pack, %s SJ, %s rows; Rp %s working nominal.',v_pack,v_sj,v_lines,v_nom),
   'Omitted dates are UNKNOWN, never inferred as zero shipments.',
   'Do not double-count this full replacement against the prior cutoff, and do not automatically reduce BJ stock.',
   p_validation_note,'Cash, receivables, physical stock and final invoices remain unchanged.'),
  'provenance',jsonb_build_object('source_ref',v_ref,'source_sha256',p_sha,
   'actual_cutoff',p_cutoff,'source_library_file_id',p_library_id));
 insert into ppic_private.daily_ledger_snapshots(period,division,cutoff,version,status,unit,
  valuation_basis,payload,source_document_ids)
 values(p_period,'DO',p_cutoff,v_version,'OPEN RECON','pack',
  'HARGA JUAL KERJA; BUKAN PIUTANG FINAL',v_payload,jsonb_build_array(v_doc))
 returning id into v_daily_id;

 with l as(
 select (x->>'sj')::int sj,(x->>'date')::date d,x->>'customer' customer,
  x->>'sku' sku,x->>'brand' brand,x->>'area' area,(x->>'hje')::int hje,
  x->>'kind' kind,(x->>'pack')::bigint pack,(x->>'nominal')::bigint nominal,
  nullif(x->>'pack_per_carton','')::numeric carton_size
 from jsonb_array_elements(p_rows) x
 ), g as(
  select sj,min(d) d,min(customer) customer,
   sum(pack) filter(where kind='REGULER') regular,
   sum(pack) filter(where kind in ('SAMPEL','SAMPLE')) sample,
   sum(pack) total,sum(nominal) total_rp,
   sum(case when carton_size>0 then pack/carton_size else 0 end) cartons
  from l group by sj
 )
 select coalesce(jsonb_agg(jsonb_build_array(sj,d,customer,coalesce(regular,0),
  coalesce(sample,0),total,total_rp,round(cartons,4)) order by sj),'[]'::jsonb)
 into v_sj_rows from g;
 with l as(
 select (x->>'sj')::int sj,x->>'customer' customer,x->>'kind' kind,
 (x->>'pack')::bigint pack,(x->>'nominal')::bigint nominal,
 nullif(x->>'pack_per_carton','')::numeric carton_size from jsonb_array_elements(p_rows) x
 ),g as(
 select customer,count(distinct sj) sj_count,
  sum(pack) filter(where kind='REGULER') regular,sum(pack) filter(where kind in ('SAMPEL','SAMPLE')) sample,
  sum(pack) total,sum(nominal) total_rp,
  sum(case when carton_size>0 then pack/carton_size else 0 end) cartons
 from l group by customer)
 select coalesce(jsonb_agg(jsonb_build_array(customer,sj_count,coalesce(regular,0),
  coalesce(sample,0),total,total_rp,round(cartons,4)) order by total_rp desc,customer),'[]'::jsonb)
 into v_customer_rows from g;
 with l as(
 select x->>'sku' sku,x->>'brand' brand,(x->>'pack')::bigint pack,
 (x->>'nominal')::bigint nominal,nullif(x->>'pack_per_carton','')::numeric carton_size
 from jsonb_array_elements(p_rows) x
 ),g as(
 select sku,min(brand) brand,sum(pack) total,sum(nominal) total_rp,
  max(carton_size) carton_size,sum(case when carton_size>0 then pack/carton_size else 0 end) cartons
 from l group by sku)
 select coalesce(jsonb_agg(jsonb_build_array(sku,brand,total,total_rp,
  carton_size,round(cartons,4)) order by sku),'[]'::jsonb)
 into v_sku_rows from g;
 with l as(
 select (x->>'sj')::int sj,x->>'area' area,(x->>'pack')::bigint pack,
 (x->>'nominal')::bigint nominal,nullif(x->>'pack_per_carton','')::numeric carton_size
 from jsonb_array_elements(p_rows) x
 ),g as(
 select area,count(distinct sj) sj_count,sum(pack) total,sum(nominal) total_rp,
  sum(case when carton_size>0 then pack/carton_size else 0 end) cartons from l group by area)
 select coalesce(jsonb_agg(jsonb_build_array(area,sj_count,total,total_rp,round(cartons,4))
  order by total_rp desc,area),'[]'::jsonb) into v_area_rows from g;
 with l as(
 select (x->>'hje')::int hje,x->>'kind' kind,(x->>'pack')::bigint pack,
 (x->>'nominal')::bigint nominal,nullif(x->>'pack_per_carton','')::numeric carton_size
 from jsonb_array_elements(p_rows) x
 ),g as(
 select hje,sum(pack) filter(where kind='REGULER') regular,
  sum(pack) filter(where kind in ('SAMPEL','SAMPLE')) sample,sum(pack) total,sum(nominal) total_rp,
  sum(case when carton_size>0 then pack/carton_size else 0 end) cartons
 from l group by hje)
 select coalesce(jsonb_agg(jsonb_build_array(hje,coalesce(regular,0),coalesce(sample,0),
  total,total_rp,round(cartons,4)) order by hje),'[]'::jsonb) into v_hje_rows from g;

 v_tables:=jsonb_build_array(
  jsonb_build_object('title','Ringkasan Nilai DO November 2026',
   'headers',jsonb_build_array('Indikator','Jumlah','Keterangan'),
   'rows',jsonb_build_array(
      jsonb_build_array('Jumlah Surat Jalan',v_sj,'SJ unik seluruh periode'),
      jsonb_build_array('Jumlah baris',v_lines,'Baris SJ/SKU'),
      jsonb_build_array('Pack reguler',v_regular,'Pengeluaran reguler'),
      jsonb_build_array('Pack sampel',v_sample,'Sampel harga kerja Rp0'),
      jsonb_build_array('TOTAL PACK',v_pack,'REGULER + SAMPEL, bukan stok'),
      jsonb_build_array('TOTAL NILAI DO (Rp)',v_nom,'HARGA KERJA; bukan piutang'),
      jsonb_build_array('Reguler tanpa harga',0,'Diverifikasi pada sumber'),
      jsonb_build_array('Saldo piutang',null,'BELUM DIVERIFIKASI'),
      jsonb_build_array('Tanggal terakhir',p_cutoff::text,'Omitted dates are unknown'))),
  jsonb_build_object('title','Rincian Nilai DO per Surat Jalan',
   'headers',jsonb_build_array('SJ','Tanggal','Customer','Reguler pack','Sampel pack','Total pack','Nilai DO (Rp)','Karton ekuivalen'),'rows',v_sj_rows),
  jsonb_build_object('title','Rincian Nilai DO per Customer',
   'headers',jsonb_build_array('Customer','Jumlah SJ','Reguler pack','Sampel pack','Total pack','Nilai DO (Rp)','Karton ekuivalen'),'rows',v_customer_rows),
  jsonb_build_object('title','Rincian Nilai DO per SKU',
   'headers',jsonb_build_array('SKU','Merek','Total pack','Nilai DO (Rp)','Pack per karton','Karton ekuivalen'),'rows',v_sku_rows),
  jsonb_build_object('title','Rincian Nilai DO per Area',
   'headers',jsonb_build_array('Area','Jumlah SJ','Total pack','Nilai DO (Rp)','Karton ekuivalen'),'rows',v_area_rows),
  jsonb_build_object('title','Kategori HJE — nominal tetap nilai jual DO',
   'headers',jsonb_build_array('Kategori HJE','Reguler pack','Sampel pack','Total pack','Nilai DO (Rp)','Karton ekuivalen'),'rows',v_hje_rows),
  jsonb_build_object('title','Kontrol Rekonsiliasi',
   'headers',jsonb_build_array('Pemeriksaan','Status','Keterangan'),
   'rows',jsonb_build_array(
      jsonb_build_array('Harga kerja','OPEN RECON','Invoice final belum direkonsiliasi'),
      jsonb_build_array('Piutang','BELUM VALID','Saldo awal dan alokasi pembayaran belum lengkap'),
      jsonb_build_array('Audit pembaruan','SOURCE VERIFIED',p_validation_note),
      jsonb_build_array('September LOCKED','TIDAK DIUBAH','Sinkron ini hanya analitik DO November'))));
 v_payload:=jsonb_build_object('notice',format('DO %s: %s SJ, %s baris, %s pack, Rp%s (harga kerja). Status OPEN RECON; nomor SJ tidak ditambahkan dua kali.',v_version,v_sj,v_lines,v_pack,v_nom),
  'tables',v_tables,'disclaimer','Nilai DO berdasarkan harga kerja, bukan piutang final atau uang yang diterima. Data sumber kerja diterima Owner; status physical delivery/QC/customer belum dipastikan.',
  'report_state','WORKING / OPEN RECON',
  'provenance',jsonb_build_object('source_document_id',v_doc,'source_sha256',p_sha,
     'source_library_file_id',p_library_id,'source_file',p_filename,'source_version',p_source_version,
     'actual_cutoff',p_cutoff,'validation_note',p_validation_note,
     'method','FULL_REPLACEMENT_WITH_HISTORICAL_LINE_CONSERVATION'),
  'missing_inputs',jsonb_build_array('Invoice final dan alokasi pembayaran per SJ',
      'Konflik SJ322, SJ327, SJ328 perlu bukti',
      'SJ334 belum tercakup konsolidasi Kas Bank V16'),
  'source_refs',jsonb_build_array(v_ref));
 insert into ppic_private.report_snapshots(report_key,period,title,cutoff,version,status,basis,payload,source_refs)
 values('09',p_period,'DO, Piutang & Forecast',p_cutoff,v_version,'OPEN RECON','MIXED',v_payload,jsonb_build_array(v_ref))
 returning id into v_report_id;

 insert into ppic_private.do_auto_publish_receipts(period,source_sha256,source_document_id,source_library_file_id,
  source_cutoff,source_version,analytics_version,details_snapshot_id,daily_snapshot_id,report_snapshot_id,
  total_sj,total_lines,total_pack,total_nominal)
 values(p_period,p_sha,v_doc,p_library_id,p_cutoff,p_source_version,v_version,v_doid,v_daily_id,v_report_id,
  v_sj,v_lines,v_pack,v_nom) returning id into v_rec.id;
 return jsonb_build_object('ok',true,'status','ANALYTICS_UPDATED','receipt_id',v_rec.id,
  'period',p_period,'cutoff',p_cutoff,'source_document_id',v_doc,
  'source_sha256',p_sha,'report_version',v_version,'total_sj',v_sj,'total_lines',v_lines,
  'total_pack',v_pack,'nominal_rp',v_nom,'official_books_changed',false);
end $fn$;

revoke all on function ppic_private.do_auto_publish_validated(text,date,text,text,text,text,jsonb,jsonb,text)
 from public,anon,authenticated,service_role;
