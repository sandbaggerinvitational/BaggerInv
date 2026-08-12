-- Preview-only shared derived-state foundation for Team Momentum and ordinary
-- Tournament Storylines. Existing JavaScript engines remain calculation owners.

create table scoring_authority.competition_derived_runs (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null references scoring_authority.tournaments (tournament_id) on delete cascade,
  round_number integer not null default 0,
  engine_key text not null,
  engine_version text not null,
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('SUCCEEDED', 'FAILED')),
  calculated_by text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_ms numeric not null default 0 check (duration_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  unique (tournament_id, round_number, engine_key, engine_version,
    configuration_fingerprint, source_fingerprint, payload_hash, status)
);

create index competition_derived_runs_scope_idx
  on scoring_authority.competition_derived_runs
    (tournament_id, engine_key, round_number, completed_at desc);

alter table scoring_authority.competition_derived_runs enable row level security;
revoke all on scoring_authority.competition_derived_runs from public, anon, authenticated;
grant select, insert, update, delete on scoring_authority.competition_derived_runs to service_role;

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
  target_duration numeric := greatest(0, coalesce((input->>'duration_ms')::numeric, 0));
  snapshot_id uuid;
  run_id uuid;
  logical_replay boolean := false;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if target_tournament = '' or target_actor = '' or target_engine_version = ''
      or target_engine not in ('TEAM_MOMENTUM', 'TOURNAMENT_STORYLINES')
      or target_configuration !~ '^[0-9a-f]{64}$'
      or target_source !~ '^[0-9a-f]{64}$'
      or target_payload_hash !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(target_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'COMPLETE_DERIVED_SNAPSHOT_REQUIRED');
  end if;
  if not exists (select 1 from scoring_authority.tournaments t where t.tournament_id = target_tournament) then
    return jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND');
  end if;

  select s.id into snapshot_id
  from scoring_authority.competition_derived_snapshots s
  where s.tournament_id = target_tournament and s.round_number = target_round
    and s.engine_key = target_engine and s.engine_version = target_engine_version
    and s.configuration_fingerprint = target_configuration
    and s.source_fingerprint = target_source and s.payload_hash = target_payload_hash
  limit 1;

  logical_replay := snapshot_id is not null;
  update scoring_authority.competition_derived_snapshots set is_current = false
  where tournament_id = target_tournament and round_number = target_round
    and engine_key = target_engine and is_current and id is distinct from snapshot_id;

  if snapshot_id is null then
    insert into scoring_authority.competition_derived_snapshots (
      tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, result_state,
      result_payload, payload_hash, is_current, calculated_at
    ) values (
      target_tournament, target_round, target_engine, target_engine_version,
      target_configuration, target_source, 'PROVISIONAL', target_payload,
      target_payload_hash, true, target_calculated_at
    ) returning id into snapshot_id;
  else
    update scoring_authority.competition_derived_snapshots set
      is_current = true, result_payload = target_payload, calculated_at = target_calculated_at
    where id = snapshot_id;
  end if;

  insert into scoring_authority.competition_derived_runs (
    tournament_id, round_number, engine_key, engine_version,
    configuration_fingerprint, source_fingerprint, payload_hash, status,
    calculated_by, started_at, completed_at, duration_ms
  ) values (
    target_tournament, target_round, target_engine, target_engine_version,
    target_configuration, target_source, target_payload_hash, 'SUCCEEDED',
    target_actor, target_started_at, target_calculated_at, target_duration
  ) on conflict (tournament_id, round_number, engine_key, engine_version,
      configuration_fingerprint, source_fingerprint, payload_hash, status)
    do update set completed_at = excluded.completed_at, duration_ms = excluded.duration_ms,
      calculated_by = excluded.calculated_by
  returning id into run_id;

  insert into scoring_authority.competition_recalculation_jobs (
    tournament_id, round_number, engine_key, status, requested_source_revision,
    attempts, requested_at, completed_at, updated_at
  ) values (
    target_tournament, target_round, target_engine, 'SUCCEEDED',
    jsonb_build_object('sourceFingerprint', target_source,
      'configurationFingerprint', target_configuration, 'payloadHash', target_payload_hash),
    1, now(), now(), now()
  ) on conflict (tournament_id, round_number, engine_key) do update set
    status = 'SUCCEEDED', attempts = scoring_authority.competition_recalculation_jobs.attempts + 1,
    requested_source_revision = excluded.requested_source_revision,
    completed_at = now(), last_error_code = null, last_error_safe = null, updated_at = now();

  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, target_engine || '_DERIVED_STATE_CALCULATED', target_actor,
    jsonb_build_object('snapshotId', snapshot_id, 'runId', run_id,
      'sourceFingerprint', target_source, 'payloadHash', target_payload_hash,
      'engineVersion', target_engine_version, 'logicalReplay', logical_replay));

  return jsonb_build_object('ok', true, 'snapshot_id', snapshot_id,
    'run_id', run_id, 'logical_replay', logical_replay);
