CREATE OR REPLACE FUNCTION production_control.assert_production_match_scoring_ready_v1(target_match_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control'
AS $function$ select production_control.match_scoring_context_readiness_v1(target_match_id, false) $function$
;
