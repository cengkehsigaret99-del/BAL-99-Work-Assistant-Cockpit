-- Automatic PPIC archive ingestion. No operational/payroll snapshot is modified.
-- Ephemeral Drive download capabilities and job nonces never enter the public catalog.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE ppic_private.auto_import_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  cadence text NOT NULL DEFAULT 'HOURLY' CHECK (cadence = 'HOURLY'),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta' CHECK (timezone = 'Asia/Jakarta'),
  automation_id text,
  minimum_period text NOT NULL DEFAULT '2026-11',
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_message text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ppic_private.auto_import_config(id) VALUES (1);

CREATE TABLE ppic_private.auto_import_folders (
  division text PRIMARY KEY CHECK (division IN ('BAHAN BAKU','GILING','VERPACK','SDM GILING','SDM VERPACK','BARANG JADI','CUKAI','DO','KAS BANK','TSG')),
  drive_folder_id text NOT NULL,
  folder_name text NOT NULL
);
-- Folder identifiers are private deployment configuration, seeded separately.

CREATE TABLE ppic_private.auto_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL CHECK (filename ~ '^[A-Za-z0-9][A-Za-z0-9._() -]{5,159}[.]xlsx$'),
  division text NOT NULL REFERENCES ppic_private.auto_import_folders(division),
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  cutoff date NOT NULL,
  version text NOT NULL CHECK (version ~ '^V[0-9]{3,}$' AND length(version) <= 16),
  sha256 text NOT NULL UNIQUE CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 100 AND 10485760),
  drive_file_id text NOT NULL CHECK (drive_file_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  drive_folder_id text NOT NULL,
  register_ref text,
  status text NOT NULL CHECK (status IN ('QUEUED','PROCESSING','IMPORTED','DUPLICATE','FAILED')),
  report_status text NOT NULL DEFAULT 'ARCHIVE_ONLY' CHECK (report_status IN ('ARCHIVE_ONLY','REVIEW_REQUIRED','SUPERSEDED','PROCESSED')),
  document_id text,
  message text,
  download_url text,
  download_expires_at timestamptz,
  nonce_hash bytea,
  nonce_expires_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  request_id bigint,
  attempts integer NOT NULL DEFAULT 0,
  attempt_window_started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CHECK (to_char(cutoff,'YYYY-MM') = period),
  CHECK (status NOT IN ('IMPORTED','DUPLICATE','FAILED') OR
    (download_url IS NULL AND nonce_hash IS NULL AND lease_token IS NULL))
);
CREATE INDEX auto_import_jobs_pending_idx ON ppic_private.auto_import_jobs(status,updated_at)
 WHERE status IN ('QUEUED','PROCESSING');
CREATE INDEX auto_import_jobs_created_idx ON ppic_private.auto_import_jobs(created_at DESC);
CREATE INDEX auto_import_jobs_document_idx ON ppic_private.auto_import_jobs(document_id) WHERE document_id IS NOT NULL;

