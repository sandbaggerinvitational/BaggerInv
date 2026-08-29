-- Production Net Skins V1 canonical control, derived-job, and bounded-read
-- contract. Installation is intentionally inert: the sole seeded state is
-- 2026 / NOT_CONFIGURED. No scoring/read/identity authority, ingress, worker,
-- maintenance, deployment, Calcutta, or tournament fact is changed here.
--
-- The JavaScript net-skins-js-v1 engine remains the only calculation owner.
-- SQL derives and freezes canonical configuration inputs, leases calculation
-- work, validates lifecycle/resource/revision boundaries, and publishes only
-- OFFICIAL results.
begin;

create table scoring_authority.net_skins_v1_configuration_revisions (
  configuration_revision_id uuid primary key
    default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  configuration_revision bigint not null check (configuration_revision > 0),
  contract_version text not null check (
    contract_version = 'production-net-skins-v1'
  ),
  state text not null check (state in ('NOT_CONFIGURED', 'CONFIGURED')),
  publication_policy text not null check (publication_policy = 'OFFICIAL_ONLY'),
  configuration_manifest jsonb not null check (
    pg_catalog.jsonb_typeof(configuration_manifest) = 'object'
  ),
  configuration_fingerprint text not null check (
    configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  resource_fingerprint text not null check (
    resource_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  activation_revision bigint not null check (activation_revision >= 0),
  authority_epoch_id uuid,
  configured_by_player_id text references scoring_authority.players(player_id)
    on delete restrict,
  configured_by_auth_user_id uuid references auth.users(id) on delete restrict,
  request_fingerprint text unique check (
    request_fingerprint is null
    or request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  request_payload_hash text check (
    request_payload_hash is null
    or request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  configured_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (tournament_id, configuration_revision),
  check (
    (state = 'NOT_CONFIGURED'
      and configured_by_player_id is null
      and configured_by_auth_user_id is null
      and configured_at is null
      and request_fingerprint is null)
    or
    (state = 'CONFIGURED'
      and configured_by_player_id is not null
      and configured_by_auth_user_id is not null
      and configured_at is not null
      and request_fingerprint is not null
      and request_payload_hash is not null)
  )
);

create table scoring_authority.net_skins_v1_configuration_current (
  tournament_id text primary key references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  configuration_revision_id uuid not null unique references
    scoring_authority.net_skins_v1_configuration_revisions(
      configuration_revision_id
    ) on delete restrict,
  configuration_revision bigint not null check (configuration_revision > 0),
  state text not null check (state in ('NOT_CONFIGURED', 'CONFIGURED')),
  updated_at timestamptz not null default pg_catalog.now()
);

create table scoring_authority.net_skins_v1_recalculation_jobs (
  job_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  round_number integer not null check (round_number between 1 and 99),
  configuration_revision_id uuid not null references
    scoring_authority.net_skins_v1_configuration_revisions(
      configuration_revision_id
    ) on delete restrict,
  configuration_revision bigint not null check (configuration_revision > 0),
  configuration_fingerprint text not null check (
    configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  source_revision jsonb not null check (
    pg_catalog.jsonb_typeof(source_revision) = 'object'
  ),
  source_fingerprint text not null check (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  status text not null default 'PENDING' check (
    status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SUPERSEDED')
  ),
  reason text not null check (
    pg_catalog.btrim(reason) <> '' and pg_catalog.length(reason) <= 120
  ),
  requested_by text not null check (
    pg_catalog.btrim(requested_by) <> '' and pg_catalog.length(requested_by) <= 160
  ),
  request_fingerprint text unique check (
    request_fingerprint is null
    or request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  request_payload_hash text check (
    request_payload_hash is null
    or request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  attempts integer not null default 0 check (attempts between 0 and 10),
  claimed_by text,
  claim_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_safe text,
  requested_at timestamptz not null default pg_catalog.now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (status = 'RUNNING'
      and claimed_by is not null
      and pg_catalog.btrim(claimed_by) <> ''
      and claim_token is not null
      and lease_expires_at is not null
      and started_at is not null
      and completed_at is null)
    or
    (status <> 'RUNNING'
      and claimed_by is null
      and claim_token is null
      and lease_expires_at is null)
  ),
  check (
    (status in ('SUCCEEDED', 'FAILED', 'SUPERSEDED') and completed_at is not null)
    or (status in ('PENDING', 'RUNNING') and completed_at is null)
  )
);

create unique index production_net_skins_v1_one_active_job_per_round
  on scoring_authority.net_skins_v1_recalculation_jobs(
    tournament_id, round_number
  ) where status in ('PENDING', 'RUNNING');

create index production_net_skins_v1_claim_queue
  on scoring_authority.net_skins_v1_recalculation_jobs(
    status, requested_at, round_number
  ) where status in ('PENDING', 'RUNNING');

create table scoring_authority.net_skins_v1_result_revisions (
  result_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments(
    tournament_id
  ) on delete restrict,
  round_number integer not null check (round_number between 1 and 99),
  configuration_revision_id uuid not null references
    scoring_authority.net_skins_v1_configuration_revisions(
      configuration_revision_id
    ) on delete restrict,
  configuration_revision bigint not null check (configuration_revision > 0),
  result_revision bigint not null check (result_revision > 0),
  job_id uuid not null unique references
    scoring_authority.net_skins_v1_recalculation_jobs(job_id) on delete restrict,
  engine_version text not null check (engine_version = 'net-skins-js-v1'),
  configuration_fingerprint text not null check (
    configuration_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  source_fingerprint text not null check (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  result_state text not null check (result_state in ('PROVISIONAL', 'OFFICIAL')),
  engine_result_payload jsonb not null check (
    pg_catalog.jsonb_typeof(engine_result_payload) = 'object'
  ),
  public_result_payload jsonb check (
    public_result_payload is null
    or pg_catalog.jsonb_typeof(public_result_payload) = 'object'
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  is_current boolean not null default true,
  calculated_by text not null check (
    pg_catalog.btrim(calculated_by) <> ''
    and pg_catalog.length(calculated_by) <= 160
  ),
  calculated_at timestamptz not null,
  published_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (tournament_id, round_number, result_revision),
  check (
    (result_state = 'OFFICIAL'
      and public_result_payload is not null
      and published_at is not null)
    or
    (result_state = 'PROVISIONAL'
      and public_result_payload is null
      and published_at is null)
  ),
  check (
    (is_current and superseded_at is null)
    or (not is_current and superseded_at is not null)
  )
);

create unique index production_net_skins_v1_one_current_result_per_round
  on scoring_authority.net_skins_v1_result_revisions(
    tournament_id, round_number
  ) where is_current;

create index production_net_skins_v1_result_history
  on scoring_authority.net_skins_v1_result_revisions(
    tournament_id, round_number, result_revision desc
  );

alter table scoring_authority.net_skins_v1_configuration_revisions
  enable row level security;
alter table scoring_authority.net_skins_v1_configuration_current
  enable row level security;
alter table scoring_authority.net_skins_v1_recalculation_jobs
  enable row level security;
alter table scoring_authority.net_skins_v1_result_revisions
  enable row level security;

revoke all on table
  scoring_authority.net_skins_v1_configuration_revisions,
  scoring_authority.net_skins_v1_configuration_current,
  scoring_authority.net_skins_v1_recalculation_jobs,
  scoring_authority.net_skins_v1_result_revisions
  from public, anon, authenticated, service_role;

grant select on table
  scoring_authority.net_skins_v1_configuration_revisions,
  scoring_authority.net_skins_v1_configuration_current,
  scoring_authority.net_skins_v1_recalculation_jobs,
  scoring_authority.net_skins_v1_result_revisions
  to service_role;

create or replace function production_control.net_skins_v1_hash(input jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions
as $$
  select pg_catalog.encode(extensions.digest(input::text, 'sha256'), 'hex')
$$;

revoke all on function production_control.net_skins_v1_hash(jsonb)
  from public, anon, authenticated, service_role;

-- Immutable installation seed. It records the lack of a Production
-- configuration; it does not activate a feature or modify an existing row.
with binding as (
  select
    activation.activation_revision,
    activation.authority_generation_id,
    production_control.net_skins_v1_hash(pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id
    )) as resource_fingerprint
  from production_control.resource_scope resource
  join production_control.cutover_activation_state activation
    on activation.scope_key = resource.scope_key
  where resource.scope_key = 'BAGGER_INV_PRODUCTION'
), inserted as (
  insert into scoring_authority.net_skins_v1_configuration_revisions (
    tournament_id, configuration_revision, contract_version, state,
    publication_policy, configuration_manifest, configuration_fingerprint,
    resource_fingerprint, activation_revision, authority_epoch_id
  )
  select
    '2026', 1, 'production-net-skins-v1', 'NOT_CONFIGURED',
    'OFFICIAL_ONLY',
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'tournament_id', '2026',
      'state', 'NOT_CONFIGURED',
      'publication_policy', 'OFFICIAL_ONLY',
      'rounds', '[]'::jsonb
    ),
    production_control.net_skins_v1_hash(pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'tournament_id', '2026',
      'state', 'NOT_CONFIGURED',
      'publication_policy', 'OFFICIAL_ONLY',
      'rounds', '[]'::jsonb
    )),
    binding.resource_fingerprint,
    binding.activation_revision,
    binding.authority_generation_id
  from binding
  on conflict (tournament_id, configuration_revision) do nothing
  returning configuration_revision_id, configuration_revision, state
), seeded as (
  select configuration_revision_id, configuration_revision, state from inserted
  union all
  select configuration_revision_id, configuration_revision, state
  from scoring_authority.net_skins_v1_configuration_revisions
  where tournament_id = '2026' and configuration_revision = 1
  limit 1
)
insert into scoring_authority.net_skins_v1_configuration_current (
  tournament_id, configuration_revision_id, configuration_revision, state
)
select '2026', configuration_revision_id, configuration_revision, state
from seeded
on conflict (tournament_id) do nothing;

create or replace function production_control.assert_production_net_skins_v1_runtime(
  input jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  expected_activation bigint := coalesce(
    (input->>'expected_activation_revision')::bigint, -1
  );
begin
  perform production_control.assert_production_scoring_runtime(input, null);
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );

  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';

  if expected_activation <> activation.activation_revision then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_ACTIVATION_REVISION_CONFLICT';
  end if;
  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or activation.read_cutover_phase <> 'OBSERVATION'
     or resource.current_tournament_read_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'SUPABASE'
     or resource.participant_identity_authority <> 'SUPABASE'
     or not resource.public_supabase_reads_enabled
     or not resource.scoring_ingress_enabled
     or input->>'vercel_project_id'
        is distinct from 'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'vercel_team_id'
        is distinct from 'team_kPw5zaib8uaQJALAwj4fWI6R'
     or pg_catalog.lower(coalesce(input->>'vercel_environment', ''))
        <> 'production' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_RUNTIME_REQUIRED';
  end if;
end;
$$;

revoke all on function
  production_control.assert_production_net_skins_v1_runtime(jsonb)
  from public, anon, authenticated, service_role;

create or replace function production_control.net_skins_v1_round_source_revision(
  target_tournament_id text,
  target_round_number integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
  select pg_catalog.jsonb_build_object(
    'tournament_id', target_tournament_id,
    'round_number', target_round_number,
    'matches', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'match_id', match_value.match_id,
          'format', match_value.format,
          'status', match_value.status,
          'match_revision', match_value.match_revision,
          'permission_revision', match_value.permission_revision,
          'scored_holes', match_value.scored_holes,
          'scorecard_complete', match_value.scorecard_complete,
          'result_winner', match_value.result_winner,
          'finalized_at', match_value.finalized_at,
          'scoring_snapshot_id', match_value.scoring_snapshot_id,
          'scoring_snapshot_hash', snapshot.canonical_hash,
          'participants', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'player_id', participant.player_id,
                'team_side', participant.team_side,
                'player_slot', participant.player_slot,
                'playing_handicap', participant.playing_handicap,
                'final_strokes', participant.final_strokes
              ) order by participant.team_side, participant.player_slot,
                participant.player_id
            )
            from scoring_authority.match_participants participant
            where participant.match_id = match_value.match_id
          ), '[]'::jsonb)
        ) order by match_value.match_id
      )
      from scoring_authority.matches match_value
      join scoring_authority.scoring_snapshots snapshot
        on snapshot.snapshot_id = match_value.scoring_snapshot_id
      where match_value.tournament_id = target_tournament_id
        and match_value.round_number = target_round_number
    ), '[]'::jsonb),
    'holes', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'match_id', score.match_id,
          'hole_number', score.hole_number,
          'hole_revision', score.hole_revision,
          'team_1_gross_scores', score.team_1_gross_scores,
          'team_2_gross_scores', score.team_2_gross_scores,
          'team_1_strokes', score.team_1_strokes,
          'team_2_strokes', score.team_2_strokes,
          'team_1_net_score', score.team_1_net_score,
          'team_2_net_score', score.team_2_net_score,
          'hole_winner', score.hole_winner
        ) order by score.match_id, score.hole_number
      )
      from scoring_authority.hole_scores score
      join scoring_authority.matches match_value
        on match_value.match_id = score.match_id
      where match_value.tournament_id = target_tournament_id
        and match_value.round_number = target_round_number
    ), '[]'::jsonb)
  )
