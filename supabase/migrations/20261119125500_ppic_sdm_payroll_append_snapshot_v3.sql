-- Additive backend migration. Existing V009/V010 snapshots and legacy RPCs remain intact.
CREATE OR REPLACE FUNCTION public.ppic_sdm_rebuild_context(p_period text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, ppic_private, public AS $fn$
DECLARE result jsonb;
BEGIN
 IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN RAISE EXCEPTION 'service role only' USING ERRCODE='42501'; END IF;
 IF p_period <> '2026-11' THEN RAISE EXCEPTION 'supported period required'; END IF;
 SELECT jsonb_build_object(
  'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',s.document_id,'division',s.division,'period',s.period,'cutoff',to_char(s.cutoff AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD'),'version',s.version,'sha256',s.sha256,'private_locator',s.private_locator,'ingested_at',s.ingested_at) ORDER BY s.cutoff DESC,s.ingested_at DESC) FROM (SELECT * FROM ppic_private.source_registry WHERE period=p_period AND division IN ('GILING','SDM GILING','VERPACK','SDM VERPACK') AND reconciliation_status<>'LOCKED' ORDER BY cutoff DESC,ingested_at DESC LIMIT 32)s),'[]'::jsonb),
  'previous',(SELECT jsonb_build_object('version',version,'cutoff',cutoff,'created_at',created_at,'payload',payload,'source_document_ids',source_document_ids) FROM ppic_private.sdm_weekly_snapshots WHERE period=p_period ORDER BY created_at DESC,version DESC LIMIT 1)
 ) INTO result;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.ppic_sdm_rebuild_context(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ppic_sdm_rebuild_context(text) TO service_role;

CREATE OR REPLACE FUNCTION public.ppic_sdm_publish_snapshot_append(
 p_period text,p_cutoff date,p_payload jsonb,p_document_ids jsonb,p_accepted_ids jsonb,p_previous_created_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, ppic_private, public AS $fn$
DECLARE old_row ppic_private.sdm_weekly_snapshots%ROWTYPE; n integer; next_version text; snap uuid;
BEGIN
 IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN RAISE EXCEPTION 'service role only' USING ERRCODE='42501'; END IF;
 IF p_period<>'2026-11' OR to_char(p_cutoff,'YYYY-MM')<>p_period OR p_cutoff>(now() AT TIME ZONE 'Asia/Jakarta')::date+1
  OR jsonb_typeof(p_document_ids)<>'array' OR jsonb_array_length(p_document_ids)<2
  OR jsonb_typeof(p_accepted_ids)<>'array' OR jsonb_array_length(p_accepted_ids)<>2
  OR p_payload->>'codec'<>'zlib-base64' OR length(coalesce(p_payload->>'data','')) NOT BETWEEN 1 AND 2000000
  OR coalesce(p_payload->'meta'->>'buildSignature','')='' THEN RAISE EXCEPTION 'invalid SDM snapshot metadata'; END IF;
 SELECT count(DISTINCT CASE WHEN division IN ('GILING','SDM GILING') THEN 'GILING' WHEN division IN ('VERPACK','SDM VERPACK') THEN 'VERPACK' END)
 INTO n FROM ppic_private.source_registry WHERE period=p_period AND reconciliation_status<>'LOCKED'
 AND document_id IN (SELECT jsonb_array_elements_text(p_accepted_ids));
 IF n<>2 THEN RAISE EXCEPTION 'validated Giling and Verpack source records required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('ppic-sdm:'||p_period));
 SELECT * INTO old_row FROM ppic_private.sdm_weekly_snapshots WHERE period=p_period ORDER BY created_at DESC,version DESC LIMIT 1;
 IF old_row.created_at IS DISTINCT FROM p_previous_created_at THEN RAISE EXCEPTION 'SDM snapshot changed; refresh and retry' USING ERRCODE='40001'; END IF;
 IF old_row.payload->'meta'->>'buildSignature'=p_payload->'meta'->>'buildSignature' THEN RETURN jsonb_build_object('ok',true,'unchanged',true,'version',old_row.version,'cutoff',old_row.cutoff); END IF;
 SELECT 'V'||lpad((coalesce(max(substring(version from 2)::int),0)+1)::text,3,'0') INTO next_version FROM ppic_private.sdm_weekly_snapshots WHERE period=p_period AND version~'^V[0-9]+$';
 INSERT INTO ppic_private.sdm_weekly_snapshots(period,version,cutoff,status,payload,source_document_ids)
 VALUES(p_period,next_version,p_cutoff,'WORKING / OPEN RECON',p_payload,p_document_ids) RETURNING id INTO snap;
 RETURN jsonb_build_object('ok',true,'snapshot_id',snap,'period',p_period,'version',next_version,'cutoff',p_cutoff);
END $fn$;
REVOKE ALL ON FUNCTION public.ppic_sdm_publish_snapshot_append(text,date,jsonb,jsonb,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ppic_sdm_publish_snapshot_append(text,date,jsonb,jsonb,jsonb,timestamptz) TO service_role;
