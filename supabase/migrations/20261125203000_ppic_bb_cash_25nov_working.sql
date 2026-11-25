-- Source-qualified finance/material balances in PPIC to Nov 25, append-only, NOT bank/stock posting.
create or replace function ppic_private.publish_supporting_balances_25nov(p_division text)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,ppic_private as $fn$
declare
 v_data jsonb;v_meta jsonb;v_hash text;v_doc text;v_ref jsonb;v_facts jsonb;v_report_payload jsonb;
 v_reportid uuid;v_receiptid uuid;v_report text;v_title text;v_version text;v_file text;v_library text;
 v_rows jsonb;v_notes jsonb;v_cutoff date:='2026-11-25';
begin
 perform ppic_private.robot_assert_writable_period('2026-11');
 perform pg_advisory_xact_lock(hashtextextended('ppic:support:20261125:'||p_division,0));
 if p_division='BAHAN BAKU' then
  if abs((1213468120.5363536+231454370.5-346329475-6070000)-1092523016.0363536)>0.01
  then raise exception 'BB_25_FINANCE_ROLLFORWARD_MISMATCH';end if;
  v_file:='PR_BAL_BAHAN_BAKU_NOVEMBER_2026_V018_CUTOFF_25NOV_OPEN_RECON.xlsx';
  v_library:='libfile_fde3_f-f64b3279d45c819189da89c8e9b78e2d_651490bce7948191a073e9ed83bb583b';
  v_version:='V018';v_report:='04';v_title:='Material Requirements Planning';
  v_data:=jsonb_build_object('opening_rp',1213468120.5363536,'in_rp',231454370.5,
   'usage_rp',346329475,'stock_adjustment_out_rp',6070000,
   'book_closing_reference_rp',1092523016.0363536,
   'sku_codes',64,'priced_codes',51,'unpriced_codes',13,'not_actual_hpp',true);
  v_rows:=jsonb_build_array(
  jsonb_build_array('Saldo awal',1213468120.54,'Nilai acuan parsial'),
  jsonb_build_array('Pembelian/pemasukan',231454370.50,'Termasuk 24 baris penerimaan'),
  jsonb_build_array('Pemakaian produksi',346329475,'Tidak termasuk SO'),
  jsonb_build_array('Penyesuaian SO keluar',6070000,'LA 336 roll dan K-02 5000 lembar'),
  jsonb_build_array('SALDO AKHIR KERJA',1092523016.04,'Bukan nominal final; 13 kode belum berharga'),
  jsonb_build_array('Kode tanpa harga',13,'dari total 64 kode BB'),
  jsonb_build_array('Bukti 25Nov belum dipadankan',1,'6 SKT vs5 Excel, HOLD'));
  v_notes:=jsonb_build_array('Kuantitas 64 bahan lintas unit tidak dijumlahkan.',
   'Penyesuaian stok opname tidak mengganti QC; 13 kode tanpa harga.',
   'AJM payment 24Nov Rp18424800 is settlement, not additional purchase.',
   'PO 056 matching and SKT receipt count 6 vs5 require verification.');
 elsif p_division='KAS BANK' then
  if abs((2970848428.42+4850023462-4535000640)-3285871250.42)>0.01
   then raise exception 'KAS_25_ROLLFORWARD_MISMATCH';end if;
  v_file:='PR_BAL_KAS_BANK_NOVEMBER_2026_V23_CUTOFF_25NOV_PPN_CORETAX_AJI_FARUQ_OPEN_RECON.xlsx';
  v_library:='libfile_fde3_f-1df05e4a6bf8819184ebfc68678c855c_651490bce7948191a073e9ed83bb583b';
  v_version:='V023';v_report:='08';v_title:='Proyeksi Kebutuhan Kas Produksi';
  v_data:=jsonb_build_object('opening_rp',2970848428.42,
    'external_receipts_identified_rp',4850023462,
    'external_payments_identified_rp',4535000640,
    'indicative_consolidated_rp',3285871250.42,
    'bca_book_indicative_rp',242037558.42,
    'internal_transfer_unmatched_rp',944350000,
    'bank_statement_confirmed',false,'free_cash_confirmed',false);
  v_rows:=jsonb_build_array(
   jsonb_build_array('Saldo awal 4 buku',2970848428.42,'Kas Farizal belum lengkap'),
   jsonb_build_array('Penerimaan eksternal tercatat',4850023462,'Tidak sama DO kerja'),
   jsonb_build_array('Pengeluaran eksternal tercatat',4535000640,'Termasuk PPN October paid'),
   jsonb_build_array('SALDO GABUNGAN INDIKATIF',3285871250.42,'Bukan saldo bank koran/free cash'),
   jsonb_build_array('Saldo BCA buku indikatif',242037558.42,'Bank match belum final'),
   jsonb_build_array('Transfer internal belum matching',944350000,'Clearing, bukan penerimaan baru'),
   jsonb_build_array('DO kerja 25Nov',5606380000,'Bukan kas masuk, jangan digandakan'));
  v_notes:=jsonb_build_array('Rupiah Rp3.28587125bn is book indicative, not actual bank balance.',
    'Internal transfers Rp944.35m matching open and not net new customer money.',
    'Aji/Faruq receipts and October PPN need invoice/CORETAX/bank proof.',
    'No payment, account statement or official tax action posted.');
 else raise exception 'UNSUPPORTED_SUPPORTING_DIVISION';end if;
 v_hash:=encode(extensions.digest('PPIC_25NOV_VERIFIED_EXTRACT|'||p_division||'|'||v_library||'|'||v_data::text,'sha256'),'hex');
 v_doc:='PPIC_202611_'||replace(p_division,' ','_')||'_EXT_'||left(v_hash,15);
 if exists(select 1 from ppic_private.working_ledger_promotion_receipts
    where period='2026-11' and division=p_division and extract_sha256=v_hash)
 then return jsonb_build_object('ok',true,'status','NO_CHANGE','division',p_division);end if;
 if exists(select 1 from ppic_private.source_registry
  where period='2026-11' and division=p_division
  and (cutoff at time zone 'Asia/Jakarta')::date>v_cutoff)
 or exists(select 1 from ppic_private.report_snapshots
  where period='2026-11' and report_key=v_report and (cutoff>v_cutoff or version='V020'))
 then raise exception 'SUPPORTING_25_NEWER_CONFLICT';end if;
 v_ref:=jsonb_build_object('document_id',v_doc,'date','2026-11-25','title',v_file,'version',v_version,
 'source_extract_sha256',v_hash,'source_hash_kind','NORMALIZED_TEXT_EXTRACT',
 'library_file_id',v_library,'scope','Extracted XLSX book WORKING, not official bank/physical HPP');
 insert into ppic_private.source_registry(document_id,division,period,cutoff,version,sha256,
 reconciliation_status,access_class,private_locator)
 values(v_doc,p_division,'2026-11','2026-11-25 00:00:00+07',v_version,v_hash,
 'OPEN RECON','CONFIDENTIAL','library-extract:'||v_library||';not-binary-sha256');
 v_facts:=jsonb_build_object('schema_version','ppic-robot-facts-v1',
 'division',p_division,'period','2026-11','cutoff','2026-11-25',
 'version',v_version,'source_sha256',v_hash,
 'facts',case when p_division='BAHAN BAKU' then jsonb_build_array(
 jsonb_build_object('key','book_closing_reference_value','label','Nilai saldo bahan baku kerja','value',1092523016.04,'unit','Rp',
 'scope','Bahan Baku periode','source_sheet','RINGKASAN','source_range','B4:D26','quality','REFERENCE',
 'note','51 priced codes, 13 missing; not HPP actual'),
 jsonb_build_object('key','book_incoming_reference_value','label','Masuk barang bahan baku','value',231454370.5,'unit','Rp',
 'scope','Bahan Baku periode','source_sheet','RINGKASAN','source_range','B4:D26','quality','REFERENCE',
 'note','24 book receipt lines, 6 SKT receipts vs 5 Excel25 mismatch'),
 jsonb_build_object('key','material_unpriced_count','label','Kode bahan tanpa harga','value',13,'unit','kode',
 'scope','Bahan Baku periode','source_sheet','RINGKASAN','source_range','B16:D19','quality','SOURCE','note','No invented costs')
 ) else jsonb_build_array(
 jsonb_build_object('key','indicative_balance','label','Saldo kas bank indikatif','value',3285871250.42,'unit','Rp',
 'scope','Kas bank buku','source_sheet','00 Dashboard','source_range','A1:D11','quality','ESTIMATE',
 'note','Not bank statement; includes internal transfers clearing'),
 jsonb_build_object('key','internal_transfer_unmatched','label','Transfer internal belum cocok','value',944350000,'unit','Rp',
 'scope','Kas bank buku','source_sheet','00 Dashboard','source_range','A1:D11','quality','REFERENCE',
 'note','Do not treat as new external income'),
 jsonb_build_object('key','verified_bank_balance','label','Saldo bank terkonfirmasi','value',null,'unit','Rp',
 'scope','Kas bank buku','source_sheet','02 Saldo','source_range','A2:H12','quality','MISSING',
 'note','Bank statement full reconciliation unavailable')
 ) end,
 'issues',jsonb_build_array(
 jsonb_build_object('code','SOURCE_NOT_FULLY_RECONCILED','severity','HIGH','title','25 Nov working book has unresolved evidence',
 'detail',case when p_division='BAHAN BAKU' then '13 unpriced codes and SKT 6 receipt vs Excel5 discrepancy.' else
 'Bank reconciliation and internal transfer clearing Rp944.35m remain open.' end,
 'fact_keys',case when p_division='BAHAN BAKU' then jsonb_build_array('book_closing_reference_value','material_unpriced_count')
 else jsonb_build_array('indicative_balance','internal_transfer_unmatched') end,
 'source_sheet',case when p_division='BAHAN BAKU' then 'RINGKASAN' else '00 Dashboard' end,
 'source_range','A2:D27')));
 perform ppic_private.robot_record_source_facts(v_doc,v_hash,v_facts);
 v_report_payload:=jsonb_build_object('notice',case when p_division='BAHAN BAKU'
 then 'Bahan Baku 25 Nov nilai saldo acuan Rp1092523016,04, 13 harga belum tersedia; not HPP final.'
 else 'Kas Bank 25 Nov saldo gabungan indikatif Rp3285871250,42; not bank actual.' end,
 'tables',jsonb_build_array(jsonb_build_object(
 'title',case when p_division='BAHAN BAKU' then 'Ringkasan Persediaan Bahan Baku'
 else 'Ringkasan Kas Bank (Indikatif)' end,
 'headers',jsonb_build_array('Indikator','Nominal Rupiah / Jumlah','Status / Ruang Lingkup'),
 'rows',v_rows)),
 'report_state','WORKING / OPEN RECON','notes',v_notes,'source_refs',jsonb_build_array(v_ref),
 'provenance',v_ref,'disclaimer','This is a validated working reference, not final cash, costing or approval.');
 insert into ppic_private.report_snapshots(report_key,period,title,cutoff,version,status,basis,payload,source_refs)
 values(v_report,'2026-11',v_title,v_cutoff,'V020','OPEN RECON','MIXED',
 v_report_payload,jsonb_build_array(v_ref)) returning id into v_reportid;
 insert into ppic_private.working_ledger_promotion_receipts(period,division,cutoff,extract_sha256,
 source_document_id,source_library_file_id,source_workbook_version,snapshot_ids,summary)
 values('2026-11',p_division,v_cutoff,v_hash,v_doc,v_library,v_version,jsonb_build_array(v_reportid),v_data)
 returning id into v_receiptid;
 return jsonb_build_object('ok',true,'status','WORKING_REFERENCE_UPDATED','division',p_division,
 'cutoff','2026-11-25','source_document_id',v_doc,'receipt_id',v_receiptid,
 'report_version','V020','source_extract_sha256',v_hash,
 'cash_or_physical_book_posted',false);
end $fn$;
revoke all on function ppic_private.publish_supporting_balances_25nov(text)
 from public,anon,authenticated,service_role;