$$;

revoke all on function
  production_control.net_skins_v1_round_source_revision(text, integer)
  from public, anon, authenticated, service_role;

create or replace function production_control.build_production_net_skins_v1_manifest(
  selected_round_numbers integer[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  round_row scoring_authority.rounds%rowtype;
  match_row record;
  participant_row record;
  side_value integer;
  expected_participants integer;
  participant_count integer;
  stable_participant_count integer;
  hole_count integer;
  team_players text[];
  team_handicap_value numeric;
  entry_value jsonb;
  entries_value jsonb;
  rounds_value jsonb := '[]'::jsonb;
  match_ids_value jsonb;
  round_manifest jsonb;
  format_value text;
  buy_in_value numeric;
  entry_type_value text;
  expected_pot_value numeric;
  selected_count integer;
begin
  if selected_round_numbers is null
     or coalesce(pg_catalog.array_length(selected_round_numbers, 1), 0) = 0
     or exists (
       select 1 from pg_catalog.unnest(selected_round_numbers) value
       where value not between 1 and 99
     )
     or (
       select pg_catalog.count(*)
       from pg_catalog.unnest(selected_round_numbers) value
     ) <> (
       select pg_catalog.count(distinct value)
       from pg_catalog.unnest(selected_round_numbers) value
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ELIGIBLE_ROUNDS_INVALID';
  end if;

  selected_count := pg_catalog.array_length(selected_round_numbers, 1);
  if (
    select pg_catalog.count(*)
    from scoring_authority.rounds value
    where value.tournament_id = '2026'
      and value.round_number = any(selected_round_numbers)
      and value.format in ('BB', 'SC', 'SI')
  ) <> selected_count then
    raise exception using errcode = '23514',
      message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
  end if;

  for round_row in
    select value.*
    from scoring_authority.rounds value
    where value.tournament_id = '2026'
      and value.round_number = any(selected_round_numbers)
    order by value.round_number
  loop
    format_value := round_row.format;
    expected_participants := case format_value
      when 'SI' then 2 else 4 end;
    buy_in_value := case format_value when 'SC' then 50 else 25 end;
    entry_type_value := case format_value
      when 'SC' then 'PAIRING' else 'INDIVIDUAL' end;
    entries_value := '[]'::jsonb;
    match_ids_value := '[]'::jsonb;

    if not exists (
      select 1 from scoring_authority.matches value
      where value.tournament_id = '2026'
        and value.round_number = round_row.round_number
    ) then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
    end if;

    for match_row in
      select
        match_value.*,
        snapshot.team_configuration,
        coalesce(nullif(presentation.display_match_number, ''),
          match_value.match_id) as engine_match_number
      from scoring_authority.matches match_value
      join scoring_authority.scoring_snapshots snapshot
        on snapshot.snapshot_id = match_value.scoring_snapshot_id
       and snapshot.tournament_id = match_value.tournament_id
       and snapshot.match_id = match_value.match_id
      left join scoring_authority.game_center_presentations presentation
        on presentation.match_id = match_value.match_id
       and presentation.tournament_id = match_value.tournament_id
      where match_value.tournament_id = '2026'
        and match_value.round_number = round_row.round_number
      order by match_value.match_id
    loop
      if match_row.format <> format_value then
        raise exception using errcode = '23514',
          message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
      end if;

      select
        pg_catalog.count(*),
        pg_catalog.count(distinct participant.player_id) filter (
          where participant.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
            and exists (
              select 1
              from scoring_authority.tournament_players membership
              where membership.tournament_id = '2026'
                and membership.player_id = participant.player_id
                and membership.participation_status = 'ACTIVE'
            )
        )
        into participant_count, stable_participant_count
      from scoring_authority.match_participants participant
      where participant.match_id = match_row.match_id;

      if participant_count <> expected_participants
         or stable_participant_count <> expected_participants then
        raise exception using errcode = '23514',
          message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
      end if;

      select pg_catalog.count(distinct hole.hole_number) into hole_count
      from scoring_authority.match_holes hole
      where hole.match_id = match_row.match_id
        and hole.hole_number between 1 and 18;
      if hole_count <> 18 then
        raise exception using errcode = '23514',
          message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
      end if;

      match_ids_value := match_ids_value || pg_catalog.jsonb_build_array(
        match_row.match_id
      );

      if format_value = 'SC' then
        for side_value in 1..2 loop
          select pg_catalog.array_agg(participant.player_id order by
              participant.player_slot, participant.player_id)
            into team_players
          from scoring_authority.match_participants participant
          where participant.match_id = match_row.match_id
            and participant.team_side = side_value;
          team_handicap_value := nullif(
            match_row.team_configuration->>
              pg_catalog.format('team_%s_strokes', side_value), ''
          )::numeric;
          if coalesce(pg_catalog.array_length(team_players, 1), 0) <> 2
             or team_handicap_value is null then
            raise exception using errcode = '23514',
              message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
          end if;
          entry_value := pg_catalog.jsonb_build_object(
            'entry_id', pg_catalog.format(
              '2026:R%s:PAIRING:%s:S%s', round_row.round_number,
              match_row.match_id, side_value
            ),
            'entry_type', 'PAIRING',
            'match_id', match_row.match_id,
            'match_number', match_row.engine_match_number,
            'player_ids', pg_catalog.to_jsonb(team_players),
            'player_id_1', team_players[1],
            'player_id_2', team_players[2],
            'team_handicap', team_handicap_value,
            'individual_stroke_allocation', null,
            'buy_in', buy_in_value,
            'eligible', true
          );
          entries_value := entries_value ||
            pg_catalog.jsonb_build_array(entry_value);
        end loop;
      else
        for participant_row in
          select participant.*
          from scoring_authority.match_participants participant
          where participant.match_id = match_row.match_id
          order by participant.team_side, participant.player_slot,
            participant.player_id
        loop
          entry_value := pg_catalog.jsonb_build_object(
            'entry_id', pg_catalog.format(
              '2026:R%s:PLAYER:%s', round_row.round_number,
              participant_row.player_id
            ),
            'entry_type', 'INDIVIDUAL',
            'match_id', match_row.match_id,
            'match_number', match_row.engine_match_number,
            'player_ids', pg_catalog.jsonb_build_array(
              participant_row.player_id
            ),
            'player_id_1', participant_row.player_id,
            'player_id_2', null,
            'team_handicap', null,
            'individual_stroke_allocation',
              participant_row.final_strokes,
            'buy_in', buy_in_value,
            'eligible', true
          );
          entries_value := entries_value ||
            pg_catalog.jsonb_build_array(entry_value);
        end loop;
      end if;
    end loop;

    if pg_catalog.jsonb_array_length(entries_value) = 0
       or (
         select pg_catalog.count(distinct player_id)
         from (
           select pg_catalog.jsonb_array_elements_text(
             entry->'player_ids'
           ) as player_id
           from pg_catalog.jsonb_array_elements(entries_value) entry
         ) player_values
       ) <> (
         select pg_catalog.count(*)
         from (
           select pg_catalog.jsonb_array_elements_text(
             entry->'player_ids'
           ) as player_id
           from pg_catalog.jsonb_array_elements(entries_value) entry
         ) player_values
       ) then
      raise exception using errcode = '23514',
        message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_INCOMPLETE';
    end if;

    expected_pot_value :=
      pg_catalog.jsonb_array_length(entries_value) * buy_in_value;
    round_manifest := pg_catalog.jsonb_build_object(
      'round_id', pg_catalog.format('2026:R%s', round_row.round_number),
      'round_number', round_row.round_number,
      'round_name', round_row.name,
      'format', format_value,
      'entry_type', entry_type_value,
      'buy_in_per_entry', buy_in_value,
      'expected_pot', expected_pot_value,
      'eligible_holes', (
        select pg_catalog.jsonb_agg(value order by value)
        from pg_catalog.generate_series(1, 18) value
      ),
      'net_handicap_basis', case format_value
        when 'SC' then 'CANONICAL_SCORING_SNAPSHOT_TEAM_STROKES'
        else 'CANONICAL_MATCH_PARTICIPANT_FINAL_STROKES' end,
      'completion_rule',
        'ALL_ELIGIBLE_ENTRIES_18_HOLES_AND_REFERENCED_MATCHES_OFFICIAL',
      'payout_rounding', 'NONE',
      'tie_rule', 'NO_SKIN_NO_CARRY',
      'carry_rule', 'NO_CARRY',
      'publication_policy', 'OFFICIAL_ONLY',
      'match_ids', match_ids_value,
      'entries', entries_value
    );
    round_manifest := round_manifest || pg_catalog.jsonb_build_object(
      'configuration_fingerprint',
      production_control.net_skins_v1_hash(round_manifest)
    );
    rounds_value := rounds_value ||
      pg_catalog.jsonb_build_array(round_manifest);
  end loop;

  return pg_catalog.jsonb_build_object(
    'contract_version', 'production-net-skins-v1',
    'tournament_id', '2026',
    'state', 'CONFIGURED',
    'publication_policy', 'OFFICIAL_ONLY',
    'rounds', rounds_value
  );
end;
$$;

revoke all on function
  production_control.build_production_net_skins_v1_manifest(integer[])
  from public, anon, authenticated, service_role;

create or replace function public.configure_production_net_skins_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  existing_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  selected_rounds integer[];
  manifest_value jsonb;
  round_value jsonb;
  entry_value jsonb;
  overall_fingerprint text;
  resource_fingerprint_value text;
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
  payload_hash_value text := production_control.net_skins_v1_hash(input);
  expected_configuration bigint := coalesce(
    (input->>'expected_configuration_revision')::bigint, -1
  );
  actor_player text := pg_catalog.btrim(
    coalesce(input#>>'{authorization,player_id}', '')
  );
  actor_auth_user uuid := nullif(
    input#>>'{authorization,auth_user_id}', ''
  )::uuid;
  response_value jsonb;
  round_count integer := 0;
  entry_count integer := 0;
begin
  perform production_control.assert_production_net_skins_v1_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);

  if input->>'contract_version'
       is distinct from 'production-net-skins-v1'
     or input->>'publication_policy' is distinct from 'OFFICIAL_ONLY'
     or request_fingerprint_value !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(coalesce(
       input->'eligible_round_numbers', 'null'::jsonb
     )) <> 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_INPUT_INVALID';
  end if;

  select value.* into existing_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.request_fingerprint = request_fingerprint_value;
  if found then
    if existing_value.request_payload_hash <> payload_hash_value then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_NET_SKINS_IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',
      'configuration_revision', existing_value.configuration_revision,
      'configuration_fingerprint',
        existing_value.configuration_fingerprint,
      'state', existing_value.state,
      'rounds', existing_value.configuration_manifest->'rounds',
      'idempotent', true
    );
  end if;

  begin
    select pg_catalog.array_agg(value::integer order by value::integer)
      into selected_rounds
    from pg_catalog.jsonb_array_elements_text(
      input->'eligible_round_numbers'
    ) value;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ELIGIBLE_ROUNDS_INVALID';
  end;

  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026'
  for update;

  if activation.activation_revision < 0
     or activation.activation_revision <>
       (input->>'expected_activation_revision')::bigint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_ACTIVATION_REVISION_CONFLICT';
  end if;
  if current_value.configuration_revision <> expected_configuration then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;

  manifest_value :=
    production_control.build_production_net_skins_v1_manifest(selected_rounds);
  overall_fingerprint := production_control.net_skins_v1_hash(manifest_value);
  resource_fingerprint_value := production_control.net_skins_v1_hash(
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'environment', 'PRODUCTION',
      'project_ref', resource.project_ref,
      'project_url', resource.project_url,
      'source_workbook_id', resource.google_workbook_id,
      'tournament_id', resource.current_tournament_id,
      'vercel_project_id', input->>'vercel_project_id',
      'vercel_team_id', input->>'vercel_team_id',
      'vercel_environment', 'production',
      'deployment_commit', activation.expected_deployment_commit,
      'authority_epoch_id', activation.authority_generation_id,
      'activation_revision', activation.activation_revision
    )
  );

  insert into scoring_authority.net_skins_v1_configuration_revisions (
    tournament_id, configuration_revision, contract_version, state,
    publication_policy, configuration_manifest, configuration_fingerprint,
    resource_fingerprint, activation_revision, authority_epoch_id,
    configured_by_player_id, configured_by_auth_user_id,
    request_fingerprint, request_payload_hash, configured_at
  ) values (
    '2026', current_value.configuration_revision + 1,
    'production-net-skins-v1', 'CONFIGURED', 'OFFICIAL_ONLY',
    manifest_value, overall_fingerprint, resource_fingerprint_value,
    activation.activation_revision, activation.authority_generation_id,
    actor_player, actor_auth_user, request_fingerprint_value,
    payload_hash_value, pg_catalog.now()
  ) returning * into revision_value;

  -- Preserve revision history in the immutable V1 ledger while updating the
  -- installed canonical engine-input tables atomically.
  update scoring_authority.net_skins_configurations
  set enabled = false,
      configuration_revision = revision_value.configuration_revision,
      imported_by = actor_player,
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  for round_value in
    select value
    from pg_catalog.jsonb_array_elements(manifest_value->'rounds') value
  loop
    round_count := round_count + 1;
    insert into scoring_authority.net_skins_configurations (
      tournament_id, round_number, format, enabled, entry_type,
      buy_in_per_entry, expected_pot, completion_rule, payout_rounding,
      tie_rule, configuration_revision, configuration_fingerprint,
      source_workbook_id, imported_by, imported_at, approved_at, updated_at
    ) values (
      '2026', (round_value->>'round_number')::integer,
      round_value->>'format', true, round_value->>'entry_type',
      (round_value->>'buy_in_per_entry')::numeric,
      (round_value->>'expected_pot')::numeric,
      round_value->>'completion_rule', round_value->>'payout_rounding',
      round_value->>'tie_rule', revision_value.configuration_revision,
      round_value->>'configuration_fingerprint',
      resource.google_workbook_id, actor_player, pg_catalog.now(),
      pg_catalog.now(), pg_catalog.now()
    ) on conflict (tournament_id, round_number) do update set
      format = excluded.format,
      enabled = true,
      entry_type = excluded.entry_type,
      buy_in_per_entry = excluded.buy_in_per_entry,
      expected_pot = excluded.expected_pot,
      completion_rule = excluded.completion_rule,
      payout_rounding = excluded.payout_rounding,
      tie_rule = excluded.tie_rule,
      configuration_revision = excluded.configuration_revision,
      configuration_fingerprint = excluded.configuration_fingerprint,
      source_workbook_id = excluded.source_workbook_id,
      imported_by = excluded.imported_by,
      imported_at = excluded.imported_at,
      approved_at = excluded.approved_at,
      updated_at = excluded.updated_at;

    delete from scoring_authority.net_skins_configuration_entries
    where tournament_id = '2026'
      and round_number = (round_value->>'round_number')::integer;

    for entry_value in
      select value
      from pg_catalog.jsonb_array_elements(round_value->'entries') value
    loop
      entry_count := entry_count + 1;
      insert into scoring_authority.net_skins_configuration_entries (
        tournament_id, round_number, entry_id, match_number, format,
        player_id_1, player_id_2, team_handicap, buy_in, eligible,
        source_payload, created_at, updated_at
      ) values (
        '2026', (round_value->>'round_number')::integer,
        entry_value->>'entry_id', entry_value->>'match_number',
        round_value->>'format', entry_value->>'player_id_1',
        nullif(entry_value->>'player_id_2', ''),
        nullif(entry_value->>'team_handicap', '')::numeric,
        (entry_value->>'buy_in')::numeric, true,
        pg_catalog.jsonb_build_object(
          'Contract Version', 'production-net-skins-v1',
          'Canonical Match ID', entry_value->>'match_id',
          'Stable Player IDs', entry_value->'player_ids',
          'Eligible Holes', round_value->'eligible_holes',
          'Net Handicap Basis', round_value->>'net_handicap_basis',
          'Individual Stroke Allocation',
            entry_value->'individual_stroke_allocation'
        ),
        pg_catalog.now(), pg_catalog.now()
      );
    end loop;
  end loop;

  update scoring_authority.net_skins_v1_configuration_current
  set configuration_revision_id = revision_value.configuration_revision_id,
      configuration_revision = revision_value.configuration_revision,
      state = 'CONFIGURED',
      updated_at = pg_catalog.now()
  where tournament_id = '2026';

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'SUPERSEDED',
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and status in ('PENDING', 'RUNNING');

  update scoring_authority.net_skins_v1_result_revisions
  set is_current = false,
      superseded_at = pg_catalog.now()
  where tournament_id = '2026' and is_current;

  insert into scoring_authority.net_skins_configuration_import_runs (
    tournament_id, source_workbook_id, configuration_fingerprint,
    status, round_count, entry_count, requested_by, imported_at
  ) values (
    '2026', resource.google_workbook_id, overall_fingerprint,
    'APPLIED', round_count, entry_count, actor_player, pg_catalog.now()
  );

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_NET_SKINS_V1_CONFIGURED', actor_player,
    pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'configuration_revision', revision_value.configuration_revision,
      'configuration_fingerprint', overall_fingerprint,
      'resource_fingerprint', resource_fingerprint_value,
      'round_count', round_count,
      'entry_count', entry_count,
      'publication_policy', 'OFFICIAL_ONLY',
      'authority_changed', false
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_CONFIGURED', 'NET_SKINS', '2026',
    actor_player, request_fingerprint_value, 'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'configuration_revision', revision_value.configuration_revision,
      'configuration_fingerprint', overall_fingerprint,
      'resource_fingerprint', resource_fingerprint_value,
      'round_count', round_count,
      'entry_count', entry_count,
      'publication_policy', 'OFFICIAL_ONLY'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_CONFIGURED',
    'configuration_revision', revision_value.configuration_revision,
    'configuration_fingerprint', overall_fingerprint,
    'state', 'CONFIGURED',
    'rounds', manifest_value->'rounds',
    'idempotent', false
  );
  return response_value;
