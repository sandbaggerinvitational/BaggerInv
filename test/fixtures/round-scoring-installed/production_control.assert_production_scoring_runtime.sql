CREATE OR REPLACE FUNCTION production_control.assert_production_scoring_runtime(input jsonb, required_worker text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(
    production_control.scoring_admission_lock_key()
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id <> '2026' then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_LEGACY_SCORING_POINTER_CHANGED';
  end if;
  perform production_control.annual_scoring_platform_certification_v1(input);
  perform production_control
    .assert_production_scoring_runtime_pre_annual_pointer_fence(
      input, required_worker
    );
end;
$function$
;
