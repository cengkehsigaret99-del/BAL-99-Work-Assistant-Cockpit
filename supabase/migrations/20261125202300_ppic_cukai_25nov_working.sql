-- PPIC Cukai 25 Nov: source-fact reconciliation to independent Robot Cukai 25 Nov
-- Reference source: PR_BAL_CUKAI_NOVEMBER_2026_V6_25NOV.xlsx and official
-- robot snapshot 9336eaac-ec4e-48b6-b9fd-76c728e093db, NO physical rebooking.
create or replace function ppic_private.publish_cukai_working_25nov()
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,ppic_private as $fn$
declare
 v_hash text;v_doc text;v_fact jsonb;v_ref jsonb;v_report jsonb;v_daily jsonb;
 v_reportid uuid;v_daily_ids jsonb:='[]'::jsonb;v_dailyid uuid;v_receiptid uuid;
 v_hje record;v_counter int:=0;
 v_library text:='libfile_fde3_f-bf6987d2679c81919edfed1b894c7a6a_651490bce7948191a073e9ed83bb583b';
begin
 perform ppic_private.robot_assert_writable_period('2026-11');
 perform pg_advisory_xact_lock(hashtextextended('ppic:cukai:25nov:v6',0));
 if 523455+1080000-1016560<>586895
 or 231100+540000-506210<>264890
 or 251200+540000-504800<>286400
 or 41155-5550<>35605
 then raise exception 'CUKAI_25_ROLLFORWARD_INVALID';end if;
 v_hash:=encode(extensions.digest('CUKAI_V6_NOV25_EXTRACT|9336eaac-ec4e-48b6-b9fd-76c728e093db|'
  ||v_library||'|10325:231100:540000:506210:264890|13775:251200:540000:504800:286400'
  ||'|10500:41155:0:5550:35605','sha256'),'hex');
 v_doc:='PPIC_202611_CUKAI_EXT_'||left(v_hash,18);
 if exists(select 1 from ppic_private.working_ledger_promotion_receipts where period='2026-11'
  and division='CUKAI' and extract_sha256=v_hash)
 then return jsonb_build_object('ok',true,'status','NO_CHANGE','division','CUKAI','closing_keping',586895);end if;
 if exists(select 1 from ppic_private.source_registry where period='2026-11'
   and division='CUKAI' and (cutoff at time zone 'Asia/Jakarta')::date>date '2026-11-25')
 or exists(select 1 from ppic_private.report_snapshots where period='2026-11'
   and report_key='05' and (version='V004' or cutoff>date '2026-11-25'))
 then raise exception 'CUKAI_25_NEWER_RECORD_CONFLICT';end if;
 v_ref:=jsonb_build_object('document_id',v_doc,'title','PR_BAL_CUKAI_NOVEMBER_2026_V6_25NOV.xlsx',
  'source_kind','CONNECTED_CUKAI_ROBOT_PLUS_WORKBOOK',
  'source_extract_sha256',v_hash,'library_file_id',v_library,
  'cukai_robot_snapshot_id','9336eaac-ec4e-48b6-b9fd-76c728e093db',
  'date','2026-11-25','version','V006','note','Cukai book. Factory 226895 is estimate; 360000 unconfirmed in physical location. Not raw workbook byte hash.');
 insert into ppic_private.source_registry(document_id,division,period,cutoff,version,
  sha256,reconciliation_status,access_class,private_locator)
 values(v_doc,'CUKAI','2026-11','2026-11-25 00:00:00+07','V006',v_hash,'OPEN RECON',
 'CONFIDENTIAL','cukai-robot-snapshot:9336eaac-ec4e-48b6-b9fd-76c728e093db;library-extract:'||v_library);
 v_fact:=jsonb_build_object('schema_version','ppic-robot-facts-v1',
 'division','CUKAI','period','2026-11','cutoff','2026-11-25','version','V006','source_sha256',v_hash,
 'facts',jsonb_build_array(
 jsonb_build_object('key','book_closing_keping','label','Saldo buku pita gabungan','value',586895,'unit','keping','scope','Pita Cukai Nov','source_sheet','Robot Cukai V6','source_range','hjes[0:2]','quality','SOURCE','note','Independent robot cutoff25 agrees with closing of all three HJE'),
 jsonb_build_object('key','book_opening_keping','label','Saldo awal','value',523455,'unit','keping','scope','Pita Cukai Nov','source_sheet','Robot Cukai V6','source_range','hjes[0:2]','quality','SOURCE','note','Opening carried forward from October'),
 jsonb_build_object('key','book_purchase_keping','label','Pembelian sah','value',1080000,'unit','keping','scope','Pita Cukai Nov','source_sheet','Robot Cukai V6','source_range','hjes[0:2]','quality','SOURCE','note','Cancelled CK1 not included; no double purchase'),
 jsonb_build_object('key','book_usage_keping','label','Pemakaian buku','value',1016560,'unit','keping','scope','Pita Cukai Nov','source_sheet','Robot Cukai V6','source_range','hjes[0:2]','quality','SOURCE','note','Includes 30000 HJE10325 Nov25 and refill 3050 Nov24 already booked'),
 jsonb_build_object('key','hje_10325_closing','label','Saldo HJE 10.325','value',264890,'unit','keping','scope','Pita Cukai Nov','source_sheet','Robot Cukai V6','source_range','hjes[0]','quality','SOURCE','note','HJE 10325 used506210'),
 jsonb_build_object('key','hje_13775_closing','label','Saldo HJE 13.775','value',286400,'unit','keping','scope','Pita Cukai Nov','source_sheet','Robot Cukai V6','source_range','hjes[1]','quality','SOURCE','note','HJE 13775 used504800'),
 jsonb_build_object('key','hje_10500_closing','label','Saldo Refill 10.500','value',35605,'unit','keping','scope','Pita Cukai Nov','source_sheet','Robot Cukai V6','source_range','hjes[2]','quality','SOURCE','note','Refill used5550, incl3050 Nov24'),
 jsonb_build_object('key','factory_stock_estimated','label','Pita di pabrik perkiraan','value',226895,'unit','keping','scope','Pita Cukai Nov','source_sheet','Robot Cukai V6','source_range','assumptions[0]','quality','ESTIMATE','note','Not physical inventory count; 360000 unconfirmed location'),
 jsonb_build_object('key','confirmed_factory_stock','label','Pita pabrik hasil opname','value',null,'unit','keping','scope','Pita Cukai Nov','source_sheet','Robot Cukai V6','source_range','assumptions[0]','quality','MISSING','note','No signed physical count supplied')
 ),'issues',jsonb_build_array(
 jsonb_build_object('code','CUKAI_UNCONFIRMED_FACTORY','severity','HIGH','title','Factory physical location not confirmed',
  'detail','Factory 226895 is estimated, 360000 unconfirmed location; factory breakdown not an opname.',
  'fact_keys',jsonb_build_array('factory_stock_estimated','confirmed_factory_stock'),
  'source_sheet','Robot Cukai V6','source_range','assumptions[0]'),
 jsonb_build_object('code','CUKAI_USAGE_NOT_DOUBLE','severity','MEDIUM','title','Preexisting November usage already included',
  'detail','Nov25 usage HJE10325 30000 and Nov24 refill3050 already included in 1016560, not to subtract again.',
  'fact_keys',jsonb_build_array('book_usage_keping','book_closing_keping'),
  'source_sheet','Robot Cukai V6','source_range','hjes[0:2]')));
 perform ppic_private.robot_record_source_facts(v_doc,v_hash,v_fact);

 for v_hje in select * from(values
  ('CUKAI 10.325',231100::bigint,540000::bigint,506210::bigint,264890::bigint),
  ('CUKAI 13.775',251200::bigint,540000::bigint,504800::bigint,286400::bigint),
  ('CUKAI REFILL',41155::bigint,0::bigint,5550::bigint,35605::bigint)
 ) x(division,opening,received,used,closing) loop
  if exists(select 1 from ppic_private.daily_ledger_snapshots where period='2026-11'
    and division=v_hje.division and version='V002') then raise exception 'CUKAI_25_DAILY_VERSION_CONFLICT';end if;
  v_daily:=jsonb_build_object(
    'cols',jsonb_build_array('day','in_qty','out_qty','in_nominal','out_nominal'),
    'unit','keping','opening_qty',v_hje.opening,'opening_nominal',null,'entries','[]'::jsonb,
    'valid_through','2026-11-25','book_period_receipts',v_hje.received,
    'book_period_usage',v_hje.used,'book_closing',v_hje.closing,
    'quantity_basis','ROBOT CUKAI OFFICIAL BOOK / OPEN RECON',
    'nominal_basis','WAC ESTIMATE NOT POSTED; no physical opname',
    'notes',jsonb_build_array('Book totals are exact, per-day entries not imported through PPIC. Read connected Robot Cukai for daily usage.',
     'Missing dates in the source are NOT zero consumption.','No new CK1 purchase or physical stamp movement posted.'),
    'provenance',v_ref);
  insert into ppic_private.daily_ledger_snapshots(period,division,cutoff,version,status,unit,
   valuation_basis,payload,source_document_ids)
  values('2026-11',v_hje.division,'2026-11-25','V002','OPEN RECON','keping',
   'CUKAI BOOK, WAC ESTIMATE',v_daily,jsonb_build_array(v_doc)) returning id into v_dailyid;
  v_daily_ids:=v_daily_ids||to_jsonb(v_dailyid);
  v_counter:=v_counter+1;
 end loop;
 v_report:=jsonb_build_object(
 'notice','Saldo Cukai 25 November: 586895 keping, opening523455 + purchases1080000 - usage1016560. BOOK OPEN RECON.',
 'tables',jsonb_build_array(
 jsonb_build_object('title','Saldo buku Pita per HJE 25 November','headers',jsonb_build_array('HJE','Awal keping','Pembelian','Pemakaian','Akhir buku','Estimasi kapasitas karton buku'),
 'rows',jsonb_build_array(
 jsonb_build_array('10.325',231100,540000,506210,264890,264),
 jsonb_build_array('13.775',251200,540000,504800,286400,358),
 jsonb_build_array('Refill 10.500',41155,0,5550,35605,null),
 jsonb_build_array('TOTAL',523455,1080000,1016560,586895,null))),
 jsonb_build_object('title','Kontrol saldo fisik dan pembukuan','headers',jsonb_build_array('Indikator','Nilai','Sumber/status'),
 'rows',jsonb_build_array(
 jsonb_build_array('Pita pabrik estimasi',226895,'ESTIMATE only'),
 jsonb_build_array('Lokasi belum konfirmasi',360000,'OPEN RECON'),
 jsonb_build_array('Saldo hasil opname',null,'MISSING'),
 jsonb_build_array('Refill 24 November 3050',3050,'SUDAH DALAM PEMAKAIAN; jangan ulang')))),
 'report_state','WORKING / OPEN RECON','source_refs',jsonb_build_array(v_ref),
 'disclaimer','Saldo buku resmi Robot Cukai, belum dipastikan lokasi fisik. WAC/biaya belum HPP final.',
 'provenance',v_ref);
 insert into ppic_private.report_snapshots(report_key,period,title,cutoff,version,status,basis,payload,source_refs)
 values('05','2026-11','Kontrol Pita Cukai per HJE, HPP & Kapasitas Karton','2026-11-25','V004',
 'OPEN RECON','MIXED',v_report,jsonb_build_array(v_ref)) returning id into v_reportid;

 insert into ppic_private.working_ledger_promotion_receipts(period,division,cutoff,extract_sha256,
 source_document_id,source_library_file_id,source_workbook_version,snapshot_ids,summary)
 values('2026-11','CUKAI','2026-11-25',v_hash,v_doc,v_library,'V006',v_daily_ids||to_jsonb(v_reportid),
 jsonb_build_object('opening',523455,'purchase',1080000,'usage',1016560,'closing',586895,
 'hje_10325',264890,'hje_13775',286400,'refill',35605,'physical_confirmed',false))
 returning id into v_receiptid;
 return jsonb_build_object('ok',true,'status','WORKING_LEDGER_UPDATED','division','CUKAI',
 'cutoff','2026-11-25','closing_keping',586895,'receipt_id',v_receiptid,
 'factory_physical_confirmed',false,'source_extract_sha256',v_hash);
end $fn$;
revoke all on function ppic_private.publish_cukai_working_25nov() from public,anon,authenticated,service_role;
