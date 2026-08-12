-- Preview-only derived worker claims. A newer enqueue invalidates the prior
-- started_at claim, so stale work cannot replace a newer prepared result.

create or replace function public.request_competition_derived_recalculation(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  target_reason text := left(btrim(coalesce(input->>'reason', 'EXPLICIT_REBUILD')), 120);
  target_actor text := left(btrim(coalesce(input->>'requested_by', 'Derived-state worker')), 180);
  engine_value text;
  requested_count integer := 0;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' or target_tournament = ''
      or jsonb_typeof(input->'engine_keys') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_DERIVED_REQUEST_REQUIRED');
  end if;
  if not exists (select 1 from scoring_authority.tournaments t where t.tournament_id = target_tournament) then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND');
  end if;
  for engine_value in select upper(btrim(value)) from jsonb_array_elements_text(input->'engine_keys') loop
    if engine_value not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES') then
      return jsonb_build_object('ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED');
    end if;
    insert into scoring_authority.competition_recalculation_jobs (
      tournament_id, round_number, engine_key, status, requested_source_revision,
      requested_at, updated_at
    ) values (
      target_tournament, 0, engine_value, 'PENDING',
      jsonb_build_object('reason', target_reason, 'requestedBy', target_actor), now(), now()
    ) on conflict (tournament_id, round_number, engine_key) do update set
      status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
      requested_at = now(), started_at = null, completed_at = null,
      last_error_code = null, last_error_safe = null, updated_at = now();
    requested_count := requested_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'requested', requested_count);
end;
$$;

