-- Preview-only Net Skins configuration and operational derived-state layer.
-- Google remains the Director configuration/reporting source. The existing
-- JavaScript engine remains the sole calculation owner.

create table scoring_authority.net_skins_configuration_import_runs (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  source_workbook_id text not null,
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('APPLIED', 'NO_CHANGE', 'REJECTED')),
  round_count integer not null default 0,
  entry_count integer not null default 0,
  requested_by text not null,
  imported_at timestamptz not null default now()
);

create index net_skins_configuration_import_runs_scope_idx
  on scoring_authority.net_skins_configuration_import_runs (tournament_id, imported_at desc);

create table scoring_authority.net_skins_configurations (
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  round_number integer not null check (round_number between 1 and 99),
  format text not null check (format in ('BB', 'SC', 'SI')),
  enabled boolean not null default true,
  entry_type text not null check (entry_type in ('INDIVIDUAL', 'PAIRING')),
  buy_in_per_entry numeric(12,2) not null check (buy_in_per_entry >= 0),
  expected_pot numeric(12,2) not null check (expected_pot >= 0),
  completion_rule text not null check (completion_rule = 'ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL'),
  payout_rounding text not null check (payout_rounding = 'NONE'),
  tie_rule text not null check (tie_rule = 'NO_SKIN_NO_CARRY'),
  configuration_revision bigint not null default 1 check (configuration_revision > 0),
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  source_workbook_id text not null,
  imported_by text not null,
  imported_at timestamptz not null default now(),
  approved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, round_number)
);

create table scoring_authority.net_skins_configuration_entries (
  tournament_id text not null,
  round_number integer not null,
  entry_id text not null,
  match_number text not null default '',
  format text not null check (format in ('BB', 'SC', 'SI')),
  player_id_1 text not null references scoring_authority.players (player_id),
  player_id_2 text references scoring_authority.players (player_id),
  team_handicap numeric(10,3),
  buy_in numeric(12,2) not null check (buy_in >= 0),
  eligible boolean not null default true,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, round_number, entry_id),
  foreign key (tournament_id, round_number)
    references scoring_authority.net_skins_configurations (tournament_id, round_number) on delete cascade,
  check ((format = 'SC' and player_id_2 is not null and player_id_2 <> player_id_1)
    or (format <> 'SC' and player_id_2 is null)),
  check (jsonb_typeof(source_payload) = 'object')
);

create unique index net_skins_active_individual_entry_idx
  on scoring_authority.net_skins_configuration_entries (tournament_id, round_number, player_id_1)
  where eligible and format <> 'SC';

create unique index net_skins_active_pairing_entry_idx
  on scoring_authority.net_skins_configuration_entries
    (tournament_id, round_number, least(player_id_1, player_id_2), greatest(player_id_1, player_id_2))
  where eligible and format = 'SC';

create table scoring_authority.competition_derived_snapshots (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  round_number integer not null,
  engine_key text not null,
  engine_version text not null,
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  result_state text not null check (result_state in ('PROVISIONAL', 'OFFICIAL')),
  result_payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  is_current boolean not null default true,
  calculated_at timestamptz not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(result_payload) = 'object'),
  unique (tournament_id, round_number, engine_key, engine_version, configuration_fingerprint, source_fingerprint, payload_hash)
);

create unique index competition_derived_current_idx
  on scoring_authority.competition_derived_snapshots (tournament_id, round_number, engine_key)
  where is_current;

create index competition_derived_history_idx
  on scoring_authority.competition_derived_snapshots (tournament_id, engine_key, round_number, calculated_at desc);

create table scoring_authority.competition_recalculation_jobs (
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  round_number integer not null,
  engine_key text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  requested_source_revision jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error_safe text,
  updated_at timestamptz not null default now(),
  primary key (tournament_id, round_number, engine_key),
  check (jsonb_typeof(requested_source_revision) = 'object')
);

alter table scoring_authority.net_skins_configuration_import_runs enable row level security;
alter table scoring_authority.net_skins_configurations enable row level security;
alter table scoring_authority.net_skins_configuration_entries enable row level security;
alter table scoring_authority.competition_derived_snapshots enable row level security;
alter table scoring_authority.competition_recalculation_jobs enable row level security;

