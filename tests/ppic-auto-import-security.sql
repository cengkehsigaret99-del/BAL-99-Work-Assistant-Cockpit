-- Run after migration with the project-admin SQL connector, BEFORE enabling the schedule.
-- All synthetic writes roll back. This script never calls net.http_post and never
-- changes source_registry, Storage objects, snapshots, auth, or existing source files.
BEGIN;
DO $test$
DECLARE
  signature text; role_name text; tab text; got jsonb; before_count bigint;
  manifest jsonb; folder text; fake_sha text; job uuid; nonce text; lease uuid;
  rejected boolean; candidate_url text; checks integer:=0; safe_status text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.ppic_auto_import_claim(uuid,text)',
    'public.ppic_auto_import_complete(uuid,uuid,text,text,text,text)',
    'public.ppic_auto_import_source_check(text,text,text,date,text)',
    'public.ppic_auto_import_status(text)'
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected % permission: %',role_name,signature; END IF;
      checks:=checks+1;
    END LOOP;
    IF NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'Missing service-only RPC grant: %',signature; END IF;
    checks:=checks+1;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'ppic_private.enqueue_auto_import(jsonb,text)',
    'ppic_private.configure_auto_import(boolean,text,text,text)',
    'ppic_private.auto_import_heartbeat(text,text)',
    'ppic_private.auto_import_discovery()'
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'Private admin entry point exposed to %: %',role_name,signature; END IF;
      checks:=checks+1;
    END LOOP;
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['auto_import_jobs','auto_import_config','auto_import_folders'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('ppic_private.'||tab)::regclass) THEN RAISE EXCEPTION 'RLS missing: %',tab; END IF;
    checks:=checks+1;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(role_name,'ppic_private.'||tab,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Private table exposed: % / %',role_name,tab; END IF;
      checks:=checks+1;
    END LOOP;
  END LOOP;

  safe_status := pg_get_functiondef('public.ppic_auto_import_status(text)'::regprocedure);
  IF safe_status ~* 'download_url|nonce_hash|nonce_expires|lease_token' THEN RAISE EXCEPTION 'Status projection exposes capabilities'; END IF;
  checks:=checks+1;
  IF safe_status !~ 'LIMIT 200' OR safe_status !~ 'source_policy' THEN RAISE EXCEPTION 'Catalog exclusion policy is incomplete'; END IF;
  checks:=checks+1;
  IF ppic_private.auto_import_safe_message('failed https://host.invalid/raw?sig=secret') LIKE '%sig=%' THEN RAISE EXCEPTION 'URL redaction failed'; END IF;
  checks:=checks+1;

  SELECT count(*) INTO before_count FROM ppic_private.auto_import_jobs;
  folder:='synthetic_tsg_folder_security_test';
  INSERT INTO ppic_private.auto_import_folders(division,drive_folder_id,folder_name)
    VALUES('TSG',folder,'SYNTHETIC ROLLBACK-ONLY TEST')
    ON CONFLICT(division) DO UPDATE SET drive_folder_id=excluded.drive_folder_id,folder_name=excluded.folder_name;
  fake_sha:=encode(extensions.digest('automatic-ingest-synthetic:'||gen_random_uuid()::text,'sha256'),'hex');
  manifest:=jsonb_build_object('filename','BAL_PPIC_AUTOMATION_SECURITY_TEST_V999.xlsx','division','TSG',
    'period',to_char((now() AT TIME ZONE 'Asia/Jakarta')::date,'YYYY-MM'),
    'cutoff',to_char((now() AT TIME ZONE 'Asia/Jakarta')::date,'YYYY-MM-DD'),
    'version','V999','sha256',fake_sha,'size_bytes',1000,'drive_file_id','synthetic_no_real_file','drive_folder_id',folder);
  PERFORM ppic_private.configure_auto_import(false,NULL);
  got:=ppic_private.enqueue_auto_import(manifest,NULL);
  IF got->>'code' IS DISTINCT FROM 'AUTO_IMPORT_DISABLED' THEN RAISE EXCEPTION 'Disabled queue gate failed'; END IF;
  checks:=checks+1;
  rejected:=false;
  BEGIN PERFORM ppic_private.configure_auto_import(true,NULL); EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Enabled schedule without actual automation ID'; END IF;
  checks:=checks+1;
  PERFORM ppic_private.configure_auto_import(true,'synthetic-test-rollback-only');
  FOREACH candidate_url IN ARRAY ARRAY[
    'http://sdmntprtest.oaiusercontent.com/files/example/raw?sig=test',
    'https://127.0.0.1/files/example/raw?sig=test',
    'https://sdmntprtest.oaiusercontent.com.evil.invalid/files/example/raw?sig=test',
    'https://sdmntprtest.oaiusercontent.com:443/files/example/raw?sig=test',
    'https://user:password@sdmntprtest.oaiusercontent.com/files/example/raw?sig=test',
    'https://sdmntprtest.oaiusercontent.com/other?sig=test'
  ] LOOP
    rejected:=false;
    BEGIN PERFORM ppic_private.enqueue_auto_import(manifest,candidate_url); EXCEPTION WHEN others THEN rejected:=true; END;
    IF NOT rejected THEN RAISE EXCEPTION 'Download capability origin/path gate failed'; END IF;
    checks:=checks+1;
  END LOOP;
  rejected:=false;
  BEGIN PERFORM ppic_private.enqueue_auto_import(manifest||jsonb_build_object('download_expires_at',now()-interval '1 minute'),
     'https://sdmntprtest.oaiusercontent.com/files/example/raw?sig=not-a-real-capability');
  EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Expired capability accepted'; END IF;
  checks:=checks+1;
  IF (SELECT count(*) FROM ppic_private.auto_import_jobs)<>before_count THEN RAISE EXCEPTION 'Negative tests mutated queue'; END IF;
  checks:=checks+1;

  -- A synthetic in-transaction row proves nonce atomicity and secret erasure.
  nonce:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO ppic_private.auto_import_jobs(filename,division,period,cutoff,version,sha256,size_bytes,drive_file_id,drive_folder_id,
     status,download_url,download_expires_at,nonce_hash,nonce_expires_at)
  VALUES(manifest->>'filename','TSG',manifest->>'period',(manifest->>'cutoff')::date,'V999',fake_sha,1000,
    'synthetic_no_real_file',folder,'QUEUED','https://sdmntprtest.oaiusercontent.com/files/example/raw?sig=not-a-real-capability',
    now()+interval '5 minutes',extensions.digest(nonce,'sha256'),now()+interval '5 minutes') RETURNING id INTO job;
  got:=public.ppic_auto_import_claim(job,repeat('0',64));
  IF got->>'claimed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Incorrect nonce accepted'; END IF;
  checks:=checks+1;
  got:=public.ppic_auto_import_claim(job,nonce);lease:=(got->>'lease_token')::uuid;
  IF got->>'claimed' IS DISTINCT FROM 'true' OR lease IS NULL THEN RAISE EXCEPTION 'Valid nonce claim failed'; END IF;
  checks:=checks+1;
  got:=public.ppic_auto_import_claim(job,nonce);
  IF got->>'claimed' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Nonce replay accepted'; END IF;
  checks:=checks+1;
  got:=public.ppic_auto_import_complete(job,gen_random_uuid(),'FAILED',NULL,'ARCHIVE_ONLY','synthetic');
  IF got->>'code' IS DISTINCT FROM 'LEASE_MISMATCH' THEN RAISE EXCEPTION 'Wrong lease accepted'; END IF;
  checks:=checks+1;
  rejected:=false;
  BEGIN PERFORM public.ppic_auto_import_complete(job,lease,'IMPORTED','nonexistent-document','PROCESSED','synthetic');
  EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Unregistered file marked imported'; END IF;
  checks:=checks+1;
  got:=public.ppic_auto_import_complete(job,lease,'FAILED',NULL,'PROCESSED','Synthetic failed test https://host.invalid/raw?sig=secret');
  IF got->>'ok' IS DISTINCT FROM 'true' OR got->>'report_status'<>'ARCHIVE_ONLY' THEN RAISE EXCEPTION 'Completion/report gate failed'; END IF;
  checks:=checks+1;
  IF EXISTS (SELECT 1 FROM ppic_private.auto_import_jobs WHERE id=job AND
      (download_url IS NOT NULL OR nonce_hash IS NOT NULL OR lease_token IS NOT NULL OR message LIKE '%sig=%'))
  THEN RAISE EXCEPTION 'Capability/message not sanitized after completion'; END IF;
  checks:=checks+1;

  UPDATE ppic_private.auto_import_jobs SET status='PROCESSING',completed_at=NULL,lease_token=gen_random_uuid(),lease_expires_at=now()-interval '1 minute',
     download_url='https://sdmntprtest.oaiusercontent.com/files/example/raw?sig=not-a-real-capability' WHERE id=job;
  PERFORM ppic_private.auto_import_heartbeat('Rollback-only security test',NULL);
  IF NOT EXISTS (SELECT 1 FROM ppic_private.auto_import_jobs WHERE id=job AND status='FAILED' AND download_url IS NULL AND lease_token IS NULL)
  THEN RAISE EXCEPTION 'Stale lease did not expire cleanly'; END IF;
  checks:=checks+1;
  got:=public.ppic_auto_import_status(manifest->>'period');
  IF got::text LIKE '%not-a-real-capability%' OR got::text LIKE '%"download_url"%' OR got::text LIKE '%"nonce_hash"%' THEN RAISE EXCEPTION 'Public status leaks secret data'; END IF;
  checks:=checks+1;
  IF got->'source_policy'->>'period' IS DISTINCT FROM manifest->>'period' OR jsonb_typeof(got->'source_policy'->'excluded_document_ids') IS DISTINCT FROM 'array'
    OR got->'source_policy'->>'complete' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'Period-scoped source policy missing'; END IF;
  checks:=checks+1;
  rejected:=false;
  BEGIN PERFORM public.ppic_auto_import_status('2026-13'); EXCEPTION WHEN others THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Malformed status period accepted'; END IF;
  checks:=checks+1;
  RAISE NOTICE 'PPIC automatic import security checks passed: %',checks;
END $test$;
ROLLBACK;
SELECT jsonb_build_object('test','ppic-auto-import-security','status','PASS','synthetic_changes_rolled_back',true) AS result;