end;
$$;

revoke all on function public.configure_production_net_skins_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.configure_production_net_skins_v1(jsonb)
  to service_role;

create or replace function production_control.enqueue_production_net_skins_v1_round(
  target_round_number integer,
  reason_value text,
  requested_by_value text
)
returns scoring_authority.net_skins_v1_recalculation_jobs
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  round_value jsonb;
  source_revision_value jsonb;
  source_fingerprint_value text;
begin
  select value.* into current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';
  if not found or current_value.state <> 'CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED';
  end if;
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;
  select value into round_value
  from pg_catalog.jsonb_array_elements(
    revision_value.configuration_manifest->'rounds'
  ) value
  where (value->>'round_number')::integer = target_round_number;
  if not found then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ROUND_NOT_CONFIGURED';
  end if;

  source_revision_value :=
    production_control.net_skins_v1_round_source_revision(
      '2026', target_round_number
    );
  source_fingerprint_value :=
    production_control.net_skins_v1_hash(source_revision_value);

  -- Serialize derived work per round. A score correction may legitimately
  -- restore a prior source fingerprint; historical jobs/results therefore
  -- remain immutable history rather than acting as permanent deduplication
  -- keys. Request receipts provide API idempotency, while the active-job
  -- partial index prevents concurrent work for the round.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format(
        'production-net-skins-v1:enqueue:2026:R%s', target_round_number
      ), 202608290055
    )
  );

  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.tournament_id = '2026'
    and value.round_number = target_round_number
    and value.configuration_revision = current_value.configuration_revision
    and value.source_fingerprint = source_fingerprint_value
    and value.status in ('PENDING', 'RUNNING')
  order by value.requested_at desc, value.job_id desc
  limit 1;
  if found then
    return job_value;
  end if;

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'SUPERSEDED',
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and round_number = target_round_number
    and status in ('PENDING', 'RUNNING');

  insert into scoring_authority.net_skins_v1_recalculation_jobs (
    tournament_id, round_number, configuration_revision_id,
    configuration_revision, configuration_fingerprint, source_revision,
    source_fingerprint, status, reason, requested_by
  ) values (
    '2026', target_round_number,
    revision_value.configuration_revision_id,
    revision_value.configuration_revision,
    round_value->>'configuration_fingerprint', source_revision_value,
    source_fingerprint_value, 'PENDING',
    pg_catalog.left(coalesce(nullif(reason_value, ''),
      'EXPLICIT_RECALCULATION'), 120),
    pg_catalog.left(coalesce(nullif(requested_by_value, ''),
      'production-net-skins-v1'), 160)
  ) returning * into job_value;
  return job_value;