revoke all on scoring_authority.net_skins_configuration_import_runs from public, anon, authenticated;
revoke all on scoring_authority.net_skins_configurations from public, anon, authenticated;
revoke all on scoring_authority.net_skins_configuration_entries from public, anon, authenticated;
revoke all on scoring_authority.competition_derived_snapshots from public, anon, authenticated;
revoke all on scoring_authority.competition_recalculation_jobs from public, anon, authenticated;
grant select, insert, update, delete on scoring_authority.net_skins_configuration_import_runs to service_role;
grant select, insert, update, delete on scoring_authority.net_skins_configurations to service_role;
grant select, insert, update, delete on scoring_authority.net_skins_configuration_entries to service_role;
grant select, insert, update, delete on scoring_authority.competition_derived_snapshots to service_role;
grant select, insert, update, delete on scoring_authority.competition_recalculation_jobs to service_role;

create or replace function public.replace_preview_net_skins_configuration(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  actor text := btrim(coalesce(input->>'requested_by', ''));
  overall_fingerprint text := lower(btrim(coalesce(input->>'configuration_fingerprint', '')));
  round_value jsonb;
  entry_value jsonb;
  prior_fingerprint text;
  next_revision bigint;
  changed boolean := false;
  rounds_count integer := 0;
  entries_count integer := 0;
  removed_rounds integer := 0;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target_tournament = '' or source_workbook = '' or actor = ''
      or overall_fingerprint !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(coalesce(input->'rounds', 'null'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_NET_SKINS_CONFIGURATION_REQUIRED');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = target_tournament and t.source_workbook_id = source_workbook
  ) then return jsonb_build_object('ok', false, 'code', 'PREVIEW_TOURNAMENT_SOURCE_MISMATCH'); end if;

  for round_value in select value from jsonb_array_elements(input->'rounds') loop
    if coalesce((round_value->>'round_number')::integer, 0) <= 0
        or upper(btrim(coalesce(round_value->>'format', ''))) not in ('BB', 'SC', 'SI')
        or lower(btrim(coalesce(round_value->>'configuration_fingerprint', ''))) !~ '^[0-9a-f]{64}$'
        or jsonb_typeof(coalesce(round_value->'entries', 'null'::jsonb)) <> 'array' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_NET_SKINS_ROUND_CONFIGURATION');
    end if;
    if upper(round_value->>'format') = 'SC' and upper(round_value->>'entry_type') <> 'PAIRING' then
      return jsonb_build_object('ok', false, 'code', 'SCRAMBLE_PAIRING_CONFIGURATION_REQUIRED');
    end if;
    if upper(round_value->>'format') <> 'SC' and upper(round_value->>'entry_type') <> 'INDIVIDUAL' then
      return jsonb_build_object('ok', false, 'code', 'INDIVIDUAL_CONFIGURATION_REQUIRED');
    end if;
    if (round_value->>'buy_in_per_entry')::numeric <> (case when upper(round_value->>'format') = 'SC' then 50 else 25 end)
        or (round_value->>'expected_pot')::numeric <> (select count(*) * (round_value->>'buy_in_per_entry')::numeric
          from jsonb_array_elements(round_value->'entries') e where coalesce((e->>'eligible')::boolean, true)) then
      return jsonb_build_object('ok', false, 'code', 'NET_SKINS_FINANCIAL_CONTRACT_MISMATCH');
    end if;
    for entry_value in select value from jsonb_array_elements(round_value->'entries') loop
      if btrim(coalesce(entry_value->>'entry_id', '')) = ''
          or btrim(coalesce(entry_value->>'player_id_1', '')) = ''
          or (entry_value->>'buy_in')::numeric <> (round_value->>'buy_in_per_entry')::numeric
          or not exists (select 1 from scoring_authority.tournament_players tp
            where tp.tournament_id = target_tournament and tp.player_id = entry_value->>'player_id_1'
              and tp.participation_status = 'ACTIVE') then
        return jsonb_build_object('ok', false, 'code', 'INVALID_NET_SKINS_ENTRY');
      end if;
      if upper(round_value->>'format') = 'SC' and (
          btrim(coalesce(entry_value->>'player_id_2', '')) = ''
          or not exists (select 1 from scoring_authority.tournament_players tp
            where tp.tournament_id = target_tournament and tp.player_id = entry_value->>'player_id_2'
              and tp.participation_status = 'ACTIVE')) then
        return jsonb_build_object('ok', false, 'code', 'INVALID_SCRAMBLE_NET_SKINS_PAIRING');
      end if;
    end loop;
  end loop;

  -- Remove rounds no longer present only after the full payload validates.
  delete from scoring_authority.net_skins_configurations c
  where c.tournament_id = target_tournament
    and not exists (select 1 from jsonb_array_elements(input->'rounds') r
      where (r->>'round_number')::integer = c.round_number);
  get diagnostics removed_rounds = row_count;
  if removed_rounds > 0 then changed := true; end if;

  for round_value in select value from jsonb_array_elements(input->'rounds') loop
    rounds_count := rounds_count + 1;
    select c.configuration_fingerprint, c.configuration_revision
      into prior_fingerprint, next_revision
    from scoring_authority.net_skins_configurations c
    where c.tournament_id = target_tournament and c.round_number = (round_value->>'round_number')::integer;
    if prior_fingerprint is null then next_revision := 1; changed := true;
    elsif prior_fingerprint <> lower(round_value->>'configuration_fingerprint') then
      next_revision := next_revision + 1; changed := true;
    end if;

    insert into scoring_authority.net_skins_configurations (
      tournament_id, round_number, format, enabled, entry_type, buy_in_per_entry, expected_pot,
      completion_rule, payout_rounding, tie_rule, configuration_revision, configuration_fingerprint,
      source_workbook_id, imported_by, imported_at, approved_at, updated_at
    ) values (
      target_tournament, (round_value->>'round_number')::integer, upper(round_value->>'format'),
      coalesce((round_value->>'enabled')::boolean, true), upper(round_value->>'entry_type'),
      (round_value->>'buy_in_per_entry')::numeric, (round_value->>'expected_pot')::numeric,
      'ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL', 'NONE', 'NO_SKIN_NO_CARRY',
      next_revision, lower(round_value->>'configuration_fingerprint'), source_workbook, actor, now(), now(), now()
    ) on conflict (tournament_id, round_number) do update set
      format = excluded.format, enabled = excluded.enabled, entry_type = excluded.entry_type,
      buy_in_per_entry = excluded.buy_in_per_entry, expected_pot = excluded.expected_pot,
      configuration_revision = excluded.configuration_revision,
      configuration_fingerprint = excluded.configuration_fingerprint,
      source_workbook_id = excluded.source_workbook_id, imported_by = excluded.imported_by,
      imported_at = now(), updated_at = now();

    delete from scoring_authority.net_skins_configuration_entries e
    where e.tournament_id = target_tournament and e.round_number = (round_value->>'round_number')::integer;
    for entry_value in select value from jsonb_array_elements(round_value->'entries') loop
      entries_count := entries_count + 1;
      if btrim(coalesce(entry_value->>'entry_id', '')) = ''
          or btrim(coalesce(entry_value->>'player_id_1', '')) = ''
          or not exists (select 1 from scoring_authority.tournament_players tp
            where tp.tournament_id = target_tournament and tp.player_id = entry_value->>'player_id_1'
              and tp.participation_status = 'ACTIVE') then
        return jsonb_build_object('ok', false, 'code', 'INVALID_NET_SKINS_ENTRY');
      end if;
      if upper(round_value->>'format') = 'SC' and (
          btrim(coalesce(entry_value->>'player_id_2', '')) = ''
          or not exists (select 1 from scoring_authority.tournament_players tp
            where tp.tournament_id = target_tournament and tp.player_id = entry_value->>'player_id_2'
              and tp.participation_status = 'ACTIVE')) then
        return jsonb_build_object('ok', false, 'code', 'INVALID_SCRAMBLE_NET_SKINS_PAIRING');
      end if;
      insert into scoring_authority.net_skins_configuration_entries (
        tournament_id, round_number, entry_id, match_number, format, player_id_1, player_id_2,
        team_handicap, buy_in, eligible, source_payload
      ) values (
        target_tournament, (round_value->>'round_number')::integer, entry_value->>'entry_id',
        btrim(coalesce(entry_value->>'match_number', '')), upper(round_value->>'format'),
        entry_value->>'player_id_1', nullif(btrim(coalesce(entry_value->>'player_id_2', '')), ''),
        nullif(entry_value->>'team_handicap', '')::numeric, (entry_value->>'buy_in')::numeric,
        coalesce((entry_value->>'eligible')::boolean, true), coalesce(entry_value->'source_payload', '{}'::jsonb)
      );
    end loop;

    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status, requested_source_revision, requested_at, updated_at
    ) values (target_tournament, (round_value->>'round_number')::integer, 'NET_SKINS', 'PENDING',
      jsonb_build_object('reason', 'CONFIGURATION_REFRESH', 'configurationFingerprint', round_value->>'configuration_fingerprint'), now(), now())
    on conflict (tournament_id, round_number, engine_key) do update set
      status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
      requested_at = now(), started_at = null, completed_at = null,
      last_error_code = null, last_error_safe = null, updated_at = now();
  end loop;

  insert into scoring_authority.net_skins_configuration_import_runs (
    tournament_id, source_workbook_id, configuration_fingerprint, status,
    round_count, entry_count, requested_by
  ) values (target_tournament, source_workbook, overall_fingerprint,
    case when changed then 'APPLIED' else 'NO_CHANGE' end, rounds_count, entries_count, actor);
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'NET_SKINS_CONFIGURATION_REFRESHED', actor,
    jsonb_build_object('fingerprint', overall_fingerprint, 'rounds', rounds_count,
      'entries', entries_count, 'changed', changed, 'sourceWorkbookStored', true));
  return jsonb_build_object('ok', true, 'configuration_fingerprint', overall_fingerprint,
    'rounds', rounds_count, 'entries', entries_count, 'changed', changed);
