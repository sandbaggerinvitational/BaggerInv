-- Step 11 isolated Production scoring rehearsal boundary.
--
-- This migration does not activate Production scoring, workers, public reads,
-- or Google writes. Rehearsal facts live only in production_rehearsal and are
-- bound to a completed 2017-2025 Production-derived source match. Tournament
-- 2026 is fingerprinted before/after but is never a mutation target.
begin;

create schema if not exists production_rehearsal;
revoke all on schema production_rehearsal from public, anon, authenticated;

create table production_rehearsal.scoring_runs (
  run_id uuid primary key,
  contract_version text not null
    check (contract_version = 'production-step11-scoring-rehearsal-v1'),
  project_ref text not null check (project_ref = 'ymqhhtxaywtqllynrmxe'),
  project_url text not null
    check (project_url = 'https://ymqhhtxaywtqllynrmxe.supabase.co'),
  source_workbook_id text not null
    check (source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'),
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  candidate_hostname text not null
    check (candidate_hostname ~ '^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$'
      and candidate_hostname <> 'baggerinv.com'),
  run_token_hash text not null check (run_token_hash ~ '^[0-9a-f]{64}$'),
  actor_id text not null,
  director_authorization_id text not null,
  synthetic_tournament_id text not null unique
    check (synthetic_tournament_id ~ '^STEP11-[0-9A-F-]{16,}$'
      and synthetic_tournament_id <> '2026'),
  source_tournament_id text not null check (source_tournament_id <> '2026'),
  source_tournament_year integer not null check (source_tournament_year between 2017 and 2025),
  source_match_id text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  frozen_fixture_fingerprint text not null
    check (frozen_fixture_fingerprint ~ '^[0-9a-f]{64}$'),
  frozen_fixture jsonb not null check (jsonb_typeof(frozen_fixture) = 'object'),
  s3_fingerprint_before text not null check (s3_fingerprint_before ~ '^[0-9a-f]{64}$'),
  current_2026_fingerprint_before text not null
    check (current_2026_fingerprint_before ~ '^[0-9a-f]{64}$'),
  current_2026_fingerprint_after text
    check (current_2026_fingerprint_after is null or current_2026_fingerprint_after ~ '^[0-9a-f]{64}$'),
  status text not null default 'PREPARED'
    check (status in ('PREPARED','ACTIVE','ROLLED_BACK','CLEANED','ABORTED','EXPIRED')),
  rehearsal_authority text not null default 'GOOGLE'
    check (rehearsal_authority in ('GOOGLE','SUPABASE')),
  ingress_state text not null default 'PAUSED' check (ingress_state in ('PAUSED','OPEN')),
  unresolved_client_queues integer not null default 0 check (unresolved_client_queues >= 0),
  external_transport text not null default 'VIRTUAL' check (external_transport = 'VIRTUAL'),
  external_google_writes integer not null default 0 check (external_google_writes = 0),
  live_2026_writes integer not null default 0 check (live_2026_writes = 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '4 hours'),
  check ((status = 'ACTIVE' and rehearsal_authority = 'SUPABASE' and ingress_state = 'OPEN')
    or status <> 'ACTIVE'),
  check ((status in ('ROLLED_BACK','CLEANED') and rehearsal_authority = 'GOOGLE'
      and ingress_state = 'PAUSED') or status not in ('ROLLED_BACK','CLEANED'))
);

create table production_rehearsal.evidence_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references production_rehearsal.scoring_runs(run_id) on delete cascade,
  sequence bigint generated always as identity,
  event_type text not null check (event_type in (
    'RUN_PREPARED','AUTHORITY_EPOCH_PREPARED','AUTHORITY_EPOCH_COMMITTED',
    'MATCH_MARKED_LIVE','SCORING_LOCKED','SCORING_UNLOCKED',
    'SCORING_ACCESS_ENABLED','SCORING_ACCESS_REVOKED','HOLE_SCORE_UPSERTED',
    'MATCH_FINALIZED','MATCH_REOPENED','MIRROR_CLAIMED','MIRROR_RETRYABLE',
    'MIRROR_CHECKPOINTED','ARCHIVE_CLAIMED','ARCHIVE_RETRYABLE',
    'ARCHIVE_CHECKPOINTED','ROLLBACK_RECONCILED','CLEANUP_CERTIFIED','RUN_ABORTED'
  )),
  mutation_key text not null default '',
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  external_google_write_count integer not null default 0
    check (external_google_write_count = 0),
  live_2026_write_count integer not null default 0 check (live_2026_write_count = 0),
  created_at timestamptz not null default now(),
  unique (run_id, sequence),
  unique (run_id, event_type, mutation_key)
);