end;
$$;

revoke all on function
  production_control.enqueue_production_net_skins_v1_round(
    integer, text, text
  ) from public, anon, authenticated, service_role;

create or replace function scoring_authority.enqueue_production_net_skins_v1_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  target_match_id text;
  match_value scoring_authority.matches%rowtype;
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  resource production_control.resource_scope%rowtype;
begin
  target_match_id := case when tg_op = 'DELETE'
    then old.match_id else new.match_id end;
  select value.* into match_value
  from scoring_authority.matches value
  where value.match_id = target_match_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select value.* into current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = match_value.tournament_id;
  if not found or current_value.state <> 'CONFIGURED' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if match_value.tournament_id <> '2026'
     or activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or resource.scoring_authority <> 'SUPABASE' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform production_control.enqueue_production_net_skins_v1_round(
    match_value.round_number,
    case when tg_table_name = 'hole_scores'
      then 'CANONICAL_SCORE_CHANGED'
      else 'CANONICAL_MATCH_LIFECYCLE_CHANGED' end,
    'production-net-skins-v1-trigger'
  );
  return case when tg_op = 'DELETE' then old else new end;
exception
  when sqlstate '22023' then
    return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function
  scoring_authority.enqueue_production_net_skins_v1_change()
  from public, anon, authenticated, service_role;

