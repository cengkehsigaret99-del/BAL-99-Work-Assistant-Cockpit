-- Register the newly enabled, still-unused pg_net outside public.
-- Supabase documents drop/re-create because pg_net is not relocatable:
-- https://supabase.com/docs/guides/database/extensions/pg_net#troubleshooting
-- No CASCADE, catalog edits, source imports, or operational snapshot changes.
DO $ppic_pg_net_schema$
BEGIN
  -- Keep the disabled importer and empty transport stable throughout this block.
  LOCK TABLE ppic_private.auto_import_config, ppic_private.auto_import_jobs IN SHARE MODE;
  LOCK TABLE net.http_request_queue, net._http_response IN ACCESS EXCLUSIVE MODE;

  IF (SELECT enabled FROM ppic_private.auto_import_config WHERE id = 1) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PPIC automatic import must remain disabled during pg_net registration repair';
  END IF;
  IF EXISTS (SELECT 1 FROM ppic_private.auto_import_jobs) THEN
    RAISE EXCEPTION 'PPIC automatic import jobs must be empty during pg_net registration repair';
  END IF;
  IF EXISTS (SELECT 1 FROM net.http_request_queue) OR EXISTS (SELECT 1 FROM net._http_response) THEN
    RAISE EXCEPTION 'pg_net requests and responses must be empty before recreation';
  END IF;
  IF to_regnamespace('extensions') IS NULL THEN
    RAISE EXCEPTION 'Expected existing extensions schema';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net' AND n.nspname = 'public' AND NOT e.extrelocatable
  ) THEN
    RAISE EXCEPTION 'Expected unused non-relocatable pg_net registered in public';
  END IF;

  -- RESTRICT preserves any unexpected dependents by failing this entire block.
  EXECUTE 'DROP EXTENSION pg_net RESTRICT';
  EXECUTE 'CREATE EXTENSION pg_net WITH SCHEMA extensions';

  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net' AND n.nspname = 'extensions'
  ) OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'pg_net registration repair did not preserve the expected net API';
  END IF;
END
$ppic_pg_net_schema$;