ALTER TABLE ppic_private.auto_import_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppic_private.auto_import_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppic_private.auto_import_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ppic_private.auto_import_config,ppic_private.auto_import_folders,ppic_private.auto_import_jobs
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION ppic_private.auto_import_safe_message(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT nullif(regexp_replace(left(coalesce(p_text,''),600),'https?://[^[:space:]]+','[alamat disembunyikan]','gi'),'')
$fn$;

CREATE FUNCTION ppic_private.auto_import_report_gate(p_division text,p_period text,p_cutoff date,p_sha256 text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE snap ppic_private.sdm_weekly_snapshots%ROWTYPE; latest_date date; logical_div text; raw_date text; accepted boolean := false;
BEGIN
 IF p_division NOT IN ('SDM GILING','SDM VERPACK') THEN
   RETURN jsonb_build_object('report_status','ARCHIVE_ONLY','latest_report_cutoff',NULL,'already_processed',false);
 END IF;
 logical_div := replace(p_division,'SDM ','');
 SELECT * INTO snap FROM ppic_private.sdm_weekly_snapshots WHERE period=p_period ORDER BY created_at DESC,version DESC LIMIT 1;
 IF FOUND THEN
   raw_date := coalesce(snap.payload->'meta'->'payroll'->'sourceCutoffByDivision'->>logical_div,
     snap.payload->'meta'->'sourceCutoffByDivision'->>logical_div,snap.cutoff::text);
   IF raw_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN latest_date := raw_date::date; END IF;
   SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(snap.payload->'meta'->'acceptedSources')='array'
         THEN snap.payload->'meta'->'acceptedSources' ELSE '[]'::jsonb END) x
       WHERE x->>'sha256'=p_sha256 AND x->>'division'=logical_div) INTO accepted;
 END IF;
 RETURN jsonb_build_object('report_status',CASE WHEN accepted THEN 'PROCESSED'
   WHEN latest_date IS NOT NULL AND p_cutoff<latest_date THEN 'SUPERSEDED' ELSE 'REVIEW_REQUIRED' END,
   'latest_report_cutoff',latest_date,'already_processed',accepted);
END $fn$;

