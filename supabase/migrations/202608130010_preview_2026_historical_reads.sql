-- Preview-only, service-side 2026 historical read bundle.
--
-- Finalized scorecard snapshots and normalized scoring tables remain RLS-closed.
-- This function exposes only the bounded canonical data needed by the server-side
-- historical adapter; it deliberately excludes archive jobs/checkpoints, audit
-- events, permissions, mutations, worker controls, and Google mirror state.

create or replace function public.read_preview_2026_historical_view(
  target_tournament_id text,
  target_source_workbook_id text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  source_workbook text := btrim(coalesce(target_source_workbook_id, ''));
  tournament_value jsonb;
  rounds_value jsonb;
  teams_value jsonb;
  players_value jsonb;
  matches_value jsonb;
  finalized_value jsonb;
  home_presentation_value jsonb;
  fingerprint_inputs_value jsonb;
  source_fingerprint_value text;
  tournament_player_count integer;
  round_count integer;
  team_count integer;
  match_count integer;
  final_match_count integer;
  coherent_finalized_count integer;
begin
  if target_tournament <> '2026'
     or source_workbook = ''
     or source_workbook = production_workbook then
    return jsonb_build_object('ok', false, 'code', 'APPROVED_2026_HISTORY_CONTEXT_REQUIRED');
  end if;

  select jsonb_build_object(
    'tournament_id', t.tournament_id,
    'tournament_year', t.tournament_year,
    'name', t.name,
    'scoring_authority', t.scoring_authority
  ) into tournament_value
  from scoring_authority.tournaments t
  where t.tournament_id = target_tournament
    and t.tournament_year = 2026
    and t.source_workbook_id = source_workbook
    and t.scoring_authority = 'SUPABASE';

  if tournament_value is null then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_2026_HISTORY_SOURCE_MISMATCH');
  end if;
  if not exists (
    select 1
    from scoring_authority.ingress_gates gate
    where gate.tournament_id = target_tournament
      and gate.authority = 'SUPABASE'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_2026_SUPABASE_AUTHORITY_REQUIRED');
  end if;

  select count(*) into tournament_player_count
  from scoring_authority.tournament_players tp
  where tp.tournament_id = target_tournament;
  select count(*) into round_count
  from scoring_authority.rounds r
  where r.tournament_id = target_tournament;
  select count(*) into team_count
  from scoring_authority.teams team
  where team.tournament_id = target_tournament;
  select count(*), count(*) filter (where m.status = 'FINAL')
  into match_count, final_match_count
  from scoring_authority.matches m
  where m.tournament_id = target_tournament;

  if tournament_player_count <> 24
     or round_count <> 3
     or team_count <> 2
     or match_count <> 24 then
    return jsonb_build_object(
      'ok', false,
      'code', 'PREVIEW_2026_HISTORY_CANONICAL_SET_INCOMPLETE',
      'counts', jsonb_build_object(
        'players', tournament_player_count,
        'rounds', round_count,
        'teams', team_count,
        'matches', match_count,
        'final_matches', final_match_count
      )
    );
  end if;

  if not exists (
    select 1
    from scoring_authority.participant_home_presentations hp
    where hp.tournament_id = target_tournament
      and hp.source_workbook_id = source_workbook
  ) then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_2026_HISTORY_PRESENTATION_NOT_IMPORTED');
  end if;

  if exists (
    select 1
    from scoring_authority.matches m
    left join scoring_authority.rounds r
      on r.tournament_id = m.tournament_id
     and r.round_number = m.round_number
    left join scoring_authority.scoring_snapshots ss
      on ss.snapshot_id = m.scoring_snapshot_id
    left join scoring_authority.game_center_presentations gp
      on gp.match_id = m.match_id
    where m.tournament_id = target_tournament
      and (
        r.tournament_id is null
        or r.format <> m.format
        or ss.snapshot_id is null
        or ss.tournament_id <> target_tournament
        or ss.match_id <> m.match_id
        or ss.format <> m.format
        or jsonb_typeof(ss.hole_definitions) <> 'array'
        or jsonb_array_length(ss.hole_definitions) <> 18
        or gp.match_id is null
        or gp.tournament_id <> target_tournament
        or gp.source_workbook_id <> source_workbook
        or btrim(gp.display_match_number) = ''
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_2026_HISTORY_MATCH_CONTEXT_INVALID');
  end if;

  if exists (
    select 1
    from scoring_authority.matches m
    where m.tournament_id = target_tournament
      and (
        (select count(*) from scoring_authority.match_participants mp where mp.match_id = m.match_id)
          <> case when m.format = 'SI' then 2 else 4 end
        or exists (
          select 1
          from generate_series(1, 2) side(team_side)
          where (
            select count(*)
            from scoring_authority.match_participants mp
            where mp.match_id = m.match_id and mp.team_side = side.team_side
          ) <> case when m.format = 'SI' then 1 else 2 end
        )
        or exists (
          select 1
          from scoring_authority.match_participants mp
          left join scoring_authority.players p on p.player_id = mp.player_id
          left join scoring_authority.tournament_players tp
            on tp.tournament_id = m.tournament_id
           and tp.player_id = mp.player_id
          where mp.match_id = m.match_id
            and (
              p.player_id is null
              or tp.player_id is null
              or tp.team_side <> mp.team_side
              or tp.participation_status <> 'ACTIVE'
            )
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_2026_HISTORY_PARTICIPANT_CONTEXT_INVALID');
  end if;

  select count(*) into coherent_finalized_count
  from scoring_authority.finalized_scorecard_snapshots finalized
  join scoring_authority.matches m
    on m.match_id = finalized.match_id
   and m.tournament_id = finalized.tournament_id
  join scoring_authority.scoring_snapshots ss
    on ss.snapshot_id = finalized.scoring_snapshot_id
  where finalized.tournament_id = target_tournament
    and finalized.state = 'CURRENT'
    and m.status = 'FINAL'
    and finalized.match_revision = m.match_revision
    and finalized.scoring_snapshot_id = m.scoring_snapshot_id
    and finalized.scoring_snapshot_revision = ss.snapshot_revision;

  if coherent_finalized_count <> final_match_count
     or (
       select count(*)
       from scoring_authority.finalized_scorecard_snapshots finalized
       where finalized.tournament_id = target_tournament
         and finalized.state = 'CURRENT'
     ) <> final_match_count
     or exists (
       select 1
       from scoring_authority.finalized_scorecard_snapshots finalized
       join scoring_authority.matches m on m.match_id = finalized.match_id
       left join scoring_authority.scoring_snapshots ss
         on ss.snapshot_id = finalized.scoring_snapshot_id
       where finalized.tournament_id = target_tournament
         and finalized.state = 'CURRENT'
         and (
           m.tournament_id <> target_tournament
           or m.status <> 'FINAL'
           or finalized.match_revision <> m.match_revision
           or finalized.scoring_snapshot_id <> m.scoring_snapshot_id
           or ss.snapshot_id is null
           or finalized.scoring_snapshot_revision <> ss.snapshot_revision
           or jsonb_typeof(finalized.payload) <> 'object'
           or coalesce(finalized.payload #>> '{tournament,tournament_id}', '') <> target_tournament
           or coalesce(finalized.payload #>> '{match,match_id}', '') <> m.match_id
           or coalesce(finalized.payload #>> '{match,status}', '') <> 'FINAL'
           or coalesce(finalized.payload #>> '{course,scoring_snapshot_id}', '') <> m.scoring_snapshot_id
           or case
             when jsonb_typeof(finalized.payload->'teams') = 'array'
               then jsonb_array_length(finalized.payload->'teams') <> 2
             else true
           end
           or case
             when jsonb_typeof(finalized.payload->'participants') = 'array'
               then jsonb_array_length(finalized.payload->'participants')
                 <> case when m.format = 'SI' then 2 else 4 end
             else true
           end
           or case
             when jsonb_typeof(finalized.payload->'holes') = 'array'
               then jsonb_array_length(finalized.payload->'holes') <> 18
             else true
           end
           or lower(coalesce(finalized.payload #>> '{result,scorecard_complete}', '')) <> 'true'
         )
     ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'PREVIEW_2026_HISTORY_FINALIZED_SET_INCOHERENT',
      'expected_final_matches', final_match_count,
      'coherent_finalized_snapshots', coherent_finalized_count
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tournament_id', r.tournament_id,
    'round_number', r.round_number,
    'format', r.format,
    'name', r.name,
    'handicap_allowance', r.handicap_allowance,
    'status', r.status
  ) order by r.round_number), '[]'::jsonb)
  into rounds_value
  from scoring_authority.rounds r
  where r.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tournament_id', team.tournament_id,
    'team_id', team.team_id,
    'team_side', team.team_side,
    'name', team.name
  ) order by team.team_side), '[]'::jsonb)
  into teams_value
  from scoring_authority.teams team
  where team.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.player_id,
    'display_name', p.display_name,
    'team_id', tp.team_id,
    'team_side', tp.team_side,
    'participation_status', tp.participation_status
  ) order by tp.team_side, p.display_name, p.player_id), '[]'::jsonb)
  into players_value
  from scoring_authority.tournament_players tp
  join scoring_authority.players p on p.player_id = tp.player_id
  where tp.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', jsonb_build_object(
      'match_id', m.match_id,
      'tournament_id', m.tournament_id,
      'round_number', m.round_number,
      'format', m.format,
      'status', m.status,
      'scoring_locked', m.scoring_locked,
      'match_revision', m.match_revision,
      'scored_holes', m.scored_holes,
      'current_hole', m.current_hole,
      'holes_remaining', m.holes_remaining,
      'team_1_holes_won', m.team_1_holes_won,
      'team_2_holes_won', m.team_2_holes_won,
      'running_result', m.running_result,
      'result_winner', m.result_winner,
      'clinched', m.clinched,
      'scorecard_complete', m.scorecard_complete,
      'finalized_at', m.finalized_at,
      'authority_updated_at', m.authority_updated_at
    ),
    'presentation', jsonb_build_object(
      'course_name', gp.course_name,
      'course_logo', gp.course_logo,
      'course_yardage', gp.course_yardage,
      'tee_time', gp.tee_time,
      'starting_hole', gp.starting_hole,
      'display_match_number', gp.display_match_number,
      'match_sort_order', gp.match_sort_order,
      'team_1_logo', gp.team_1_logo,
      'team_1_primary_color', gp.team_1_primary_color,
      'team_1_secondary_color', gp.team_1_secondary_color,
      'team_2_logo', gp.team_2_logo,
      'team_2_primary_color', gp.team_2_primary_color,
      'team_2_secondary_color', gp.team_2_secondary_color,
      'tournament_location', gp.tournament_location,
      'tournament_logo', gp.tournament_logo,
      'tournament_status', gp.tournament_status,
      'tournament_time_zone', gp.tournament_time_zone,
      'source_payload_hash', gp.source_payload_hash
    ),
    'scoring_snapshot', jsonb_build_object(
      'snapshot_id', ss.snapshot_id,
      'snapshot_revision', ss.snapshot_revision,
      'scoring_rules_version', ss.scoring_rules_version,
      'format', ss.format,
      'handicap_allowance', ss.handicap_allowance,
      'course_id', ss.course_id,
      'tee', ss.tee,
      'rating', ss.rating,
      'slope', ss.slope,
      'par', ss.par,
      'match_netting_baseline', ss.match_netting_baseline,
      'hole_definitions', ss.hole_definitions,
      'participant_configuration', ss.participant_configuration,
      'team_configuration', ss.team_configuration,
      'effective_at', ss.effective_at,
      'canonical_hash', ss.canonical_hash
    ),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', mp.player_id,
        'display_name', p.display_name,
        'team_side', mp.team_side,
        'player_slot', mp.player_slot,
        'handicap_index', mp.handicap_index,
        'course_handicap', mp.course_handicap,
        'playing_handicap', mp.playing_handicap,
        'final_strokes', mp.final_strokes
      ) order by mp.team_side, mp.player_slot)
      from scoring_authority.match_participants mp
      join scoring_authority.players p on p.player_id = mp.player_id
      where mp.match_id = m.match_id
    ), '[]'::jsonb)
  ) order by m.round_number, gp.match_sort_order, m.match_id), '[]'::jsonb)
  into matches_value
  from scoring_authority.matches m
  join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
  where m.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tournament_id', finalized.tournament_id,
    'match_id', finalized.match_id,
    'snapshot_revision', finalized.snapshot_revision,
    'state', finalized.state,
    'match_revision', finalized.match_revision,
    'scoring_snapshot_id', finalized.scoring_snapshot_id,
    'scoring_snapshot_revision', finalized.scoring_snapshot_revision,
    'source_fingerprint', finalized.source_fingerprint,
    'payload_hash', finalized.payload_hash,
    'payload', finalized.payload,
    'finalized_at', finalized.finalized_at
  ) order by m.round_number, gp.match_sort_order, finalized.match_id), '[]'::jsonb)
  into finalized_value
  from scoring_authority.finalized_scorecard_snapshots finalized
  join scoring_authority.matches m
    on m.match_id = finalized.match_id
   and m.tournament_id = finalized.tournament_id
  join scoring_authority.scoring_snapshots ss
    on ss.snapshot_id = finalized.scoring_snapshot_id
  join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where finalized.tournament_id = target_tournament
    and finalized.state = 'CURRENT'
    and m.status = 'FINAL'
    and finalized.match_revision = m.match_revision
    and finalized.scoring_snapshot_id = m.scoring_snapshot_id
    and finalized.scoring_snapshot_revision = ss.snapshot_revision;

  select jsonb_build_object(
    'presentation', hp.presentation,
    'source_fingerprint', hp.source_fingerprint,
    'imported_at', hp.imported_at
  ) into home_presentation_value
  from scoring_authority.participant_home_presentations hp
  where hp.tournament_id = target_tournament
    and hp.source_workbook_id = source_workbook;

  fingerprint_inputs_value := jsonb_build_object(
    'schema_version', 'preview-2026-history-v1',
    'tournament', tournament_value,
    'rounds_hash', encode(extensions.digest(rounds_value::text, 'sha256'), 'hex'),
    'teams_hash', encode(extensions.digest(teams_value::text, 'sha256'), 'hex'),
    'players_hash', encode(extensions.digest(players_value::text, 'sha256'), 'hex'),
    'match_revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', m.match_id,
        'status', m.status,
        'match_revision', m.match_revision,
        'scoring_snapshot_id', m.scoring_snapshot_id,
        'scoring_snapshot_hash', ss.canonical_hash,
        'presentation_payload_hash', gp.source_payload_hash
      ) order by m.round_number, gp.match_sort_order, m.match_id)
      from scoring_authority.matches m
      join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
      join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
      where m.tournament_id = target_tournament
    ), '[]'::jsonb),
    'finalized_revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', finalized.match_id,
        'snapshot_revision', finalized.snapshot_revision,
        'match_revision', finalized.match_revision,
        'source_fingerprint', finalized.source_fingerprint,
        'payload_hash', finalized.payload_hash
      ) order by finalized.match_id)
      from scoring_authority.finalized_scorecard_snapshots finalized
      join scoring_authority.matches m on m.match_id = finalized.match_id
      where finalized.tournament_id = target_tournament
        and finalized.state = 'CURRENT'
        and m.status = 'FINAL'
        and finalized.match_revision = m.match_revision
        and finalized.scoring_snapshot_id = m.scoring_snapshot_id
    ), '[]'::jsonb),
    'home_presentation_fingerprint', home_presentation_value->>'source_fingerprint'
  );
  source_fingerprint_value := encode(
    extensions.digest(fingerprint_inputs_value::text, 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'schema_version', 'preview-2026-history-v1',
      'tournament', tournament_value,
      'rounds', rounds_value,
      'teams', teams_value,
      'players', players_value,
      'matches', matches_value,
      'finalized_snapshots', finalized_value,
      'home_presentation', home_presentation_value,
      'source_fingerprint', source_fingerprint_value,
      'source_fingerprint_inputs', fingerprint_inputs_value,
      'counts', jsonb_build_object(
        'players', tournament_player_count,
        'rounds', round_count,
        'teams', team_count,
        'matches', match_count,
        'final_matches', final_match_count,
        'live_matches', match_count - final_match_count,
        'current_finalized_snapshots', coherent_finalized_count
      ),
      'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
    )
  );
end;
$$;

create or replace function public.inspect_preview_2026_historical_security()
returns jsonb
language sql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'ok', true,
    'anon_history_execute', has_function_privilege(
      'anon',
      'public.read_preview_2026_historical_view(text,text)',
      'execute'
    ),
    'authenticated_history_execute', has_function_privilege(
      'authenticated',
      'public.read_preview_2026_historical_view(text,text)',
      'execute'
    ),
    'service_history_execute', has_function_privilege(
      'service_role',
      'public.read_preview_2026_historical_view(text,text)',
      'execute'
    ),
    'anon_snapshot_select', has_table_privilege(
      'anon',
      'scoring_authority.finalized_scorecard_snapshots',
      'select'
    ),
    'authenticated_snapshot_select', has_table_privilege(
      'authenticated',
      'scoring_authority.finalized_scorecard_snapshots',
      'select'
    )
  )
$$;

revoke all on function public.read_preview_2026_historical_view(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.inspect_preview_2026_historical_security()
  from public, anon, authenticated, service_role;

grant execute on function public.read_preview_2026_historical_view(text, text)
  to service_role;
grant execute on function public.inspect_preview_2026_historical_security()
  to service_role;

notify pgrst, 'reload schema';