end;
$$;

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
    'source_fingerprint', s.source_fingerprint, 'result_payload', s.result_payload,
    'payload_hash', s.payload_hash, 'calculated_at', s.calculated_at
  ) order by s.engine_key), '[]'::jsonb) into snapshots_value
  from scoring_authority.competition_derived_snapshots s
  where s.tournament_id = target_tournament and s.round_number = 0
    and s.engine_key = any(target_engine_keys) and s.is_current;

  select coalesce(jsonb_agg(jsonb_build_object(
    'engine_key', j.engine_key, 'status', j.status,
    'requested_source_revision', j.requested_source_revision,
    'attempts', j.attempts, 'requested_at', j.requested_at,
    'completed_at', j.completed_at, 'last_error_code', j.last_error_code
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

create or replace function scoring_authority.enqueue_competition_derived_job(
  target_tournament text,
  target_engine text,
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
    target_tournament, 0, target_engine, 'PENDING',
    jsonb_build_object('reason', reason_value, 'revision', coalesce(revision_value, '{}'::jsonb)),
    now(), now()
  ) on conflict (tournament_id, round_number, engine_key) do update set
    status = 'PENDING', requested_source_revision = excluded.requested_source_revision,
    requested_at = now(), started_at = null, completed_at = null,
    last_error_code = null, last_error_safe = null, updated_at = now();
end;
$$;

create or replace function scoring_authority.enqueue_storylines_for_score_change()
returns trigger
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_match_id text := case when tg_op = 'DELETE' then old.match_id else new.match_id end;
  target_match scoring_authority.matches%rowtype;
begin
  select * into target_match from scoring_authority.matches where match_id = target_match_id;
  if target_match.match_id is not null then
    perform scoring_authority.enqueue_competition_derived_job(
      target_match.tournament_id, 'TOURNAMENT_STORYLINES', 'SCORE_CHANGE',
      jsonb_build_object('matchId', target_match.match_id,
        'matchRevision', target_match.match_revision,
        'hole', case when tg_op = 'DELETE' then old.hole_number else new.hole_number end)
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function scoring_authority.enqueue_derived_for_match_change()
returns trigger
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
begin
  perform scoring_authority.enqueue_competition_derived_job(
    new.tournament_id, 'TOURNAMENT_STORYLINES', 'MATCH_CHANGE',
    jsonb_build_object('matchId', new.match_id, 'matchRevision', new.match_revision,
      'status', new.status, 'resultWinner', new.result_winner)
  );
  if old.status is distinct from new.status
      or old.result_winner is distinct from new.result_winner
      or old.scorecard_complete is distinct from new.scorecard_complete
      or old.finalized_at is distinct from new.finalized_at then
    perform scoring_authority.enqueue_competition_derived_job(
      new.tournament_id, 'TEAM_MOMENTUM', 'OFFICIAL_RESULT_CHANGE',
      jsonb_build_object('matchId', new.match_id, 'matchRevision', new.match_revision,
        'status', new.status, 'resultWinner', new.result_winner)
    );
  end if;
  return new;
end;
$$;

create or replace function scoring_authority.enqueue_storylines_for_net_skins_change()
returns trigger
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
begin
  if new.engine_key = 'NET_SKINS' and new.is_current then
    perform scoring_authority.enqueue_competition_derived_job(
      new.tournament_id, 'TOURNAMENT_STORYLINES', 'NET_SKINS_RESULT_CHANGE',
      jsonb_build_object('round', new.round_number, 'sourceFingerprint', new.source_fingerprint,
        'payloadHash', new.payload_hash)
    );
  end if;
  return new;
end;
$$;

create trigger tournament_storylines_score_change
after insert or update or delete on scoring_authority.hole_scores
for each row execute function scoring_authority.enqueue_storylines_for_score_change();

create trigger tournament_derived_match_change
after update of status, result_winner, scorecard_complete, finalized_at, match_revision
on scoring_authority.matches
for each row execute function scoring_authority.enqueue_derived_for_match_change();

create trigger tournament_storylines_net_skins_change
after insert or update of is_current, source_fingerprint, payload_hash
on scoring_authority.competition_derived_snapshots
for each row execute function scoring_authority.enqueue_storylines_for_net_skins_change();

revoke all on function public.write_competition_derived_snapshot(jsonb) from public, anon, authenticated;
revoke all on function public.read_competition_derived_state(text, text[]) from public, anon, authenticated;
revoke all on function scoring_authority.enqueue_competition_derived_job(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function scoring_authority.enqueue_storylines_for_score_change() from public, anon, authenticated;
revoke all on function scoring_authority.enqueue_derived_for_match_change() from public, anon, authenticated;
revoke all on function scoring_authority.enqueue_storylines_for_net_skins_change() from public, anon, authenticated;
grant execute on function public.write_competition_derived_snapshot(jsonb) to service_role;
grant execute on function public.read_competition_derived_state(text, text[]) to service_role;

notify pgrst, 'reload schema';