end;
$$;

create or replace function public.read_net_skins_input_view(target_tournament_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  tournament_value jsonb;
  config_value jsonb;
  players_value jsonb;
  matches_value jsonb;
  source_revision_value jsonb;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  select to_jsonb(t) into tournament_value from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'configuration', to_jsonb(c),
    'entries', coalesce((select jsonb_agg(to_jsonb(e) order by e.entry_id)
      from scoring_authority.net_skins_configuration_entries e
      where e.tournament_id = c.tournament_id and e.round_number = c.round_number), '[]'::jsonb)
  ) order by c.round_number), '[]'::jsonb) into config_value
  from scoring_authority.net_skins_configurations c
  where c.tournament_id = target_tournament and c.enabled;
  if jsonb_array_length(config_value) = 0 then return jsonb_build_object('ok', false, 'code', 'NET_SKINS_CONFIGURATION_REQUIRED'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('player_id', p.player_id, 'display_name', p.display_name)
    order by p.display_name, p.player_id), '[]'::jsonb) into players_value
  from scoring_authority.tournament_players tp join scoring_authority.players p on p.player_id = tp.player_id
  where tp.tournament_id = target_tournament and tp.participation_status = 'ACTIVE';

  select coalesce(jsonb_agg(jsonb_build_object(
    'match', to_jsonb(m), 'presentation', coalesce(to_jsonb(gp), '{}'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', mp.player_id, 'display_name', p.display_name,
      'team_side', mp.team_side, 'player_slot', mp.player_slot
    ) order by mp.team_side, mp.player_slot)
      from scoring_authority.match_participants mp join scoring_authority.players p on p.player_id = mp.player_id
      where mp.match_id = m.match_id), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', mh.hole_number, 'stroke_index', mh.stroke_index, 'par', mh.par
    ) order by mh.hole_number) from scoring_authority.match_holes mh where mh.match_id = m.match_id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
      'hole_number', hs.hole_number, 'hole_revision', hs.hole_revision,
      'team_1_gross_scores', hs.team_1_gross_scores, 'team_2_gross_scores', hs.team_2_gross_scores,
      'team_1_strokes', hs.team_1_strokes, 'team_2_strokes', hs.team_2_strokes,
      'team_1_net_score', hs.team_1_net_score, 'team_2_net_score', hs.team_2_net_score
    ) order by hs.hole_number) from scoring_authority.hole_scores hs where hs.match_id = m.match_id), '[]'::jsonb)
  ) order by m.round_number, coalesce(gp.match_sort_order, 9999), m.match_id), '[]'::jsonb) into matches_value
  from scoring_authority.matches m
  left join scoring_authority.game_center_presentations gp on gp.match_id = m.match_id
  where m.tournament_id = target_tournament;

  select jsonb_build_object(
    'tournamentId', target_tournament,
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', m.match_id, 'round', m.round_number, 'matchRevision', m.match_revision,
      'status', m.status, 'finalizedAt', m.finalized_at, 'scorecardComplete', m.scorecard_complete,
      'resultWinner', m.result_winner) order by m.match_id)
      from scoring_authority.matches m where m.tournament_id = target_tournament), '[]'::jsonb),
    'holes', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', hs.match_id, 'hole', hs.hole_number, 'revision', hs.hole_revision)
      order by hs.match_id, hs.hole_number)
      from scoring_authority.hole_scores hs join scoring_authority.matches m on m.match_id = hs.match_id
      where m.tournament_id = target_tournament), '[]'::jsonb)
  ) into source_revision_value;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value, 'configurations', config_value, 'players', players_value,
    'matches', matches_value, 'source_revision', source_revision_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

