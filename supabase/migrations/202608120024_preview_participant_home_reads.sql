-- Preview-only participant Home presentation/config projection and compact
-- participant-scoped read. Scoring/match state remains canonical in the
-- Phase 2 authority aggregate; Google remains the Director configuration source.

create table scoring_authority.participant_home_presentations (
  tournament_id text primary key references scoring_authority.tournaments (tournament_id) on delete cascade,
  presentation jsonb not null default '{}'::jsonb,
  source_workbook_id text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  imported_by text not null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(presentation) = 'object'),
  check (jsonb_typeof(coalesce(presentation->'timeline'->'events', '[]'::jsonb)) = 'array'),
  check (jsonb_typeof(coalesce(presentation->'netSkinsByPlayer', '{}'::jsonb)) = 'object')
);

alter table scoring_authority.participant_home_presentations enable row level security;
revoke all on scoring_authority.participant_home_presentations from public, anon, authenticated;
grant select, insert, update, delete on scoring_authority.participant_home_presentations to service_role;

create or replace function public.replace_preview_participant_home_presentation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  actor text := btrim(coalesce(input->>'requested_by', ''));
  presentation_value jsonb := coalesce(input->'presentation', '{}'::jsonb);
  fingerprint text;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target_tournament = '' or source_workbook = '' or actor = '' or jsonb_typeof(presentation_value) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_HOME_PRESENTATION_REQUIRED');
  end if;
  if jsonb_typeof(coalesce(presentation_value->'timeline'->'events', '[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(presentation_value->'netSkinsByPlayer', '{}'::jsonb)) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_HOME_PRESENTATION');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = target_tournament and t.source_workbook_id = source_workbook
  ) then return jsonb_build_object('ok', false, 'code', 'PREVIEW_TOURNAMENT_SOURCE_MISMATCH'); end if;

  fingerprint := encode(extensions.digest(presentation_value::text, 'sha256'::text), 'hex');
  insert into scoring_authority.participant_home_presentations (
    tournament_id, presentation, source_workbook_id, source_fingerprint, imported_by
  ) values (
    target_tournament, presentation_value, source_workbook, fingerprint, actor
  ) on conflict (tournament_id) do update set
    presentation = excluded.presentation,
    source_workbook_id = excluded.source_workbook_id,
    source_fingerprint = excluded.source_fingerprint,
    imported_by = excluded.imported_by,
    imported_at = now(),
    updated_at = now();

  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'PARTICIPANT_HOME_PRESENTATION_REFRESHED', actor,
    jsonb_build_object(
      'fingerprint', fingerprint,
      'scheduleEvents', jsonb_array_length(coalesce(presentation_value->'timeline'->'events', '[]'::jsonb)),
      'netSkinsPlayers', (select count(*) from jsonb_object_keys(coalesce(presentation_value->'netSkinsByPlayer', '{}'::jsonb))),
      'sourceWorkbookStored', true
    ));
  return jsonb_build_object('ok', true, 'fingerprint', fingerprint,
    'scheduleEvents', jsonb_array_length(coalesce(presentation_value->'timeline'->'events', '[]'::jsonb)),
    'netSkinsPlayers', (select count(*) from jsonb_object_keys(coalesce(presentation_value->'netSkinsByPlayer', '{}'::jsonb))));
end;
$$;

create or replace function public.read_participant_home_view(target_tournament_id text, target_player_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, participant_identity, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  target_player text := btrim(coalesce(target_player_id, ''));
  tournament_value jsonb;
  teams_value jsonb;
  rounds_value jsonb;
  matches_value jsonb;
  participant_value jsonb;
  home_presentation_value jsonb;
  live_revision_value jsonb;
begin
  if target_tournament = '' or target_player = '' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_PARTICIPANT_CONTEXT_REQUIRED');
  end if;
  if not exists (
    select 1 from scoring_authority.tournament_players tp
    where tp.tournament_id = target_tournament and tp.player_id = target_player
      and tp.participation_status = 'ACTIVE'
  ) then return jsonb_build_object('ok', false, 'code', 'ACTIVE_TOURNAMENT_PLAYER_REQUIRED'); end if;

  select to_jsonb(t) into tournament_value
  from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  participant_value := public.read_my_match_view(target_tournament, target_player);
  if not coalesce((participant_value->>'ok')::boolean, false) then return participant_value; end if;

  select coalesce(jsonb_agg(to_jsonb(team) order by team.team_side), '[]'::jsonb) into teams_value
  from scoring_authority.teams team where team.tournament_id = target_tournament;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.round_number), '[]'::jsonb) into rounds_value
  from scoring_authority.rounds r where r.tournament_id = target_tournament;

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m),
    'round', to_jsonb(r),
    'snapshot', jsonb_build_object('snapshot_id', ss.snapshot_id, 'course_id', ss.course_id, 'tee', ss.tee,
      'par', ss.par, 'rating', ss.rating, 'slope', ss.slope, 'team_configuration', ss.team_configuration),
    'presentation', coalesce(to_jsonb(gp), '{}'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', mp.player_id, 'display_name', p.display_name, 'team_side', mp.team_side,
      'player_slot', mp.player_slot, 'playing_handicap', mp.playing_handicap, 'final_strokes', mp.final_strokes
    ) order by mp.team_side, mp.player_slot)
      from scoring_authority.match_participants mp
      join scoring_authority.players p on p.player_id = mp.player_id
      where mp.match_id = m.match_id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number, 'hole_winner', hs.hole_winner, 'updated_at', hs.updated_at
    ) order by hs.hole_number)
      from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, coalesce(gp.match_sort_order, 9999), m.match_id), '[]'::jsonb)
  into matches_value
  from scoring_authority.matches m
  join scoring_authority.rounds r on r.tournament_id = m.tournament_id and r.round_number = m.round_number
  join scoring_authority.scoring_snapshots ss on ss.snapshot_id = m.scoring_snapshot_id
  left join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where m.tournament_id = target_tournament;

  select to_jsonb(hp) into home_presentation_value
  from scoring_authority.participant_home_presentations hp
  where hp.tournament_id = target_tournament;

  select jsonb_build_object(
    'maxMatchRevision', coalesce(max(m.match_revision), 0),
    'totalMatchRevisions', coalesce(sum(m.match_revision), 0),
    'scoredHoles', coalesce(sum(m.scored_holes), 0),
    'finalMatches', count(*) filter (where m.status = 'FINAL'),
    'authorityUpdatedAt', max(m.authority_updated_at)
  ) into live_revision_value
  from scoring_authority.matches m where m.tournament_id = target_tournament;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value,
    'teams', teams_value,
    'rounds', rounds_value,
    'matches', matches_value,
    'participant_view', participant_value,
    'home_presentation', home_presentation_value,
    'live_revision', live_revision_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

revoke all on function public.replace_preview_participant_home_presentation(jsonb) from public, anon, authenticated;
revoke all on function public.read_participant_home_view(text, text) from public, anon, authenticated;
grant execute on function public.replace_preview_participant_home_presentation(jsonb) to service_role;
grant execute on function public.read_participant_home_view(text, text) to service_role;

notify pgrst, 'reload schema';
