-- Preview-only Game Center read projection.
-- Authoritative score state remains in scoring_authority; this table contains
-- only the small workbook-owned presentation/configuration projection needed
-- to remove Google from the foreground Game Center request path.

create table scoring_authority.game_center_presentations (
  match_id text primary key references scoring_authority.matches (match_id) on delete cascade,
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  course_name text not null default '',
  course_logo text not null default '',
  course_yardage text not null default '',
  tee_time text not null default '',
  starting_hole text not null default '',
  display_match_number text not null default '',
  match_sort_order integer not null check (match_sort_order > 0),
  team_1_logo text not null default '',
  team_1_primary_color text not null default '',
  team_1_secondary_color text not null default '',
  team_2_logo text not null default '',
  team_2_primary_color text not null default '',
  team_2_secondary_color text not null default '',
  tournament_location text not null default '',
  tournament_logo text not null default '',
  tournament_status text not null default '',
  tournament_time_zone text not null default 'America/Chicago',
  source_workbook_id text not null,
  source_updated_at timestamptz,
  source_payload_hash text not null check (source_payload_hash ~ '^[0-9a-f]{64}$'),
  imported_by text not null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scoring_authority_game_center_navigation_idx
  on scoring_authority.game_center_presentations (tournament_id, match_sort_order, match_id);

alter table scoring_authority.game_center_presentations enable row level security;
revoke all on scoring_authority.game_center_presentations from public, anon, authenticated;
grant select, insert, update, delete on scoring_authority.game_center_presentations to service_role;

alter table participant_identity.participant_identity_shadow_observations
  add column passport_context_revision bigint,
  add column linked_context_revision bigint;

create or replace function public.record_participant_identity_shadow_observation(observation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = participant_identity, scoring_authority, public, pg_temp
as $$
declare id uuid;
begin
  if btrim(coalesce(observation->>'request_id', '')) = '' then raise exception 'Shadow request identity is required.'; end if;
  insert into participant_identity.participant_identity_shadow_observations (
    request_id, tournament_id, auth_user_id, passport_player_id, linked_player_id,
    passport_team_id, linked_team_id, passport_membership_active, linked_membership_active,
    passport_match_ids, linked_match_ids, passport_scoring_permissions, linked_scoring_permissions,
    passport_context_revision, linked_context_revision, comparison_status, comparison_diagnostics
  ) values (
    observation->>'request_id', observation->>'tournament_id', nullif(observation->>'auth_user_id', '')::uuid,
    nullif(observation->>'passport_player_id', ''), nullif(observation->>'linked_player_id', ''),
    nullif(observation->>'passport_team_id', ''), nullif(observation->>'linked_team_id', ''),
    nullif(observation->>'passport_membership_active', '')::boolean, nullif(observation->>'linked_membership_active', '')::boolean,
    coalesce(observation->'passport_match_ids', '[]'::jsonb), coalesce(observation->'linked_match_ids', '[]'::jsonb),
    coalesce(observation->'passport_scoring_permissions', '{}'::jsonb), coalesce(observation->'linked_scoring_permissions', '{}'::jsonb),
    nullif(observation->>'passport_context_revision', '')::bigint, nullif(observation->>'linked_context_revision', '')::bigint,
    coalesce(nullif(observation->>'comparison_status', ''), 'NOT_RUN'), coalesce(observation->'comparison_diagnostics', '{}'::jsonb)
  ) on conflict (request_id) do nothing returning observation_id into id;
  return jsonb_build_object('ok', true, 'created', id is not null, 'observationId', id);
end;
$$;

revoke all on function public.record_participant_identity_shadow_observation(jsonb) from public, anon, authenticated;
grant execute on function public.record_participant_identity_shadow_observation(jsonb) to service_role;

create or replace function public.replace_preview_game_center_presentations(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  actor text := btrim(coalesce(input->>'requested_by', ''));
  rows_value jsonb := coalesce(input->'rows', '[]'::jsonb);
  item jsonb;
  imported_count integer := 0;
  removed_count integer := 0;
  fingerprint text;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target_tournament = '' or source_workbook = '' or actor = '' or jsonb_typeof(rows_value) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_PRESENTATION_IMPORT_REQUIRED');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = target_tournament and t.source_workbook_id = source_workbook
  ) then return jsonb_build_object('ok', false, 'code', 'PREVIEW_TOURNAMENT_SOURCE_MISMATCH'); end if;
  if jsonb_array_length(rows_value) <> (
    select count(*) from scoring_authority.matches m where m.tournament_id = target_tournament
  ) then return jsonb_build_object('ok', false, 'code', 'COMPLETE_MATCH_PRESENTATION_SET_REQUIRED'); end if;
  if exists (
    select 1 from jsonb_array_elements(rows_value) r
    where btrim(coalesce(r->>'tournament_id', '')) <> target_tournament
      or not exists (
        select 1 from scoring_authority.matches m
        where m.match_id = btrim(coalesce(r->>'match_id', '')) and m.tournament_id = target_tournament
      )
  ) then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_MATCH_PRESENTATION'); end if;
  if (select count(distinct btrim(r->>'match_id')) from jsonb_array_elements(rows_value) r) <> jsonb_array_length(rows_value) then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE_MATCH_PRESENTATION');
  end if;

  delete from scoring_authority.game_center_presentations p
  where p.tournament_id = target_tournament
    and not exists (select 1 from jsonb_array_elements(rows_value) r where btrim(r->>'match_id') = p.match_id);
  get diagnostics removed_count = row_count;

  for item in select value from jsonb_array_elements(rows_value) loop
    insert into scoring_authority.game_center_presentations (
      match_id, tournament_id, course_name, course_logo, course_yardage,
      tee_time, starting_hole, display_match_number, match_sort_order,
      team_1_logo, team_1_primary_color, team_1_secondary_color,
      team_2_logo, team_2_primary_color, team_2_secondary_color,
      tournament_location, tournament_logo, tournament_status, tournament_time_zone,
      source_workbook_id, source_updated_at, source_payload_hash, imported_by
    ) values (
      btrim(item->>'match_id'), target_tournament,
      btrim(coalesce(item->>'course_name', '')), btrim(coalesce(item->>'course_logo', '')), btrim(coalesce(item->>'course_yardage', '')),
      btrim(coalesce(item->>'tee_time', '')), btrim(coalesce(item->>'starting_hole', '')), btrim(coalesce(item->>'display_match_number', '')),
      greatest(1, coalesce((item->>'match_sort_order')::integer, 1)),
      btrim(coalesce(item->>'team_1_logo', '')), btrim(coalesce(item->>'team_1_primary_color', '')), btrim(coalesce(item->>'team_1_secondary_color', '')),
      btrim(coalesce(item->>'team_2_logo', '')), btrim(coalesce(item->>'team_2_primary_color', '')), btrim(coalesce(item->>'team_2_secondary_color', '')),
      btrim(coalesce(item->>'tournament_location', '')), btrim(coalesce(item->>'tournament_logo', '')), btrim(coalesce(item->>'tournament_status', '')),
      coalesce(nullif(btrim(item->>'tournament_time_zone'), ''), 'America/Chicago'),
      source_workbook, nullif(btrim(coalesce(item->>'source_updated_at', '')), '')::timestamptz,
      encode(extensions.digest(item::text, 'sha256'::text), 'hex'), actor
    ) on conflict (match_id) do update set
      tournament_id = excluded.tournament_id,
      course_name = excluded.course_name, course_logo = excluded.course_logo, course_yardage = excluded.course_yardage,
      tee_time = excluded.tee_time, starting_hole = excluded.starting_hole,
      display_match_number = excluded.display_match_number, match_sort_order = excluded.match_sort_order,
      team_1_logo = excluded.team_1_logo, team_1_primary_color = excluded.team_1_primary_color, team_1_secondary_color = excluded.team_1_secondary_color,
      team_2_logo = excluded.team_2_logo, team_2_primary_color = excluded.team_2_primary_color, team_2_secondary_color = excluded.team_2_secondary_color,
      tournament_location = excluded.tournament_location, tournament_logo = excluded.tournament_logo,
      tournament_status = excluded.tournament_status, tournament_time_zone = excluded.tournament_time_zone,
      source_workbook_id = excluded.source_workbook_id, source_updated_at = excluded.source_updated_at,
      source_payload_hash = excluded.source_payload_hash, imported_by = excluded.imported_by,
      imported_at = now(), updated_at = now();
    imported_count := imported_count + 1;
  end loop;
  fingerprint := encode(extensions.digest(rows_value::text, 'sha256'::text), 'hex');
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'GAME_CENTER_PRESENTATION_REFRESHED', actor,
    jsonb_build_object('rows', imported_count, 'removed', removed_count, 'fingerprint', fingerprint, 'sourceWorkbookStored', true));
  return jsonb_build_object('ok', true, 'rows', imported_count, 'removed', removed_count, 'fingerprint', fingerprint);
end;
$$;

create or replace function public.read_game_center_view(target_match_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  match_row scoring_authority.matches%rowtype;
  presentation_row scoring_authority.game_center_presentations%rowtype;
  tournament_value jsonb;
  round_value jsonb;
  snapshot_value jsonb;
  teams_value jsonb;
  participants_value jsonb;
  permissions_value jsonb;
  holes_value jsonb;
  scores_value jsonb;
  navigation_value jsonb;
begin
  select * into match_row from scoring_authority.matches where match_id = btrim(coalesce(target_match_id, ''));
  if not found then return jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  select * into presentation_row from scoring_authority.game_center_presentations where match_id = match_row.match_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'GAME_CENTER_PRESENTATION_NOT_IMPORTED'); end if;
  select to_jsonb(t) into tournament_value from scoring_authority.tournaments t where t.tournament_id = match_row.tournament_id;
  select to_jsonb(r) into round_value from scoring_authority.rounds r where r.tournament_id = match_row.tournament_id and r.round_number = match_row.round_number;
  select to_jsonb(s) into snapshot_value from scoring_authority.scoring_snapshots s where s.snapshot_id = match_row.scoring_snapshot_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.team_side), '[]'::jsonb) into teams_value
    from scoring_authority.teams t where t.tournament_id = match_row.tournament_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', mp.player_id, 'display_name', p.display_name, 'team_side', mp.team_side,
    'player_slot', mp.player_slot, 'handicap_index', mp.handicap_index,
    'course_handicap', mp.course_handicap, 'playing_handicap', mp.playing_handicap,
    'final_strokes', mp.final_strokes
  ) order by mp.team_side, mp.player_slot), '[]'::jsonb) into participants_value
    from scoring_authority.match_participants mp join scoring_authority.players p using (player_id)
    where mp.match_id = match_row.match_id;
  select coalesce(jsonb_agg(to_jsonb(sp) order by sp.player_id), '[]'::jsonb) into permissions_value
    from scoring_authority.scoring_permissions sp where sp.match_id = match_row.match_id;
  select coalesce(jsonb_agg(to_jsonb(mh) order by mh.hole_number), '[]'::jsonb) into holes_value
    from scoring_authority.match_holes mh where mh.match_id = match_row.match_id;
  select coalesce(jsonb_agg(to_jsonb(hs) order by hs.hole_number), '[]'::jsonb) into scores_value
    from scoring_authority.hole_scores hs where hs.match_id = match_row.match_id;

  with ordered as (
    select m.match_id, m.round_number, p.display_match_number, p.match_sort_order,
      lag(m.match_id) over (order by m.round_number, p.match_sort_order, m.match_id) as previous_id,
      lead(m.match_id) over (order by m.round_number, p.match_sort_order, m.match_id) as next_id,
      row_number() over (partition by m.round_number order by p.match_sort_order, m.match_id) as round_position,
      count(*) over (partition by m.round_number) as round_total
    from scoring_authority.matches m
    join scoring_authority.game_center_presentations p using (match_id)
    where m.tournament_id = match_row.tournament_id
  ), selected as (
    select * from ordered where match_id = match_row.match_id
  ) select jsonb_build_object(
    'previous', case when s.previous_id is null then null else jsonb_build_object(
      'id', s.previous_id, 'label', 'Round ' || pm.round_number || ', Match ' || pp.display_match_number) end,
    'next', case when s.next_id is null then null else jsonb_build_object(
      'id', s.next_id, 'label', 'Round ' || nm.round_number || ', Match ' || np.display_match_number) end,
    'position', jsonb_build_object('round', s.round_number, 'index', s.round_position, 'total', s.round_total)
  ) into navigation_value from selected s
    left join scoring_authority.matches pm on pm.match_id = s.previous_id
    left join scoring_authority.game_center_presentations pp on pp.match_id = s.previous_id
    left join scoring_authority.matches nm on nm.match_id = s.next_id
    left join scoring_authority.game_center_presentations np on np.match_id = s.next_id;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value, 'round', round_value, 'match', to_jsonb(match_row),
    'snapshot', snapshot_value, 'teams', teams_value, 'participants', participants_value,
    'permissions', permissions_value, 'holes', holes_value, 'scores', scores_value,
    'presentation', to_jsonb(presentation_row), 'navigation', navigation_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

revoke all on function public.replace_preview_game_center_presentations(jsonb) from public, anon, authenticated;
revoke all on function public.read_game_center_view(text) from public, anon, authenticated;
grant execute on function public.replace_preview_game_center_presentations(jsonb) to service_role;
grant execute on function public.read_game_center_view(text) to service_role;

notify pgrst, 'reload schema';