create or replace function public.claim_competition_derived_jobs(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  target_engines text[];
  claims jsonb;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' or target_tournament = ''
      or jsonb_typeof(input->'engine_keys') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_DERIVED_CLAIM_REQUIRED');
  end if;
  select coalesce(array_agg(upper(btrim(value))), array[]::text[]) into target_engines
  from jsonb_array_elements_text(input->'engine_keys');
  if cardinality(target_engines) = 0 or exists (
    select 1 from unnest(target_engines) as requested(engine_key)
    where engine_key not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
  ) then return jsonb_build_object('ok', false, 'code', 'DERIVED_ENGINE_NOT_SUPPORTED'); end if;

  with candidates as (
    select j.tournament_id, j.round_number, j.engine_key
    from scoring_authority.competition_recalculation_jobs j
    where j.tournament_id = target_tournament and j.round_number = 0
      and j.engine_key = any(target_engines) and j.status in ('PENDING', 'FAILED')
    order by j.engine_key
    for update skip locked
  ), claimed as (
    update scoring_authority.competition_recalculation_jobs j set
      status = 'RUNNING', attempts = j.attempts + 1, started_at = clock_timestamp(),
      completed_at = null, last_error_code = null, last_error_safe = null, updated_at = now()
    from candidates c
    where j.tournament_id = c.tournament_id and j.round_number = c.round_number and j.engine_key = c.engine_key
    returning j.engine_key, j.started_at, j.requested_at, j.requested_source_revision, j.attempts
  ) select coalesce(jsonb_agg(jsonb_build_object(
      'engine_key', engine_key, 'claim_started_at', started_at,
      'requested_at', requested_at, 'requested_source_revision', requested_source_revision,
      'attempt', attempts
    ) order by engine_key), '[]'::jsonb) into claims from claimed;
  return jsonb_build_object('ok', true, 'claims', claims);
end;
$$;

create or replace function public.mark_competition_derived_job_failed(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  target_engine text := upper(btrim(coalesce(input->>'engine_key', '')));
  target_claim timestamptz := (input->>'claim_started_at')::timestamptz;
  updated_count integer := 0;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' or target_tournament = ''
      or target_engine not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES') or target_claim is null then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_DERIVED_FAILURE_REQUIRED');
  end if;
  update scoring_authority.competition_recalculation_jobs set
    status = 'FAILED', completed_at = now(),
    last_error_code = left(btrim(coalesce(input->>'error_code', 'DERIVED_CALCULATION_FAILED')), 120),
    last_error_safe = left(btrim(coalesce(input->>'error_safe', 'Prepared competition content is temporarily unavailable.')), 400),
    updated_at = now()
  where tournament_id = target_tournament and round_number = 0 and engine_key = target_engine
    and status = 'RUNNING' and started_at = target_claim;
  get diagnostics updated_count = row_count;
  return jsonb_build_object('ok', true, 'marked', updated_count = 1, 'superseded', updated_count = 0);
end;
$$;

create or replace function public.write_competition_derived_snapshot(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_tournament text := btrim(coalesce(input->>'tournament_id', ''));
  target_round integer := coalesce((input->>'round_number')::integer, 0);
  target_engine text := upper(btrim(coalesce(input->>'engine_key', '')));
  target_engine_version text := btrim(coalesce(input->>'engine_version', ''));
  target_configuration text := lower(btrim(coalesce(input->>'configuration_fingerprint', '')));
  target_source text := lower(btrim(coalesce(input->>'source_fingerprint', '')));
  target_payload_hash text := lower(btrim(coalesce(input->>'payload_hash', '')));
  target_payload jsonb := coalesce(input->'result_payload', 'null'::jsonb);
  target_actor text := btrim(coalesce(input->>'calculated_by', ''));
  target_calculated_at timestamptz := coalesce((input->>'calculated_at')::timestamptz, now());
  target_started_at timestamptz := coalesce((input->>'started_at')::timestamptz, target_calculated_at);
  target_claim_started_at timestamptz := (input->>'claim_started_at')::timestamptz;
  target_duration numeric := greatest(0, coalesce((input->>'duration_ms')::numeric, 0));
  snapshot_id uuid;
  run_id uuid;
  logical_replay boolean := false;
  claimed_job scoring_authority.competition_recalculation_jobs%rowtype;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target_tournament = '' or target_actor = '' or target_engine_version = ''
      or target_engine not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
      or target_configuration !~ '^[0-9a-f]{64}$' or target_source !~ '^[0-9a-f]{64}$'
      or target_payload_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(target_payload) <> 'object'
      or target_claim_started_at is null then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_DERIVED_SNAPSHOT_REQUIRED');
  end if;

  select * into claimed_job from scoring_authority.competition_recalculation_jobs j
  where j.tournament_id = target_tournament and j.round_number = target_round
    and j.engine_key = target_engine and j.status = 'RUNNING'
    and j.started_at = target_claim_started_at
  for update;
  if claimed_job.engine_key is null then
    return jsonb_build_object('ok', false, 'code', 'STALE_DERIVED_JOB', 'superseded', true);
  end if;

  select s.id into snapshot_id from scoring_authority.competition_derived_snapshots s
  where s.tournament_id = target_tournament and s.round_number = target_round
    and s.engine_key = target_engine and s.engine_version = target_engine_version
    and s.configuration_fingerprint = target_configuration and s.source_fingerprint = target_source
    and s.payload_hash = target_payload_hash limit 1;
  logical_replay := snapshot_id is not null;

  update scoring_authority.competition_derived_snapshots set is_current = false
  where tournament_id = target_tournament and round_number = target_round
    and engine_key = target_engine and is_current and id is distinct from snapshot_id;
  if snapshot_id is null then
    insert into scoring_authority.competition_derived_snapshots (
      tournament_id, round_number, engine_key, engine_version, configuration_fingerprint,
      source_fingerprint, result_state, result_payload, payload_hash, is_current, calculated_at
    ) values (
      target_tournament, target_round, target_engine, target_engine_version, target_configuration,
      target_source, 'PROVISIONAL', target_payload, target_payload_hash, true, target_calculated_at
    ) returning id into snapshot_id;
  else
    update scoring_authority.competition_derived_snapshots set
      is_current = true, result_payload = target_payload, calculated_at = target_calculated_at
    where id = snapshot_id;
  end if;

  insert into scoring_authority.competition_derived_runs (
    tournament_id, round_number, engine_key, engine_version, configuration_fingerprint,
    source_fingerprint, payload_hash, status, calculated_by, started_at, completed_at, duration_ms
  ) values (
    target_tournament, target_round, target_engine, target_engine_version, target_configuration,
    target_source, target_payload_hash, 'SUCCEEDED', target_actor, target_started_at,
    target_calculated_at, target_duration
  ) on conflict (tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, payload_hash, status)
    do update set completed_at = excluded.completed_at, duration_ms = excluded.duration_ms,
      calculated_by = excluded.calculated_by
  returning id into run_id;

  update scoring_authority.competition_recalculation_jobs set
    status = 'SUCCEEDED', requested_source_revision = jsonb_build_object(
      'sourceFingerprint', target_source, 'configurationFingerprint', target_configuration,
      'payloadHash', target_payload_hash), completed_at = now(), last_error_code = null,
    last_error_safe = null, updated_at = now()
  where tournament_id = target_tournament and round_number = target_round
    and engine_key = target_engine and status = 'RUNNING' and started_at = target_claim_started_at;

  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, target_engine || '_DERIVED_STATE_CALCULATED', target_actor,
    jsonb_build_object('snapshotId', snapshot_id, 'runId', run_id, 'sourceFingerprint', target_source,
      'payloadHash', target_payload_hash, 'engineVersion', target_engine_version,
      'logicalReplay', logical_replay, 'claimStartedAt', target_claim_started_at));
  return jsonb_build_object('ok', true, 'snapshot_id', snapshot_id,
    'run_id', run_id, 'logical_replay', logical_replay);
end;
$$;

revoke all on function public.request_competition_derived_recalculation(jsonb) from public, anon, authenticated;
revoke all on function public.claim_competition_derived_jobs(jsonb) from public, anon, authenticated;
revoke all on function public.mark_competition_derived_job_failed(jsonb) from public, anon, authenticated;
revoke all on function public.write_competition_derived_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.request_competition_derived_recalculation(jsonb) to service_role;
grant execute on function public.claim_competition_derived_jobs(jsonb) to service_role;
grant execute on function public.mark_competition_derived_job_failed(jsonb) to service_role;
grant execute on function public.write_competition_derived_snapshot(jsonb) to service_role;

notify pgrst, 'reload schema';