create table production_rehearsal.cleanup_certifications (
  run_id uuid primary key references production_rehearsal.scoring_runs(run_id) on delete restrict,
  synthetic_tournament_id text not null check (synthetic_tournament_id ~ '^STEP11-'),
  synthetic_final_fingerprint text not null check (synthetic_final_fingerprint ~ '^[0-9a-f]{64}$'),
  s3_fingerprint_before text not null check (s3_fingerprint_before ~ '^[0-9a-f]{64}$'),
  s3_fingerprint_after text not null check (s3_fingerprint_after ~ '^[0-9a-f]{64}$'),
  current_2026_fingerprint_before text not null
    check (current_2026_fingerprint_before ~ '^[0-9a-f]{64}$'),
  current_2026_fingerprint_after text not null
    check (current_2026_fingerprint_after ~ '^[0-9a-f]{64}$'),
  supabase_authoritative_writes integer not null check (supabase_authoritative_writes >= 0),
  already_mirrored integer not null check (already_mirrored >= 0),
  reconciled_writes integer not null check (reconciled_writes >= 0),
  duplicate_writes integer not null check (duplicate_writes = 0),
  unresolved_writes integer not null check (unresolved_writes = 0),
  lost_writes integer not null check (lost_writes = 0),
  final_authority text not null check (final_authority = 'GOOGLE'),
  external_google_writes integer not null default 0 check (external_google_writes = 0),
  live_2026_writes integer not null default 0 check (live_2026_writes = 0),
  certified_by text not null,
  certified_at timestamptz not null default now(),
  check (s3_fingerprint_before = s3_fingerprint_after),
  check (current_2026_fingerprint_before = current_2026_fingerprint_after)
);

alter table production_rehearsal.scoring_runs enable row level security;
alter table production_rehearsal.evidence_events enable row level security;
alter table production_rehearsal.cleanup_certifications enable row level security;

revoke all on all tables in schema production_rehearsal from public, anon, authenticated, service_role;
revoke all on all sequences in schema production_rehearsal from public, anon, authenticated, service_role;

create or replace function production_rehearsal.current_2026_fingerprint()
returns text
language sql
security definer
stable
set search_path = pg_catalog, scoring_authority, extensions, pg_temp
as $$
  select encode(extensions.digest(jsonb_build_object(
    'tournament', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.tournament_id)
      from scoring_authority.tournaments value where value.tournament_id = '2026'
    ), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.team_id)
      from scoring_authority.teams value where value.tournament_id = '2026'
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.player_id)
      from scoring_authority.tournament_players value where value.tournament_id = '2026'
    ), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.round_number)
      from scoring_authority.rounds value where value.tournament_id = '2026'
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.match_id)
      from scoring_authority.matches value where value.tournament_id = '2026'
    ), '[]'::jsonb),
    'holes', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.match_id, value.hole_number)
      from scoring_authority.hole_scores value
      join scoring_authority.matches match on match.match_id = value.match_id
      where match.tournament_id = '2026'
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.match_id, value.player_id)
      from scoring_authority.scoring_permissions value
      join scoring_authority.matches match on match.match_id = value.match_id
      where match.tournament_id = '2026'
    ), '[]'::jsonb),
    'outbox', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.created_at, value.id)
      from scoring_authority.google_outbox_events value where value.tournament_id = '2026'
    ), '[]'::jsonb),
    'archives', coalesce((
      select jsonb_agg(to_jsonb(value) order by value.match_id, value.snapshot_revision)
      from scoring_authority.finalized_scorecard_snapshots value where value.tournament_id = '2026'
    ), '[]'::jsonb)
  )::text, 'sha256'), 'hex')
$$;

revoke all on function production_rehearsal.current_2026_fingerprint()
  from public, anon, authenticated, service_role;

