-- Avoid shadowing SQL table alias s with an uninitialized PL/pgSQL record variable.
create or replace function ppic_private.stage3_refresh(p_period text)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,ppic_private as $fn$
declare
 v_ctx jsonb; v_hash text; v_stage2_result jsonb;
 v_stage2 ppic_private.stage2_review_snapshots%rowtype;
 v_brief ppic_private.robot_briefings%rowtype;
 v_existing uuid; v_total integer; v_blockers integer:=0;
 v_cards jsonb:='[]'::jsonb; v_focus jsonb:='[]'::jsonb;
 v_risks jsonb:='[]'::jsonb; v_card jsonb;
 v_action jsonb; v_evidence jsonb; v_ref jsonb; v_key jsonb;
 v_related jsonb; v_departments jsonb; v_evidence_missing boolean;
 v_valid_ref boolean; v_status text; v_gate text;
 v_rank integer:=0; v_brief_state jsonb;
 r record; w record;
begin
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    or p_period < '2026-11' or p_period > to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'STAGE3_INVALID_PERIOD' using errcode='22023';end if;
 if not exists(select 1 from ppic_private.robot_config where enabled=true)
 then return jsonb_build_object('ok',false,'status','ROBOT_DISABLED','period',p_period);end if;
 v_ctx:=ppic_private.robot_context(p_period);
 v_hash:=v_ctx->>'evidence_hash';
 if v_hash is null or v_hash !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('ok',false,'status','WAITING_EVIDENCE','period',p_period);end if;
 v_stage2_result:=ppic_private.stage2_refresh(p_period);
 if v_stage2_result->>'ok' is distinct from 'true'
 then return jsonb_build_object('ok',false,'status','WAITING_STAGE2','period',p_period);end if;
 select * into v_stage2 from ppic_private.stage2_review_snapshots
 where period=p_period and evidence_hash=v_hash order by created_at desc limit 1;
 if not found then return jsonb_build_object('ok',false,'status','WAITING_STAGE2','period',p_period);end if;
 select * into v_brief from ppic_private.robot_briefings
 where period=p_period order by created_at desc,id desc limit 1;
 if not found or v_brief.evidence_hash is distinct from v_hash
 then return jsonb_build_object('ok',false,'status','WAITING_GPT_BRIEF','period',p_period);end if;
 select id into v_existing from ppic_private.stage3_decision_snapshots
 where period=p_period and evidence_hash=v_hash and briefing_id=v_brief.id and stage2_id=v_stage2.id;
 if found then return jsonb_build_object('ok',true,'status','NO_CHANGE','id',v_existing,'period',p_period,'evidence_hash',v_hash);end if;
 v_brief_state:=v_brief.payload;
 if v_brief_state->>'schema_version' is distinct from 'ppic-robot-brief-v1'
    or jsonb_typeof(v_brief_state->'decisions') is distinct from 'array'
 then return jsonb_build_object('ok',false,'status','WAITING_VALID_BRIEF','period',p_period);end if;
 v_total:=jsonb_array_length(v_brief_state->'decisions');
 if v_total not between 1 and 10 then return jsonb_build_object('ok',false,'status','WAITING_VALID_BRIEF','period',p_period);end if;
 -- Match every briefing citation with the currently selected private source fact keys,
 -- including explicit MISSING facts. Do not silently substitute historical versions.
 for r in select value as d,ord from jsonb_array_elements(v_brief_state->'decisions') with ordinality x(value,ord)
 order by case value->>'priority' when 'P1' then 1 when 'P2' then 2 else 3 end,ord loop
  v_action:=r.d;
  if coalesce(v_action->>'id','') !~ '^[a-zA-Z0-9_:-]{2,100}$'
   or v_action->>'action_state' is distinct from 'USULAN'
   or v_action->>'priority' not in ('P1','P2','P3')
   or v_action->>'kind' not in ('OWNER_DECISION','ADMIN_FOLLOWUP','DATA_BLOCKER')
   or v_action->>'confidence' not in ('TINGGI','SEDANG','RENDAH')
   or jsonb_typeof(v_action->'evidence') is distinct from 'array'
  then return jsonb_build_object('ok',false,'status','WAITING_VALID_BRIEF','period',p_period);end if;
  v_evidence:=v_action->'evidence';
  if jsonb_array_length(v_evidence) not between 1 and 10 then
    return jsonb_build_object('ok',false,'status','WAITING_VALID_BRIEF','period',p_period);end if;
  v_departments:='[]'::jsonb;v_evidence_missing:=false;
  for v_ref in select value from jsonb_array_elements(v_evidence) loop
   if jsonb_typeof(v_ref->'fact_keys') is distinct from 'array'
     or jsonb_array_length(v_ref->'fact_keys') not between 1 and 30
   then return jsonb_build_object('ok',false,'status','WAITING_VALID_BRIEF','period',p_period);end if;
   select s.division into v_status from ppic_private.robot_selected_sources(p_period) s
   where s.document_id=v_ref->>'document_id' and s.fact_payload is not null limit 1;
   if v_status is null then return jsonb_build_object('ok',false,'status','WAITING_FACT_PROVENANCE','period',p_period);end if;
   if not v_departments ? v_status then v_departments:=v_departments||to_jsonb(v_status);end if;
   for v_key in select value from jsonb_array_elements(v_ref->'fact_keys') loop
    select exists(select 1 from ppic_private.robot_selected_sources(p_period) s,
         lateral jsonb_array_elements(coalesce(s.fact_payload->'facts','[]'::jsonb)) f
         where s.document_id=v_ref->>'document_id' and f->>'key'=trim(both '"' from v_key::text)) into v_valid_ref;
    if not v_valid_ref then return jsonb_build_object('ok',false,'status','WAITING_FACT_PROVENANCE','period',p_period);end if;
    if exists(select 1 from ppic_private.robot_selected_sources(p_period) s,
         lateral jsonb_array_elements(coalesce(s.fact_payload->'facts','[]'::jsonb)) f
         where s.document_id=v_ref->>'document_id' and f->>'key'=trim(both '"' from v_key::text)
         and (f->>'quality'='MISSING' or f->'value'='null'::jsonb)) then v_evidence_missing:=true;end if;
   end loop;
   v_status:=null;
  end loop;
  v_related:='[]'::jsonb;
  for w in select value warning from jsonb_array_elements(v_stage2.warnings) loop
    if v_departments ? (w.warning->>'division') and jsonb_array_length(v_related)<3 then
      v_related:=v_related||jsonb_build_array(jsonb_build_object('code',w.warning->>'code',
       'severity',w.warning->>'severity','message',left(w.warning->>'message',360),
       'division',w.warning->>'division'));
    end if;
  end loop;
  v_gate:=case when v_evidence_missing or v_action->>'kind'='DATA_BLOCKER'
         or exists(select 1 from jsonb_array_elements(v_related) x where x->>'severity'='HIGH')
       then 'BUTUH_VERIFIKASI'
       when v_action->>'kind'='OWNER_DECISION' then 'PERLU_TINJAUAN_OWNER'
       else 'TINDAK_LANJUT_DIVISI' end;
  if v_gate='BUTUH_VERIFIKASI' then v_blockers:=v_blockers+1;end if;
  v_rank:=v_rank+1;
  v_card:=jsonb_build_object(
     'id',v_action->>'id','rank',v_rank,'priority',v_action->>'priority','kind',v_action->>'kind',
     'title',left(coalesce(v_action->>'title',''),240),
     'recommendation',left(coalesce(v_action->>'recommendation',''),1500),
     'reason',left(coalesce(v_action->>'reason',''),1500),
     'consequence',left(coalesce(v_action->>'consequence',''),1200),
     'owner_role',left(coalesce(v_action->>'owner_role',''),160),
     'confidence',v_action->>'confidence','data_limit',left(coalesce(v_action->>'data_limit',''),1400),
     'action_state','USULAN','gate',v_gate,'requires_owner_approval',v_action->>'kind'='OWNER_DECISION',
     'missing_evidence_present',v_evidence_missing,'divisions',v_departments,
     'risks',v_related,'evidence',v_evidence);
  v_cards:=v_cards||jsonb_build_array(v_card);
  if v_rank<=3 then v_focus:=v_focus||jsonb_build_array(v_action->>'id');end if;
 end loop;
 v_risks:=coalesce((select jsonb_agg(jsonb_build_object('code',w->>'code','severity',w->>'severity',
     'division',w->>'division','message',left(coalesce(w->>'message',''),500),
     'source_cutoff',w->>'source_cutoff','report_cutoff',w->>'report_cutoff'))
   from jsonb_array_elements(v_stage2.warnings) w),'[]'::jsonb);
 v_status:=case when v_stage2.status='BLOCKED' or v_blockers>0 then 'WAITING_DATA' else 'REVIEW_REQUIRED' end;
 -- Recheck evidence under transaction; refuse stale analysis rather than rewriting its hash.
 if (ppic_private.robot_context(p_period)->>'evidence_hash') is distinct from v_hash
 then return jsonb_build_object('ok',false,'status','STALE_EVIDENCE','period',p_period);end if;
 insert into ppic_private.stage3_decision_snapshots(period,evidence_hash,briefing_id,stage2_id,analysis_as_of,
   status,decisions,focus_ids,risk_register,coverage,source_count,data_blockers)
 values(p_period,v_hash,v_brief.id,v_stage2.id,v_brief.as_of,v_status,v_cards,v_focus,v_risks,v_stage2.coverage,v_stage2.source_count,v_blockers)
 on conflict (period,evidence_hash,briefing_id,stage2_id) do nothing returning id into v_existing;
 if v_existing is null then
  select id into v_existing from ppic_private.stage3_decision_snapshots
   where period=p_period and evidence_hash=v_hash and briefing_id=v_brief.id and stage2_id=v_stage2.id;
  return jsonb_build_object('ok',true,'status','NO_CHANGE','id',v_existing,'period',p_period,'evidence_hash',v_hash);
 end if;
 return jsonb_build_object('ok',true,'status','DECISIONS_REFRESHED','id',v_existing,'period',p_period,
   'evidence_hash',v_hash,'decisions',v_rank,'focus_count',jsonb_array_length(v_focus),
   'data_blockers',v_blockers,'business_status',v_status,'analysis_as_of',v_brief.as_of);
end $fn$;