-- Replace the legacy Preview-derived queue hooks in this Production schema.
-- Leaving both trigger sets installed would enqueue an unconsumed legacy job
-- alongside every canonical V1 job after configuration.
drop trigger if exists net_skins_hole_score_recalculation
  on scoring_authority.hole_scores;
drop trigger if exists net_skins_match_lifecycle_recalculation
  on scoring_authority.matches;

create trigger production_net_skins_v1_hole_score_recalculation
after insert or update or delete on scoring_authority.hole_scores
for each row execute function
  scoring_authority.enqueue_production_net_skins_v1_change();

create trigger production_net_skins_v1_match_lifecycle_recalculation
after update of status, finalized_at, match_revision, scorecard_complete
on scoring_authority.matches
for each row execute function
  scoring_authority.enqueue_production_net_skins_v1_change();

create or replace function public.enqueue_production_net_skins_v1_recalculation(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  existing_response jsonb;
  response_value jsonb;
  jobs_value jsonb := '[]'::jsonb;
  round_numbers integer[];
  round_number_value integer;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  expected_configuration bigint := coalesce(
    (input->>'expected_configuration_revision')::bigint, -1
  );
  request_fingerprint_value text := pg_catalog.lower(
    coalesce(input->>'request_fingerprint', '')
  );
begin
  perform production_control.assert_production_net_skins_v1_runtime(input);
  existing_response := production_control.lookup_cutover_receipt(
    'NET_SKINS_V1_ENQUEUE', input
  );
  if existing_response is not null then return existing_response; end if;
  if request_fingerprint_value !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_REQUEST_FINGERPRINT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026'
  for update;
  if current_value.state <> 'CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED';
  end if;
  if current_value.configuration_revision <> expected_configuration then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;

  if input ? 'round_numbers' then
    if pg_catalog.jsonb_typeof(input->'round_numbers') <> 'array' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_ROUNDS_INVALID';
    end if;
    begin
      select pg_catalog.array_agg(value::integer order by value::integer)
        into round_numbers
      from pg_catalog.jsonb_array_elements_text(input->'round_numbers') value;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_ROUNDS_INVALID';
    end;
  else
    select pg_catalog.array_agg(
      (value->>'round_number')::integer
      order by (value->>'round_number')::integer
    ) into round_numbers
    from pg_catalog.jsonb_array_elements(
      revision_value.configuration_manifest->'rounds'
    ) value;
  end if;
  if round_numbers is null
     or coalesce(pg_catalog.array_length(round_numbers, 1), 0) = 0
     or (
       select pg_catalog.count(*)
       from pg_catalog.unnest(round_numbers) value
     ) <> (
       select pg_catalog.count(distinct value)
       from pg_catalog.unnest(round_numbers) value
     ) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_ROUNDS_INVALID';
  end if;

  foreach round_number_value in array round_numbers loop
    job_value := production_control.enqueue_production_net_skins_v1_round(
      round_number_value,
      pg_catalog.left(coalesce(nullif(input->>'reason', ''),
        'EXPLICIT_RECALCULATION'), 120),
      pg_catalog.left(coalesce(nullif(input->>'requested_by', ''),
        'production-net-skins-v1'), 160)
    );
    jobs_value := jobs_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'job_id', job_value.job_id,
        'round_number', job_value.round_number,
        'status', job_value.status,
        'source_fingerprint', job_value.source_fingerprint
      )
    );
  end loop;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_ENQUEUED',
    'configuration_revision', current_value.configuration_revision,
    'jobs', jobs_value,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'NET_SKINS_V1_ENQUEUE', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.enqueue_production_net_skins_v1_recalculation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.enqueue_production_net_skins_v1_recalculation(jsonb)
  to service_role;

create or replace function public.claim_production_net_skins_v1_recalculation(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  calculation_input jsonb;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  lease_seconds_value integer := pg_catalog.least(300, pg_catalog.greatest(
    15, coalesce((input->>'lease_seconds')::integer, 60)
  ));
  current_source jsonb;
  current_source_fingerprint text;
  expected_result_revision bigint;
  claim_token_value uuid;
begin
  perform production_control.assert_production_net_skins_v1_runtime(input);
  existing_response := production_control.lookup_cutover_receipt(
    'NET_SKINS_V1_CLAIM', input
  );
  if existing_response is not null then return existing_response; end if;
  if worker_value = '' or pg_catalog.length(worker_value) > 160 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_WORKER_ID_REQUIRED';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';
  if current_value.state <> 'CONFIGURED' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REQUIRED';
  end if;
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = case when attempts >= 5 then 'FAILED' else 'PENDING' end,
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = case when attempts >= 5
        then pg_catalog.now() else null end,
      last_error_code = case when attempts >= 5
        then 'PRODUCTION_NET_SKINS_LEASE_EXHAUSTED' else null end,
      last_error_safe = case when attempts >= 5
        then 'Net Skins recalculation is temporarily unavailable.' else null end,
      updated_at = pg_catalog.now()
  where tournament_id = '2026'
    and configuration_revision = current_value.configuration_revision
    and status = 'RUNNING'
    and lease_expires_at <= pg_catalog.now();

  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.tournament_id = '2026'
    and value.configuration_revision = current_value.configuration_revision
    and value.status = 'PENDING'
    and value.attempts < 5
  order by value.requested_at, value.round_number
  for update skip locked
  limit 1;

  if not found then
    response_value := pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_EMPTY',
      'job', null,
      'calculation_input', null,
      'idempotent', false
    );
    perform production_control.store_cutover_receipt(
      'NET_SKINS_V1_CLAIM', input, response_value
    );
    return response_value;
  end if;

  current_source := production_control.net_skins_v1_round_source_revision(
    '2026', job_value.round_number
  );
  current_source_fingerprint :=
    production_control.net_skins_v1_hash(current_source);
  if current_source_fingerprint <> job_value.source_fingerprint then
    update scoring_authority.net_skins_v1_recalculation_jobs
    set status = 'SUPERSEDED', completed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where job_id = job_value.job_id;
    job_value := production_control.enqueue_production_net_skins_v1_round(
      job_value.round_number, 'SOURCE_ADVANCED_BEFORE_CLAIM', worker_value
    );
    select value.* into job_value
    from scoring_authority.net_skins_v1_recalculation_jobs value
    where value.job_id = job_value.job_id
    for update;
  end if;

  claim_token_value := extensions.gen_random_uuid();
  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'RUNNING',
      attempts = attempts + 1,
      claimed_by = worker_value,
      claim_token = claim_token_value,
      lease_expires_at = pg_catalog.now()
        + pg_catalog.make_interval(secs => lease_seconds_value),
      started_at = pg_catalog.now(),
      completed_at = null,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id
  returning * into job_value;

  select coalesce(pg_catalog.max(value.result_revision), 0)
    into expected_result_revision
  from scoring_authority.net_skins_v1_result_revisions value
  where value.tournament_id = '2026'
    and value.round_number = job_value.round_number;

  calculation_input := public.read_net_skins_input_view('2026');
  if coalesce((calculation_input->>'ok')::boolean, false) is not true then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_CANONICAL_INPUT_UNAVAILABLE';
  end if;

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_CLAIMED',
    'job', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'configuration_fingerprint', job_value.configuration_fingerprint,
      'source_fingerprint', job_value.source_fingerprint,
      'claim_token', job_value.claim_token,
      'lease_expires_at', job_value.lease_expires_at,
      'expected_result_revision', expected_result_revision
    ),
    'calculation_input', calculation_input->'data',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'NET_SKINS_V1_CLAIM', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.claim_production_net_skins_v1_recalculation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.claim_production_net_skins_v1_recalculation(jsonb)
  to service_role;

