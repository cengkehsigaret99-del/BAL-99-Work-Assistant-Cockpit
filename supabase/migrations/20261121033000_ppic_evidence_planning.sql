-- BAL PPIC Stage 3B: evidence-gated, read-only production and dispatch readiness.
-- Does not alter source registry, official reports, CK-1, stock, finance or payroll.
create table if not exists ppic_private.skt_form_observations (
 id uuid primary key default gen_random_uuid(),
 period text not null check (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' and period>='2026-11'),
 source_system text not null default 'WEB_SKT_MIRROR' check (source_system='WEB_SKT_MIRROR'),
 content_revision text not null check (content_revision ~ '^BAL-MIRROR-[a-f0-9]{64}$'),
 captured_at timestamptz not null,
 completeness text not null check(completeness='COMPLETE_CURRENT_FORMS'),
 counts jsonb not null check(jsonb_typeof(counts)='object'),
 scope jsonb not null check(jsonb_typeof(scope)='object'),
 created_at timestamptz not null default now(),
 unique(period,content_revision)
);
create index if not exists skt_form_observations_period_idx on ppic_private.skt_form_observations(period,created_at desc);
alter table ppic_private.skt_form_observations enable row level security;
revoke all on ppic_private.skt_form_observations from public,anon,authenticated,service_role;

create table if not exists ppic_private.plan_readiness_snapshots (
 id uuid primary key default gen_random_uuid(),
 period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' and period>='2026-11'),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 decision_snapshot_id uuid not null references ppic_private.stage3_decision_snapshots(id),
 skt_revision text not null,
 skt_observation_id uuid references ppic_private.skt_form_observations(id),
 analysis_as_of date not null,
 state text not null check(state in ('HOLD_DATA','PROPOSALS_READY')),
 gates jsonb not null check(jsonb_typeof(gates)='array'),
 source_facts jsonb not null check(jsonb_typeof(source_facts)='array'),
 proposal_lines jsonb not null check(jsonb_typeof(proposal_lines)='array'),
 next_actions jsonb not null check(jsonb_typeof(next_actions)='array'),
 sdm_metadata_conflict boolean not null default false,
 created_at timestamptz not null default now(),
 unique(period,evidence_hash,decision_snapshot_id,skt_revision)
);
create index if not exists plan_readiness_period_idx on ppic_private.plan_readiness_snapshots(period,created_at desc);
alter table ppic_private.plan_readiness_snapshots enable row level security;
revoke all on ppic_private.plan_readiness_snapshots from public,anon,authenticated,service_role;

create or replace function ppic_private.record_skt_form_observation(
 p_period text,p_revision text,p_captured_at timestamptz,p_counts jsonb,p_scope jsonb
) returns jsonb language plpgsql security invoker
set search_path=pg_catalog,ppic_private as $fn$
declare v_id uuid; v_required text[]:=array['daily_reports','sj_documents','bb_documents','co_orders','co_realizations','co_allocations','bb_master_entries','total_documents']; k text;
begin
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
   or p_period < '2026-11' or p_period > to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
   or p_revision is null or p_revision !~ '^BAL-MIRROR-[a-f0-9]{64}$'
   or p_captured_at is null or p_counts is null or jsonb_typeof(p_counts)<>'object'
   or p_scope is null or jsonb_typeof(p_scope)<>'object'
   or p_scope->>'current_forms_only' is distinct from 'true'
   or p_scope->>'latest_versions_only' is distinct from 'true'
   or p_scope->>'full_database_backup' is distinct from 'false'
   or p_scope->>'no_reimport_as_transactions' is distinct from 'true'
 then raise exception 'SKT_MANIFEST_INVALID' using errcode='22023';end if;
 if (select count(*) from jsonb_object_keys(p_counts))<>cardinality(v_required)
 then raise exception 'SKT_MANIFEST_COUNTS_INVALID' using errcode='22023';end if;
 foreach k in array v_required loop
  if jsonb_typeof(p_counts->k) is distinct from 'number' or (p_counts->>k)!~ '^[0-9]{1,7}$'
  then raise exception 'SKT_MANIFEST_COUNT_INVALID' using errcode='22023';end if;
 end loop;
 select id into v_id from ppic_private.skt_form_observations where period=p_period and content_revision=p_revision;
 if found then return jsonb_build_object('ok',true,'status','NO_CHANGE','id',v_id,'period',p_period,'revision',p_revision);end if;
 insert into ppic_private.skt_form_observations(period,content_revision,captured_at,completeness,counts,scope)
 values(p_period,p_revision,p_captured_at,'COMPLETE_CURRENT_FORMS',p_counts,p_scope)
 on conflict (period,content_revision) do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from ppic_private.skt_form_observations where period=p_period and content_revision=p_revision;
  return jsonb_build_object('ok',true,'status','NO_CHANGE','id',v_id,'period',p_period,'revision',p_revision);
 end if;
 return jsonb_build_object('ok',true,'status','OBSERVED','id',v_id,'period',p_period,'revision',p_revision,
  'current_form_count',p_counts->'total_documents');
end $fn$;

create or replace function ppic_private.plan_source_fact(p_period text,p_division text,p_key text)
returns jsonb language sql security invoker stable
set search_path=pg_catalog,ppic_private as $fn$
 select jsonb_build_object('key',f.value->>'key','value',f.value->'value','unit',f.value->>'unit',
  'quality',f.value->>'quality','cutoff',s.cutoff,'document_id',s.document_id,'division',s.division)
 from ppic_private.robot_selected_sources(p_period) s
 cross join lateral jsonb_array_elements(coalesce(s.fact_payload->'facts','[]'::jsonb)) f
 where s.division=p_division and f.value->>'key'=p_key
 order by s.cutoff desc,s.document_id desc limit 1
$fn$;

create or replace function ppic_private.plan_verified_qty(p_fact jsonb)
returns numeric language sql immutable security invoker
set search_path=pg_catalog,ppic_private as $fn$
 select case when p_fact->>'quality'='SOURCE' and jsonb_typeof(p_fact->'value')='number'
    and (p_fact->>'value')::numeric between 0 and 1000000000
    then (p_fact->>'value')::numeric else null end
$fn$;

create or replace function ppic_private.plan_refresh(p_period text)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,ppic_private as $fn$
declare
 v_hash text; v_context jsonb; v_decision ppic_private.stage3_decision_snapshots%rowtype;
 v_skt ppic_private.skt_form_observations%rowtype; v_skt_revision text:='UNAVAILABLE';
 v_existing uuid; v_gate jsonb:='[]'::jsonb; v_facts jsonb:='[]'::jsonb;
 v_tasks jsonb:='[]'::jsonb; v_lines jsonb:='[]'::jsonb;
 v_demand jsonb; v_stock jsonb; v_material jsonb; v_excise jsonb; v_capacity jsonb; v_wip jsonb;
 v_cash jsonb; v_bom jsonb; v_missing numeric; v_unarrived numeric;
 v_qty numeric; v_available numeric; v_material_cover numeric; v_pita_cover numeric; v_capacity_qty numeric;
 v_stock_num numeric; v_date date; v_mdate date; v_edate date; v_cdate date; v_fdate date;
 v_sku text; v_firm jsonb; v_ready jsonb; v_mat jsonb; v_pita jsonb; v_cap jsonb;
 v_status text; v_pending text[]; v_doc jsonb; r record; v_conflict boolean:=false; v_good integer:=0;
 v_skt_count integer;
begin
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_period < '2026-11'
  or p_period > to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'PLAN_INVALID_PERIOD' using errcode='22023';end if;
 if not exists(select 1 from ppic_private.robot_config where enabled=true)
 then return jsonb_build_object('ok',false,'status','ROBOT_DISABLED','period',p_period);end if;
 v_context:=ppic_private.robot_context(p_period);
 v_hash:=v_context->>'evidence_hash';
 if v_hash is null or v_hash !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('ok',false,'status','WAITING_EVIDENCE','period',p_period);end if;
 select * into v_decision from ppic_private.stage3_decision_snapshots
 where period=p_period and evidence_hash=v_hash order by created_at desc,id desc limit 1;
 if not found then return jsonb_build_object('ok',false,'status','WAITING_STAGE3','period',p_period);end if;
 if v_decision.briefing_id is distinct from (select id from ppic_private.robot_briefings where period=p_period order by created_at desc,id desc limit 1)
 then return jsonb_build_object('ok',false,'status','WAITING_GPT_BRIEF','period',p_period);end if;
 select * into v_skt from ppic_private.skt_form_observations where period=p_period order by created_at desc,id desc limit 1;
 if found then v_skt_revision:=v_skt.content_revision;end if;
 select id into v_existing from ppic_private.plan_readiness_snapshots
 where period=p_period and evidence_hash=v_hash and decision_snapshot_id=v_decision.id and skt_revision=v_skt_revision;
 if found then return jsonb_build_object('ok',true,'status','NO_CHANGE','id',v_existing,'period',p_period,'evidence_hash',v_hash);end if;

 v_demand:=ppic_private.plan_source_fact(p_period,'DO','verified_firm_order_pack');
 v_stock:=ppic_private.plan_source_fact(p_period,'BARANG JADI','ready_for_delivery_pack');
 v_material:=ppic_private.plan_source_fact(p_period,'BAHAN BAKU','missing_capacity_material_count');
 v_excise:=ppic_private.plan_source_fact(p_period,'CUKAI','not_arrived_keping');
 v_capacity:=ppic_private.plan_source_fact(p_period,'GILING','physical_stock_batang');
 v_wip:=ppic_private.plan_source_fact(p_period,'SDM GILING','confirmed_current_output');
 v_cash:=ppic_private.plan_source_fact(p_period,'KAS BANK','indicative_balance');
 v_bom:=ppic_private.plan_source_fact(p_period,'BAHAN BAKU','material_op_07_closing');
 for v_doc in select value from jsonb_array_elements(jsonb_build_array(v_demand,v_stock,v_material,v_excise,v_capacity,v_wip,v_cash,v_bom))
 loop if v_doc is not null and v_doc<>'null'::jsonb then v_facts:=v_facts||jsonb_build_array(v_doc);end if;end loop;
 select exists(select 1 from jsonb_array_elements(coalesce(v_context->'coverage','[]'::jsonb)) c where c->>'division'='SDM GILING'
  and c->>'report_status'='METADATA_CONFLICT') into v_conflict;
 v_skt_count:=case when v_skt.id is null then null else (v_skt.counts->>'co_orders')::integer end;

 -- A count of customer-order forms does NOT establish firm order quantities, per-SKU demand or allocation.
 v_gate:=v_gate||jsonb_build_array(jsonb_build_object(
  'code','FIRM_ORDER_LINES','label','Pesanan firm per SKU','state','MISSING_PROOF',
  'observed_forms',v_skt_count,'basis','SKT_CURRENT_FORM_COUNT_NOT_FIRM_ORDERS',
  'message','Jumlah formulir pesanan SKT belum membuktikan pesanan firm, SKU, qty, tanggal kirim dan alokasi.',
  'owner_role','Admin DO / Customer / Sales'));
 v_gate:=v_gate||jsonb_build_array(jsonb_build_object(
  'code','QC_AVAILABLE_STOCK','label','Barang Jadi bebas dan lolos QC','state',
   case when ppic_private.plan_verified_qty(v_stock) is null then 'MISSING_PROOF' else 'PARTIAL_PROOF' end,
  'message','Saldo buku BJ bukan stok siap kirim. Butuh lot lolos QC, fisik, retur, reservasi dan alokasi per SKU.',
  'owner_role','Gudang Barang Jadi / QC / DO'));
 v_missing:=ppic_private.plan_verified_qty(v_material);
 v_gate:=v_gate||jsonb_build_array(jsonb_build_object(
  'code','MATERIAL_BOM_COVER','label','BOM dan bahan pembatas','state',
   case when v_missing is null or v_missing>0 then 'MISSING_PROOF' else 'PARTIAL_PROOF' end,
  'message','BOM setiap SKU dan cakupan seluruh komponen perlu diverifikasi. Bahan pembatas yang tersisa nol tidak otomatis berarti seluruh produksi berhenti.',
  'owner_role','Gudang Bahan / PPIC / Purchasing'));
 v_unarrived:=ppic_private.plan_verified_qty(v_excise);
 v_gate:=v_gate||jsonb_build_array(jsonb_build_object(
  'code','PHYSICAL_EXCISE','label','Pita cukai fisik per HJE','state',
   case when v_unarrived is null or v_unarrived>0 then 'MISSING_PROOF' else 'PARTIAL_PROOF' end,
  'message','Pita belum terkonfirmasi tiba tidak dihitung sebagai stok fisik siap dipakai; saldo lokasi dari sumber masih estimasi.',
  'owner_role','Petugas Pita / Cukai / PPIC'));
 v_gate:=v_gate||jsonb_build_array(jsonb_build_object(
  'code','WIP_HANDOVER','label','Serah terima per SKU dan lot','state','MISSING_PROOF',
  'message','Akumulasi Giling dalam batang dan Verpack dalam pack tidak dapat dikurangkan tanpa transfer, QC, rijek dan stok WIP.',
  'owner_role','Mandor Giling / Verpack / Gudang'));
 v_gate:=v_gate||jsonb_build_array(jsonb_build_object(
  'code','EFFECTIVE_CAPACITY','label','Kapasitas efektif tenaga dan mesin','state',
  case when v_conflict then 'METADATA_CONFLICT' else 'MISSING_PROOF' end,
  'message','Target membutuhkan jam/shift efektif, kapasitas SKU, batas mesin, absensi terverifikasi, dan koreksi konflik tanggal SDM.',
  'owner_role','SDM / Mandor / PPIC'));
 v_gate:=v_gate||jsonb_build_array(jsonb_build_object(
  'code','COMMITMENT_CASH','label','Dana bebas dan jatuh tempo','state','MISSING_PROOF',
  'message','Saldo indikatif Kas/Bank bukan dana bebas untuk PO dan pembelian; perlu rekening koran serta daftar kewajiban.',
  'owner_role','Finance / Owner'));

 -- Optional future-ready path: numerical scenarios ONLY from explicitly VERIFIED SOURCE facts per SKU,
 -- five independent dimensions and identical verified cutoff dates. Historical outputs never qualify.
 for r in select s.cutoff,s.document_id,f.value as fact,
          substring(f.value->>'key' from '^firm_order_sku_(c_[0-9]{3})_pack$') as sku
  from ppic_private.robot_selected_sources(p_period) s,
    lateral jsonb_array_elements(coalesce(s.fact_payload->'facts','[]'::jsonb)) f
  where s.division='DO' and f.value->>'key' ~ '^firm_order_sku_c_[0-9]{3}_pack$'
  order by s.cutoff desc,f.value->>'key' limit 40
 loop
   v_sku:=r.sku;v_firm:=r.fact;v_qty:=ppic_private.plan_verified_qty(v_firm);
   v_ready:=ppic_private.plan_source_fact(p_period,'BARANG JADI','ready_unallocated_sku_'||v_sku||'_pack');
   v_mat:=ppic_private.plan_source_fact(p_period,'BAHAN BAKU','material_cover_verified_sku_'||v_sku||'_pack');
   v_pita:=ppic_private.plan_source_fact(p_period,'CUKAI','pita_cover_verified_sku_'||v_sku||'_pack');
   v_cap:=ppic_private.plan_source_fact(p_period,'VERPACK','effective_capacity_verified_sku_'||v_sku||'_pack');
   v_available:=ppic_private.plan_verified_qty(v_ready);
   v_material_cover:=ppic_private.plan_verified_qty(v_mat);
   v_pita_cover:=ppic_private.plan_verified_qty(v_pita);
   v_capacity_qty:=ppic_private.plan_verified_qty(v_cap);
   v_pending:=array[]::text[];
   if v_qty is null then v_pending:=array_append(v_pending,'FIRM_DEMAND_SOURCE');end if;
   if v_available is null then v_pending:=array_append(v_pending,'QC_UNALLOCATED_STOCK_SOURCE');end if;
   if v_material_cover is null then v_pending:=array_append(v_pending,'FULL_BOM_MATERIAL_COVER_SOURCE');end if;
   if v_pita_cover is null then v_pending:=array_append(v_pending,'PHYSICAL_EXCISE_COVER_SOURCE');end if;
   if v_capacity_qty is null then v_pending:=array_append(v_pending,'EFFECTIVE_CAPACITY_SOURCE');end if;
   if cardinality(v_pending)=0 then
     v_date:=r.cutoff;
     v_mdate:=(v_mat->>'cutoff')::date;v_edate:=(v_pita->>'cutoff')::date;
     v_cdate:=(v_cap->>'cutoff')::date;v_fdate:=(v_ready->>'cutoff')::date;
     if not(v_date=v_mdate and v_date=v_edate and v_date=v_cdate and v_date=v_fdate)
     then v_pending:=array_append(v_pending,'CUTOFF_DATE_MISMATCH');end if;
   end if;
   if cardinality(v_pending)>0 then
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('sku',v_sku,'state','HOLD','missing',to_jsonb(v_pending),
      'firm_order_pack',case when v_qty is not null then to_jsonb(v_qty) else null end,
      'available_pack',null,'proposed_ship_pack',null,'proposed_make_pack',null,
      'source_document_id',r.document_id,'owner_approval_required',true));
   else
    v_good:=v_good+1;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('sku',v_sku,'state','PROPOSAL_ONLY',
      'missing','[]'::jsonb,'firm_order_pack',v_qty,'available_pack',v_available,
      'proposed_ship_pack',least(v_qty,v_available),
      'proposed_make_pack',least(greatest(v_qty-v_available,0),v_material_cover,v_pita_cover,v_capacity_qty),
      'unit','pack','planning_cutoff',v_date,
      'source_document_id',r.document_id,'owner_approval_required',true));
   end if;
 end loop;

 v_tasks:=jsonb_build_array(
  jsonb_build_object('priority','P1','division','DO / Customer','task','Verifikasi pesanan firm per SKU, jumlah, tanggal kirim dan alokasi dengan sumber aslinya.','release_state','USULAN'),
  jsonb_build_object('priority','P1','division','Barang Jadi / QC','task','Cocokkan penerimaan 19–20 November, QC, stok fisik, retur dan alokasi per SKU sebelum menetapkan stok bebas.','release_state','USULAN'),
  jsonb_build_object('priority','P1','division','Cukai','task','Konfirmasi lokasi dan bukti fisik pita HJE 10.325/13.775/Refill serta kedatangan yang belum masuk pabrik.','release_state','USULAN'),
  jsonb_build_object('priority','P2','division','Giling / Verpack','task','Lengkapi serah terima WIP, rijek, hasil packing yang diterima dan jam efektif per SKU, bukan dari total kumulatif.','release_state','USULAN'),
  jsonb_build_object('priority','P2','division','Bahan Baku / Purchasing','task','Validasi BOM per SKU, bahan pembatas, penerimaan PO dan waktu vendor sebelum merekomendasikan PO baru.','release_state','USULAN'),
  jsonb_build_object('priority','P2','division','SDM / Finance','task','Selesaikan konflik tanggal SDM Giling dan rekonsiliasi dana bebas serta jatuh tempo.','release_state','USULAN'));

 v_status:=case when v_good>0 and cardinality(v_pending)=0
  and (select count(*) from jsonb_array_elements(v_lines) x where x->>'state'='HOLD')=0 then 'PROPOSALS_READY' else 'HOLD_DATA' end;
 -- If no firm demand source was received, v_good=0, which is a HOLD rather than a plan of zero units.
 if (ppic_private.robot_context(p_period)->>'evidence_hash') is distinct from v_hash
 then return jsonb_build_object('ok',false,'status','STALE_EVIDENCE','period',p_period);end if;
 insert into ppic_private.plan_readiness_snapshots(period,evidence_hash,decision_snapshot_id,
  skt_revision,skt_observation_id,analysis_as_of,state,gates,source_facts,proposal_lines,next_actions,sdm_metadata_conflict)
 values(p_period,v_hash,v_decision.id,v_skt_revision,v_skt.id,v_decision.analysis_as_of,
  v_status,v_gate,v_facts,v_lines,v_tasks,v_conflict)
 on conflict(period,evidence_hash,decision_snapshot_id,skt_revision) do nothing returning id into v_existing;
 if v_existing is null then
  select id into v_existing from ppic_private.plan_readiness_snapshots
   where period=p_period and evidence_hash=v_hash and decision_snapshot_id=v_decision.id and skt_revision=v_skt_revision;
  return jsonb_build_object('ok',true,'status','NO_CHANGE','period',p_period,'id',v_existing,'evidence_hash',v_hash);
 end if;
 return jsonb_build_object('ok',true,'status','READINESS_REFRESHED','id',v_existing,'period',p_period,
  'evidence_hash',v_hash,'business_status',v_status,'proposal_count',v_good,
  'skt_observed',v_skt.id is not null,'skt_order_forms',v_skt_count,'gate_count',jsonb_array_length(v_gate));
