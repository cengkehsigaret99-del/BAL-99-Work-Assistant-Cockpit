-- PPIC Robot Manajer v6: private, append-only evidence and GPT briefing records.
-- This migration neither changes operational ledgers nor calls an LLM/network API.
-- The project-admin connector writes evidence; the Owner Edge function only reads.

CREATE TABLE ppic_private.robot_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  enabled boolean NOT NULL DEFAULT false,
  automation_id text,
  cadence text NOT NULL DEFAULT 'HOURLY' CHECK (cadence='HOURLY'),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta' CHECK (timezone='Asia/Jakarta'),
  minimum_period text NOT NULL DEFAULT '2026-11' CHECK (minimum_period='2026-11'),
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_message text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR automation_id IS NOT NULL),
  CHECK (automation_id IS NULL OR automation_id ~ '^Automation_[A-Za-z0-9_-]{8,100}$')
);
INSERT INTO ppic_private.robot_config(id) VALUES (1);

CREATE TABLE ppic_private.robot_source_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id text NOT NULL REFERENCES ppic_private.source_registry(document_id),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  division text NOT NULL,
  cutoff date NOT NULL,
  version text NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(document_id,payload_sha256)
);
CREATE INDEX robot_source_facts_current_idx ON ppic_private.robot_source_facts(document_id,created_at DESC,id DESC);

CREATE TABLE ppic_private.robot_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  as_of date NOT NULL,
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  evidence_manifest jsonb NOT NULL CHECK (jsonb_typeof(evidence_manifest)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(period,evidence_hash,payload_sha256)
);
CREATE INDEX robot_briefings_period_idx ON ppic_private.robot_briefings(period,created_at DESC,id DESC);

CREATE TABLE ppic_private.robot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('CHECK','ANALYSIS','MAINTENANCE')),
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCESS','NO_CHANGE','WAITING','FAILED','BLOCKED')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX robot_runs_created_idx ON ppic_private.robot_runs(created_at DESC,id DESC);

ALTER TABLE ppic_private.robot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppic_private.robot_source_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppic_private.robot_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppic_private.robot_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ppic_private.robot_config,ppic_private.robot_source_facts,
 ppic_private.robot_briefings,ppic_private.robot_runs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION ppic_private.robot_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'Robot evidence and audit records are append-only'; END $fn$;
CREATE TRIGGER robot_facts_no_change BEFORE UPDATE OR DELETE ON ppic_private.robot_source_facts
 FOR EACH ROW EXECUTE FUNCTION ppic_private.robot_append_only();
CREATE TRIGGER robot_briefs_no_change BEFORE UPDATE OR DELETE ON ppic_private.robot_briefings
 FOR EACH ROW EXECUTE FUNCTION ppic_private.robot_append_only();
CREATE TRIGGER robot_runs_no_change BEFORE UPDATE OR DELETE ON ppic_private.robot_runs
 FOR EACH ROW EXECUTE FUNCTION ppic_private.robot_append_only();
CREATE TRIGGER robot_facts_no_truncate BEFORE TRUNCATE ON ppic_private.robot_source_facts
 FOR EACH STATEMENT EXECUTE FUNCTION ppic_private.robot_append_only();
CREATE TRIGGER robot_briefs_no_truncate BEFORE TRUNCATE ON ppic_private.robot_briefings
 FOR EACH STATEMENT EXECUTE FUNCTION ppic_private.robot_append_only();
CREATE TRIGGER robot_runs_no_truncate BEFORE TRUNCATE ON ppic_private.robot_runs
 FOR EACH STATEMENT EXECUTE FUNCTION ppic_private.robot_append_only();

CREATE FUNCTION ppic_private.robot_valid_object(p_value jsonb,p_keys text[],p_required text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN false ELSE
   NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_value) k WHERE NOT (k=ANY(p_keys)))
   AND p_value ?& p_required END
$fn$;

CREATE FUNCTION ppic_private.robot_safe_text(p_value text,p_limit integer DEFAULT 1200)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT left(regexp_replace(regexp_replace(regexp_replace(coalesce(p_value,''),
  'https?://[^[:space:]]+','[alamat disembunyikan]','gi'),
  '(Bearer[[:space:]]+[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+)',
  '[rahasia disembunyikan]','gi'),'[[:cntrl:]]',' ','g'),greatest(0,least(p_limit,5000)))
$fn$;

