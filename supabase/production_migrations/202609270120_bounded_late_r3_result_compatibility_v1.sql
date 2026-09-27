-- Preserve every compatibility condition; avoid planning historical hashes for ineligible results.
BEGIN;
CREATE OR REPLACE FUNCTION production_control.late_r3_result_compatible_v1(target_result uuid, current_source text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- Eligibility is evaluated before planning the unchanged fingerprint predicates.
  -- SQL STABLE functions in those predicates can be evaluated by the planner
  -- for selectivity even when no compatible receipt exists for this result.
  if not exists (
    select 1 from production_control.late_r3_calcutta_compatibility_v1 c
    join scoring_authority.calcutta_v1_result_revisions r on r.result_id=c.result_id
    where r.result_id=target_result and r.is_current and r.tournament_id='2026'
      and c.original_result_source_fingerprint=r.source_fingerprint
      and c.policy='late-r3-calculation-neutral-v1'
  ) then
    return false;
  end if;
  return exists(select 1 from production_control.late_r3_calcutta_compatibility_v1 c
    join scoring_authority.calcutta_v1_result_revisions r on r.result_id=c.result_id
    where r.result_id=target_result and r.is_current and r.tournament_id='2026'
      and c.original_result_source_fingerprint=r.source_fingerprint
      and (c.source_after_fingerprint=current_source or
        (current_source=production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))
          and production_control.late_r3_approved_refresh_equivalent_v1(c.source_after,production_control.calcutta_v1_source_revision('2026'))))
      and c.policy='late-r3-calculation-neutral-v1'
      and c.financial_fingerprint=production_control.late_r3_financial_fingerprint_v1()
      and c.consumed_fingerprint=production_control.late_r3_consumed_fingerprint_v1());
end;
$function$;
COMMIT;
