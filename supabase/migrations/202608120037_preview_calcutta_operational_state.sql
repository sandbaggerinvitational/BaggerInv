-- Preview-only Calcutta configuration projection and operational result.
-- Google remains the Director auction/configuration workspace. The existing
-- JavaScript engine remains the sole business-calculation owner.

create table scoring_authority.calcutta_configuration_import_runs (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  source_workbook_id text not null,
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('APPLIED', 'NO_CHANGE', 'REJECTED')),
  purchase_count integer not null default 0,
  ownership_count integer not null default 0,
  total_market_value numeric(14,2) not null default 0,
  requested_by text not null,
  imported_at timestamptz not null default now()
);

create index calcutta_configuration_import_runs_scope_idx
  on scoring_authority.calcutta_configuration_import_runs (tournament_id, imported_at desc);

create table scoring_authority.calcutta_configurations (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  tournament_year integer not null check (tournament_year between 2000 and 2200),
  configuration_revision bigint not null check (configuration_revision > 0),
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  purchases jsonb not null check (jsonb_typeof(purchases) = 'array'),
  ownership jsonb not null check (jsonb_typeof(ownership) = 'array'),
  point_structure jsonb not null check (jsonb_typeof(point_structure) = 'array'),
  payout_structure jsonb not null check (jsonb_typeof(payout_structure) = 'array'),
  financial_contract jsonb not null check (jsonb_typeof(financial_contract) = 'object'),
  source_workbook_id text not null,
  status text not null default 'APPROVED' check (status in ('APPROVED', 'SUPERSEDED')),
  is_current boolean not null default true,
  imported_by text not null,
  imported_at timestamptz not null default now(),
  approved_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (tournament_id, configuration_revision)
);
create index if not exists calcutta_configurations_fingerprint_idx
  on scoring_authority.calcutta_configurations (tournament_id, configuration_fingerprint);

create unique index calcutta_configurations_current_idx
  on scoring_authority.calcutta_configurations (tournament_id) where is_current;
create index calcutta_configurations_history_idx
  on scoring_authority.calcutta_configurations (tournament_id, configuration_revision desc);

alter table scoring_authority.calcutta_configuration_import_runs enable row level security;
alter table scoring_authority.calcutta_configurations enable row level security;
revoke all on scoring_authority.calcutta_configuration_import_runs from public, anon, authenticated;
revoke all on scoring_authority.calcutta_configurations from public, anon, authenticated;
grant select, insert, update, delete on scoring_authority.calcutta_configuration_import_runs to service_role;
grant select, insert, update, delete on scoring_authority.calcutta_configurations to service_role;