create or replace function public.write_net_skins_derived_results(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  actor text := btrim(coalesce(input->>'calculated_by', ''));
  engine_version_value text := btrim(coalesce(input->>'engine_version', ''));
  round_value jsonb;
  snapshot_id uuid;
  written integer := 0;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target_tournament = '' or actor = '' or engine_version_value = ''
      or jsonb_typeof(coalesce(input->'rounds', 'null'::jsonb)) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_NET_SKINS_RESULT_REQUIRED');
  end if;
  for round_value in select value from jsonb_array_elements(input->'rounds') loop
    if lower(coalesce(round_value->>'configuration_fingerprint', '')) !~ '^[0-9a-f]{64}$'
        or lower(coalesce(round_value->>'source_fingerprint', '')) !~ '^[0-9a-f]{64}$'
        or lower(coalesce(round_value->>'payload_hash', '')) !~ '^[0-9a-f]{64}$'
        or upper(coalesce(round_value->>'result_state', '')) not in ('PROVISIONAL', 'OFFICIAL')
        or jsonb_typeof(coalesce(round_value->'result_payload', 'null'::jsonb)) <> 'object' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_NET_SKINS_RESULT');
    end if;
    update scoring_authority.competition_derived_snapshots set is_current = false
    where tournament_id = target_tournament and round_number = (round_value->>'round_number')::integer
      and engine_key = 'NET_SKINS' and is_current;
    insert into scoring_authority.competition_derived_snapshots (
      tournament_id, round_number, engine_key, engine_version, configuration_fingerprint,
      source_fingerprint, result_state, result_payload, payload_hash, is_current,
      calculated_at, published_at
    ) values (
      target_tournament, (round_value->>'round_number')::integer, 'NET_SKINS', engine_version_value,
      lower(round_value->>'configuration_fingerprint'), lower(round_value->>'source_fingerprint'),
      upper(round_value->>'result_state'), round_value->'result_payload', lower(round_value->>'payload_hash'), true,
      (round_value->>'calculated_at')::timestamptz,
      case when upper(round_value->>'result_state') = 'OFFICIAL' then (round_value->>'calculated_at')::timestamptz else null end
    ) on conflict (tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, payload_hash) do update set
      result_state = excluded.result_state, result_payload = excluded.result_payload,
      is_current = true, calculated_at = excluded.calculated_at,
      published_at = excluded.published_at
    returning id into snapshot_id;
    written := written + 1;
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status, requested_source_revision,
      attempts, requested_at, completed_at, updated_at
    ) values (target_tournament, (round_value->>'round_number')::integer, 'NET_SKINS', 'SUCCEEDED',
      jsonb_build_object('sourceFingerprint', round_value->>'source_fingerprint'), 1, now(), now(), now())
    on conflict (tournament_id, round_number, engine_key) do update set
      status = 'SUCCEEDED', attempts = scoring_authority.competition_recalculation_jobs.attempts + 1,
      requested_source_revision = excluded.requested_source_revision, completed_at = now(),
      last_error_code = null, last_error_safe = null, updated_at = now();
  end loop;
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'NET_SKINS_DERIVED_RESULTS_CALCULATED', actor,
    jsonb_build_object('rounds', written, 'engineVersion', engine_version_value));
  return jsonb_build_object('ok', true, 'rounds', written);
