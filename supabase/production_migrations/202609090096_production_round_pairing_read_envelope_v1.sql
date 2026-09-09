-- Read-only compatibility correction. Preserve 095 and every mutation contract.
begin;
create or replace function public.read_production_tournament_setup_v1(input jsonb)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,production_control,scoring_authority
as $$
declare result_value jsonb; data_value jsonb; matches_value jsonb;
begin
  result_value:=production_control.read_tournament_setup_before_round_workspace_v1(input);
  data_value:=result_value->'data';
  if result_value->>'ok' is distinct from 'true'
    or jsonb_typeof(data_value) is distinct from 'object'
    or jsonb_typeof(data_value->'matches') is distinct from 'array' then
    raise exception 'TOURNAMENT_SETUP_RESPONSE_INVALID';
  end if;
  select jsonb_agg(item.value || jsonb_build_object(
    'detailsManaged',d.match_id is not null,
    'contextFingerprint',production_control.tournament_setup_hash_v1(jsonb_build_object(
      'details',to_jsonb(d),'round',to_jsonb(r),'course',to_jsonb(c),
      'holes',(select jsonb_agg(to_jsonb(h) order by h.hole_number)
        from scoring_authority.tournament_setup_course_holes_v1 h where h.tournament_id='2026'
          and h.course_id=d.course_id and h.tee_id=d.tee_id),
      'snapshot',item.value->'snapshot',
      'handicap',(select revision_id from scoring_authority.handicap_revision_current where tournament_id='2026')
    ))) order by (item.value->>'roundNumber')::integer,(item.value->>'matchNumber')::integer)
    into matches_value from jsonb_array_elements(data_value->'matches') item(value)
    left join scoring_authority.tournament_setup_match_details_v1 d on d.match_id=item.value->>'matchId'
    left join scoring_authority.rounds r on r.tournament_id='2026' and r.round_number=(item.value->>'roundNumber')::integer
    left join scoring_authority.tournament_setup_course_tees_v1 c on c.tournament_id='2026' and c.course_id=d.course_id and c.tee_id=d.tee_id;
  return jsonb_set(result_value,'{data}',data_value || jsonb_build_object(
    'matches',coalesce(matches_value,'[]'::jsonb),
    'approvedHandicapRevisionId',(select revision_id from scoring_authority.handicap_revision_current where tournament_id='2026'),
    'approvedHandicapRevisionNumber',(select to_jsonb(c)->'revision_number' from scoring_authority.handicap_revision_current c where tournament_id='2026')));
end;
$$;
revoke all on function public.read_production_tournament_setup_v1(jsonb) from public,anon,authenticated;
grant execute on function public.read_production_tournament_setup_v1(jsonb) to service_role;
commit;