create or replace function scoring_authority.enqueue_calcutta_job(
  target_tournament text,
  reason_value text,
  revision_value jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
begin
  insert into scoring_authority.competition_recalculation_jobs (
    tournament_id, round_number, engine_key, status, requested_source_revision,
    requested_at, updated_at
  ) values (
    target_tournament, 0, 'CALCUTTA', 'PENDING',
    jsonb_build_object('reason', reason_value, 'revision', coalesce(revision_value, '{}'::jsonb)),
    now(), now()
  ) on conflict (tournament_id, round_number, engine_key) do update set
    status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
    requested_at = now(), started_at = null, completed_at = null,
    last_error_code = null, last_error_safe = null, updated_at = now();
end;
$$;

create or replace function public.replace_preview_calcutta_configuration(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  target_year integer := coalesce((input->>'tournament_year')::integer, 0);
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  actor text := btrim(coalesce(input->>'requested_by', ''));
  target_fingerprint text := lower(btrim(coalesce(input->>'configuration_fingerprint', '')));
  existing scoring_authority.calcutta_configurations%rowtype;
  next_revision bigint;
  purchase_value jsonb;
  owner_value jsonb;
  purchase_count integer := 0;
  ownership_count integer := 0;
  total_market numeric := 0;
  ownership_total numeric;
  payout_total numeric := 0;
  configuration_id uuid;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target_tournament = '' or target_year = 0 or source_workbook = '' or actor = ''
      or target_fingerprint !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(input->'purchases') <> 'array'
      or jsonb_typeof(input->'ownership') <> 'array'
      or jsonb_typeof(input->'point_structure') <> 'array'
      or jsonb_typeof(input->'payout_structure') <> 'array'
      or jsonb_typeof(input->'financial_contract') <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_CALCUTTA_CONFIGURATION_REQUIRED');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = target_tournament and t.tournament_year = target_year
      and t.source_workbook_id = source_workbook
  ) then return jsonb_build_object('ok', false, 'code', 'PREVIEW_TOURNAMENT_SOURCE_MISMATCH'); end if;

  for purchase_value in select value from jsonb_array_elements(input->'purchases') loop
    if btrim(coalesce(purchase_value->>'player_id', '')) = ''
        or coalesce((purchase_value->>'purchase_price')::numeric, -1) < 0
        or not exists (select 1 from scoring_authority.tournament_players tp
          where tp.tournament_id = target_tournament and tp.player_id = purchase_value->>'player_id'
            and tp.participation_status = 'ACTIVE') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_CALCUTTA_PURCHASE');
    end if;
    if (select count(*) from jsonb_array_elements(input->'purchases') p
        where p->>'player_id' = purchase_value->>'player_id') <> 1 then
      return jsonb_build_object('ok', false, 'code', 'DUPLICATE_CALCUTTA_PURCHASE');
    end if;
    purchase_count := purchase_count + 1;
    total_market := total_market + (purchase_value->>'purchase_price')::numeric;
    select coalesce(sum((o->>'ownership_fraction')::numeric), 0) into ownership_total
    from jsonb_array_elements(input->'ownership') o
    where o->>'player_id' = purchase_value->>'player_id';
    if abs(ownership_total - 1) >= 0.000001 then
      return jsonb_build_object('ok', false, 'code', 'CALCUTTA_OWNERSHIP_TOTAL_MISMATCH',
        'player_id', purchase_value->>'player_id', 'ownership_total', ownership_total);
    end if;
  end loop;
  if purchase_count = 0 then return jsonb_build_object('ok', false, 'code', 'CALCUTTA_PURCHASES_REQUIRED'); end if;

  for owner_value in select value from jsonb_array_elements(input->'ownership') loop
    if btrim(coalesce(owner_value->>'player_id', '')) = ''
        or btrim(coalesce(owner_value->>'owner_player_id', '')) = ''
        or coalesce((owner_value->>'ownership_fraction')::numeric, 0) <= 0
        or coalesce((owner_value->>'ownership_fraction')::numeric, 0) > 1
        or not exists (select 1 from scoring_authority.players p where p.player_id = owner_value->>'owner_player_id')
        or (select count(*) from jsonb_array_elements(input->'ownership') o
          where o->>'player_id' = owner_value->>'player_id'
            and o->>'owner_player_id' = owner_value->>'owner_player_id') <> 1 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_CALCUTTA_OWNERSHIP');
    end if;
    ownership_count := ownership_count + 1;
  end loop;

  payout_total := coalesce((input#>>'{financial_contract,total_payout_fraction}')::numeric, -1);
  if abs(payout_total - 1) >= 0.000001
      or abs(total_market - coalesce((input#>>'{financial_contract,total_market_value}')::numeric, -1)) >= 0.005 then
    return jsonb_build_object('ok', false, 'code', 'CALCUTTA_FINANCIAL_CONSERVATION_FAILED');
  end if;

  select * into existing from scoring_authority.calcutta_configurations c
  where c.tournament_id = target_tournament and c.configuration_fingerprint = target_fingerprint
    and c.is_current;
  if existing.id is not null then
    insert into scoring_authority.calcutta_configuration_import_runs (
      tournament_id, source_workbook_id, configuration_fingerprint, status,
      purchase_count, ownership_count, total_market_value, requested_by
    ) values (target_tournament, source_workbook, target_fingerprint, 'NO_CHANGE',
      purchase_count, ownership_count, total_market, actor);
    return jsonb_build_object('ok', true, 'changed', false, 'configuration_id', existing.id,
      'configuration_revision', existing.configuration_revision,
      'configuration_fingerprint', target_fingerprint, 'purchase_count', purchase_count,
      'ownership_count', ownership_count, 'total_market_value', total_market);
  end if;

  select coalesce(max(c.configuration_revision), 0) + 1 into next_revision
  from scoring_authority.calcutta_configurations c where c.tournament_id = target_tournament;
  update scoring_authority.calcutta_configurations set
    is_current = false, status = 'SUPERSEDED', superseded_at = now()
  where tournament_id = target_tournament and is_current;
  insert into scoring_authority.calcutta_configurations (
    tournament_id, tournament_year, configuration_revision, configuration_fingerprint,
    purchases, ownership, point_structure, payout_structure, financial_contract,
    source_workbook_id, imported_by
  ) values (
    target_tournament, target_year, next_revision, target_fingerprint,
    input->'purchases', input->'ownership', input->'point_structure', input->'payout_structure',
    input->'financial_contract', source_workbook, actor
  ) returning id into configuration_id;
  insert into scoring_authority.calcutta_configuration_import_runs (
    tournament_id, source_workbook_id, configuration_fingerprint, status,
    purchase_count, ownership_count, total_market_value, requested_by
  ) values (target_tournament, source_workbook, target_fingerprint, 'APPLIED',
    purchase_count, ownership_count, total_market, actor);
  perform scoring_authority.enqueue_calcutta_job(target_tournament, 'CONFIGURATION_REVISION',
    jsonb_build_object('configurationRevision', next_revision, 'configurationFingerprint', target_fingerprint));
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'CALCUTTA_CONFIGURATION_REFRESHED', actor,
    jsonb_build_object('configurationId', configuration_id, 'configurationRevision', next_revision,
      'configurationFingerprint', target_fingerprint, 'purchases', purchase_count,
      'ownershipRows', ownership_count, 'totalMarketValue', total_market,
      'priorConfigurationPreserved', true));
  return jsonb_build_object('ok', true, 'changed', true, 'configuration_id', configuration_id,
    'configuration_revision', next_revision, 'configuration_fingerprint', target_fingerprint,
    'purchase_count', purchase_count, 'ownership_count', ownership_count,
    'total_market_value', total_market);
end;
$$;

create or replace function public.read_calcutta_configuration_view(target_tournament_id text)
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
  configuration_value jsonb;
begin
  if target_tournament = '' then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_REQUIRED'); end if;
  select to_jsonb(t) into tournament_value from scoring_authority.tournaments t where t.tournament_id = target_tournament;
  if tournament_value is null then return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND'); end if;
  select to_jsonb(c) - 'source_workbook_id' into configuration_value
  from scoring_authority.calcutta_configurations c
  where c.tournament_id = target_tournament and c.is_current and c.status = 'APPROVED';
  if configuration_value is null then return jsonb_build_object('ok', false, 'code', 'CALCUTTA_CONFIGURATION_REQUIRED'); end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament', tournament_value, 'configuration', configuration_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

create or replace function public.request_preview_calcutta_recalculation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' or target_tournament = '' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_CALCUTTA_REQUEST_REQUIRED');
  end if;
  if not exists (select 1 from scoring_authority.calcutta_configurations c
    where c.tournament_id = target_tournament and c.is_current and c.status = 'APPROVED') then
    return jsonb_build_object('ok', false, 'code', 'CALCUTTA_CONFIGURATION_REQUIRED');
  end if;
  perform scoring_authority.enqueue_calcutta_job(target_tournament,
    left(btrim(coalesce(input->>'reason', 'EXPLICIT_REBUILD')), 120),
    jsonb_build_object('requestedBy', left(btrim(coalesce(input->>'requested_by', 'Calcutta worker')), 180)));
  return jsonb_build_object('ok', true, 'requested', 1);
end;
$$;

create or replace function public.claim_preview_calcutta_recalculation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  claims jsonb;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' or target_tournament = '' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_CALCUTTA_CLAIM_REQUIRED');
  end if;
  with candidate as (
    select j.tournament_id, j.round_number, j.engine_key
    from scoring_authority.competition_recalculation_jobs j
    where j.tournament_id = target_tournament and j.round_number = 0
      and j.engine_key = 'CALCUTTA' and j.status in ('PENDING', 'FAILED')
    for update skip locked
  ), claimed as (
    update scoring_authority.competition_recalculation_jobs j set
      status = 'RUNNING', attempts = j.attempts + 1, started_at = clock_timestamp(),
      completed_at = null, last_error_code = null, last_error_safe = null, updated_at = now()
    from candidate c where j.tournament_id = c.tournament_id and j.round_number = c.round_number
      and j.engine_key = c.engine_key
    returning j.engine_key, j.started_at, j.requested_at, j.requested_source_revision, j.attempts
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'engine_key', engine_key, 'claim_started_at', started_at, 'requested_at', requested_at,
    'requested_source_revision', requested_source_revision, 'attempt', attempts)), '[]'::jsonb)
  into claims from claimed;
  return jsonb_build_object('ok', true, 'claims', claims);
end;
$$;

create or replace function public.write_preview_calcutta_result(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  target_configuration text := lower(btrim(coalesce(input->>'configuration_fingerprint', '')));
  target_source text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
  target_payload_hash text := lower(btrim(coalesce(input->>'payload_hash', '')));
  target_engine_version text := btrim(coalesce(input->>'engine_version', ''));
  target_state text := upper(btrim(coalesce(input->>'result_state', 'PROVISIONAL')));
  target_payload jsonb := input->'result_payload';
  target_actor text := btrim(coalesce(input->>'calculated_by', ''));
  target_calculated_at timestamptz := coalesce((input->>'calculated_at')::timestamptz, now());
  target_started_at timestamptz := coalesce((input->>'started_at')::timestamptz, target_calculated_at);
  target_claim timestamptz := (input->>'claim_started_at')::timestamptz;
  target_published_at timestamptz := (input->>'published_at')::timestamptz;
  target_duration numeric := greatest(0, coalesce((input->>'duration_ms')::numeric, 0));
  snapshot_id uuid;
  run_id uuid;
  logical_replay boolean := false;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
      or target_tournament = '' or upper(btrim(coalesce(input->>'engine_key', ''))) <> 'CALCUTTA'
      or target_actor = '' or target_engine_version = '' or target_state not in ('PROVISIONAL', 'OFFICIAL')
      or target_configuration !~ '^[0-9a-f]{64}$' or target_source !~ '^[0-9a-f]{64}$'
      or target_payload_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(target_payload) <> 'object'
      or target_claim is null then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_CALCUTTA_RESULT_REQUIRED');
  end if;
  perform 1 from scoring_authority.competition_recalculation_jobs j
    where j.tournament_id = target_tournament and j.round_number = 0 and j.engine_key = 'CALCUTTA'
      and j.status = 'RUNNING' and j.started_at = target_claim for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STALE_CALCUTTA_JOB', 'superseded', true);
  end if;
  if not exists (select 1 from scoring_authority.calcutta_configurations c
    where c.tournament_id = target_tournament and c.is_current and c.status = 'APPROVED'
      and c.configuration_fingerprint = target_configuration) then
    return jsonb_build_object('ok', false, 'code', 'STALE_CALCUTTA_CONFIGURATION', 'superseded', true);
  end if;
  select s.id into snapshot_id from scoring_authority.competition_derived_snapshots s
  where s.tournament_id = target_tournament and s.round_number = 0 and s.engine_key = 'CALCUTTA'
    and s.engine_version = target_engine_version and s.configuration_fingerprint = target_configuration
    and s.source_fingerprint = target_source and s.payload_hash = target_payload_hash limit 1;
  logical_replay := snapshot_id is not null;
  update scoring_authority.competition_derived_snapshots set is_current = false
  where tournament_id = target_tournament and round_number = 0 and engine_key = 'CALCUTTA'
    and is_current and id is distinct from snapshot_id;
  if snapshot_id is null then
    insert into scoring_authority.competition_derived_snapshots (
      tournament_id, round_number, engine_key, engine_version, configuration_fingerprint,
      source_fingerprint, result_state, result_payload, payload_hash, is_current,
      calculated_at, published_at
    ) values (
      target_tournament, 0, 'CALCUTTA', target_engine_version, target_configuration,
      target_source, target_state, target_payload, target_payload_hash, true,
      target_calculated_at, case when target_state = 'OFFICIAL' then coalesce(target_published_at, target_calculated_at) else null end
    ) returning id into snapshot_id;
  else
    update scoring_authority.competition_derived_snapshots set
      is_current = true, result_state = target_state, result_payload = target_payload,
      calculated_at = target_calculated_at,
      published_at = case when target_state = 'OFFICIAL' then coalesce(target_published_at, published_at, target_calculated_at) else null end
    where id = snapshot_id;
  end if;
  insert into scoring_authority.competition_derived_runs (
    tournament_id, round_number, engine_key, engine_version, configuration_fingerprint,
    source_fingerprint, payload_hash, status, calculated_by, started_at, completed_at, duration_ms
  ) values (
    target_tournament, 0, 'CALCUTTA', target_engine_version, target_configuration,
    target_source, target_payload_hash, 'SUCCEEDED', target_actor, target_started_at,
    target_calculated_at, target_duration
  ) on conflict (tournament_id, round_number, engine_key, engine_version,
    configuration_fingerprint, source_fingerprint, payload_hash, status) do update set
      completed_at = excluded.completed_at, duration_ms = excluded.duration_ms,
      calculated_by = excluded.calculated_by
  returning id into run_id;
  update scoring_authority.competition_recalculation_jobs set
    status = 'SUCCEEDED', requested_source_revision = jsonb_build_object(
      'sourceFingerprint', target_source, 'configurationFingerprint', target_configuration,
      'payloadHash', target_payload_hash), completed_at = now(), last_error_code = null,
    last_error_safe = null, updated_at = now()
  where tournament_id = target_tournament and round_number = 0 and engine_key = 'CALCUTTA'
    and status = 'RUNNING' and started_at = target_claim;
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'CALCUTTA_OPERATIONAL_RESULT_CALCULATED', target_actor,
    jsonb_build_object('snapshotId', snapshot_id, 'runId', run_id,
      'configurationFingerprint', target_configuration, 'sourceFingerprint', target_source,
      'payloadHash', target_payload_hash, 'resultState', target_state,
      'logicalReplay', logical_replay, 'claimStartedAt', target_claim));
  return jsonb_build_object('ok', true, 'snapshot_id', snapshot_id, 'run_id', run_id,
    'logical_replay', logical_replay, 'result_state', target_state);
end;
$$;

create or replace function public.fail_preview_calcutta_recalculation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  target_claim timestamptz := (input->>'claim_started_at')::timestamptz;
  changed integer := 0;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
      or target_tournament = '' or target_claim is null then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_CALCUTTA_FAILURE_REQUIRED');
  end if;
  update scoring_authority.competition_recalculation_jobs set
    status = 'FAILED', completed_at = now(),
    last_error_code = left(btrim(coalesce(input->>'error_code', 'CALCUTTA_CALCULATION_FAILED')), 120),
    last_error_safe = left(btrim(coalesce(input->>'error_safe', 'Calcutta is temporarily unavailable.')), 400),
    updated_at = now()
  where tournament_id = target_tournament and round_number = 0 and engine_key = 'CALCUTTA'
    and status = 'RUNNING' and started_at = target_claim;
  get diagnostics changed = row_count;
  return jsonb_build_object('ok', true, 'marked', changed = 1, 'superseded', changed = 0);
end;
$$;

create or replace function scoring_authority.enqueue_calcutta_for_match_change()
returns trigger
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
begin
  if old.status is distinct from new.status
      or old.result_winner is distinct from new.result_winner
      or old.scorecard_complete is distinct from new.scorecard_complete
      or old.finalized_at is distinct from new.finalized_at
      or ((old.status = 'FINAL' or new.status = 'FINAL') and old.match_revision is distinct from new.match_revision) then
    perform scoring_authority.enqueue_calcutta_job(new.tournament_id, 'OFFICIAL_MATCH_STATE_CHANGE',
      jsonb_build_object('matchId', new.match_id, 'priorStatus', old.status, 'status', new.status,
        'matchRevision', new.match_revision, 'scorecardComplete', new.scorecard_complete,
        'resultWinner', new.result_winner));
  end if;
  return new;
end;
$$;

create trigger calcutta_official_match_change
after update of status, result_winner, scorecard_complete, finalized_at, match_revision
on scoring_authority.matches
for each row execute function scoring_authority.enqueue_calcutta_for_match_change();

-- Preserve the shared read contract while exposing lifecycle metadata needed by
-- financial snapshots. Existing Momentum/Storyline consumers ignore the added
-- fields.
create or replace function public.read_competition_derived_state(
  target_tournament_id text,
  target_engine_keys text[] default array['TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES']::text[]
)
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
  if not exists (select 1 from scoring_authority.tournaments t where t.tournament_id = target_tournament) then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'engine_key', s.engine_key, 'engine_version', s.engine_version,
    'configuration_fingerprint', s.configuration_fingerprint,
    'source_fingerprint', s.source_fingerprint, 'result_state', s.result_state,
    'result_payload', s.result_payload, 'payload_hash', s.payload_hash,
    'calculated_at', s.calculated_at, 'published_at', s.published_at
  ) order by s.engine_key), '[]'::jsonb) into snapshots_value
  from scoring_authority.competition_derived_snapshots s
  where s.tournament_id = target_tournament and s.round_number = 0
    and s.engine_key = any(target_engine_keys) and s.is_current;
  select coalesce(jsonb_agg(jsonb_build_object(
    'engine_key', j.engine_key, 'status', j.status,
    'requested_source_revision', j.requested_source_revision,
    'attempts', j.attempts, 'requested_at', j.requested_at,
    'started_at', j.started_at, 'completed_at', j.completed_at,
    'last_error_code', j.last_error_code
  ) order by j.engine_key), '[]'::jsonb) into jobs_value
  from scoring_authority.competition_recalculation_jobs j
  where j.tournament_id = target_tournament and j.round_number = 0
    and j.engine_key = any(target_engine_keys);
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'tournament_id', target_tournament, 'snapshots', snapshots_value, 'jobs', jobs_value,
    'query_ms', round(extract(epoch from (clock_timestamp() - started_at)) * 1000, 3)
  ));