end;
$$;

create or replace function public.read_net_skins_result_view(target_tournament_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  target_tournament text := btrim(coalesce(target_tournament_id, ''));
  snapshots_value jsonb;
  jobs_value jsonb;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'round_number', s.round_number, 'engine_version', s.engine_version,
    'configuration_fingerprint', s.configuration_fingerprint, 'source_fingerprint', s.source_fingerprint,
    'result_state', s.result_state, 'result_payload', s.result_payload,
    'payload_hash', s.payload_hash, 'calculated_at', s.calculated_at, 'published_at', s.published_at
  ) order by s.round_number), '[]'::jsonb) into snapshots_value
  from scoring_authority.competition_derived_snapshots s
  where s.tournament_id = target_tournament and s.engine_key = 'NET_SKINS' and s.is_current;
  select coalesce(jsonb_agg(to_jsonb(j) order by j.round_number), '[]'::jsonb) into jobs_value
  from scoring_authority.competition_recalculation_jobs j
  where j.tournament_id = target_tournament and j.engine_key = 'NET_SKINS';
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament_id', target_tournament, 'snapshots', snapshots_value, 'jobs', jobs_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

create or replace function public.mark_net_skins_recalculation_failed(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  target_round integer := coalesce((input->>'round_number')::integer, 0);
  safe_code text := left(btrim(coalesce(input->>'error_code', 'NET_SKINS_CALCULATION_FAILED')), 120);
  safe_message text := left(btrim(coalesce(input->>'error_safe', 'Net Skins recalculation is temporarily unavailable.')), 400);
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' or target_tournament = '' or target_round <= 0 then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_NET_SKINS_FAILURE_REQUIRED');
  end if;
  update scoring_authority.competition_recalculation_jobs set
    status = 'FAILED', attempts = attempts + 1, completed_at = now(),
    last_error_code = safe_code, last_error_safe = safe_message, updated_at = now()
  where tournament_id = target_tournament and round_number = target_round and engine_key = 'NET_SKINS';
  return jsonb_build_object('ok', true, 'round_number', target_round);
