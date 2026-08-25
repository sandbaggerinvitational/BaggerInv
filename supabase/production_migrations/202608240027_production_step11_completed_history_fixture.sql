-- Step 11 completed-history fixture correction.
--
-- Migration 018 intentionally freezes a real, completed Production match before
-- creating its synthetic rehearsal state. The first implementation looked for
-- that source match in the current-tournament scoring tables. Certified
-- 2017-2025 facts instead live in immutable, revisioned completed-history tables.
-- This migration changes only the source fixture lookup and its begin-time
-- verification. It never inserts, updates, or deletes canonical scoring facts.
begin;

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
    'sourceTournamentId', candidate.tournament_id,
    'sourceTournamentYear', candidate.tournament_year,
    'sourceMatchId', candidate.match_id,
    'sourceRevisionId', candidate.revision_id,
    'sourceRevisionNumber', candidate.revision_number,
    'sourceRevisionFingerprint', candidate.database_payload_fingerprint,
    'status', candidate.lifecycle,
    'format', candidate.format,
    'participantIds', candidate.participant_ids,
    'courseId', candidate.course_id,
    'tee', candidate.tee,
    'roundNumber', candidate.round_number
  )
  into fixture
  from (
    select
      current_revision.tournament_id,
      current_revision.tournament_year,
      revision.revision_id,
      revision.revision_number,
      revision.database_payload_fingerprint,
      completed_match.match_id,
      upper(completed_match.lifecycle) as lifecycle,
      upper(completed_match.format) as format,
      completed_match.round_number,
      course.course_id,
      course.tee,
      participants.participant_ids
    from scoring_authority.completed_history_current_revisions current_revision
    join scoring_authority.completed_history_revisions revision
      on revision.revision_id = current_revision.revision_id
     and revision.tournament_id = current_revision.tournament_id
     and revision.tournament_year = current_revision.tournament_year
     and revision.project_ref = current_revision.project_ref
     and revision.source_workbook_id = current_revision.source_workbook_id
    join scoring_authority.completed_history_tournament_facts tournament
      on tournament.revision_id = revision.revision_id
     and tournament.tournament_id = current_revision.tournament_id
     and tournament.tournament_year = current_revision.tournament_year
    join scoring_authority.completed_history_matches completed_match
      on completed_match.revision_id = revision.revision_id
     and completed_match.tournament_id = current_revision.tournament_id
    join scoring_authority.completed_history_course_appearances course
      on course.revision_id = revision.revision_id
     and course.tournament_id = current_revision.tournament_id
     and course.appearance_id = completed_match.course_appearance_id
    join lateral (
      select
        jsonb_agg(
          participant.player_id
          order by participant.team_side, participant.player_slot, participant.player_id
        ) as participant_ids,
        count(*) as participant_count
      from scoring_authority.completed_history_match_participants participant
      where participant.revision_id = revision.revision_id
        and participant.match_id = completed_match.match_id
        and btrim(participant.player_id) <> ''
    ) participants on participants.participant_count >= 2
    where current_revision.project_ref = 'ymqhhtxaywtqllynrmxe'
      and current_revision.source_workbook_id = '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
      and current_revision.tournament_year between 2017 and 2025
      and current_revision.tournament_id <> '2026'
      and upper(completed_match.lifecycle) = 'FINAL'
      and upper(completed_match.format) in ('BB', 'SC', 'SI')
      and (
        nullif(btrim(coalesce(requested_match_id, '')), '') is null
        or completed_match.match_id = btrim(requested_match_id)
      )
  ) candidate
  order by candidate.tournament_year desc, candidate.match_id
  limit 1;

  if fixture is null
     or jsonb_array_length(fixture->'participantIds') < 2 then
    raise exception using
      errcode = '42501',
      message = 'PRODUCTION_STEP11_COMPLETED_SOURCE_MATCH_REQUIRED';
  end if;

  return fixture;
end;
$$;

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
  if database_fixture->>'sourceTournamentId' <> source_tournament
     or coalesce((database_fixture->>'sourceTournamentYear')::integer, 0) <> source_year
     or database_fixture->>'sourceMatchId' <> source_match then
    raise exception using errcode = '42501', message = 'PRODUCTION_STEP11_COMPLETED_SOURCE_MATCH_REQUIRED';
  end if;
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

revoke all on function production_rehearsal.completed_source_fixture(text)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_production_step11_scoring_rehearsal(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_production_step11_scoring_rehearsal(jsonb)
  to service_role;

comment on function production_rehearsal.completed_source_fixture(text) is
  'Read-only Step 11 fixture resolver bound to the certified current revision of immutable 2017-2025 Production completed history.';

commit;