create or replace function production_control.normalize_production_net_skins_v1_official_result(
  target_round_number integer,
  engine_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  round_value jsonb;
  skin_value jsonb;
  leaderboard_value jsonb;
  entry_row scoring_authority.net_skins_configuration_entries%rowtype;
  winner_id_1 text;
  winner_id_2 text;
  target_entry_id text;
  hole_number_value integer;
  normalized_skins jsonb := '[]'::jsonb;
  normalized_leaderboard jsonb := '[]'::jsonb;
  configured_entry_count integer;
  normalized_skin_count integer := 0;
  normalized_leader_count integer := 0;
  expected_pot_value numeric;
  seen_holes integer[] := '{}'::integer[];
begin
  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;
  select value into strict round_value
  from pg_catalog.jsonb_array_elements(
    revision_value.configuration_manifest->'rounds'
  ) value
  where (value->>'round_number')::integer = target_round_number;

  configured_entry_count := pg_catalog.jsonb_array_length(
    round_value->'entries'
  );
  expected_pot_value := (round_value->>'expected_pot')::numeric;
  if pg_catalog.jsonb_typeof(engine_payload) <> 'object'
     or coalesce((engine_payload->>'round')::integer, 0) <>
       target_round_number
     or engine_payload->>'format' is distinct from round_value->>'format'
     or coalesce((engine_payload->>'complete')::boolean, false) is not true
     or coalesce((engine_payload->>'finalized')::boolean, false) is not true
     or coalesce((engine_payload->>'completedHoles')::integer, -1) <> 18
     or coalesce((engine_payload->>'eligibleCount')::integer, -1) <>
       configured_entry_count
     or coalesce((engine_payload->>'pot')::numeric, -1) <>
       expected_pot_value
     or pg_catalog.jsonb_typeof(coalesce(
       engine_payload->'skins', 'null'::jsonb
     )) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(
       engine_payload->'leaderboard', 'null'::jsonb
     )) <> 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
  end if;

  if exists (
    select 1
    from (
      select distinct entry->>'match_id' as match_id
      from pg_catalog.jsonb_array_elements(round_value->'entries') entry
    ) configured_match
    left join scoring_authority.matches match_value
      on match_value.match_id = configured_match.match_id
     and match_value.tournament_id = '2026'
     and match_value.round_number = target_round_number
    where match_value.match_id is null
       or match_value.status <> 'FINAL'
       or not match_value.scorecard_complete
       or match_value.scored_holes <> 18
       or match_value.finalized_at is null
       or pg_catalog.btrim(match_value.result_winner) = ''
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_NET_SKINS_REFERENCED_MATCHES_NOT_OFFICIAL';
  end if;

  for skin_value in
    select value
    from pg_catalog.jsonb_array_elements(engine_payload->'skins') value
    order by (value->>'hole')::integer
  loop
    begin
      hole_number_value := (skin_value->>'hole')::integer;
    exception when others then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end;
    if hole_number_value not between 1 and 18
       or hole_number_value = any(seen_holes) then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end if;
    seen_holes := pg_catalog.array_append(seen_holes, hole_number_value);
    winner_id_1 := pg_catalog.btrim(coalesce(
      skin_value->>'winnerPlayerId', ''
    ));
    winner_id_2 := pg_catalog.btrim(coalesce(
      skin_value->>'winnerPlayerId2', ''
    ));
    if winner_id_1 = '' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end if;

    select value.* into entry_row
    from scoring_authority.net_skins_configuration_entries value
    where value.tournament_id = '2026'
      and value.round_number = target_round_number
      and value.eligible
      and (
        (value.format <> 'SC'
          and value.player_id_1 = winner_id_1
          and winner_id_2 = '')
        or
        (value.format = 'SC'
          and pg_catalog.least(value.player_id_1, value.player_id_2) =
            pg_catalog.least(winner_id_1, winner_id_2)
          and pg_catalog.greatest(value.player_id_1, value.player_id_2) =
            pg_catalog.greatest(winner_id_1, winner_id_2))
      );
    if not found then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end if;
    target_entry_id := entry_row.entry_id;
    normalized_skin_count := normalized_skin_count + 1;
    normalized_skins := normalized_skins || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'skin_id', pg_catalog.format(
          '2026:R%s:H%s', target_round_number, hole_number_value
        ),
        'hole_number', hole_number_value,
        'match_id', entry_row.source_payload->>'Canonical Match ID',
        'winner_entry_id', target_entry_id,
        'winner_player_ids', case when entry_row.player_id_2 is null
          then pg_catalog.jsonb_build_array(entry_row.player_id_1)
          else pg_catalog.jsonb_build_array(
            entry_row.player_id_1, entry_row.player_id_2
          ) end,
        'winning_net_score', (skin_value->>'winningNetScore')::numeric,
        'skin_value', (skin_value->>'skinValue')::numeric
      )
    );
  end loop;

  if normalized_skin_count <>
       coalesce((engine_payload->>'skinsAwarded')::integer, -1) then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
  end if;

  for leaderboard_value in
    select value
    from pg_catalog.jsonb_array_elements(engine_payload->'leaderboard') value
    order by (value->>'rank')::integer, value->>'id'
  loop
    target_entry_id := pg_catalog.btrim(coalesce(
      leaderboard_value->>'id', ''
    ));
    select value.* into entry_row
    from scoring_authority.net_skins_configuration_entries value
    where value.tournament_id = '2026'
      and value.round_number = target_round_number
      and value.entry_id = target_entry_id
      and value.eligible;
    if not found then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
    end if;
    normalized_leader_count := normalized_leader_count + 1;
    normalized_leaderboard := normalized_leaderboard ||
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'rank', (leaderboard_value->>'rank')::integer,
        'display_rank', coalesce(leaderboard_value->>'displayRank', ''),
        'entry_id', entry_row.entry_id,
        'player_ids', case when entry_row.player_id_2 is null
          then pg_catalog.jsonb_build_array(entry_row.player_id_1)
          else pg_catalog.jsonb_build_array(
            entry_row.player_id_1, entry_row.player_id_2
          ) end,
        'skins_won', (leaderboard_value->>'skinsWon')::integer,
        'total_winnings', (leaderboard_value->>'totalWinnings')::numeric,
        'winning_hole_numbers', coalesce((
          select pg_catalog.jsonb_agg(
            (skin->>'hole_number')::integer
            order by (skin->>'hole_number')::integer
          )
          from pg_catalog.jsonb_array_elements(normalized_skins) skin
          where skin->>'winner_entry_id' = entry_row.entry_id
        ), '[]'::jsonb)
      ));
  end loop;

  if normalized_leader_count <> configured_entry_count then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
  end if;

  return pg_catalog.jsonb_build_object(
    'pot', (engine_payload->>'pot')::numeric,
    'eligible_count', (engine_payload->>'eligibleCount')::integer,
    'completed_holes', (engine_payload->>'completedHoles')::integer,
    'skins_awarded', (engine_payload->>'skinsAwarded')::integer,
    'skin_value', (engine_payload->>'skinValue')::numeric,
    'complete', true,
    'finalized', true,
    'skins', normalized_skins,
    'leaderboard', normalized_leaderboard
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023',
    message = 'PRODUCTION_NET_SKINS_OFFICIAL_RESULT_INVALID';
end;
$$;

revoke all on function
  production_control.normalize_production_net_skins_v1_official_result(
    integer, jsonb
  ) from public, anon, authenticated, service_role;

create or replace function public.complete_production_net_skins_v1_recalculation(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  result_value scoring_authority.net_skins_v1_result_revisions%rowtype;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  result_state_value text := pg_catalog.upper(coalesce(
    input->>'result_state', ''
  ));
  result_payload_value jsonb := input->'result_payload';
  normalized_result_value jsonb;
  payload_hash_value text;
  current_source_value jsonb;
  current_source_fingerprint text;
  current_result_revision bigint;
  expected_result_revision bigint := coalesce(
    (input->>'expected_result_revision')::bigint, -1
  );
begin
  perform production_control.assert_production_net_skins_v1_runtime(input);
  existing_response := production_control.lookup_cutover_receipt(
    'NET_SKINS_V1_COMPLETE', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or input->>'engine_version' is distinct from 'net-skins-js-v1'
     or result_state_value not in ('PROVISIONAL', 'OFFICIAL')
     or pg_catalog.jsonb_typeof(coalesce(
       result_payload_value, 'null'::jsonb
     )) <> 'object' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_COMPLETION_INPUT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026'
  for update;
  if current_value.state <> 'CONFIGURED'
     or current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;
  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.job_id = job_id_value
  for update;
  if not found
     or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.now() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_JOB_LEASE_REQUIRED';
  end if;
  if input->>'source_fingerprint'
       is distinct from job_value.source_fingerprint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';
  end if;

  current_source_value :=
    production_control.net_skins_v1_round_source_revision(
      '2026', job_value.round_number
    );
  current_source_fingerprint :=
    production_control.net_skins_v1_hash(current_source_value);
  if current_source_fingerprint <> job_value.source_fingerprint then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_SOURCE_REVISION_CONFLICT';
  end if;
  if coalesce((result_payload_value->>'round')::integer, 0) <>
       job_value.round_number then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_RESULT_ROUND_MISMATCH';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('production-net-skins-v1:2026:R%s',
        job_value.round_number), 202608290055
    )
  );
  select coalesce(pg_catalog.max(value.result_revision), 0)
    into current_result_revision
  from scoring_authority.net_skins_v1_result_revisions value
  where value.tournament_id = '2026'
    and value.round_number = job_value.round_number;
  if current_result_revision <> expected_result_revision then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_RESULT_REVISION_CONFLICT';
  end if;

  if result_state_value = 'OFFICIAL' then
    normalized_result_value :=
      production_control.normalize_production_net_skins_v1_official_result(
        job_value.round_number, result_payload_value
      );
  else
    normalized_result_value := null;
    if pg_catalog.jsonb_typeof(coalesce(
         result_payload_value->'skins', 'null'::jsonb
       )) <> 'array'
       or pg_catalog.jsonb_typeof(coalesce(
         result_payload_value->'leaderboard', 'null'::jsonb
       )) <> 'array' then
      raise exception using errcode = '22023',
        message = 'PRODUCTION_NET_SKINS_PROVISIONAL_RESULT_INVALID';
    end if;
  end if;
  payload_hash_value := production_control.net_skins_v1_hash(
    result_payload_value
  );

  update scoring_authority.net_skins_v1_result_revisions
  set is_current = false, superseded_at = pg_catalog.now()
  where tournament_id = '2026'
    and round_number = job_value.round_number
    and is_current;

  insert into scoring_authority.net_skins_v1_result_revisions (
    tournament_id, round_number, configuration_revision_id,
    configuration_revision, result_revision, job_id, engine_version,
    configuration_fingerprint, source_fingerprint, result_state,
    engine_result_payload, public_result_payload, payload_hash, is_current,
    calculated_by, calculated_at, published_at
  ) values (
    '2026', job_value.round_number,
    job_value.configuration_revision_id,
    job_value.configuration_revision, current_result_revision + 1,
    job_value.job_id, 'net-skins-js-v1',
    job_value.configuration_fingerprint, job_value.source_fingerprint,
    result_state_value, result_payload_value, normalized_result_value,
    payload_hash_value, true, worker_value, pg_catalog.now(),
    case when result_state_value = 'OFFICIAL'
      then pg_catalog.now() else null end
  ) returning * into result_value;

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'SUCCEEDED',
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = pg_catalog.now(),
      last_error_code = null,
      last_error_safe = null,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id;

  insert into scoring_authority.audit_events (
    tournament_id, action, actor_id, metadata
  ) values (
    '2026', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED',
    worker_value, pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'result_revision', result_value.result_revision,
      'result_state', result_state_value,
      'source_fingerprint', job_value.source_fingerprint,
      'payload_hash', payload_hash_value,
      'published', result_state_value = 'OFFICIAL'
    )
  );
  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED', 'NET_SKINS',
    '2026', worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'SUCCEEDED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'result_revision', result_value.result_revision,
      'result_state', result_state_value,
      'published', result_state_value = 'OFFICIAL'
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED',
    'job_id', job_value.job_id,
    'round_number', job_value.round_number,
    'configuration_revision', job_value.configuration_revision,
    'result_revision', result_value.result_revision,
    'result_state', result_state_value,
    'published', result_state_value = 'OFFICIAL',
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'NET_SKINS_V1_COMPLETE', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.complete_production_net_skins_v1_recalculation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.complete_production_net_skins_v1_recalculation(jsonb)
  to service_role;