end;
$$;

create or replace function scoring_authority.enqueue_net_skins_recalculation()
returns trigger
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_match scoring_authority.matches%rowtype;
  target_match_id text;
begin
  target_match_id := case when tg_op = 'DELETE' then old.match_id else new.match_id end;
  select * into target_match from scoring_authority.matches
  where match_id = target_match_id;
  if target_match.match_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if exists (select 1 from scoring_authority.net_skins_configurations c
    where c.tournament_id = target_match.tournament_id and c.round_number = target_match.round_number and c.enabled) then
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status, requested_source_revision, requested_at, updated_at
    ) values (target_match.tournament_id, target_match.round_number, 'NET_SKINS', 'PENDING',
      jsonb_build_object('matchId', target_match.match_id, 'matchRevision', target_match.match_revision,
        'reason', tg_table_name), now(), now())
    on conflict (tournament_id, round_number, engine_key) do update set
      status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
      requested_at = now(), started_at = null, completed_at = null,
      last_error_code = null, last_error_safe = null, updated_at = now();
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger net_skins_hole_score_recalculation
after insert or update or delete on scoring_authority.hole_scores
for each row execute function scoring_authority.enqueue_net_skins_recalculation();

create trigger net_skins_match_lifecycle_recalculation
after update of status, finalized_at, match_revision on scoring_authority.matches
for each row execute function scoring_authority.enqueue_net_skins_recalculation();

revoke all on function public.replace_preview_net_skins_configuration(jsonb) from public, anon, authenticated;
revoke all on function public.read_net_skins_input_view(text) from public, anon, authenticated;
revoke all on function public.write_net_skins_derived_results(jsonb) from public, anon, authenticated;
revoke all on function public.read_net_skins_result_view(text) from public, anon, authenticated;
revoke all on function public.mark_net_skins_recalculation_failed(jsonb) from public, anon, authenticated;
revoke all on function scoring_authority.enqueue_net_skins_recalculation() from public, anon, authenticated;
grant execute on function public.replace_preview_net_skins_configuration(jsonb) to service_role;
grant execute on function public.read_net_skins_input_view(text) to service_role;
grant execute on function public.write_net_skins_derived_results(jsonb) to service_role;
grant execute on function public.read_net_skins_result_view(text) to service_role;
grant execute on function public.mark_net_skins_recalculation_failed(jsonb) to service_role;

notify pgrst, 'reload schema';
