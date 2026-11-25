-- Depends on Robot Cukai canonical publication migration; contains no business quantities.
-- Private backend projections are receipts of a source revision, never stock movements.
do $role$ begin
 if not exists(select 1 from pg_roles where rolname='ppic_cukai_reader') then
  create role ppic_cukai_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
 end if;
end $role$;
grant ppic_cukai_reader to postgres;
grant usage on schema auth,ppic_private,bal_cukai_robot to ppic_cukai_reader;
grant execute on function auth.uid() to ppic_cukai_reader;
grant select on ppic_private.owner_access to ppic_cukai_reader;
drop policy if exists ppic_cukai_owner_self on ppic_private.owner_access;
create policy ppic_cukai_owner_self on ppic_private.owner_access for select to ppic_cukai_reader using(owner_user_id=(select auth.uid()));
grant execute on function bal_cukai_robot.read_publication(text) to ppic_cukai_reader;
grant select on bal_cukai_robot.published_snapshots to ppic_cukai_reader;
grant select(id,source_hash,cutoff,created_at) on bal_cukai_robot.snapshots to ppic_cukai_reader;
drop policy if exists ppic_cukai_publication_reader on bal_cukai_robot.published_snapshots;
create policy ppic_cukai_publication_reader on bal_cukai_robot.published_snapshots for select to ppic_cukai_reader using(true);
drop policy if exists ppic_cukai_source_metadata_reader on bal_cukai_robot.snapshots;
create policy ppic_cukai_source_metadata_reader on bal_cukai_robot.snapshots for select to ppic_cukai_reader using(true);