create or replace function public.fail_production_net_skins_v1_recalculation(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  existing_response jsonb;
  response_value jsonb;
  job_id_value uuid := nullif(input->>'job_id', '')::uuid;
  claim_token_value uuid := nullif(input->>'claim_token', '')::uuid;
  worker_value text := pg_catalog.btrim(coalesce(input->>'worker_id', ''));
  error_code_value text := pg_catalog.upper(pg_catalog.left(
    coalesce(nullif(input->>'error_code', ''),
      'PRODUCTION_NET_SKINS_CALCULATION_FAILED'), 120
  ));
  error_safe_value text := pg_catalog.left(coalesce(
    nullif(input->>'error_safe', ''),
    'Net Skins recalculation is temporarily unavailable.'
  ), 300);
begin
  perform production_control.assert_production_net_skins_v1_runtime(input);
  existing_response := production_control.lookup_cutover_receipt(
    'NET_SKINS_V1_FAIL', input
  );
  if existing_response is not null then return existing_response; end if;
  if job_id_value is null or claim_token_value is null or worker_value = ''
     or error_code_value !~ '^[A-Z0-9_:-]{3,120}$' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_NET_SKINS_FAILURE_INPUT_INVALID';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';
  if current_value.configuration_revision <>
       coalesce((input->>'expected_configuration_revision')::bigint, -1) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_NET_SKINS_CONFIGURATION_REVISION_CONFLICT';
  end if;
  select value.* into job_value
  from scoring_authority.net_skins_v1_recalculation_jobs value
  where value.job_id = job_id_value
  for update;
  if not found
     or job_value.status <> 'RUNNING'
     or job_value.configuration_revision <>
       current_value.configuration_revision
     or job_value.claim_token <> claim_token_value
     or job_value.claimed_by <> worker_value
     or job_value.lease_expires_at <= pg_catalog.now() then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_JOB_LEASE_REQUIRED';
  end if;

  update scoring_authority.net_skins_v1_recalculation_jobs
  set status = 'FAILED',
      claimed_by = null,
      claim_token = null,
      lease_expires_at = null,
      completed_at = pg_catalog.now(),
      last_error_code = error_code_value,
      last_error_safe = error_safe_value,
      updated_at = pg_catalog.now()
  where job_id = job_value.job_id;

  insert into production_control.operation_audit_events (
    event_type, domain, tournament_id, actor, request_fingerprint,
    result, details
  ) values (
    'PRODUCTION_NET_SKINS_V1_RECALCULATION_FAILED', 'NET_SKINS',
    '2026', worker_value, pg_catalog.lower(input->>'request_fingerprint'),
    'FAILED', pg_catalog.jsonb_build_object(
      'job_id', job_value.job_id,
      'round_number', job_value.round_number,
      'configuration_revision', job_value.configuration_revision,
      'error_code', error_code_value
    )
  );

  response_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_NET_SKINS_V1_RECALCULATION_FAILED',
    'job_id', job_value.job_id,
    'round_number', job_value.round_number,
    'configuration_revision', job_value.configuration_revision,
    'idempotent', false
  );
  perform production_control.store_cutover_receipt(
    'NET_SKINS_V1_FAIL', input, response_value
  );
  return response_value;
end;
$$;

revoke all on function
  public.fail_production_net_skins_v1_recalculation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.fail_production_net_skins_v1_recalculation(jsonb)
  to service_role;

