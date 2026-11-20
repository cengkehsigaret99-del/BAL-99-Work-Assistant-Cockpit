-- Run through the project-admin SQL connector AFTER the V6 migration.
-- Synthetic source-registry/evidence inserts are confined to this transaction.
-- No operational snapshot, Storage object, Auth row or network request is changed.
BEGIN;
DO $test$
DECLARE signature text; role_name text; tab text; current_period text:=to_char(now() AT TIME ZONE 'Asia/Jakarta','YYYY-MM');
 current_date_jkt date:=(now() AT TIME ZONE 'Asia/Jakarta')::date; doc text; old_doc text; sha text; old_sha text;
 payload jsonb; candidate jsonb; fact jsonb; ctx jsonb; got jsonb; brief jsonb; ref jsonb; status jsonb;
 initial_counts jsonb; final_counts jsonb; hash_before text; result_id uuid; rejected boolean; checks integer:=0;
 funcs text; item jsonb;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'ppic_private.robot_record_source_facts(text,text,jsonb)','ppic_private.robot_context(text)',
  'ppic_private.robot_publish_brief(text,text,jsonb)','ppic_private.robot_heartbeat(text,text,jsonb)',
  'ppic_private.robot_configure(boolean,text,text,text)','ppic_private.robot_selected_sources(text)',
  'ppic_private.robot_report_metadata(text)','ppic_private.robot_validate_evidence(jsonb,jsonb,boolean)'
 ] LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'Admin robot function exposed: % / %',role_name,signature; END IF;
   checks:=checks+1;
  END LOOP;
 END LOOP;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_function_privilege(role_name,'public.ppic_robot_status(text)','EXECUTE') THEN RAISE EXCEPTION 'Status RPC directly exposed: %',role_name; END IF;
  checks:=checks+1;
 END LOOP;
 IF NOT has_function_privilege('service_role','public.ppic_robot_status(text)','EXECUTE') THEN RAISE EXCEPTION 'Service status grant missing'; END IF;
 checks:=checks+1;
 FOREACH tab IN ARRAY ARRAY['robot_config','robot_source_facts','robot_briefings','robot_runs'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('ppic_private.'||tab)::regclass) THEN RAISE EXCEPTION 'RLS missing: %',tab; END IF;
  checks:=checks+1;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(role_name,'ppic_private.'||tab,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN RAISE EXCEPTION 'Private robot table exposed: % / %',role_name,tab; END IF;
   checks:=checks+1;
  END LOOP;
 END LOOP;
 SELECT pg_get_functiondef('public.ppic_robot_status(text)'::regprocedure) INTO funcs;
 IF funcs ~* 'private_locator|download_url|nonce_hash|lease_token|storage[.]|auth[.]' THEN RAISE EXCEPTION 'Status projection leaks capabilities'; END IF;
 checks:=checks+1;
 SELECT pg_get_functiondef('ppic_private.robot_report_metadata(text)'::regprocedure) INTO funcs;
 IF position('documentId' IN funcs)=0 THEN RAISE EXCEPTION 'SDM camelCase documentId mapping missing'; END IF;
 checks:=checks+1;
 IF ppic_private.robot_safe_text('Synthetic https://example.invalid/path?sig=hidden Bearer synthetic-hidden',1200) ~ 'sig=|Bearer|synthetic-hidden'
 THEN RAISE EXCEPTION 'Heartbeat redaction failed'; END IF;
 checks:=checks+1;
 SELECT jsonb_build_object('daily',(SELECT count(*) FROM ppic_private.daily_ledger_snapshots),
  'do',(SELECT count(*) FROM ppic_private.do_customer_snapshots),'bj',(SELECT count(*) FROM ppic_private.finished_goods_snapshots),
  'bb',(SELECT count(*) FROM ppic_private.material_daily_snapshots),'reports',(SELECT count(*) FROM ppic_private.report_snapshots),
  'sdm',(SELECT count(*) FROM ppic_private.sdm_weekly_snapshots)) INTO initial_counts;

 rejected:=false; BEGIN PERFORM ppic_private.robot_configure(true,NULL); EXCEPTION WHEN others THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Schedule enabled without automation identity'; END IF;checks:=checks+1;
 PERFORM ppic_private.robot_configure(false,NULL);
 rejected:=false; BEGIN PERFORM ppic_private.robot_assert_writable_period('2026-09'); EXCEPTION WHEN others THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Historical locked working range was writable'; END IF;checks:=checks+1;

 doc:='SYNTHETIC_ROBOT_'||replace(gen_random_uuid()::text,'-','');
 old_doc:=doc||'_OLD';sha:=encode(extensions.digest(doc,'sha256'),'hex');old_sha:=encode(extensions.digest(old_doc,'sha256'),'hex');
 INSERT INTO ppic_private.source_registry(id,document_id,division,period,cutoff,version,sha256,reconciliation_status,access_class,private_locator,ingested_at)
  VALUES(gen_random_uuid(),doc,'TSG',current_period,current_date_jkt::timestamp AT TIME ZONE 'Asia/Jakarta','V999998',sha,'OPEN RECON','INTERNAL','synthetic/rollback-only.xlsx',now()),
   (gen_random_uuid(),old_doc,'TSG',current_period,(current_date_jkt-1)::timestamp AT TIME ZONE 'Asia/Jakarta','V999999',old_sha,'OPEN RECON','INTERNAL','synthetic/rollback-only-old.xlsx',now()+interval '1 hour');
 fact:=jsonb_build_object('key','synthetic_negative_stock','label','Synthetic rollback-only balance','value',-7,'unit','pack','scope','SYNTHETIC',
  'source_sheet','SYNTHETIC','source_range','A1','quality','SOURCE','note','Not factory data.');
 payload:=jsonb_build_object('schema_version','ppic-robot-facts-v1','division','TSG','period',current_period,'cutoff',current_date_jkt,
  'version','V999998','source_sha256',sha,'facts',jsonb_build_array(fact),'issues','[]'::jsonb);
 got:=ppic_private.robot_record_source_facts(doc,sha,payload);
 IF got->>'ok' IS DISTINCT FROM 'true' OR got->>'duplicate' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Valid facts not recorded'; END IF;
 result_id:=(got->>'id')::uuid;checks:=checks+1;
 got:=ppic_private.robot_record_source_facts(doc,sha,payload);
 IF got->>'duplicate' IS DISTINCT FROM 'true' OR (got->>'id')::uuid<>result_id THEN RAISE EXCEPTION 'Facts are not idempotent'; END IF;checks:=checks+1;
 rejected:=false; BEGIN PERFORM ppic_private.robot_record_source_facts(doc,old_sha,payload); EXCEPTION WHEN others THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Wrong source hash accepted'; END IF;checks:=checks+1;
 FOR candidate IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  payload||jsonb_build_object('cutoff',current_date_jkt-1),
  payload||jsonb_build_object('unexpected','value'),
  payload||jsonb_build_object('facts',jsonb_build_array(fact,fact)),
  payload||jsonb_build_object('facts',jsonb_build_array(fact||jsonb_build_object('value',true))),
  payload||jsonb_build_object('facts',jsonb_build_array(fact||jsonb_build_object('value',9007199254740992::numeric))),
  payload||jsonb_build_object('facts',jsonb_build_array(fact||jsonb_build_object('quality','MISSING'))),
  payload||jsonb_build_object('facts',jsonb_build_array(fact-'source_range')),
  payload||jsonb_build_object('issues',jsonb_build_array(jsonb_build_object('code','SYNTHETIC','severity','HIGH','title','Test','detail','Test',
   'fact_keys',jsonb_build_array('unknown_key'),'source_sheet','SYNTHETIC','source_range','A1')))
 )) LOOP
  rejected:=false;BEGIN PERFORM ppic_private.robot_record_source_facts(doc,sha,candidate);EXCEPTION WHEN others THEN rejected:=true;END;
  IF NOT rejected THEN RAISE EXCEPTION 'Invalid facts accepted'; END IF;checks:=checks+1;
 END LOOP;
 -- Exercise the actual LOCKED-status gate for a current period. The nested
 -- rollback removes only this synthetic locked marker, then the main test resumes.
 BEGIN
  INSERT INTO ppic_private.source_registry(id,document_id,division,period,cutoff,version,sha256,reconciliation_status,access_class,private_locator,ingested_at)
   VALUES(gen_random_uuid(),doc||'_LOCKED','TSG',current_period,current_date_jkt::timestamp AT TIME ZONE 'Asia/Jakarta','V999997',
    encode(extensions.digest(doc||'_LOCKED','sha256'),'hex'),'LOCKED','INTERNAL','synthetic/locked-only.xlsx',now());
  rejected:=false;BEGIN PERFORM ppic_private.robot_record_source_facts(doc,sha,payload);EXCEPTION WHEN others THEN rejected:=true;END;
  IF NOT rejected THEN RAISE EXCEPTION 'Facts written into a currently LOCKED period'; END IF;
  RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='Synthetic nested rollback';
 EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM ppic_private.source_registry WHERE document_id=doc||'_LOCKED') THEN RAISE EXCEPTION 'Nested LOCKED marker not rolled back'; END IF;
 checks:=checks+1;
 ctx:=ppic_private.robot_context(current_period);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ctx->'sources') s WHERE s->>'division'='TSG' AND s->>'document_id'=doc)
 THEN RAISE EXCEPTION 'Newly archived older source displaced current cutoff'; END IF;checks:=checks+1;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ctx->'evidence_sources') s,jsonb_array_elements(s->'facts') f
   WHERE s->>'document_id'=doc AND f->>'key'='synthetic_negative_stock' AND f->'value'='-7'::jsonb)
 THEN RAISE EXCEPTION 'Negative source value not preserved'; END IF;checks:=checks+1;
 hash_before:=ctx->>'evidence_hash';
 PERFORM ppic_private.robot_heartbeat('SUCCESS','Synthetic heartbeat; not an actual canary.',jsonb_build_object('period',current_period,'check_name','SYNTHETIC_ROLLBACK'));
 IF ppic_private.robot_context(current_period)->>'evidence_hash'<>hash_before THEN RAISE EXCEPTION 'Heartbeat invalidated data evidence'; END IF;checks:=checks+1;
 rejected:=false;BEGIN PERFORM ppic_private.robot_heartbeat('SUCCESS','Synthetic',jsonb_build_object('download_url','https://example.invalid'));EXCEPTION WHEN others THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Unbounded heartbeat capability accepted'; END IF;checks:=checks+1;

 ref:=jsonb_build_array(jsonb_build_object('document_id',doc,'fact_keys',jsonb_build_array('synthetic_negative_stock')));
 brief:=jsonb_build_object('schema_version','ppic-robot-brief-v1','headline','Synthetic rollback-only briefing','summary','Synthetic data only.',
  'operating_status','PERLU_PERHATIAN','as_of',current_date_jkt,'decisions',jsonb_build_array(jsonb_build_object('id','SYNTHETIC_1','priority','P1',
   'title','Review synthetic balance','recommendation','Reconcile synthetic source.','reason','Synthetic negative balance.','consequence','No real operational effect.',
   'kind','ADMIN_FOLLOWUP','owner_role','Synthetic test','evidence',ref,'confidence','TINGGI','data_limit','Synthetic source only.','action_state','USULAN')),
  'watchlist','[]'::jsonb,'work_completed','[]'::jsonb,'pending_data','[]'::jsonb,'limitations',jsonb_build_array('Synthetic rollback only.'));
 rejected:=false;BEGIN PERFORM ppic_private.robot_publish_brief(current_period,repeat('0',64),brief);EXCEPTION WHEN others THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Stale evidence hash accepted'; END IF;checks:=checks+1;
 candidate:=jsonb_set(brief,'{decisions,0,evidence,0,fact_keys}',jsonb_build_array('unknown_key'));
 rejected:=false;BEGIN PERFORM ppic_private.robot_publish_brief(current_period,hash_before,candidate);EXCEPTION WHEN others THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Dangling decision fact accepted'; END IF;checks:=checks+1;
 candidate:=jsonb_set(brief,'{decisions,0,evidence,0,document_id}',to_jsonb(old_doc));
 rejected:=false;BEGIN PERFORM ppic_private.robot_publish_brief(current_period,hash_before,candidate);EXCEPTION WHEN others THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Decision cited an older non-current source'; END IF;checks:=checks+1;
 candidate:=jsonb_set(brief,'{decisions,0,action_state}','"EXECUTED"'::jsonb);
 rejected:=false;BEGIN PERFORM ppic_private.robot_publish_brief(current_period,hash_before,candidate);EXCEPTION WHEN others THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Robot claimed an executed business decision'; END IF;checks:=checks+1;
 got:=ppic_private.robot_publish_brief(current_period,hash_before,brief);
 IF got->>'duplicate' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Valid briefing not appended'; END IF;checks:=checks+1;
 result_id:=(got->>'id')::uuid;
 got:=ppic_private.robot_publish_brief(current_period,hash_before,brief);
 IF got->>'duplicate' IS DISTINCT FROM 'true' OR (got->>'id')::uuid<>result_id THEN RAISE EXCEPTION 'Unchanged evidence duplicated briefing'; END IF;checks:=checks+1;
 candidate:=brief||jsonb_build_object('summary','Corrected synthetic reasoning with the same source evidence.');
 got:=ppic_private.robot_publish_brief(current_period,hash_before,candidate);
 IF got->>'duplicate' IS DISTINCT FROM 'false' OR (got->>'id')::uuid=result_id THEN RAISE EXCEPTION 'Corrected reasoning was silently discarded'; END IF;checks:=checks+1;
 rejected:=false;BEGIN UPDATE ppic_private.robot_briefings SET payload='{}'::jsonb WHERE id=result_id;EXCEPTION WHEN others THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Briefing was mutable'; END IF;checks:=checks+1;
 rejected:=false;BEGIN DELETE FROM ppic_private.robot_source_facts WHERE document_id=doc;EXCEPTION WHEN others THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Evidence was deletable'; END IF;checks:=checks+1;
 PERFORM ppic_private.robot_record_source_facts(doc,sha,jsonb_set(payload,'{facts,0,value}','-8'::jsonb));
 IF ppic_private.robot_context(current_period)->>'evidence_hash'=hash_before THEN RAISE EXCEPTION 'Amended evidence was not detected'; END IF;checks:=checks+1;
 status:=public.ppic_robot_status(current_period);
 IF status#>>'{health,source_changed_since_brief}' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Outdated analysis was not labelled'; END IF;checks:=checks+1;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(status->'evidence_sources') s,jsonb_array_elements(s->'facts') f
   WHERE s->>'document_id'=doc AND f->'value'='-7'::jsonb)
 THEN RAISE EXCEPTION 'Saved briefing lost its exact original provenance'; END IF;checks:=checks+1;
 IF status::text ~ 'private_locator|download_url|nonce_hash|lease_token|synthetic/rollback' THEN RAISE EXCEPTION 'Status leaked a private locator'; END IF;checks:=checks+1;

 -- A newly selected source without extracted facts must not inherit old facts.
 old_doc:=doc||'_NEW';old_sha:=encode(extensions.digest(old_doc,'sha256'),'hex');
 INSERT INTO ppic_private.source_registry(id,document_id,division,period,cutoff,version,sha256,reconciliation_status,access_class,private_locator,ingested_at)
  VALUES(gen_random_uuid(),old_doc,'TSG',current_period,current_date_jkt::timestamp AT TIME ZONE 'Asia/Jakarta','V9999999',old_sha,'OPEN RECON','INTERNAL','synthetic/new-only.xlsx',now());
 ctx:=ppic_private.robot_context(current_period);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ctx->'coverage') c WHERE c->>'division'='TSG' AND c->>'selection_status'='MISSING_FACTS' AND c->>'source_document_id'=old_doc)
 THEN RAISE EXCEPTION 'Missing current facts silently fell back to historical facts'; END IF;checks:=checks+1;
 SELECT jsonb_build_object('daily',(SELECT count(*) FROM ppic_private.daily_ledger_snapshots),
  'do',(SELECT count(*) FROM ppic_private.do_customer_snapshots),'bj',(SELECT count(*) FROM ppic_private.finished_goods_snapshots),
  'bb',(SELECT count(*) FROM ppic_private.material_daily_snapshots),'reports',(SELECT count(*) FROM ppic_private.report_snapshots),
  'sdm',(SELECT count(*) FROM ppic_private.sdm_weekly_snapshots)) INTO final_counts;
 IF final_counts<>initial_counts THEN RAISE EXCEPTION 'Robot changed an operational snapshot table'; END IF;checks:=checks+1;
 RAISE NOTICE 'PPIC robot security and evidence tests passed: % assertions; all synthetic writes roll back.',checks;
END $test$;
ROLLBACK;