end;
$$;

revoke all on function scoring_authority.enqueue_calcutta_job(text, text, jsonb) from public, anon, authenticated;
revoke all on function scoring_authority.enqueue_calcutta_for_match_change() from public, anon, authenticated;
revoke all on function public.replace_preview_calcutta_configuration(jsonb) from public, anon, authenticated;
revoke all on function public.read_calcutta_configuration_view(text) from public, anon, authenticated;
revoke all on function public.request_preview_calcutta_recalculation(jsonb) from public, anon, authenticated;
revoke all on function public.claim_preview_calcutta_recalculation(jsonb) from public, anon, authenticated;
revoke all on function public.write_preview_calcutta_result(jsonb) from public, anon, authenticated;
revoke all on function public.fail_preview_calcutta_recalculation(jsonb) from public, anon, authenticated;
revoke all on function public.read_competition_derived_state(text, text[]) from public, anon, authenticated;
grant execute on function public.replace_preview_calcutta_configuration(jsonb) to service_role;
grant execute on function public.read_calcutta_configuration_view(text) to service_role;
grant execute on function public.request_preview_calcutta_recalculation(jsonb) to service_role;
grant execute on function public.claim_preview_calcutta_recalculation(jsonb) to service_role;
grant execute on function public.write_preview_calcutta_result(jsonb) to service_role;
grant execute on function public.fail_preview_calcutta_recalculation(jsonb) to service_role;
grant execute on function public.read_competition_derived_state(text, text[]) to service_role;

notify pgrst, 'reload schema';
