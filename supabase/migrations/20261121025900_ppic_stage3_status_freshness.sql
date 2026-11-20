-- Stage 3 status must distinguish a saved decision from current source and briefing evidence.
create or replace function public.ppic_stage3_status(p_owner uuid,p_period text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,ppic_private as $fn$
declare s ppic_private.stage3_decision_snapshots%rowtype; current_hash text; current_brief uuid;
begin
 if not exists(select 1 from ppic_private.owner_access where owner_user_id=p_owner)
 then raise exception 'STAGE3_OWNER_DENIED' using errcode='42501';end if;
 if p_period is null or p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
   or p_period < '2026-11' or p_period > to_char(timezone('Asia/Jakarta',now()),'YYYY-MM')
 then raise exception 'STAGE3_INVALID_PERIOD' using errcode='22023';end if;
 select * into s from ppic_private.stage3_decision_snapshots
 where period=p_period order by created_at desc,id desc limit 1;
 if not found then return jsonb_build_object('ok',true,'period',p_period,'ready',false,'latest',null);end if;
 select ppic_private.robot_context(p_period)->>'evidence_hash' into current_hash;
 select id into current_brief from ppic_private.robot_briefings where period=p_period order by created_at desc,id desc limit 1;
 return jsonb_build_object('ok',true,'period',p_period,'ready',true,'latest',jsonb_build_object(
  'id',s.id,'schema_version','ppic-stage3-decision-v1','evidence_hash',s.evidence_hash,
  'evidence_current',s.evidence_hash=current_hash and s.briefing_id=current_brief,
  'analysis_as_of',s.analysis_as_of,'status',s.status,'source_count',s.source_count,
  'data_blockers',s.data_blockers,'briefing_id',s.briefing_id,
  'decisions',s.decisions,'focus_ids',s.focus_ids,'risk_register',s.risk_register,
  'coverage',s.coverage,'created_at',s.created_at));
end $fn$;