create or replace function public.read_production_net_skins_v1(input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  revision_value scoring_authority.net_skins_v1_configuration_revisions%rowtype;
  round_value jsonb;
  job_value scoring_authority.net_skins_v1_recalculation_jobs%rowtype;
  result_value scoring_authority.net_skins_v1_result_revisions%rowtype;
  source_revision_value jsonb;
  source_fingerprint_value text;
  source_fingerprints_value jsonb := '{}'::jsonb;
  entries_value jsonb;
  eligible_players_value jsonb;
  rounds_value jsonb := '[]'::jsonb;
  round_state text;
  top_state text := 'CONFIGURED';
  round_stale boolean;
  any_unavailable boolean := false;
  any_in_progress boolean := false;
  all_official boolean := true;
  max_result_revision bigint := 0;
  max_calculated_at timestamptz;
  max_published_at timestamptz;
  top_source_fingerprint text;
  revision_token text;
begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );
  if pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'tournament_id' is distinct from '2026' then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_NET_SKINS_RESOURCE_ASSERTION_FAILED';
  end if;

  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';
  select value.* into strict revision_value
  from scoring_authority.net_skins_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;

  if current_value.state = 'NOT_CONFIGURED' then
    revision_token := pg_catalog.format(
      'net-skins-v1:%s:0:NOT_CONFIGURED',
      current_value.configuration_revision
    );
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'data', pg_catalog.jsonb_build_object(
        'contract_version', 'production-net-skins-v1',
        'tournament_id', '2026',
        'state', 'NOT_CONFIGURED',
        'publication_policy', 'OFFICIAL_ONLY',
        'configuration_revision', current_value.configuration_revision,
        'result_revision', null,
        'configuration_fingerprint', null,
        'revision', revision_token,
        'freshness', pg_catalog.jsonb_build_object(
          'stale', false,
          'configured_at', null,
          'calculated_at', null,
          'published_at', null,
          'source_fingerprint', null
        ),
        'rounds', '[]'::jsonb
      )
    );
  end if;

  for round_value in
    select value
    from pg_catalog.jsonb_array_elements(
      revision_value.configuration_manifest->'rounds'
    ) value
    order by (value->>'round_number')::integer
  loop
    source_revision_value :=
      production_control.net_skins_v1_round_source_revision(
        '2026', (round_value->>'round_number')::integer
      );
    source_fingerprint_value :=
      production_control.net_skins_v1_hash(source_revision_value);
    source_fingerprints_value := source_fingerprints_value ||
      pg_catalog.jsonb_build_object(
        round_value->>'round_number', source_fingerprint_value
      );

    job_value := null;
    select value.* into job_value
    from scoring_authority.net_skins_v1_recalculation_jobs value
    where value.tournament_id = '2026'
      and value.round_number = (round_value->>'round_number')::integer
      and value.configuration_revision =
        current_value.configuration_revision
    order by value.requested_at desc, value.job_id desc
    limit 1;

    result_value := null;
    select value.* into result_value
    from scoring_authority.net_skins_v1_result_revisions value
    where value.tournament_id = '2026'
      and value.round_number = (round_value->>'round_number')::integer
      and value.configuration_revision =
        current_value.configuration_revision
      and value.is_current
    limit 1;

    if result_value.result_id is not null
       and result_value.result_state = 'OFFICIAL'
       and result_value.source_fingerprint = source_fingerprint_value then
      round_state := 'OFFICIAL';
      round_stale := false;
    elsif job_value.job_id is not null
       and job_value.source_fingerprint = source_fingerprint_value
       and job_value.status = 'FAILED' then
      round_state := 'UNAVAILABLE';
      round_stale := true;
    elsif job_value.job_id is not null
       and job_value.source_fingerprint = source_fingerprint_value
       and job_value.status in ('PENDING', 'RUNNING') then
      round_state := 'IN_PROGRESS';
      round_stale := true;
    elsif result_value.result_id is not null
       and result_value.result_state = 'PROVISIONAL'
       and result_value.source_fingerprint = source_fingerprint_value then
      round_state := 'IN_PROGRESS';
      round_stale := true;
    elsif exists (
      select 1
      from scoring_authority.matches match_value
      where match_value.tournament_id = '2026'
        and match_value.round_number =
          (round_value->>'round_number')::integer
        and (match_value.status <> 'UPCOMING'
          or match_value.scored_holes > 0)
    ) then
      round_state := 'IN_PROGRESS';
      round_stale := true;
    else
      round_state := 'CONFIGURED';
      round_stale := false;
    end if;

    entries_value := coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'entry_id', entry->>'entry_id',
          'entry_type', entry->>'entry_type',
          'match_id', entry->>'match_id',
          'player_ids', entry->'player_ids'
        ) order by entry->>'entry_id'
      )
      from pg_catalog.jsonb_array_elements(round_value->'entries') entry
      where coalesce((entry->>'eligible')::boolean, false)
    ), '[]'::jsonb);
    eligible_players_value := coalesce((
      select pg_catalog.jsonb_agg(player_id order by player_id)
      from (
        select distinct pg_catalog.jsonb_array_elements_text(
          entry->'player_ids'
        ) as player_id
        from pg_catalog.jsonb_array_elements(round_value->'entries') entry
        where coalesce((entry->>'eligible')::boolean, false)
      ) player_values
    ), '[]'::jsonb);

    any_unavailable := any_unavailable or round_state = 'UNAVAILABLE';
    any_in_progress := any_in_progress or round_state = 'IN_PROGRESS';
    all_official := all_official and round_state = 'OFFICIAL';
    max_result_revision := pg_catalog.greatest(
      max_result_revision, coalesce(result_value.result_revision, 0)
    );
    if result_value.calculated_at is not null
       and (max_calculated_at is null
         or result_value.calculated_at > max_calculated_at) then
      max_calculated_at := result_value.calculated_at;
    end if;
    if result_value.published_at is not null
       and (max_published_at is null
         or result_value.published_at > max_published_at) then
      max_published_at := result_value.published_at;
    end if;

    rounds_value := rounds_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'round_id', round_value->>'round_id',
        'round_number', (round_value->>'round_number')::integer,
        'format', round_value->>'format',
        'entry_type', round_value->>'entry_type',
        'buy_in_per_entry', (round_value->>'buy_in_per_entry')::numeric,
        'eligible_entry_count', pg_catalog.jsonb_array_length(entries_value),
        'eligible_player_ids', eligible_players_value,
        'match_ids', round_value->'match_ids',
        'entries', entries_value,
        'state', round_state,
        'configuration_revision', current_value.configuration_revision,
        'result_revision', case when result_value.result_id is null
          then null else result_value.result_revision end,
        'configuration_fingerprint',
          round_value->>'configuration_fingerprint',
        'freshness', pg_catalog.jsonb_build_object(
          'stale', round_stale,
          'calculated_at', result_value.calculated_at,
          'published_at', case when round_state = 'OFFICIAL'
            then result_value.published_at else null end,
          'source_fingerprint', source_fingerprint_value
        ),
        'result_payload', case when round_state = 'OFFICIAL'
          then result_value.engine_result_payload else null end,
        'official_results', case when round_state = 'OFFICIAL'
          then result_value.public_result_payload else null end
      )
    );
  end loop;

  top_state := case
    when any_unavailable then 'UNAVAILABLE'
    when all_official and pg_catalog.jsonb_array_length(rounds_value) > 0
      then 'OFFICIAL'
    when any_in_progress
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(rounds_value) value
        where value->>'state' = 'OFFICIAL'
      ) then 'IN_PROGRESS'
    else 'CONFIGURED'
  end;
  top_source_fingerprint := production_control.net_skins_v1_hash(
    source_fingerprints_value
  );
  revision_token := pg_catalog.format(
    'net-skins-v1:%s:%s:%s',
    current_value.configuration_revision,
    max_result_revision,
    top_state
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-net-skins-v1',
      'tournament_id', '2026',
      'state', top_state,
      'publication_policy', 'OFFICIAL_ONLY',
      'configuration_revision', current_value.configuration_revision,
      'result_revision', case when max_result_revision = 0
        then null else max_result_revision end,
      'configuration_fingerprint',
        revision_value.configuration_fingerprint,
      'revision', revision_token,
      'freshness', pg_catalog.jsonb_build_object(
        'stale', any_unavailable or any_in_progress,
        'configured_at', revision_value.configured_at,
        'calculated_at', max_calculated_at,
        'published_at', max_published_at,
        'source_fingerprint', top_source_fingerprint
      ),
      'rounds', rounds_value
    )
  );
end;
$$;

revoke all on function public.read_production_net_skins_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_net_skins_v1(jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