create or replace function production_rehearsal.completed_source_fixture(requested_match_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, scoring_authority, extensions, pg_temp
as $$
declare
  fixture jsonb;
begin
  select jsonb_build_object(
    'sourceTournamentId', match.tournament_id,
    'sourceTournamentYear', tournament.tournament_year,
    'sourceMatchId', match.match_id,
    'status', upper(match.status),
    'format', upper(match.format),
    'participantIds', coalesce((
      select jsonb_agg(participant.player_id order by participant.team_side, participant.player_slot)
      from scoring_authority.match_participants participant
      where participant.match_id = match.match_id
    ), '[]'::jsonb),
    'courseId', snapshot.course_id,
    'tee', snapshot.tee,
    'roundNumber', match.round_number
  ) into fixture
  from scoring_authority.matches match
  join scoring_authority.tournaments tournament
    on tournament.tournament_id = match.tournament_id
  join scoring_authority.scoring_snapshots snapshot
    on snapshot.snapshot_id = match.scoring_snapshot_id
  where tournament.tournament_year between 2017 and 2025
    and match.tournament_id <> '2026'
    and upper(match.status) = 'FINAL'
    and upper(match.format) in ('BB','SC','SI')
    and (nullif(btrim(coalesce(requested_match_id,'')), '') is null
      or match.match_id = btrim(requested_match_id))
  order by tournament.tournament_year desc, match.match_id
  limit 1;

  if fixture is null
     or jsonb_array_length(fixture->'participantIds') < 2 then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_COMPLETED_SOURCE_MATCH_REQUIRED';
  end if;
  return fixture;
end;
$$;

revoke all on function production_rehearsal.completed_source_fixture(text)
  from public, anon, authenticated, service_role;

create or replace function public.inspect_production_step11_scoring_rehearsal(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_rehearsal, production_control, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  fixture jsonb;
  fixture_fingerprint text;
  director_player_id text := btrim(coalesce(input->>'actor_id',''));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_SERVICE_ROLE_REQUIRED';
  end if;
  scope := production_control.assert_current_shadow_v2_dormant();
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or input->>'project_ref' <> scope.project_ref
     or input->>'project_url' <> scope.project_url
     or input->>'source_workbook_id' <> scope.google_workbook_id
     or lower(btrim(coalesce(input->>'candidate_sha',''))) !~ '^[0-9a-f]{40}$'
     or btrim(coalesce(input->>'candidate_hostname','')) !~ '^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$'
     or btrim(coalesce(input->>'candidate_hostname','')) = 'baggerinv.com'
     or director_player_id = '' then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_EXACT_RESOURCE_SCOPE_REQUIRED';
  end if;
  if not exists (
    select 1
    from production_control.director_entitlements entitlement
    join participant_identity.user_player_links link
      on link.auth_user_id = entitlement.auth_user_id
     and link.player_id = entitlement.player_id
     and link.status = 'ACTIVE'
    join participant_identity.tournament_roles role
      on role.auth_user_id = entitlement.auth_user_id
     and role.tournament_id = entitlement.tournament_id
     and role.role = 'DIRECTOR'
     and role.role_active
    where entitlement.tournament_id = '2026'
      and entitlement.player_id = director_player_id
      and entitlement.status = 'ACTIVE'
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_ACTIVE_DIRECTOR_REQUIRED';
  end if;
  fixture := production_rehearsal.completed_source_fixture(input->>'source_match_id');
  fixture_fingerprint := encode(extensions.digest(fixture::text, 'sha256'), 'hex');
  return jsonb_build_object(
    'ok', true,
    'actorId', director_player_id,
    'current2026Fingerprint', production_rehearsal.current_2026_fingerprint(),
    'fixture', fixture,
    'fixtureFingerprint', fixture_fingerprint,
    'sourceFingerprint', fixture_fingerprint,
    'externalTransport', 'VIRTUAL',
    'externalGoogleWrites', 0,
    'live2026Writes', 0
  );
end;
$$;

create or replace function production_rehearsal.assert_run(input jsonb)
returns production_rehearsal.scoring_runs
language plpgsql
security definer
set search_path = pg_catalog, production_rehearsal, production_control, auth, extensions, pg_temp
as $$
declare
  run production_rehearsal.scoring_runs%rowtype;
  scope production_control.resource_scope%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_SERVICE_ROLE_REQUIRED';
  end if;
  scope := production_control.assert_current_shadow_v2_dormant();
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref','')) <> scope.project_ref
     or btrim(coalesce(input->>'project_url','')) <> scope.project_url
     or btrim(coalesce(input->>'source_workbook_id','')) <> scope.google_workbook_id
     or btrim(coalesce(input->>'candidate_sha','')) !~ '^[0-9a-f]{40}$'
     or btrim(coalesce(input->>'candidate_hostname','')) !~ '^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$'
     or btrim(coalesce(input->>'candidate_hostname','')) = 'baggerinv.com'
     or btrim(coalesce(input->>'run_token','')) = '' then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_EXACT_RESOURCE_SCOPE_REQUIRED';
  end if;
  select * into strict run from production_rehearsal.scoring_runs value
  where value.run_id = (input->>'run_id')::uuid for update;
  if run.project_ref <> scope.project_ref
     or run.project_url <> scope.project_url
     or run.source_workbook_id <> scope.google_workbook_id
     or run.candidate_sha <> input->>'candidate_sha'
     or run.candidate_hostname <> input->>'candidate_hostname'
     or run.synthetic_tournament_id <> input->>'synthetic_tournament_id'
     or run.run_token_hash <> encode(extensions.digest(input->>'run_token','sha256'),'hex') then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_RUN_SCOPE_MISMATCH';
  end if;
  if run.expires_at <= now() then
    update production_rehearsal.scoring_runs set status = 'EXPIRED'
    where run_id = run.run_id and status not in ('CLEANED','ABORTED');
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_RUN_EXPIRED';
  end if;
  if run.synthetic_tournament_id = '2026'
     or run.external_transport <> 'VIRTUAL'
     or run.external_google_writes <> 0
     or run.live_2026_writes <> 0 then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_SAFETY_INVARIANT_FAILED';
  end if;
  return run;
end;
$$;

revoke all on function production_rehearsal.assert_run(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.begin_production_step11_scoring_rehearsal(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_rehearsal, production_control, scoring_authority, auth, extensions, pg_temp
as $$
declare
  scope production_control.resource_scope%rowtype;
  run_id_value uuid := (input->>'run_id')::uuid;
  synthetic_id text := btrim(coalesce(input->>'synthetic_tournament_id',''));
  source_year integer := coalesce((input->>'source_tournament_year')::integer,0);
  source_tournament text := btrim(coalesce(input->>'source_tournament_id',''));
  source_match text := btrim(coalesce(input->>'source_match_id',''));
  candidate_sha_value text := lower(btrim(coalesce(input->>'candidate_sha','')));
  current_fingerprint text;
  authorization_at timestamptz;
  database_fixture jsonb;
  database_fixture_fingerprint text;
  existing_run production_rehearsal.scoring_runs%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_SERVICE_ROLE_REQUIRED';
  end if;
  scope := production_control.assert_current_shadow_v2_dormant();
  begin authorization_at := (input#>>'{director_authorization,authorized_at}')::timestamptz;
  exception when others then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_DIRECTOR_AUTHORIZATION_REQUIRED';
  end;
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PRODUCTION'
     or input->>'project_ref' <> scope.project_ref
     or input->>'project_url' <> scope.project_url
     or input->>'source_workbook_id' <> scope.google_workbook_id
     or input->>'contract_version' <> 'production-step11-scoring-rehearsal-v1'
     or candidate_sha_value !~ '^[0-9a-f]{40}$'
     or lower(input->>'runtime_candidate_sha') <> candidate_sha_value
     or btrim(coalesce(input->>'candidate_hostname','')) !~ '^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$'
     or synthetic_id !~ '^STEP11-[0-9A-F-]{16,}$'
     or synthetic_id = '2026'
     or source_tournament = '2026'
     or source_year not between 2017 and 2025
     or input->>'s3_fingerprint' !~ '^[0-9a-f]{64}$'
     or input->>'expected_current_2026_fingerprint' !~ '^[0-9a-f]{64}$'
     or input->>'source_fingerprint' !~ '^[0-9a-f]{64}$'
     or input->>'frozen_fixture_fingerprint' !~ '^[0-9a-f]{64}$'
     or btrim(coalesce(input->>'run_token','')) = ''
     or jsonb_typeof(input->'frozen_fixture') <> 'object'
     or input#>>'{frozen_fixture,sourceTournamentId}' <> source_tournament
     or coalesce((input#>>'{frozen_fixture,sourceTournamentYear}')::integer,0) <> source_year
     or input#>>'{frozen_fixture,sourceMatchId}' <> source_match
     or encode(extensions.digest((input->'frozen_fixture')::text,'sha256'),'hex')
        <> input->>'frozen_fixture_fingerprint'
     or coalesce((input#>>'{director_authorization,authorized}')::boolean,false) is not true
     or input#>>'{director_authorization,scope}' <> 'PRODUCTION_STEP11_SCORING_REHEARSAL'
     or input#>>'{director_authorization,actor_id}' <> input->>'actor_id'
     or length(btrim(coalesce(input#>>'{director_authorization,authorization_id}',''))) < 8
     or authorization_at < now() - interval '15 minutes'
     or authorization_at > now() + interval '1 minute' then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_REHEARSAL_SCOPE_REQUIRED';
  end if;
  if not exists (
    select 1 from scoring_authority.matches match
    join scoring_authority.tournaments tournament on tournament.tournament_id = match.tournament_id
    where match.match_id = source_match
      and match.tournament_id = source_tournament
      and tournament.tournament_year = source_year
      and upper(match.status) = 'FINAL'
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_COMPLETED_SOURCE_MATCH_REQUIRED';
  end if;
  if not exists (
    select 1
    from production_control.director_entitlements entitlement
    join participant_identity.user_player_links link
      on link.auth_user_id = entitlement.auth_user_id
     and link.player_id = entitlement.player_id
     and link.status = 'ACTIVE'
    join participant_identity.tournament_roles role
      on role.auth_user_id = entitlement.auth_user_id
     and role.tournament_id = entitlement.tournament_id
     and role.role = 'DIRECTOR'
     and role.role_active
    where entitlement.tournament_id = '2026'
      and entitlement.player_id = input->>'actor_id'
      and entitlement.status = 'ACTIVE'
  ) then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_ACTIVE_DIRECTOR_REQUIRED';
  end if;
  database_fixture := production_rehearsal.completed_source_fixture(source_match);
  database_fixture_fingerprint := encode(extensions.digest(database_fixture::text, 'sha256'), 'hex');
  if input->'frozen_fixture' <> database_fixture
     or input->>'frozen_fixture_fingerprint' <> database_fixture_fingerprint
     or input->>'source_fingerprint' <> database_fixture_fingerprint then
    raise exception using errcode = '40001', message = 'PRODUCTION_STEP11_SOURCE_FIXTURE_MISMATCH';
  end if;
  current_fingerprint := production_rehearsal.current_2026_fingerprint();
  if current_fingerprint <> input->>'expected_current_2026_fingerprint' then
    raise exception using errcode = '40001', message = 'PRODUCTION_STEP11_CURRENT_2026_FINGERPRINT_MISMATCH';
  end if;
  select * into existing_run from production_rehearsal.scoring_runs value
  where value.run_id = run_id_value;
  if found then
    if existing_run.run_token_hash <> encode(extensions.digest(input->>'run_token','sha256'),'hex')
       or existing_run.candidate_sha <> candidate_sha_value
       or existing_run.candidate_hostname <> input->>'candidate_hostname'
       or existing_run.synthetic_tournament_id <> synthetic_id
       or existing_run.frozen_fixture_fingerprint <> database_fixture_fingerprint
       or existing_run.s3_fingerprint_before <> input->>'s3_fingerprint'
       or existing_run.current_2026_fingerprint_before <> current_fingerprint then
      raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_RUN_SCOPE_MISMATCH';
    end if;
    return jsonb_build_object('ok',true,'idempotent',true,'runId',existing_run.run_id,
      'syntheticTournamentId',existing_run.synthetic_tournament_id,
      'status',existing_run.status,'authority',existing_run.rehearsal_authority,
      'ingress',existing_run.ingress_state,'externalTransport','VIRTUAL',
      'externalGoogleWrites',0,'live2026Writes',0,
      'current2026Fingerprint',current_fingerprint);
  end if;
  insert into production_rehearsal.scoring_runs (
    run_id, contract_version, project_ref, project_url, source_workbook_id,
    candidate_sha, candidate_hostname, run_token_hash, actor_id,
    director_authorization_id, synthetic_tournament_id, source_tournament_id,
    source_tournament_year, source_match_id, source_fingerprint,
    frozen_fixture_fingerprint, frozen_fixture,
    s3_fingerprint_before, current_2026_fingerprint_before, expires_at
  ) values (
    run_id_value, 'production-step11-scoring-rehearsal-v1', scope.project_ref,
    scope.project_url, scope.google_workbook_id, candidate_sha_value,
    input->>'candidate_hostname', encode(extensions.digest(input->>'run_token','sha256'),'hex'),
    input->>'actor_id', input#>>'{director_authorization,authorization_id}', synthetic_id,
    source_tournament, source_year, source_match, input->>'source_fingerprint',
    input->>'frozen_fixture_fingerprint', input->'frozen_fixture',
    input->>'s3_fingerprint', current_fingerprint,
    least((input->>'expires_at')::timestamptz, now() + interval '4 hours')
  );
  insert into production_rehearsal.evidence_events (
    run_id, event_type, evidence, evidence_fingerprint
  ) values (
    run_id_value, 'RUN_PREPARED',
    jsonb_build_object('syntheticTournamentId',synthetic_id,'sourceTournamentId',source_tournament,
      'sourceMatchId',source_match,'candidateSha',candidate_sha_value,'externalGoogleWrites',0,
      'live2026Writes',0,'authority','GOOGLE','ingress','PAUSED'),
    encode(extensions.digest(concat_ws(E'\n', run_id_value::text, synthetic_id,
      source_match, candidate_sha_value, current_fingerprint),'sha256'),'hex')
  );
  return jsonb_build_object('ok',true,'runId',run_id_value,
    'syntheticTournamentId',synthetic_id,'authority','GOOGLE','ingress','PAUSED',
    'externalTransport','VIRTUAL','externalGoogleWrites',0,'live2026Writes',0,
    'current2026Fingerprint',current_fingerprint);
end;
$$;

create or replace function public.record_production_step11_scoring_rehearsal_evidence(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_rehearsal, production_control, auth, extensions, pg_temp
as $$
declare
  run production_rehearsal.scoring_runs%rowtype;
  existing_event production_rehearsal.evidence_events%rowtype;
  event_type_value text := upper(btrim(coalesce(input->>'event_type','')));
  evidence_value jsonb := input->'evidence';
  evidence_hash text;
  affected_rows integer;
begin
  run := production_rehearsal.assert_run(input);
  evidence_hash := encode(extensions.digest(evidence_value::text,'sha256'),'hex');
  if jsonb_typeof(evidence_value) <> 'object'
     or (nullif(btrim(coalesce(input->>'evidence_fingerprint','')),'') is not null
       and lower(btrim(input->>'evidence_fingerprint')) <> evidence_hash)
     or coalesce((evidence_value->>'externalGoogleWrites')::integer,0) <> 0
     or coalesce((evidence_value->>'live2026Writes')::integer,0) <> 0 then
    raise exception using errcode = '22023', message = 'PRODUCTION_STEP11_EVIDENCE_INVALID';
  end if;
  if event_type_value in ('AUTHORITY_EPOCH_COMMITTED','MATCH_MARKED_LIVE','SCORING_LOCKED',
      'SCORING_UNLOCKED','SCORING_ACCESS_ENABLED','SCORING_ACCESS_REVOKED',
      'HOLE_SCORE_UPSERTED','MATCH_FINALIZED','MATCH_REOPENED')
     and run.synthetic_tournament_id <> evidence_value->>'tournamentId' then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_SYNTHETIC_TARGET_REQUIRED';
  end if;
  select * into existing_event
  from production_rehearsal.evidence_events value
  where value.run_id = run.run_id
    and value.event_type = event_type_value
    and value.mutation_key = coalesce(nullif(input->>'mutation_key',''),'');
  if found then
    if existing_event.evidence_fingerprint <> evidence_hash
       or existing_event.evidence <> evidence_value then
      raise exception using errcode = '40001', message = 'PRODUCTION_STEP11_EVIDENCE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok',true,'idempotent',true,'runId',run.run_id,
      'eventType',event_type_value,'externalGoogleWrites',0,'live2026Writes',0);
  end if;
  if event_type_value = 'AUTHORITY_EPOCH_PREPARED'
     and (run.status <> 'PREPARED' or run.rehearsal_authority <> 'GOOGLE'
       or run.ingress_state <> 'PAUSED') then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_EPOCH_PREPARE_STATE_REQUIRED';
  elsif event_type_value = 'AUTHORITY_EPOCH_COMMITTED'
     and (run.status <> 'PREPARED' or run.rehearsal_authority <> 'GOOGLE'
       or run.ingress_state <> 'PAUSED'
       or not exists (
         select 1 from production_rehearsal.evidence_events prior
         where prior.run_id = run.run_id
           and prior.event_type = 'AUTHORITY_EPOCH_PREPARED'
           and prior.mutation_key = coalesce(nullif(input->>'mutation_key',''),'')
       )) then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_EPOCH_COMMIT_STATE_REQUIRED';
  elsif event_type_value in ('MATCH_MARKED_LIVE','SCORING_LOCKED','SCORING_UNLOCKED',
      'SCORING_ACCESS_ENABLED','SCORING_ACCESS_REVOKED','HOLE_SCORE_UPSERTED',
      'MATCH_FINALIZED','MATCH_REOPENED','MIRROR_CLAIMED','MIRROR_RETRYABLE',
      'MIRROR_CHECKPOINTED','ARCHIVE_CLAIMED','ARCHIVE_RETRYABLE','ARCHIVE_CHECKPOINTED')
     and (run.status <> 'ACTIVE' or run.rehearsal_authority <> 'SUPABASE'
       or run.ingress_state <> 'OPEN') then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_ACTIVE_REHEARSAL_REQUIRED';
  elsif event_type_value = 'ROLLBACK_RECONCILED'
     and (run.status <> 'ACTIVE' or run.rehearsal_authority <> 'SUPABASE'
       or run.ingress_state <> 'OPEN') then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_ACTIVE_ROLLBACK_REQUIRED';
  elsif event_type_value = 'CLEANUP_CERTIFIED'
     and (run.status <> 'ROLLED_BACK' or run.rehearsal_authority <> 'GOOGLE'
       or run.ingress_state <> 'PAUSED') then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_ROLLBACK_REQUIRED';
  end if;
  insert into production_rehearsal.evidence_events (
    run_id, event_type, mutation_key, evidence, evidence_fingerprint
  ) values (
    run.run_id, event_type_value, coalesce(nullif(input->>'mutation_key',''),''), evidence_value, evidence_hash
  ) on conflict (run_id, event_type, mutation_key) do nothing;
  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    select * into strict existing_event
    from production_rehearsal.evidence_events value
    where value.run_id = run.run_id
      and value.event_type = event_type_value
      and value.mutation_key = coalesce(nullif(input->>'mutation_key',''),'');
    if existing_event.evidence_fingerprint <> evidence_hash
       or existing_event.evidence <> evidence_value then
      raise exception using errcode = '40001', message = 'PRODUCTION_STEP11_EVIDENCE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('ok',true,'idempotent',true,'runId',run.run_id,
      'eventType',event_type_value,'externalGoogleWrites',0,'live2026Writes',0);
  end if;
  if event_type_value = 'AUTHORITY_EPOCH_COMMITTED' then
    update production_rehearsal.scoring_runs set status='ACTIVE',
      rehearsal_authority='SUPABASE', ingress_state='OPEN'
    where run_id=run.run_id and status='PREPARED' and rehearsal_authority='GOOGLE'
      and ingress_state='PAUSED' and unresolved_client_queues=0;
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception using errcode = '40001', message = 'PRODUCTION_STEP11_EPOCH_COMMIT_FAILED';
    end if;
  elsif event_type_value = 'ROLLBACK_RECONCILED' then
    if coalesce((evidence_value->>'unresolved')::integer,-1) <> 0
       or coalesce((evidence_value->>'duplicates')::integer,-1) <> 0
       or coalesce((evidence_value->>'lost')::integer,-1) <> 0
       or evidence_value->>'finalAuthorityState' <> 'GOOGLE'
       or evidence_value->>'finalSupabaseFingerprint'
          <> evidence_value->>'finalRollbackTargetFingerprint' then
      raise exception using errcode = '40001', message = 'PRODUCTION_STEP11_ROLLBACK_RECONCILIATION_FAILED';
    end if;
    update production_rehearsal.scoring_runs set status='ROLLED_BACK',
      rehearsal_authority='GOOGLE', ingress_state='PAUSED'
    where run_id=run.run_id and status='ACTIVE';
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception using errcode = '40001', message = 'PRODUCTION_STEP11_ROLLBACK_COMMIT_FAILED';
    end if;
  end if;
  return jsonb_build_object('ok',true,'runId',run.run_id,'eventType',event_type_value,
    'externalGoogleWrites',0,'live2026Writes',0);
end;
$$;

create or replace function public.complete_production_step11_scoring_rehearsal(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, production_rehearsal, production_control, auth, extensions, pg_temp
as $$
declare
  run production_rehearsal.scoring_runs%rowtype;
  evidence jsonb := input->'reconciliation';
  current_fingerprint text;
  existing_certification production_rehearsal.cleanup_certifications%rowtype;
begin
  run := production_rehearsal.assert_run(input);
  if run.status = 'CLEANED' then
    select * into strict existing_certification
    from production_rehearsal.cleanup_certifications value where value.run_id = run.run_id;
    if input->>'s3_fingerprint_after' <> existing_certification.s3_fingerprint_after
       or evidence->>'finalSupabaseFingerprint' <> existing_certification.synthetic_final_fingerprint
       or coalesce((evidence->>'duplicates')::integer,-1) <> 0
       or coalesce((evidence->>'unresolved')::integer,-1) <> 0
       or coalesce((evidence->>'lost')::integer,-1) <> 0 then
      raise exception using errcode = '40001', message = 'PRODUCTION_STEP11_CLEANUP_CERTIFICATION_CONFLICT';
    end if;
    return jsonb_build_object('ok',true,'idempotent',true,'runId',run.run_id,
      'status','CLEANED','current2026Unchanged',true,'s3Unchanged',true,
      'externalGoogleWrites',0,'live2026Writes',0,'finalAuthority','GOOGLE');
  end if;
  if run.status <> 'ROLLED_BACK' or run.rehearsal_authority <> 'GOOGLE'
     or run.ingress_state <> 'PAUSED' then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_ROLLBACK_REQUIRED';
  end if;
  current_fingerprint := production_rehearsal.current_2026_fingerprint();
  if current_fingerprint <> run.current_2026_fingerprint_before
     or input->>'s3_fingerprint_after' <> run.s3_fingerprint_before
     or coalesce((evidence->>'duplicates')::integer,-1) <> 0
     or coalesce((evidence->>'unresolved')::integer,-1) <> 0
     or coalesce((evidence->>'lost')::integer,-1) <> 0
     or evidence->>'finalAuthorityState' <> 'GOOGLE'
     or evidence->>'finalSupabaseFingerprint' <> evidence->>'finalRollbackTargetFingerprint'
     or coalesce((evidence->>'externalGoogleWrites')::integer,-1) <> 0
     or coalesce((evidence->>'live2026Writes')::integer,-1) <> 0 then
    raise exception using errcode = '40001', message = 'PRODUCTION_STEP11_CLEANUP_CERTIFICATION_FAILED';
  end if;
  insert into production_rehearsal.cleanup_certifications (
    run_id, synthetic_tournament_id, synthetic_final_fingerprint,
    s3_fingerprint_before, s3_fingerprint_after,
    current_2026_fingerprint_before, current_2026_fingerprint_after,
    supabase_authoritative_writes, already_mirrored, reconciled_writes,
    duplicate_writes, unresolved_writes, lost_writes, final_authority,
    external_google_writes, live_2026_writes, certified_by
  ) values (
    run.run_id, run.synthetic_tournament_id, evidence->>'finalSupabaseFingerprint',
    run.s3_fingerprint_before, input->>'s3_fingerprint_after',
    run.current_2026_fingerprint_before, current_fingerprint,
    (evidence->>'supabaseAuthoritativeWrites')::integer,
    (evidence->>'alreadyRepresentedInMirror')::integer,
    (evidence->>'successfullyReconciled')::integer, 0, 0, 0, 'GOOGLE', 0, 0,
    input->>'actor_id'
  );
  update production_rehearsal.scoring_runs set status='CLEANED',
    current_2026_fingerprint_after=current_fingerprint, completed_at=now()
  where run_id=run.run_id;
  return jsonb_build_object('ok',true,'runId',run.run_id,'status','CLEANED',
    'current2026Unchanged',true,'s3Unchanged',true,
    'externalGoogleWrites',0,'live2026Writes',0,'finalAuthority','GOOGLE');
end;
$$;

revoke all on function public.begin_production_step11_scoring_rehearsal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.inspect_production_step11_scoring_rehearsal(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.record_production_step11_scoring_rehearsal_evidence(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_production_step11_scoring_rehearsal(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.begin_production_step11_scoring_rehearsal(jsonb) to service_role;
grant execute on function public.inspect_production_step11_scoring_rehearsal(jsonb) to service_role;
grant execute on function public.record_production_step11_scoring_rehearsal_evidence(jsonb) to service_role;
grant execute on function public.complete_production_step11_scoring_rehearsal(jsonb) to service_role;

comment on schema production_rehearsal is
  'Service-role-only Step 11 synthetic scoring evidence. It cannot target tournament 2026 or perform external Google writes.';

notify pgrst, 'reload schema';
commit;