CREATE FUNCTION ppic_private.robot_valid_text(p_value jsonb,p_limit integer,p_required boolean DEFAULT true)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,ppic_private AS $fn$
 SELECT jsonb_typeof(p_value)='string' AND length(p_value#>>'{}')<=p_limit
  AND (NOT p_required OR length(btrim(p_value#>>'{}'))>0)
  AND (p_value#>>'{}')=ppic_private.robot_safe_text(p_value#>>'{}',p_limit)
$fn$;

CREATE FUNCTION ppic_private.robot_assert_writable_period(p_period text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,ppic_private AS $fn$
BEGIN
 IF p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
   OR p_period<(SELECT minimum_period FROM ppic_private.robot_config WHERE id=1)
   OR p_period>to_char(now() AT TIME ZONE 'Asia/Jakarta','YYYY-MM')
 THEN RAISE EXCEPTION 'Robot period is invalid or outside the open working range'; END IF;
 IF EXISTS (SELECT 1 FROM ppic_private.source_registry WHERE period=p_period AND reconciliation_status='LOCKED')
   OR EXISTS (SELECT 1 FROM ppic_private.daily_ledger_snapshots WHERE period=p_period AND status='LOCKED')
   OR EXISTS (SELECT 1 FROM ppic_private.do_customer_snapshots WHERE period=p_period AND status='LOCKED')
   OR EXISTS (SELECT 1 FROM ppic_private.finished_goods_snapshots WHERE period=p_period AND status='LOCKED')
   OR EXISTS (SELECT 1 FROM ppic_private.material_daily_snapshots WHERE period=p_period AND status='LOCKED')
   OR EXISTS (SELECT 1 FROM ppic_private.report_snapshots WHERE period=p_period AND status='LOCKED')
   OR EXISTS (SELECT 1 FROM ppic_private.sdm_weekly_snapshots WHERE period=p_period AND status='LOCKED')
 THEN RAISE EXCEPTION 'LOCKED period is read-only'; END IF;
END $fn$;

CREATE FUNCTION ppic_private.robot_record_source_facts(p_document_id text,p_source_sha256 text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE s ppic_private.source_registry%ROWTYPE; item jsonb; issue jsonb; fk jsonb;
 keys text[]:='{}'; hash text; result_id uuid; existed boolean;
BEGIN
 IF NOT ppic_private.robot_valid_object(p_payload,
   ARRAY['schema_version','division','period','cutoff','version','source_sha256','facts','issues'],
   ARRAY['schema_version','division','period','cutoff','version','source_sha256','facts','issues'])
  OR p_payload->>'schema_version' IS DISTINCT FROM 'ppic-robot-facts-v1'
  OR octet_length(p_payload::text)>524288
  OR jsonb_typeof(p_payload->'facts') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_payload->'issues') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Invalid robot facts envelope'; END IF;
 IF jsonb_array_length(p_payload->'facts')>500 OR jsonb_array_length(p_payload->'issues')>50
 THEN RAISE EXCEPTION 'Robot facts limit exceeded'; END IF;
 SELECT * INTO s FROM ppic_private.source_registry WHERE document_id=p_document_id;
 IF NOT FOUND OR s.sha256 IS DISTINCT FROM p_source_sha256 OR s.sha256 IS DISTINCT FROM p_payload->>'source_sha256'
   OR s.division IS DISTINCT FROM p_payload->>'division' OR s.period IS DISTINCT FROM p_payload->>'period'
   OR s.version IS DISTINCT FROM p_payload->>'version'
   OR to_char(s.cutoff AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') IS DISTINCT FROM p_payload->>'cutoff'
 THEN RAISE EXCEPTION 'Facts must match the registered document, SHA256 and actual metadata'; END IF;
 PERFORM ppic_private.robot_assert_writable_period(s.period);
 IF s.division NOT IN ('BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK')
 THEN RAISE EXCEPTION 'Unsupported robot division'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'facts') LOOP
  IF NOT ppic_private.robot_valid_object(item,
    ARRAY['key','label','value','unit','scope','source_sheet','source_range','quality','note'],
    ARRAY['key','label','value','unit','scope','source_sheet','source_range','quality','note'])
   OR coalesce(item->>'key','') !~ '^[a-z][a-z0-9_]{0,79}$'
   OR (item->>'key')=ANY(keys)
   OR NOT coalesce(ppic_private.robot_valid_text(item->'label',240),false)
   OR NOT coalesce(ppic_private.robot_valid_text(item->'unit',240,false),false)
   OR NOT coalesce(ppic_private.robot_valid_text(item->'scope',240,false),false)
   OR NOT coalesce(ppic_private.robot_valid_text(item->'source_sheet',120,false),false)
   OR NOT coalesce(ppic_private.robot_valid_text(item->'source_range',120,false),false)
   OR NOT coalesce(ppic_private.robot_valid_text(item->'note',1200,false),false)
   OR coalesce(item->>'quality','') NOT IN ('SOURCE','ESTIMATE','REFERENCE','MISSING')
   OR coalesce(jsonb_typeof(item->'value'),'absent') NOT IN ('number','string','null')
  THEN RAISE EXCEPTION 'Invalid, duplicate or unbounded fact'; END IF;
  IF jsonb_typeof(item->'value')='string' AND NOT ppic_private.robot_valid_text(item->'value',500,false)
  THEN RAISE EXCEPTION 'Invalid fact string'; END IF;
  IF jsonb_typeof(item->'value')='number' AND abs((item->>'value')::numeric)>9007199254740991
  THEN RAISE EXCEPTION 'Fact number exceeds the safe client numeric range'; END IF;
  IF (item->>'quality'='MISSING' AND item->'value'<>'null'::jsonb)
    OR (item->>'quality' IN ('SOURCE','ESTIMATE') AND
        (btrim(item->>'source_sheet')='' OR btrim(item->>'source_range')=''))
  THEN RAISE EXCEPTION 'Missing facts must be null and numeric/source facts need source cells'; END IF;
  keys:=array_append(keys,item->>'key');
 END LOOP;
 FOR issue IN SELECT value FROM jsonb_array_elements(p_payload->'issues') LOOP
  IF NOT ppic_private.robot_valid_object(issue,
    ARRAY['code','severity','title','detail','fact_keys','source_sheet','source_range'],
    ARRAY['code','severity','title','detail','fact_keys','source_sheet','source_range'])
   OR coalesce(issue->>'code','') !~ '^[A-Z][A-Z0-9_]{0,79}$'
   OR coalesce(issue->>'severity','') NOT IN ('HIGH','MEDIUM','LOW')
   OR NOT coalesce(ppic_private.robot_valid_text(issue->'title',240),false)
   OR NOT coalesce(ppic_private.robot_valid_text(issue->'detail',2000),false)
   OR NOT coalesce(ppic_private.robot_valid_text(issue->'source_sheet',120,false),false)
   OR NOT coalesce(ppic_private.robot_valid_text(issue->'source_range',120,false),false)
   OR jsonb_typeof(issue->'fact_keys') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid fact issue'; END IF;
  IF jsonb_array_length(issue->'fact_keys')>50 THEN RAISE EXCEPTION 'Issue references limit exceeded'; END IF;
  FOR fk IN SELECT value FROM jsonb_array_elements(issue->'fact_keys') LOOP
   IF jsonb_typeof(fk) IS DISTINCT FROM 'string' OR NOT ((fk#>>'{}')=ANY(keys))
   THEN RAISE EXCEPTION 'Issue references an unknown fact'; END IF;
  END LOOP;
 END LOOP;
 hash:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('ppic:robot:facts:'||p_document_id,0));
 SELECT id INTO result_id FROM ppic_private.robot_source_facts WHERE document_id=p_document_id AND payload_sha256=hash;
 existed:=FOUND;
 IF NOT existed THEN
  INSERT INTO ppic_private.robot_source_facts(document_id,source_sha256,period,division,cutoff,version,payload_sha256,payload)
   VALUES(s.document_id,s.sha256,s.period,s.division,(s.cutoff AT TIME ZONE 'Asia/Jakarta')::date,s.version,hash,p_payload)
   RETURNING id INTO result_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'id',result_id,'document_id',p_document_id,'duplicate',existed,
  'payload_sha256',hash,'fact_count',jsonb_array_length(p_payload->'facts'));
END $fn$;

-- Selected source is based on actual cutoff first, then numeric version. A newly
-- archived historical source must never displace a later current source.
CREATE FUNCTION ppic_private.robot_selected_sources(p_period text)
RETURNS TABLE(document_id text,division text,period text,cutoff date,version text,
 sha256 text,reconciliation_status text,report_gate jsonb,fact_payload jsonb,fact_payload_sha256 text)
LANGUAGE sql STABLE SET search_path=pg_catalog,ppic_private AS $fn$
 WITH ranked AS (
  SELECT s.*,row_number() OVER (PARTITION BY s.division ORDER BY
   (s.cutoff AT TIME ZONE 'Asia/Jakarta')::date DESC,
   CASE WHEN s.version ~ '^V[0-9]+$' THEN substring(s.version FROM 2)::numeric ELSE 0 END DESC,
   s.ingested_at DESC,s.document_id DESC) AS rank
  FROM ppic_private.source_registry s WHERE s.period=p_period
   AND s.division IN ('BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK')
 )
 SELECT s.document_id,s.division,s.period,(s.cutoff AT TIME ZONE 'Asia/Jakarta')::date,
  s.version,s.sha256,s.reconciliation_status,
  ppic_private.auto_import_report_gate(s.division,s.period,(s.cutoff AT TIME ZONE 'Asia/Jakarta')::date,s.sha256),
  f.payload,f.payload_sha256
 FROM ranked s LEFT JOIN LATERAL (
  SELECT rf.payload,rf.payload_sha256 FROM ppic_private.robot_source_facts rf
  WHERE rf.document_id=s.document_id AND rf.source_sha256=s.sha256
  ORDER BY rf.created_at DESC,rf.id DESC LIMIT 1
 ) f ON true WHERE s.rank=1 ORDER BY s.division
$fn$;

-- Read-only metadata for the reports actually displayed by the operational site.
-- Full operational payloads are hashed privately; worker identities are not returned.
CREATE FUNCTION ppic_private.robot_report_metadata(p_period text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE result jsonb; sdm ppic_private.sdm_weekly_snapshots%ROWTYPE; div text; logical_div text;
 raw_cutoff text; actual_cutoff date; conflict boolean; controls jsonb; q jsonb; accepted jsonb;
BEGIN
 WITH candidates AS (
  SELECT 'DO'::text division,'DO_DETAIL'::text source_kind,id,cutoff,version,status,
   encode(extensions.digest(rows::text,'sha256'),'hex') payload_hash,2 AS precedence
   FROM ppic_private.do_customer_snapshots WHERE period=p_period
  UNION ALL SELECT 'BARANG JADI','BJ_DETAIL',id,cutoff,version,status,
   encode(extensions.digest(payload::text,'sha256'),'hex'),2
   FROM ppic_private.finished_goods_snapshots WHERE period=p_period
  UNION ALL SELECT 'BAHAN BAKU','BB_DETAIL',id,cutoff,version,status,
   encode(extensions.digest(payload::text,'sha256'),'hex'),2
   FROM ppic_private.material_daily_snapshots WHERE period=p_period
  UNION ALL SELECT division,'DAILY_LEDGER',id,cutoff,version,status,
   encode(extensions.digest(payload::text,'sha256'),'hex'),1
   FROM ppic_private.daily_ledger_snapshots WHERE period=p_period
    AND division IN ('DO','BARANG JADI','BAHAN BAKU','GILING','VERPACK','KAS BANK','TSG')
  UNION ALL SELECT 'CUKAI','REPORT_05',id,cutoff,version,status,
   encode(extensions.digest(payload::text,'sha256'),'hex'),2
   FROM ppic_private.report_snapshots WHERE period=p_period AND report_key='05'
 ), ranked AS (
  SELECT c.*,row_number() OVER(PARTITION BY division ORDER BY cutoff DESC,precedence DESC,
   CASE WHEN version ~ '^V[0-9]+$' THEN substring(version FROM 2)::numeric ELSE 0 END DESC,id DESC) AS rank
  FROM candidates c
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('division',division,'report_id',id,'source_kind',source_kind,
   'cutoff',cutoff,'version',version,'status',status,'metadata_conflict',false,'payload_sha256',payload_hash)
   ORDER BY division),'[]'::jsonb) INTO result FROM ranked WHERE rank=1;
 SELECT * INTO sdm FROM ppic_private.sdm_weekly_snapshots WHERE period=p_period
  ORDER BY cutoff DESC,CASE WHEN version ~ '^V[0-9]+$' THEN substring(version FROM 2)::numeric ELSE 0 END DESC,created_at DESC,id DESC LIMIT 1;
 IF FOUND THEN
  FOREACH div IN ARRAY ARRAY['SDM GILING','SDM VERPACK'] LOOP
   logical_div:=replace(div,'SDM ','');
   raw_cutoff:=coalesce(sdm.payload#>>ARRAY['meta','payroll','sourceCutoffByDivision',logical_div],
    sdm.payload#>>ARRAY['meta','sourceCutoffByDivision',logical_div]);
   actual_cutoff:=NULL;
   IF raw_cutoff ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    BEGIN actual_cutoff:=raw_cutoff::date; EXCEPTION WHEN others THEN actual_cutoff:=NULL; END;
   END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('document_id',coalesce(a->>'documentId',a->>'document_id'),'cutoff',a->>'cutoff')
    ORDER BY coalesce(a->>'documentId',a->>'document_id')),'[]'::jsonb)
    INTO accepted FROM jsonb_array_elements(CASE WHEN jsonb_typeof(sdm.payload#>'{meta,acceptedSources}')='array'
      THEN sdm.payload#>'{meta,acceptedSources}' ELSE '[]'::jsonb END) a
    WHERE a->>'division'=logical_div;
   conflict:=actual_cutoff IS NULL OR jsonb_array_length(accepted)=0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(accepted) a LEFT JOIN ppic_private.source_registry sr ON sr.document_id=a->>'document_id'
    WHERE sr.document_id IS NULL OR to_char(sr.cutoff AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') IS DISTINCT FROM a->>'cutoff'
      OR a->>'cutoff' IS DISTINCT FROM actual_cutoff::text);
   q:=sdm.payload#>ARRAY['meta','summaries',div];
   controls:=jsonb_build_object(
    'qty_recorded',CASE WHEN jsonb_typeof(q->'qty')='number' THEN q->'qty' END,
    'gross_wage_recorded',CASE WHEN jsonb_typeof(q->'wage')='number' THEN q->'wage' END,
    'line_count',CASE WHEN jsonb_typeof(q->'lines')='number' THEN q->'lines' END,
    'held_wage_recorded',CASE WHEN jsonb_typeof(q->'heldWage')='number' THEN q->'heldWage' END,
    'wage_without_output_count',CASE WHEN jsonb_typeof(q->'upahTanpaHasil')='number' THEN q->'upahTanpaHasil' END,
    'coverage_from',sdm.payload#>>ARRAY['meta','payroll','coverageByDivision',logical_div,'from'],
    'coverage_through',sdm.payload#>>ARRAY['meta','payroll','coverageByDivision',logical_div,'through'],
    'attendance_verified',coalesce(sdm.payload#>'{meta,attendanceVerified}','false'::jsonb),
    'net_approved',coalesce(sdm.payload#>'{meta,payroll,netApproved}','false'::jsonb),
    'interpretation',CASE WHEN conflict THEN 'METADATA_CONFLICT: aggregate report observations require source reconciliation' ELSE 'Report aggregates; gross values are not approved payroll' END);
   result:=result||jsonb_build_array(jsonb_build_object('division',div,'report_id',sdm.id,'source_kind','SDM_SNAPSHOT',
    'cutoff',actual_cutoff,'snapshot_cutoff',sdm.cutoff,'version',sdm.version,
    'status',CASE WHEN conflict THEN 'METADATA_CONFLICT' ELSE sdm.status END,
    'metadata_conflict',conflict,'accepted_sources',accepted,'controls',controls,
    'payload_sha256',encode(extensions.digest(sdm.payload::text,'sha256'),'hex')));
  END LOOP;
 END IF;
 RETURN result;
END $fn$;

CREATE FUNCTION ppic_private.robot_context(p_period text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE sources jsonb; coverage jsonb; reports jsonb; evidence jsonb; manifest jsonb; fingerprint text;
BEGIN
 IF p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Invalid robot period'; END IF;
 reports:=ppic_private.robot_report_metadata(p_period);
 SELECT coalesce(jsonb_agg(jsonb_build_object('document_id',s.document_id,'division',s.division,'period',s.period,
   'cutoff',s.cutoff,'version',s.version,'source_sha256',s.sha256,'status',s.reconciliation_status,
   'report_gate',s.report_gate,'fact_payload_sha256',s.fact_payload_sha256,
   'has_facts',s.fact_payload IS NOT NULL AND s.report_gate->>'report_status'<>'SUPERSEDED',
   'facts',CASE WHEN s.report_gate->>'report_status'='SUPERSEDED' THEN '[]'::jsonb ELSE coalesce(s.fact_payload->'facts','[]'::jsonb) END,
   'issues',CASE WHEN s.report_gate->>'report_status'='SUPERSEDED' THEN '[]'::jsonb ELSE coalesce(s.fact_payload->'issues','[]'::jsonb) END)
  ORDER BY s.division),'[]'::jsonb) INTO sources FROM ppic_private.robot_selected_sources(p_period) s;
 SELECT jsonb_agg(jsonb_build_object('division',d.division,'source_document_id',s->>'document_id',
  'source_version',s->>'version','source_cutoff',s->>'cutoff','reconciliation_status',s->>'status',
  'has_facts',coalesce((s->>'has_facts')::boolean,false),
  'selection_status',CASE WHEN s IS NULL THEN 'NO_SOURCE' WHEN s#>>'{report_gate,report_status}'='SUPERSEDED' THEN 'SUPERSEDED'
   WHEN coalesce((s->>'has_facts')::boolean,false) THEN 'READY' ELSE 'MISSING_FACTS' END,
  'report_cutoff',r->>'cutoff','report_version',r->>'version','report_status',r->>'status') ORDER BY d.division)
 INTO coverage FROM unnest(ARRAY['BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK']) d(division)
 LEFT JOIN LATERAL (SELECT value s FROM jsonb_array_elements(sources) WHERE value->>'division'=d.division) a ON true
 LEFT JOIN LATERAL (SELECT value r FROM jsonb_array_elements(reports) WHERE value->>'division'=d.division) b ON true;
 SELECT coalesce(jsonb_agg(jsonb_build_object('document_id',s->>'document_id','division',s->>'division',
  'version',s->>'version','cutoff',s->>'cutoff','status',s->>'status','facts',s->'facts','issues',s->'issues') ORDER BY s->>'division'),'[]'::jsonb)
 INTO evidence FROM jsonb_array_elements(sources) s WHERE s#>>'{report_gate,report_status}'<>'SUPERSEDED';
 -- No heartbeat/config/run timestamps enter the evidence hash. Report payload
 -- hashes do, so an amended operational report invalidates a previous analysis.
 manifest:=jsonb_build_object('schema_version','ppic-robot-context-v1','period',p_period,
  'sources',sources,'reports',reports,'coverage',coverage);
 fingerprint:=encode(extensions.digest(manifest::text,'sha256'),'hex');
 RETURN manifest||jsonb_build_object('evidence_hash',fingerprint,'evidence_sources',evidence,
  'counts',jsonb_build_object('sources_with_facts',(SELECT count(*) FROM jsonb_array_elements(coverage) c WHERE c->>'selection_status'='READY'),
    'pending_fact_sources',(SELECT count(*) FROM jsonb_array_elements(coverage) c WHERE c->>'selection_status'='MISSING_FACTS')));
END $fn$;

CREATE FUNCTION ppic_private.robot_validate_evidence(p_evidence jsonb,p_context jsonb,p_required boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE ref jsonb; source jsonb; key jsonb; seen text[]:='{}';
BEGIN
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Evidence must be an array'; END IF;
 IF jsonb_array_length(p_evidence)>20 OR (p_required AND jsonb_array_length(p_evidence)=0)
 THEN RAISE EXCEPTION 'A decision needs current evidence; evidence limit is 20'; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(p_evidence) LOOP
  IF NOT ppic_private.robot_valid_object(ref,ARRAY['document_id','fact_keys'],ARRAY['document_id','fact_keys'])
   OR jsonb_typeof(ref->'document_id') IS DISTINCT FROM 'string'
   OR jsonb_typeof(ref->'fact_keys') IS DISTINCT FROM 'array'
   OR coalesce(ref->>'document_id','')=ANY(seen)
  THEN RAISE EXCEPTION 'Invalid or duplicate evidence reference'; END IF;
  IF jsonb_array_length(ref->'fact_keys')>50 THEN RAISE EXCEPTION 'Fact reference limit exceeded'; END IF;
  SELECT value INTO source FROM jsonb_array_elements(p_context->'evidence_sources')
   WHERE value->>'document_id'=ref->>'document_id';
  IF source IS NULL THEN RAISE EXCEPTION 'Evidence document is not a selected current source'; END IF;
  FOR key IN SELECT value FROM jsonb_array_elements(ref->'fact_keys') LOOP
   IF jsonb_typeof(key) IS DISTINCT FROM 'string' OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(source->'facts') f WHERE f->>'key'=key#>>'{}')
   THEN RAISE EXCEPTION 'Evidence references an unknown or unavailable fact'; END IF;
  END LOOP;
  seen:=array_append(seen,ref->>'document_id');
 END LOOP;
END $fn$;

CREATE FUNCTION ppic_private.robot_publish_brief(p_period text,p_evidence_hash text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE context jsonb; item jsonb; field text; k text; brief_date date; max_cutoff date;
 result_id uuid; existed boolean; previous_as_of date; ids text[]:='{}'; payload_hash text;
BEGIN
 PERFORM ppic_private.robot_assert_writable_period(p_period);
 IF NOT ppic_private.robot_valid_object(p_payload,
   ARRAY['schema_version','headline','summary','operating_status','as_of','decisions','watchlist','work_completed','pending_data','limitations'],
   ARRAY['schema_version','headline','summary','operating_status','as_of','decisions','watchlist','work_completed','pending_data','limitations'])
  OR p_payload->>'schema_version' IS DISTINCT FROM 'ppic-robot-brief-v1'
  OR octet_length(p_payload::text)>131072
  OR NOT coalesce(ppic_private.robot_valid_text(p_payload->'headline',240),false)
  OR NOT coalesce(ppic_private.robot_valid_text(p_payload->'summary',3000),false)
  OR coalesce(p_payload->>'operating_status','') NOT IN ('PERLU_PERHATIAN','TERKENDALI','DATA_BELUM_CUKUP')
  OR coalesce(p_payload->>'as_of','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  OR p_evidence_hash IS NULL OR p_evidence_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Invalid robot briefing envelope'; END IF;
 brief_date:=(p_payload->>'as_of')::date;
 IF brief_date>(now() AT TIME ZONE 'Asia/Jakarta')::date OR brief_date<(p_period||'-01')::date
 THEN RAISE EXCEPTION 'Briefing as-of date is outside the actual working range'; END IF;
 FOREACH field IN ARRAY ARRAY['decisions','watchlist','work_completed','pending_data','limitations'] LOOP
  IF jsonb_typeof(p_payload->field) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Briefing section must be an array'; END IF;
  IF jsonb_array_length(p_payload->field)>(CASE WHEN field='decisions' THEN 10 ELSE 20 END)
  THEN RAISE EXCEPTION 'Briefing item limit exceeded'; END IF;
 END LOOP;
 -- Hold a short read lock only while committing an already prepared briefing.
 -- Concurrent ingestion/rebuilds cannot change its evidence between comparison
 -- and append. There is no operational UPDATE/INSERT/DELETE in this function.
 PERFORM pg_advisory_xact_lock(hashtextextended('ppic:robot:brief:'||p_period,0));
 LOCK TABLE ppic_private.source_registry,ppic_private.robot_source_facts,
  ppic_private.daily_ledger_snapshots,ppic_private.do_customer_snapshots,
  ppic_private.finished_goods_snapshots,ppic_private.material_daily_snapshots,
  ppic_private.report_snapshots,ppic_private.sdm_weekly_snapshots IN SHARE MODE;
 context:=ppic_private.robot_context(p_period);
 IF context->>'evidence_hash' IS DISTINCT FROM p_evidence_hash
 THEN RAISE EXCEPTION 'STALE_EVIDENCE: read robot_context and analyse the current evidence again'; END IF;
 SELECT max((s->>'cutoff')::date) INTO max_cutoff FROM jsonb_array_elements(context->'sources') s;
 IF max_cutoff>brief_date THEN RAISE EXCEPTION 'Briefing date precedes its source cutoff'; END IF;
 SELECT as_of INTO previous_as_of FROM ppic_private.robot_briefings WHERE period=p_period ORDER BY created_at DESC,id DESC LIMIT 1;
 IF previous_as_of>brief_date THEN RAISE EXCEPTION 'Briefing as-of date must not regress'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'decisions') LOOP
  IF NOT ppic_private.robot_valid_object(item,
    ARRAY['id','priority','title','recommendation','reason','consequence','kind','owner_role','evidence','confidence','data_limit','action_state'],
    ARRAY['id','priority','title','recommendation','reason','consequence','kind','owner_role','evidence','confidence','data_limit','action_state'])
   OR coalesce(item->>'id','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$' OR (item->>'id')=ANY(ids)
   OR coalesce(item->>'priority','') NOT IN ('P1','P2','P3')
   OR coalesce(item->>'kind','') NOT IN ('OWNER_DECISION','ADMIN_FOLLOWUP','DATA_BLOCKER')
   OR coalesce(item->>'confidence','') NOT IN ('TINGGI','SEDANG','RENDAH')
   OR item->>'action_state' IS DISTINCT FROM 'USULAN'
  THEN RAISE EXCEPTION 'Invalid decision or action state'; END IF;
  FOREACH k IN ARRAY ARRAY['title','recommendation','reason','consequence','owner_role','data_limit'] LOOP
   IF NOT coalesce(ppic_private.robot_valid_text(item->k,CASE WHEN k IN ('title','owner_role') THEN 240 ELSE 2000 END),false)
   THEN RAISE EXCEPTION 'Decision text is missing, unsafe or unbounded'; END IF;
  END LOOP;
  PERFORM ppic_private.robot_validate_evidence(item->'evidence',context,true);
  ids:=array_append(ids,item->>'id');
 END LOOP;
 ids:='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'watchlist') LOOP
  IF NOT ppic_private.robot_valid_object(item,ARRAY['division','status','summary','evidence'],ARRAY['division','status','summary','evidence'])
   OR coalesce(item->>'division','') NOT IN ('BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK')
   OR (item->>'division')=ANY(ids)
   OR coalesce(item->>'status','') NOT IN ('PERLU_PERHATIAN','TERKENDALI','DATA_BELUM_CUKUP')
   OR NOT coalesce(ppic_private.robot_valid_text(item->'summary',2000),false)
  THEN RAISE EXCEPTION 'Invalid watchlist item'; END IF;
  PERFORM ppic_private.robot_validate_evidence(item->'evidence',context,false);
  ids:=array_append(ids,item->>'division');
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'work_completed') LOOP
  IF NOT ppic_private.robot_valid_object(item,ARRAY['title','detail','evidence'],ARRAY['title','detail','evidence'])
   OR NOT coalesce(ppic_private.robot_valid_text(item->'title',240),false)
   OR NOT coalesce(ppic_private.robot_valid_text(item->'detail',2000),false)
  THEN RAISE EXCEPTION 'Invalid completed work item'; END IF;
  PERFORM ppic_private.robot_validate_evidence(item->'evidence',context,false);
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'pending_data') LOOP
  IF NOT ppic_private.robot_valid_object(item,ARRAY['division','item','why_needed','owner_role','evidence'],ARRAY['division','item','why_needed','owner_role','evidence'])
   OR coalesce(item->>'division','') NOT IN ('BAHAN BAKU','BARANG JADI','CUKAI','DO','GILING','KAS BANK','SDM GILING','SDM VERPACK','TSG','VERPACK')
   OR NOT coalesce(ppic_private.robot_valid_text(item->'item',1000),false)
   OR NOT coalesce(ppic_private.robot_valid_text(item->'why_needed',2000),false)
   OR NOT coalesce(ppic_private.robot_valid_text(item->'owner_role',240),false)
  THEN RAISE EXCEPTION 'Invalid pending data item'; END IF;
  PERFORM ppic_private.robot_validate_evidence(item->'evidence',context,false);
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'limitations') LOOP
  IF NOT coalesce(ppic_private.robot_valid_text(item,1200),false) THEN RAISE EXCEPTION 'Invalid briefing limitation'; END IF;
 END LOOP;
 payload_hash:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
 SELECT id INTO result_id FROM ppic_private.robot_briefings
  WHERE period=p_period AND evidence_hash=p_evidence_hash AND payload_sha256=payload_hash;
 existed:=FOUND;
 IF NOT existed THEN
  INSERT INTO ppic_private.robot_briefings(period,as_of,evidence_hash,payload_sha256,payload,evidence_manifest)
   VALUES(p_period,brief_date,p_evidence_hash,payload_hash,p_payload,context)
   RETURNING id INTO result_id;
  INSERT INTO ppic_private.robot_runs(kind,status,message,details)
   VALUES('ANALYSIS','SUCCESS','Analisis GPT tersimpan dengan bukti sumber yang diperiksa.',
    jsonb_build_object('period',p_period,'brief_id',result_id,'evidence_hash',p_evidence_hash));
 END IF;
 RETURN jsonb_build_object('ok',true,'id',result_id,'duplicate',existed,'period',p_period,'evidence_hash',p_evidence_hash);
END $fn$;

CREATE FUNCTION ppic_private.robot_heartbeat(p_status text,p_message text,p_details jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE kind text:=coalesce(p_details->>'kind','CHECK'); k text; value jsonb; safe_details jsonb; run_id uuid;
BEGIN
 IF p_status IS NULL OR p_status NOT IN ('RUNNING','SUCCESS','NO_CHANGE','WAITING','FAILED','BLOCKED')
  OR kind NOT IN ('CHECK','ANALYSIS','MAINTENANCE')
  OR NOT ppic_private.robot_valid_object(p_details,
    ARRAY['kind','period','evidence_hash','brief_id','source_count','fact_count','tests_passed','tests_failed','commit_sha','check_name','code','run_id','automation_id','release','repaired','result'],ARRAY[]::text[])
  OR octet_length(p_details::text)>4096 OR p_message IS NULL OR btrim(p_message)=''
 THEN RAISE EXCEPTION 'Invalid robot heartbeat'; END IF;
 safe_details:=p_details-'kind';
 FOR k,value IN SELECT * FROM jsonb_each(safe_details) LOOP
  IF k IN ('source_count','fact_count','tests_passed','tests_failed') THEN
   IF jsonb_typeof(value) IS DISTINCT FROM 'number' OR (value#>>'{}') !~ '^[0-9]{1,9}$'
   THEN RAISE EXCEPTION 'Invalid heartbeat count'; END IF;
  ELSIF k='repaired' THEN
   IF jsonb_typeof(value) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid repair flag'; END IF;
  ELSE
   IF NOT coalesce(ppic_private.robot_valid_text(value,240),false) THEN RAISE EXCEPTION 'Invalid heartbeat detail'; END IF;
   IF (k='period' AND value#>>'{}' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
    OR (k='evidence_hash' AND value#>>'{}' !~ '^[a-f0-9]{64}$')
    OR (k='commit_sha' AND value#>>'{}' !~ '^[a-f0-9]{40}$')
   THEN RAISE EXCEPTION 'Invalid heartbeat identity'; END IF;
  END IF;
 END LOOP;
 INSERT INTO ppic_private.robot_runs(kind,status,message,details)
  VALUES(kind,p_status,ppic_private.robot_safe_text(p_message,1000),safe_details) RETURNING id INTO run_id;
 -- A technical maintenance heartbeat must not hide a stopped GPT analysis task.
 IF kind IN ('CHECK','ANALYSIS') THEN
  UPDATE ppic_private.robot_config SET last_check_at=now(),
   last_success_at=CASE WHEN p_status IN ('SUCCESS','NO_CHANGE') THEN now() ELSE last_success_at END,
   last_message=ppic_private.robot_safe_text(p_message,1000),
   last_error=CASE WHEN p_status IN ('FAILED','BLOCKED') THEN ppic_private.robot_safe_text(p_message,1000) END,
   updated_at=now() WHERE id=1;
 END IF;
 RETURN jsonb_build_object('ok',true,'id',run_id,'kind',kind,'status',p_status);
END $fn$;

CREATE FUNCTION ppic_private.robot_configure(p_enabled boolean,p_automation_id text,p_cadence text DEFAULT 'HOURLY',p_timezone text DEFAULT 'Asia/Jakarta')
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE c ppic_private.robot_config%ROWTYPE;
BEGIN
 IF p_enabled IS NULL OR p_cadence IS DISTINCT FROM 'HOURLY' OR p_timezone IS DISTINCT FROM 'Asia/Jakarta'
  OR (p_automation_id IS NOT NULL AND p_automation_id !~ '^Automation_[A-Za-z0-9_-]{8,100}$')
  OR (p_enabled AND p_automation_id IS NULL)
 THEN RAISE EXCEPTION 'An actual hourly ChatGPT automation identity is required before enabling'; END IF;
 UPDATE ppic_private.robot_config SET enabled=p_enabled,automation_id=p_automation_id,
  cadence=p_cadence,timezone=p_timezone,updated_at=now() WHERE id=1 RETURNING * INTO c;
 INSERT INTO ppic_private.robot_runs(kind,status,message,details)
  VALUES('MAINTENANCE','SUCCESS',CASE WHEN p_enabled THEN 'Jadwal Robot Manajer dikonfigurasi.' ELSE 'Jadwal Robot Manajer dinonaktifkan.' END,
   jsonb_strip_nulls(jsonb_build_object('code','ROBOT_CONFIGURED','automation_id',p_automation_id)));
 RETURN jsonb_build_object('ok',true,'enabled',c.enabled,'automation_id',c.automation_id,'cadence',c.cadence,'timezone',c.timezone);
END $fn$;

CREATE FUNCTION public.ppic_robot_status(p_period text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,ppic_private AS $fn$
DECLARE c ppic_private.robot_config%ROWTYPE; b ppic_private.robot_briefings%ROWTYPE;
 context jsonb; changed boolean; pending boolean; state text; msg text; evidence jsonb; history jsonb; runs jsonb; counts jsonb;
BEGIN
 context:=ppic_private.robot_context(p_period);
 SELECT * INTO c FROM ppic_private.robot_config WHERE id=1;
 SELECT * INTO b FROM ppic_private.robot_briefings WHERE period=p_period ORDER BY created_at DESC,id DESC LIMIT 1;
 changed:=b.id IS NOT NULL AND b.evidence_hash IS DISTINCT FROM context->>'evidence_hash';
 pending:=coalesce((context#>>'{counts,pending_fact_sources}')::integer,0)>0;
 state:=CASE WHEN NOT c.enabled THEN 'DISABLED'
  WHEN c.last_error IS NOT NULL THEN 'ERROR'
  WHEN c.last_check_at IS NOT NULL AND c.last_check_at<now()-interval '150 minutes' THEN 'STALE'
  WHEN c.last_check_at IS NULL OR b.id IS NULL OR changed OR pending THEN 'WAITING' ELSE 'HEALTHY' END;
 msg:=CASE state WHEN 'DISABLED' THEN 'Jadwal Robot Manajer belum aktif.'
  WHEN 'ERROR' THEN 'Pemeriksaan terakhir membutuhkan tindak lanjut teknis.'
  WHEN 'STALE' THEN 'Pemeriksaan terjadwal terakhir lebih dari 150 menit lalu.'
  WHEN 'WAITING' THEN CASE WHEN pending THEN 'Ada sumber terbaru yang belum diekstrak menjadi bukti analisis.'
   WHEN changed THEN 'Sumber berubah; analisis baru menunggu pemeriksaan GPT.' ELSE 'Menunggu pemeriksaan atau analisis pertama.' END
  ELSE 'Pemeriksaan robot berjalan; tanggal dan kelengkapan data tetap mengikuti sumber.' END;
 -- Evidence addresses belong to the saved analysis, even when current data has
 -- moved on. The separate current coverage and changed flag identify staleness.
 evidence:=CASE WHEN b.id IS NOT NULL THEN b.evidence_manifest->'evidence_sources' ELSE context->'evidence_sources' END;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'period',x.period,'as_of',x.as_of,'created_at',x.created_at,
  'headline',x.payload->>'headline') ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO history
  FROM (SELECT * FROM ppic_private.robot_briefings WHERE period=p_period ORDER BY created_at DESC,id DESC LIMIT 10)x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'status',x.status,'message',x.message,
  'details',x.details,'created_at',x.created_at) ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO runs
  FROM (SELECT * FROM ppic_private.robot_runs WHERE NOT(details ? 'period') OR details->>'period'=p_period ORDER BY created_at DESC,id DESC LIMIT 20)x;
 counts:=context->'counts'||jsonb_build_object('decisions',coalesce(jsonb_array_length(b.payload->'decisions'),0),
  'owner_decisions',(SELECT count(*) FROM jsonb_array_elements(coalesce(b.payload->'decisions','[]'::jsonb)) d WHERE d->>'kind'='OWNER_DECISION'));
 RETURN jsonb_build_object('ok',true,'period',p_period,
  'config',jsonb_build_object('enabled',c.enabled,'cadence',c.cadence,'timezone',c.timezone,'automation_id',c.automation_id,
    'last_check_at',c.last_check_at,'last_success_at',c.last_success_at,'last_message',c.last_message,'last_error',c.last_error),
  'health',jsonb_build_object('state',state,'message',msg,'source_changed_since_brief',changed,'has_unextracted_sources',pending),
  'latest_brief',CASE WHEN b.id IS NOT NULL THEN jsonb_build_object('id',b.id,'period',b.period,'as_of',b.as_of,
    'evidence_hash',b.evidence_hash,'payload',b.payload,'created_at',b.created_at) END,
  'history',history,'coverage',context->'coverage','evidence_sources',evidence,'runs',runs,'counts',counts,
  'import_counts',(SELECT jsonb_build_object('total',count(*),'queued',count(*) FILTER(WHERE status='QUEUED'),
    'processing',count(*) FILTER(WHERE status='PROCESSING'),'imported',count(*) FILTER(WHERE status='IMPORTED'),
    'duplicate',count(*) FILTER(WHERE status='DUPLICATE'),'failed',count(*) FILTER(WHERE status='FAILED'))
    FROM ppic_private.auto_import_jobs WHERE period=p_period));
END $fn$;

-- There is deliberately no public write RPC. The browser/Edge service key
-- cannot write facts, briefings, configuration, or audit events.
REVOKE ALL ON FUNCTION ppic_private.robot_append_only(),
 ppic_private.robot_valid_object(jsonb,text[],text[]),
 ppic_private.robot_safe_text(text,integer),ppic_private.robot_valid_text(jsonb,integer,boolean),
 ppic_private.robot_assert_writable_period(text),ppic_private.robot_record_source_facts(text,text,jsonb),
 ppic_private.robot_selected_sources(text),ppic_private.robot_report_metadata(text),ppic_private.robot_context(text),
 ppic_private.robot_validate_evidence(jsonb,jsonb,boolean),ppic_private.robot_publish_brief(text,text,jsonb),
 ppic_private.robot_heartbeat(text,text,jsonb),ppic_private.robot_configure(boolean,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.ppic_robot_status(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ppic_robot_status(text) TO service_role;

COMMENT ON TABLE ppic_private.robot_briefings IS 'Append-only GPT proposals with an immutable current-evidence manifest; never an instruction to mutate operational ledgers.';
COMMENT ON FUNCTION public.ppic_robot_status(text) IS 'Service-only read projection for the exact-Origin, verified-Owner ppic-robot-status Edge function.';

