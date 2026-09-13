-- Local STEP 2K.1 read-only projection. No results, entries or publication writes.
begin;
create function production_control.native_published_skins_labels_v1(target text, engine jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare detail jsonb; labels jsonb := '[]'; players jsonb; team jsonb; course jsonb; tournament_name text;
begin
  if engine->>'calculationPolicy' is distinct from 'production-full-course-handicap-v1'
    or jsonb_typeof(engine->'fullNetDetail') is distinct from 'array' then return null; end if;
  select name into strict tournament_name from scoring_authority.tournaments where tournament_id=target;
  for detail in select value from jsonb_array_elements(engine->'fullNetDetail') loop
    if detail->>'policy' is distinct from 'production-full-course-handicap-v1'
      or detail->>'official' is distinct from 'true' then return null; end if;
    select jsonb_build_object('courseId',s.course_id,'name',nullif(g.course_name,''),'tee',s.tee)
      into course from scoring_authority.matches m
      join scoring_authority.scoring_snapshots s on s.snapshot_id=m.scoring_snapshot_id
        and s.match_id=m.match_id and s.tournament_id=target
      left join scoring_authority.game_center_presentations g on g.match_id=m.match_id and g.tournament_id=target
      where m.match_id=detail->>'matchId' and m.tournament_id=target and m.status='FINAL'
        and m.scorecard_complete and s.snapshot_id=detail->>'snapshotId';
    if course is null then return null; end if;
    select jsonb_agg(jsonb_build_object('playerId',p.player_id,'name',p.display_name) order by ids.ordinality)
      into players from jsonb_array_elements_text(detail->'playerIds') with ordinality ids(id,ordinality)
      join scoring_authority.match_participants mp on mp.match_id=detail->>'matchId' and mp.player_id=ids.id
      join scoring_authority.players p on p.player_id=mp.player_id;
    if jsonb_array_length(players) is distinct from jsonb_array_length(detail->'playerIds') then return null; end if;
    select jsonb_build_object('teamId',t.team_id,'name',t.name) into team
      from scoring_authority.teams t where t.tournament_id=target and t.team_side=(
        select min(mp.team_side) from scoring_authority.match_participants mp
        where mp.match_id=detail->>'matchId' and detail->'playerIds' ? mp.player_id
        having count(distinct mp.team_side)=1);
    if team is null then return null; end if;
    labels:=labels||jsonb_build_array(jsonb_build_object('entryId',detail->>'entryId',
      'matchId',detail->>'matchId','players',players,'team',team,'course',course));
  end loop;
  return jsonb_build_object('tournamentName',tournament_name,'entries',labels);
end;
$$;
revoke all on function production_control.native_published_skins_labels_v1(text,jsonb) from public,anon,authenticated,service_role;
-- Augment only the existing OFFICIAL-only branch; all admission, source revision,
-- staleness and publication predicates in the existing readers remain identical.
do $$
declare f text; definition text; needle text := 'then result_value.engine_result_payload else null end'; target_expr text;
begin
  foreach f in array array['public.read_production_net_skins_frozen_2026_v1(jsonb)',
    'production_control.read_annual_net_skins_v1(text)'] loop
    definition:=pg_get_functiondef(f::regprocedure);
    if length(definition)-length(replace(definition,needle,''))<>length(needle) then
      raise exception 'NATIVE_SKINS_READ_PROJECTION_BOUNDARY_CHANGED'; end if;
    target_expr:=case when f like 'public.%' then '''2026''' else 'target' end;
    definition:=replace(definition,needle,'then result_value.engine_result_payload || jsonb_build_object(''participantLabels'', production_control.native_published_skins_labels_v1('||target_expr||',result_value.engine_result_payload)) else null end');
    execute definition;
  end loop;
end $$;
commit;
