-- Complete the existing Production Guide read envelope. No table data,
-- publication pointer, grant, RLS policy, admission gate or worker is changed.
begin;

create or replace function public.read_production_guide_projection(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $frozen_guide_read$
declare
  result_value jsonb;
  tournament_value jsonb;
  courses_value jsonb;
begin
  -- Preserve the annual pointer and exact release/resource/service checks.
  perform production_control.assert_frozen_2026_current_read_v1();
  result_value := public.read_production_guide_projection_frozen_2026_v1(input);
  if coalesce((result_value->>'ok')::boolean, false) is not true then
    return result_value;
  end if;
  if result_value#>>'{data,tournament_id}' is distinct from '2026'
     or result_value#>>'{data,tournament_year}' is distinct from '2026' then
    raise exception using errcode = '55000', message = 'GUIDE_CANONICAL_CONTEXT_UNAVAILABLE';
  end if;
  select pg_catalog.jsonb_build_object(
    'tournament_id', value.tournament_id,
    'tournament_year', value.tournament_year,
    'name', value.name
  ) into strict tournament_value
  from scoring_authority.tournaments value where value.tournament_id = '2026';

  -- Reuse the same canonical assignment/tee/hole reader as Guide authoring.
  -- It already handles the frozen snapshot fallback; do not duplicate it here.
  courses_value := production_control.guide_canonical_course_context_v1('2026');
  if scoring_authority.guide_course_context_is_eligible(courses_value) is not true then
    raise exception using errcode = '55000', message = 'GUIDE_CANONICAL_CONTEXT_UNAVAILABLE';
  end if;
  return pg_catalog.jsonb_set(result_value, '{data}', result_value->'data' ||
    pg_catalog.jsonb_build_object(
      'tournament', tournament_value,
      'course_context', courses_value,
      'delivery_fingerprint', pg_catalog.encode(extensions.digest(
        pg_catalog.jsonb_build_object(
          'publication', result_value#>>'{data,payload_fingerprint}',
          'tournament', tournament_value,
          'course_context', courses_value
        )::text, 'sha256'), 'hex')
    ));
end;
$frozen_guide_read$;

commit;