CREATE FUNCTION public.ppic_auto_import_source_check(p_sha256 text,p_division text,p_period text,p_cutoff date,p_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE s ppic_private.source_registry%ROWTYPE; gate jsonb; matched boolean;
BEGIN
 IF p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid SHA256'; END IF;
 gate := ppic_private.auto_import_report_gate(p_division,p_period,p_cutoff,p_sha256);
 SELECT * INTO s FROM ppic_private.source_registry WHERE sha256=p_sha256;
 IF NOT FOUND THEN RETURN jsonb_build_object('exists',false,'matching',false)||gate; END IF;
 matched := s.division=p_division AND s.period=p_period AND
   (s.cutoff AT TIME ZONE 'Asia/Jakarta')::date=p_cutoff AND s.version=p_version;
 RETURN jsonb_build_object('exists',true,'matching',matched,'document_id',s.document_id,
   'division',s.division,'period',s.period,'cutoff',to_char(s.cutoff AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD'),
   'version',s.version,'private_locator',s.private_locator,'reconciliation_status',s.reconciliation_status,
   'conflict_message',CASE WHEN NOT matched THEN 'SHA256 sudah terdaftar dengan metadata berbeda.' END)||gate;
END $fn$;
REVOKE ALL ON FUNCTION public.ppic_auto_import_source_check(text,text,text,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ppic_auto_import_source_check(text,text,text,date,text) TO service_role;

CREATE FUNCTION ppic_private.configure_auto_import(p_enabled boolean,p_automation_id text,p_cadence text DEFAULT 'HOURLY',p_timezone text DEFAULT 'Asia/Jakarta')
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE c ppic_private.auto_import_config%ROWTYPE;
BEGIN
 IF p_cadence IS DISTINCT FROM 'HOURLY' OR p_timezone IS DISTINCT FROM 'Asia/Jakarta'
   OR (p_automation_id IS NOT NULL AND p_automation_id !~ '^[A-Za-z0-9_:-]{6,120}$')
   OR (p_enabled AND p_automation_id IS NULL) THEN RAISE EXCEPTION 'actual hourly automation identity required'; END IF;
 UPDATE ppic_private.auto_import_config SET enabled=p_enabled,automation_id=p_automation_id,
   cadence=p_cadence,timezone=p_timezone,updated_at=now() WHERE id=1 RETURNING * INTO c;
 RETURN jsonb_build_object('enabled',c.enabled,'cadence',c.cadence,'timezone',c.timezone,'automation_id',c.automation_id,
   'last_check_at',c.last_check_at,'last_success_at',c.last_success_at);
END $fn$;

CREATE FUNCTION ppic_private.auto_import_heartbeat(p_message text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE expired integer;
BEGIN
 UPDATE ppic_private.auto_import_jobs SET status='FAILED',message='Percobaan kedaluwarsa; unduh sumber Drive kembali untuk mencoba ulang.',
   download_url=NULL,download_expires_at=NULL,nonce_hash=NULL,nonce_expires_at=NULL,
   lease_token=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now()
 WHERE (status='QUEUED' AND nonce_expires_at<now()) OR (status='PROCESSING' AND lease_expires_at<now());
 GET DIAGNOSTICS expired=ROW_COUNT;
 UPDATE ppic_private.auto_import_config SET last_check_at=now(),last_message=ppic_private.auto_import_safe_message(p_message),
   last_error=ppic_private.auto_import_safe_message(p_error),updated_at=now() WHERE id=1;
 RETURN jsonb_build_object('ok',true,'expired_attempts',expired,'last_check_at',now());
END $fn$;

CREATE FUNCTION ppic_private.enqueue_auto_import(p_manifest jsonb,p_download_url text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,ppic_private,public AS $fn$
#variable_conflict use_variable
DECLARE
  j ppic_private.auto_import_jobs%ROWTYPE; cfg ppic_private.auto_import_config%ROWTYPE;
  filename text := p_manifest->>'filename'; division text := p_manifest->>'division';
  period text := p_manifest->>'period'; version text := p_manifest->>'version'; sha text := p_manifest->>'sha256';
  drive_id text := p_manifest->>'drive_file_id'; folder_id text := p_manifest->>'drive_folder_id';
  cutoff_date date; file_size integer; expires timestamptz; nonce text; response jsonb; gate jsonb;
  doc text; target_status text; result_message text; pending_count integer; found_job boolean; locator text;
BEGIN
 IF jsonb_typeof(p_manifest) IS DISTINCT FROM 'object' OR filename IS NULL OR filename !~ '^[A-Za-z0-9][A-Za-z0-9._() -]{5,159}[.]xlsx$'
  OR division IS NULL OR period IS NULL OR period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  OR version IS NULL OR version !~ '^V[0-9]{3,}$' OR length(version)>16 OR sha IS NULL OR sha !~ '^[a-f0-9]{64}$'
  OR coalesce(p_manifest->>'cutoff','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR coalesce(p_manifest->>'size_bytes','') !~ '^[0-9]{3,8}$'
  OR coalesce(drive_id,'') !~ '^[A-Za-z0-9_-]{10,100}$'
  OR NOT EXISTS (SELECT 1 FROM ppic_private.auto_import_folders f WHERE f.division=division AND f.drive_folder_id=folder_id)
 THEN RAISE EXCEPTION 'invalid PPIC manifest or unapproved Drive folder'; END IF;
 cutoff_date := (p_manifest->>'cutoff')::date; file_size := (p_manifest->>'size_bytes')::integer;
 SELECT * INTO cfg FROM ppic_private.auto_import_config WHERE id=1;
 IF to_char(cutoff_date,'YYYY-MM')<>period OR period<cfg.minimum_period OR
    cutoff_date>(now() AT TIME ZONE 'Asia/Jakarta')::date OR file_size NOT BETWEEN 100 AND 10485760
 THEN RAISE EXCEPTION 'invalid period, actual cutoff or XLSX size'; END IF;
 IF EXISTS (SELECT 1 FROM ppic_private.source_registry s WHERE s.period=period AND s.reconciliation_status='LOCKED')
 THEN RAISE EXCEPTION 'LOCKED period cannot be imported automatically'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ppic:auto-import:enqueue',0));
 SELECT * INTO j FROM ppic_private.auto_import_jobs q WHERE q.sha256=sha FOR UPDATE; found_job := FOUND;
 IF found_job AND (j.division<>division OR j.period<>period OR j.cutoff<>cutoff_date OR j.version<>version OR j.size_bytes<>file_size)
 THEN RETURN jsonb_build_object('ok',false,'id',j.id,'status',j.status,'code','HASH_METADATA_CONFLICT'); END IF;
 response := public.ppic_auto_import_source_check(sha,division,period,cutoff_date,version);
 gate := ppic_private.auto_import_report_gate(division,period,cutoff_date,sha);
 IF coalesce((response->>'exists')::boolean,false) THEN
   IF NOT coalesce((response->>'matching')::boolean,false) THEN
     RETURN jsonb_build_object('ok',false,'code','HASH_METADATA_CONFLICT','document_id',response->>'document_id');
   END IF;
   locator := 'ppic-private-sources/'||period||'/'||replace(lower(division),' ','_')||'/'||sha||'.xlsx';
   IF response->>'private_locator' IS DISTINCT FROM locator OR NOT EXISTS
      (SELECT 1 FROM storage.objects o WHERE o.bucket_id='ppic-private-sources' AND o.name=substring(locator FROM length('ppic-private-sources/')+1)
        AND o.metadata->>'size'=file_size::text)
   THEN RETURN jsonb_build_object('ok',false,'code','REGISTERED_REFERENCE_REQUIRES_REVIEW','document_id',response->>'document_id'); END IF;
   IF found_job AND j.status IN ('IMPORTED','DUPLICATE') THEN
     RETURN jsonb_build_object('ok',true,'duplicate',true,'id',j.id,'status',j.status,'document_id',j.document_id,'report_status',gate->>'report_status');
   END IF;
   IF found_job AND j.status='PROCESSING' AND j.lease_expires_at>now() THEN
     RETURN jsonb_build_object('ok',true,'id',j.id,'status',j.status,'message','Proses yang sama masih berjalan.');
   END IF;
   target_status := 'DUPLICATE'; doc := response->>'document_id';
   result_message := 'File dengan SHA256 dan metadata yang sama sudah tersimpan; tidak diunggah ulang.';
 ELSE
   IF found_job AND j.status IN ('IMPORTED','DUPLICATE') THEN
     RETURN jsonb_build_object('ok',false,'id',j.id,'code','REGISTERED_SOURCE_MISSING_REVIEW');
   END IF;
   IF NOT cfg.enabled OR cfg.automation_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','AUTO_IMPORT_DISABLED'); END IF;
   IF found_job AND ((j.status='QUEUED' AND j.nonce_expires_at>now()) OR (j.status='PROCESSING' AND j.lease_expires_at>now())) THEN
     RETURN jsonb_build_object('ok',true,'id',j.id,'status',j.status,'message','Percobaan yang sama masih berjalan.');
   END IF;
   IF found_job AND j.attempts>=5 AND j.attempt_window_started_at>now()-interval '24 hours' THEN
     RETURN jsonb_build_object('ok',false,'id',j.id,'code','RETRY_LIMIT');
   END IF;
   IF p_download_url IS NULL OR length(p_download_url)>6000 OR
      p_download_url !~ '^https://sdmntpr[a-z0-9-]*[.]oaiusercontent[.]com/files/[A-Za-z0-9_-]+/raw[?][^[:space:]]+$'
   THEN RAISE EXCEPTION 'fresh authenticated Drive download capability required'; END IF;
   expires := least(now()+interval '10 minutes',coalesce((p_manifest->>'download_expires_at')::timestamptz,now()+interval '10 minutes'));
   IF expires<now()+interval '30 seconds' THEN RAISE EXCEPTION 'download capability expires too soon; fetch Drive again'; END IF;
   SELECT count(*) INTO pending_count FROM ppic_private.auto_import_jobs WHERE status IN ('QUEUED','PROCESSING') AND id IS DISTINCT FROM j.id;
   IF pending_count>=32 THEN RETURN jsonb_build_object('ok',false,'code','QUEUE_LIMIT'); END IF;
   target_status := 'QUEUED'; result_message := 'Menunggu pemeriksaan dan penyimpanan arsip otomatis.';
   nonce := encode(extensions.gen_random_bytes(32),'hex');
 END IF;
 IF NOT found_job THEN
   INSERT INTO ppic_private.auto_import_jobs(filename,division,period,cutoff,version,sha256,size_bytes,drive_file_id,drive_folder_id,register_ref,status,report_status,document_id,message)
   VALUES(filename,division,period,cutoff_date,version,sha,file_size,drive_id,folder_id,left(p_manifest->>'register_ref',120),target_status,gate->>'report_status',doc,result_message)
   RETURNING * INTO j;
 END IF;
 UPDATE ppic_private.auto_import_jobs SET status=target_status,document_id=doc,report_status=gate->>'report_status',message=result_message,
   download_url=CASE WHEN target_status='QUEUED' THEN p_download_url END,
   download_expires_at=CASE WHEN target_status='QUEUED' THEN expires END,
   nonce_hash=CASE WHEN target_status='QUEUED' THEN extensions.digest(nonce,'sha256') END,
   nonce_expires_at=CASE WHEN target_status='QUEUED' THEN expires END,
   lease_token=NULL,lease_expires_at=NULL,started_at=NULL,
   completed_at=CASE WHEN target_status='DUPLICATE' THEN now() END,
   attempts=CASE WHEN target_status='QUEUED' THEN CASE WHEN attempt_window_started_at<now()-interval '24 hours' THEN 1 ELSE attempts+1 END ELSE attempts END,
   attempt_window_started_at=CASE WHEN attempt_window_started_at<now()-interval '24 hours' THEN now() ELSE attempt_window_started_at END,
   updated_at=now() WHERE id=j.id RETURNING * INTO j;
 IF target_status='QUEUED' THEN
   UPDATE ppic_private.auto_import_jobs SET request_id=net.http_post(
     url:='https://jryfozndxpjymggevkgq.supabase.co/functions/v1/ppic-auto-import',
     body:=jsonb_build_object('job_id',j.id,'nonce',nonce),headers:=jsonb_build_object('Content-Type','application/json'),timeout_milliseconds:=60000)
   WHERE id=j.id RETURNING * INTO j;
 ELSE
   UPDATE ppic_private.auto_import_config SET last_success_at=now(),updated_at=now() WHERE id=1;
 END IF;
 RETURN jsonb_build_object('ok',true,'id',j.id,'status',j.status,'document_id',j.document_id,'report_status',j.report_status,
   'request_id',j.request_id,'duplicate',j.status='DUPLICATE');
END $fn$;

CREATE FUNCTION public.ppic_auto_import_claim(p_job_id uuid,p_nonce text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE j ppic_private.auto_import_jobs%ROWTYPE; lease uuid; gate jsonb;
BEGIN
 IF p_nonce IS NULL OR p_nonce !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('claimed',false); END IF;
 SELECT * INTO j FROM ppic_private.auto_import_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'QUEUED' OR j.nonce_expires_at<=now() OR j.download_expires_at<=now()
   OR j.nonce_hash IS DISTINCT FROM extensions.digest(p_nonce,'sha256')
   OR NOT EXISTS (SELECT 1 FROM ppic_private.auto_import_config WHERE id=1 AND enabled)
 THEN RETURN jsonb_build_object('claimed',false); END IF;
 lease := gen_random_uuid();
 UPDATE ppic_private.auto_import_jobs SET status='PROCESSING',nonce_hash=NULL,nonce_expires_at=NULL,
   lease_token=lease,lease_expires_at=now()+interval '5 minutes',started_at=now(),updated_at=now(),message='Memeriksa file dan menyimpan arsip privat.'
 WHERE id=j.id;
 gate := ppic_private.auto_import_report_gate(j.division,j.period,j.cutoff,j.sha256);
 RETURN jsonb_build_object('claimed',true,'id',j.id,'lease_token',lease,'filename',j.filename,'division',j.division,
   'period',j.period,'cutoff',to_char(j.cutoff,'YYYY-MM-DD'),'version',j.version,'sha256',j.sha256,'size_bytes',j.size_bytes,
   'download_url',j.download_url,'drive_file_id',j.drive_file_id,'drive_folder_id',j.drive_folder_id,
   'source_file_id',j.drive_file_id,'source_folder_id',j.drive_folder_id,'latest_report_cutoff',gate->'latest_report_cutoff');
END $fn$;
REVOKE ALL ON FUNCTION public.ppic_auto_import_claim(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ppic_auto_import_claim(uuid,text) TO service_role;

CREATE FUNCTION public.ppic_auto_import_complete(p_job_id uuid,p_lease_token uuid,p_status text,p_document_id text DEFAULT NULL,p_report_status text DEFAULT 'ARCHIVE_ONLY',p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE j ppic_private.auto_import_jobs%ROWTYPE; source jsonb; gate jsonb; locator text;
BEGIN
 IF p_status IS NULL OR p_status NOT IN ('IMPORTED','DUPLICATE','FAILED') THEN RAISE EXCEPTION 'invalid completion state'; END IF;
 SELECT * INTO j FROM ppic_private.auto_import_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR p_lease_token IS NULL OR j.status<>'PROCESSING' OR j.lease_token IS DISTINCT FROM p_lease_token
   OR j.lease_expires_at<=now() THEN RETURN jsonb_build_object('ok',false,'code','LEASE_MISMATCH'); END IF;
 gate := ppic_private.auto_import_report_gate(j.division,j.period,j.cutoff,j.sha256);
 IF p_status IN ('IMPORTED','DUPLICATE') THEN
   source := public.ppic_auto_import_source_check(j.sha256,j.division,j.period,j.cutoff,j.version);
   locator := 'ppic-private-sources/'||j.period||'/'||replace(lower(j.division),' ','_')||'/'||j.sha256||'.xlsx';
   IF NOT coalesce((source->>'exists')::boolean,false) OR NOT coalesce((source->>'matching')::boolean,false)
      OR source->>'document_id' IS DISTINCT FROM p_document_id OR source->>'private_locator' IS DISTINCT FROM locator
      OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='ppic-private-sources' AND o.name=substring(locator FROM length('ppic-private-sources/')+1)
        AND o.metadata->>'size'=j.size_bytes::text)
   THEN RAISE EXCEPTION 'private object and matching registry receipt required'; END IF;
 END IF;
 UPDATE ppic_private.auto_import_jobs SET status=p_status,
   document_id=CASE WHEN p_status IN ('IMPORTED','DUPLICATE') THEN p_document_id END,
   report_status=gate->>'report_status',message=ppic_private.auto_import_safe_message(p_message),
   download_url=NULL,download_expires_at=NULL,nonce_hash=NULL,nonce_expires_at=NULL,lease_token=NULL,lease_expires_at=NULL,
   completed_at=now(),updated_at=now() WHERE id=j.id RETURNING * INTO j;
 IF p_status IN ('IMPORTED','DUPLICATE') THEN UPDATE ppic_private.auto_import_config SET last_success_at=now(),last_error=NULL,updated_at=now() WHERE id=1; END IF;
 RETURN jsonb_build_object('ok',true,'id',j.id,'status',j.status,'document_id',j.document_id,'report_status',j.report_status);
END $fn$;
REVOKE ALL ON FUNCTION public.ppic_auto_import_complete(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ppic_auto_import_complete(uuid,uuid,text,text,text,text) TO service_role;

CREATE FUNCTION public.ppic_auto_import_status(p_period text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,ppic_private AS $fn$
BEGIN
 IF p_period IS NOT NULL AND p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'invalid period'; END IF;
 RETURN (SELECT jsonb_build_object('ok',true,
   'config',(SELECT jsonb_build_object('enabled',enabled,'cadence',cadence,'timezone',timezone,'automation_id',automation_id,
      'last_check_at',last_check_at,'last_success_at',last_success_at,'last_message',last_message,'last_error',last_error) FROM ppic_private.auto_import_config WHERE id=1),
   'jobs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'filename',filename,'division',division,'period',period,'version',version,
     'cutoff',to_char(cutoff,'YYYY-MM-DD'),'status',status,'document_id',document_id,'report_status',report_status,'message',message,
     'created_at',created_at,'completed_at',completed_at) ORDER BY created_at DESC)
     FROM (SELECT id,filename,division,period,version,cutoff,status,document_id,message,created_at,completed_at,
       CASE WHEN status IN ('IMPORTED','DUPLICATE')
         THEN ppic_private.auto_import_report_gate(division,period,cutoff,sha256)->>'report_status'
         ELSE report_status END AS report_status
       FROM ppic_private.auto_import_jobs WHERE p_period IS NULL OR period=p_period ORDER BY created_at DESC LIMIT 80) q),'[]'::jsonb),
   'source_policy',jsonb_build_object('period',p_period,'complete',true,'excluded_document_ids',coalesce(
     (SELECT jsonb_agg(s.document_id ORDER BY s.ingested_at DESC,s.document_id)
       FROM (SELECT document_id,period,ingested_at FROM ppic_private.source_registry ORDER BY ingested_at DESC LIMIT 200) s
       JOIN ppic_private.auto_import_jobs j ON j.document_id=s.document_id
       WHERE (p_period IS NULL OR s.period=p_period) AND j.status IN ('IMPORTED','DUPLICATE')
         AND ppic_private.auto_import_report_gate(j.division,j.period,j.cutoff,j.sha256)->>'report_status' IN ('ARCHIVE_ONLY','SUPERSEDED')),'[]'::jsonb)),
   'counts',(SELECT jsonb_build_object('total',count(*),'queued',count(*) FILTER(WHERE status='QUEUED'),
      'processing',count(*) FILTER(WHERE status='PROCESSING'),'imported',count(*) FILTER(WHERE status='IMPORTED'),
      'duplicate',count(*) FILTER(WHERE status='DUPLICATE'),'failed',count(*) FILTER(WHERE status='FAILED'))
       FROM ppic_private.auto_import_jobs WHERE p_period IS NULL OR period=p_period)));
END;
$fn$;
REVOKE ALL ON FUNCTION public.ppic_auto_import_status(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ppic_auto_import_status(text) TO service_role;

CREATE FUNCTION ppic_private.auto_import_discovery()
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,ppic_private AS $fn$
 SELECT public.ppic_auto_import_status() || jsonb_build_object(
   'allowed_folders',(SELECT jsonb_agg(jsonb_build_object('division',division,'drive_folder_id',drive_folder_id,'folder_name',folder_name) ORDER BY division) FROM ppic_private.auto_import_folders),
   'minimum_period',(SELECT minimum_period FROM ppic_private.auto_import_config WHERE id=1),
   'recent_hashes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'filename',filename,'division',division,'period',period,'cutoff',cutoff,'version',version,
       'sha256',sha256,'size_bytes',size_bytes,'drive_file_id',drive_file_id,'status',status,
       'report_status',CASE WHEN status IN ('IMPORTED','DUPLICATE') THEN ppic_private.auto_import_report_gate(division,period,cutoff,sha256)->>'report_status' ELSE report_status END,
       'document_id',document_id,'attempts',attempts)
       ORDER BY updated_at DESC) FROM (SELECT * FROM ppic_private.auto_import_jobs ORDER BY updated_at DESC LIMIT 200) q),'[]'::jsonb))
$fn$;

-- Private entry points are for the authenticated project-admin connector only.
REVOKE ALL ON FUNCTION ppic_private.auto_import_safe_message(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION ppic_private.auto_import_report_gate(text,text,date,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION ppic_private.configure_auto_import(boolean,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION ppic_private.auto_import_heartbeat(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION ppic_private.enqueue_auto_import(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION ppic_private.auto_import_discovery() FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE ppic_private.auto_import_jobs IS 'Private automatic source archive jobs; nonce/download URL fields must never be exposed in APIs, UI, logs, exports, or public repository data.';