end $fn$;

create or replace function public.ppic_plan_status(p_owner uuid,p_period text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,ppic_private as $fn$
declare s ppic_private.plan_readiness_snapshots%rowtype; v_hash text; v_latest_decision uuid; v_skt_revision text;
begin
 if not exists(select 1 from ppic_private.owner_access where owner_user_id=p_owner)
 then raise exception 'PLAN_OWNER_DENIED' using errcode='42501';end if;
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
   or p_period<'2026-11' or p_period > to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'PLAN_INVALID_PERIOD' using errcode='22023';end if;
 select * into s from ppic_private.plan_readiness_snapshots
 where period=p_period order by created_at desc,id desc limit 1;
 if not found then return jsonb_build_object('ok',true,'period',p_period,'ready',false,'latest',null);end if;
 select ppic_private.robot_context(p_period)->>'evidence_hash' into v_hash;
 select id into v_latest_decision from ppic_private.stage3_decision_snapshots
  where period=p_period order by created_at desc,id desc limit 1;
 select content_revision into v_skt_revision from ppic_private.skt_form_observations
  where period=p_period order by created_at desc,id desc limit 1;
 return jsonb_build_object('ok',true,'period',p_period,'ready',true,'latest',jsonb_build_object(
  'id',s.id,'schema_version','ppic-production-plan-v1','analysis_as_of',s.analysis_as_of,
  'evidence_hash',s.evidence_hash,'evidence_current',
   s.evidence_hash=v_hash and s.decision_snapshot_id=v_latest_decision
   and s.skt_revision=coalesce(v_skt_revision,'UNAVAILABLE'),
  'state',s.state,'gates',s.gates,'source_facts',s.source_facts,
  'proposal_lines',s.proposal_lines,'next_actions',s.next_actions,
  'skt_observed',s.skt_observation_id is not null,
  'skt_revision',case when s.skt_observation_id is null then null else s.skt_revision end,
  'skt_counts',(select counts from ppic_private.skt_form_observations where id=s.skt_observation_id),
  'skt_captured_at',(select captured_at from ppic_private.skt_form_observations where id=s.skt_observation_id),
  'created_at',s.created_at));
end $fn$;

revoke all on function ppic_private.record_skt_form_observation(text,text,timestamptz,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function ppic_private.plan_source_fact(text,text,text) from public,anon,authenticated,service_role;
revoke all on function ppic_private.plan_verified_qty(jsonb) from public,anon,authenticated,service_role;
revoke all on function ppic_private.plan_refresh(text) from public,anon,authenticated,service_role;
revoke all on function public.ppic_plan_status(uuid,text) from public,anon,authenticated;
grant execute on function public.ppic_plan_status(uuid,text) to service_role;