create or replace function ppic_private.read_cukai_owner(p_period text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $fn$
begin
 if auth.uid() is null or not exists(select 1 from ppic_private.owner_access where owner_user_id=auth.uid())
 then raise exception 'CUKAI_OWNER_DENIED' using errcode='42501';end if;
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
 then raise exception 'CUKAI_INVALID_PERIOD' using errcode='22023';end if;
 return bal_cukai_robot.read_publication(p_period);
end $fn$;
grant create on schema ppic_private to ppic_cukai_reader;
alter function ppic_private.read_cukai_owner(text) owner to ppic_cukai_reader;
revoke create on schema ppic_private from ppic_cukai_reader;
revoke all on function ppic_private.read_cukai_owner(text) from public,anon,authenticated,service_role;
grant usage on schema ppic_private to authenticated;
grant execute on function ppic_private.read_cukai_owner(text) to authenticated;
create or replace function public.ppic_cukai_source(p_period text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $fn$
 select ppic_private.read_cukai_owner(p_period)
$fn$;
revoke all on function public.ppic_cukai_source(text) from public,anon,authenticated,service_role;
grant execute on function public.ppic_cukai_source(text) to authenticated;

create table if not exists ppic_private.cukai_sync_receipts(
 period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 source_revision bigint not null check(source_revision>0),
 source_snapshot_id uuid not null,
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 source_cutoff date not null,
 document_id text not null references ppic_private.source_registry(document_id),
 published_at timestamptz not null,
 synced_at timestamptz not null default clock_timestamp(),
 primary key(period,source_revision),unique(period,source_snapshot_id)
);
alter table ppic_private.cukai_sync_receipts enable row level security;
revoke all on ppic_private.cukai_sync_receipts from public,anon,authenticated,service_role;

create or replace function ppic_private.sync_cukai_publication(p_period text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,ppic_private as $fn$
declare
 p jsonb; h jsonb; v_prior bigint; v_rev bigint; v_hash text; v_doc text; v_version text;
 v_ref jsonb; v_facts jsonb:='[]'; v_rows jsonb:='[]'; v_usage_rows jsonb:='[]'; v_day jsonb;
 v_open numeric;v_in numeric;v_out numeric;v_close numeric;v_factory numeric;v_unconfirmed numeric;
 v_count int;v_div text;v_dailyversion text;v_reportversion text;v_status text;v_field record;
begin
 perform ppic_private.robot_assert_writable_period(p_period);
 perform pg_advisory_xact_lock(hashtextextended('ppic:cukai:publication:'||p_period,0));
 p:=bal_cukai_robot.read_publication(p_period);
 if coalesce((p->>'ready')::boolean,false)=false then return jsonb_build_object('ok',true,'status','WAITING_SOURCE','period',p_period);end if;
 if p#>>'{sync,status}' is distinct from 'current' then raise exception 'CUKAI_SOURCE_STALE';end if;
 if p->>'source_system'<>'ROBOT_CUKAI' or p->>'period'<>p_period or jsonb_typeof(p->'hjes')<>'array'
 then raise exception 'CUKAI_CANONICAL_INVALID';end if;
 v_rev:=(p->>'source_revision')::bigint;
 select max(source_revision) into v_prior from ppic_private.cukai_sync_receipts where period=p_period;
 if v_prior>=v_rev then
  if v_prior=v_rev and not exists(select 1 from ppic_private.cukai_sync_receipts where period=p_period and source_revision=v_rev and source_snapshot_id=(p->>'source_snapshot_id')::uuid and payload_hash=p->>'payload_hash' and source_hash=p->>'source_hash')
  then raise exception 'CUKAI_REVISION_CONFLICT';end if;
  return jsonb_build_object('ok',true,'status','NO_CHANGE','period',p_period,'source_revision',v_prior);
 end if;
 if jsonb_array_length(p->'hjes') not between 1 and 100 then raise exception 'CUKAI_POOL_LIMIT';end if;
 if exists(select 1 from jsonb_array_elements(p->'hjes') x where jsonb_typeof(x->'opening')<>'number' or jsonb_typeof(x->'purchases')<>'number' or jsonb_typeof(x->'usage')<>'number' or jsonb_typeof(x->'closing')<>'number' or (x->>'opening')::numeric+(x->>'purchases')::numeric-(x->>'usage')::numeric<>(x->>'closing')::numeric)
 then raise exception 'CUKAI_CONTROL_INVALID';end if;
 v_hash:=encode(extensions.digest('ROBOT_CUKAI_PUBLICATION|'||p_period||'|'||v_rev||'|'||(p->>'source_snapshot_id')||'|'||(p->>'payload_hash'),'sha256'),'hex');
 v_doc:='ROBOT_CUKAI_'||replace(p->>'source_snapshot_id','-','')||'_R'||v_rev;
 select 'V'||lpad((coalesce(max(substring(version from 2)::numeric),0)+1)::text,3,'0') into v_version from ppic_private.source_registry where division='CUKAI' and period=p_period;
 v_status:=case when p->>'reconciliation_status'='RECONCILED' then 'RECONCILED' else 'OPEN RECON' end;
 v_ref:=jsonb_build_object('document_id',v_doc,'title','Robot Cukai — publikasi resmi','source_kind','ROBOT_CUKAI_CANONICAL','source_snapshot_id',p->'source_snapshot_id','source_revision',v_rev,'source_hash',p->'source_hash','payload_hash',p->'payload_hash','date',p->'cutoff','version',v_version,'published_at',p->'published_at');
 insert into ppic_private.source_registry(document_id,division,period,cutoff,version,sha256,reconciliation_status,access_class,private_locator)
 values(v_doc,'CUKAI',p_period,((p->>'cutoff')::date::timestamp at time zone 'Asia/Jakarta'),v_version,v_hash,v_status,'CONFIDENTIAL','cukai-publication:'||v_rev);
 select count(*),sum((x->>'opening')::numeric),sum((x->>'purchases')::numeric),sum((x->>'usage')::numeric),sum((x->>'closing')::numeric),case when count(x->>'factory')=count(*) then sum((x->>'factory')::numeric) end,case when count(x->>'unconfirmed')=count(*) then sum((x->>'unconfirmed')::numeric) end
 into v_count,v_open,v_in,v_out,v_close,v_factory,v_unconfirmed from jsonb_array_elements(p->'hjes') x;
 for v_field in select * from(values
  ('book_opening_keping','Saldo awal buku',v_open,'SOURCE'),
  ('book_purchase_keping','Pemasukan buku',v_in,'SOURCE'),
  ('book_usage_keping','Pemakaian buku',v_out,'SOURCE'),
  ('book_closing_keping','Saldo akhir buku',v_close,'SOURCE'),
  ('factory_stock_estimated','Estimasi pita pabrik',v_factory,case when v_factory is null then 'MISSING' else 'ESTIMATE' end),
  ('not_arrived_keping','Penerimaan belum terkonfirmasi',v_unconfirmed,case when v_unconfirmed is null then 'MISSING' else 'SOURCE' end),
  ('confirmed_factory_stock','Pita pabrik hasil opname',null::numeric,'MISSING'),
  ('canonical_source_revision','Revisi Robot Cukai',v_rev::numeric,'SOURCE')
 ) f(key,label,value,quality) loop
  v_facts:=v_facts||jsonb_build_array(jsonb_build_object('key',v_field.key,'label',v_field.label,'value',v_field.value,'unit',case when v_field.key='canonical_source_revision' then 'revisi' else 'keping' end,'scope','Publikasi Cukai '||p_period,'source_sheet','Robot Cukai publication','source_range','hjes','quality',v_field.quality,'note','Saldo buku dan estimasi mengikuti sumber; stok fisik belum menjadi bukti opname.'));
 end loop;
 perform ppic_private.robot_record_source_facts(v_doc,v_hash,jsonb_build_object('schema_version','ppic-robot-facts-v1','division','CUKAI','period',p_period,'cutoff',p->>'cutoff','version',v_version,'source_sha256',v_hash,'facts',v_facts,'issues','[]'::jsonb));
 for h in select value from jsonb_array_elements(p->'hjes') loop
  v_div:='CUKAI '||(h->>'id');
  select 'V'||lpad((coalesce(max(substring(version from 2)::numeric),0)+1)::text,3,'0') into v_dailyversion from ppic_private.daily_ledger_snapshots where period=p_period and division=v_div;
  insert into ppic_private.daily_ledger_snapshots(period,division,cutoff,version,status,unit,valuation_basis,payload,source_document_ids)
  values(p_period,v_div,(p->>'cutoff')::date,v_dailyversion,v_status,'keping','SALDO BUKU ROBOT CUKAI',jsonb_build_object('cols',jsonb_build_array('day','in_qty','out_qty'),'entries','[]'::jsonb,'opening_qty',h->'opening','opening_nominal',null,'book_period_receipts',h->'purchases','book_period_usage',h->'usage','book_closing',h->'closing','valid_through',p->'cutoff','qty_basis','Saldo buku resmi, bukan stok fisik','nominal_basis','Nominal terpisah sesuai metode sumber','notes',jsonb_build_array('Tanggal penerimaan harian belum tersedia. Tidak menganggap tanggal kosong sebagai mutasi nol.'),'canonical_source',true,'source_hje_id',h->'id','source_revision',v_rev,'source_label',h->'label','provenance',v_ref),jsonb_build_array(v_doc));
  v_rows:=v_rows||jsonb_build_array(jsonb_build_array(h->'id',h->'label',h->'hje',h->'opening',h->'purchases',h->'usage',h->'closing',h->'factory',h->'unconfirmed',null));
 end loop;
 for v_day in select value from jsonb_array_elements(coalesce(p->'daily_usage','[]'::jsonb)) loop
  v_usage_rows:=v_usage_rows||jsonb_build_array(jsonb_build_array(v_day->'date',coalesce(v_day->>'source_hje_id','Kelompok belum terpetakan'),v_day->'hje',v_day->'quantity'));
 end loop;
 select 'V'||lpad((coalesce(max(substring(version from 2)::numeric),0)+1)::text,3,'0') into v_reportversion from ppic_private.report_snapshots where report_key='05' and period=p_period;
 insert into ppic_private.report_snapshots(report_key,period,title,cutoff,version,status,basis,payload,source_refs)
 values('05',p_period,'Pita Cukai — sumber Robot Cukai',(p->>'cutoff')::date,v_reportversion,v_status,'ACTUAL',jsonb_build_object('notice','Sumber: Robot Cukai. Revisi '||v_rev||'. Saldo buku, estimasi pabrik dan hasil opname adalah kategori berbeda.','tables',jsonb_build_array(jsonb_build_object('title','Saldo per kelompok pita','headers',jsonb_build_array('ID pita','Kelompok','HJE','Awal','Masuk','Pemakaian','Akhir buku','Estimasi pabrik','Belum terkonfirmasi','Fisik opname'),'rows',v_rows),jsonb_build_object('title','Pemakaian harian bersumber','headers',jsonb_build_array('Tanggal','ID pita','HJE','Pemakaian keping'),'rows',v_usage_rows)),'report_state',p->'reconciliation_status','provenance',v_ref,'source_refs',jsonb_build_array(v_ref),'disclaimer','Data harian yang belum tersedia tetap tidak diketahui. Konversi karton memerlukan master terverifikasi.'),jsonb_build_array(v_ref));
 insert into ppic_private.cukai_sync_receipts(period,source_revision,source_snapshot_id,source_hash,payload_hash,source_cutoff,document_id,published_at)
 values(p_period,v_rev,(p->>'source_snapshot_id')::uuid,p->>'source_hash',p->>'payload_hash',(p->>'cutoff')::date,v_doc,(p->>'published_at')::timestamptz);
 return jsonb_build_object('ok',true,'status','SYNCED','period',p_period,'source_revision',v_rev,'source_snapshot_id',p->'source_snapshot_id','payload_hash',p->'payload_hash','document_id',v_doc,'pool_count',v_count,'opening',v_open,'purchases',v_in,'usage',v_out,'closing',v_close);
end $fn$;
revoke all on function ppic_private.sync_cukai_publication(text) from public,anon,authenticated,service_role;

-- Only Cukai switches to the canonical receipt pointer. All other source ranking stays intact.
create or replace function ppic_private.robot_selected_sources(p_period text)
returns table(document_id text,division text,period text,cutoff date,version text,sha256 text,reconciliation_status text,report_gate jsonb,fact_payload jsonb,fact_payload_sha256 text)
language sql stable security invoker set search_path=pg_catalog,ppic_private as $fn$
 with current_cukai as(select c.document_id from ppic_private.cukai_sync_receipts c where c.period=p_period order by c.source_revision desc limit 1), ranked as(
  select s.*,row_number() over(partition by s.division order by
   case when s.division='CUKAI' and s.document_id=(select c.document_id from current_cukai c) then 1 else 0 end desc,
   (s.cutoff at time zone 'Asia/Jakarta')::date desc,
   case when s.version ~ '^V[0-9]+$' then substring(s.version from 2)::numeric else 0 end desc,
   s.ingested_at desc,s.document_id desc) as rank
  from ppic_private.source_registry s where s.period=p_period and s.division in('BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK')
 )
 select s.document_id,s.division,s.period,(s.cutoff at time zone 'Asia/Jakarta')::date,s.version,s.sha256,s.reconciliation_status,
 ppic_private.auto_import_report_gate(s.division,s.period,(s.cutoff at time zone 'Asia/Jakarta')::date,s.sha256),f.payload,f.payload_sha256
 from ranked s left join lateral(select rf.payload,rf.payload_sha256 from ppic_private.robot_source_facts rf where rf.document_id=s.document_id and rf.source_sha256=s.sha256 order by rf.created_at desc,rf.id desc limit 1) f on true
 where s.rank=1 order by s.division
$fn$;
notify pgrst,'reload schema';
