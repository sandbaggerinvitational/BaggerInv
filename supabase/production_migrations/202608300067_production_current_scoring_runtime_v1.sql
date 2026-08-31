-- Step 13E.7A current-tournament scoring runtime V1.
--
-- This migration is additive and inert.  It does not replace, rename, or
-- redefine any certified 2026 RPC.  New future-only RPCs preserve the current
-- request/success shapes, while their server-side caller resolves the active
-- tournament pointer and binds each call to exact annual-generation tokens.
begin;

create or replace function
  production_control.assert_future_scoring_runtime_capability_v1(
    target_tournament_id text,
    expected_runtime_generation_id uuid,
    expected_authority_generation_id uuid,
    expected_admission_generation_id uuid
  )
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  generation production_control.future_annual_runtime_generations_v1%rowtype;
begin
  select value.* into generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_tournament_id
    and value.runtime_generation_id = expected_runtime_generation_id;
  if generation.runtime_generation_id is null
     or generation.generation_status <> 'PREPARED'
     or generation.authority_generation_id <> expected_authority_generation_id
     or generation.admission_generation_id <> expected_admission_generation_id
     or expected_authority_generation_id = expected_admission_generation_id
     or expected_runtime_generation_id in (
       expected_authority_generation_id, expected_admission_generation_id
     )
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or not exists (
       select 1 from scoring_authority.tournaments tournament_value
       where tournament_value.tournament_id = target_tournament_id
         and tournament_value.scoring_authority = 'SUPABASE'
     )
     or exists (
       select 1 from scoring_authority.matches match_value
       where match_value.tournament_id = target_tournament_id
         and (match_value.status <> 'UPCOMING'
           or match_value.match_revision <> 0
           or match_value.scored_holes <> 0
           or match_value.scorecard_complete
           or match_value.finalized_at is not null)
     )
     or exists (
       select 1 from scoring_authority.scoring_permissions permission
       join scoring_authority.matches match_value
         on match_value.match_id = permission.match_id
       where match_value.tournament_id = target_tournament_id
         and permission.can_score
     )
     or exists (
       select 1 from scoring_authority.hole_scores score
       join scoring_authority.matches match_value
         on match_value.match_id = score.match_id
       where match_value.tournament_id = target_tournament_id
     ) then
    raise exception using errcode = '55000',
      message = 'FUTURE_SCORING_RUNTIME_CAPABILITY_INVALID';
  end if;
end;
$$;

create or replace function
  production_control.assert_future_production_scoring_runtime_v1(
    input jsonb,
    required_worker text default null
  )
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
  active_generation_count integer;
begin
  -- This proves the frozen Step-12 platform/deployment/worker prerequisites.
  -- The independent annual generation below is the target authority evidence.
  perform production_control.assert_production_scoring_runtime(
    input, required_worker
  );
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  if pointer.tournament_id = '2026' then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_SCORING_TARGET_REQUIRED';
  end if;
  select value.* into catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = pointer.tournament_id;
  select pg_catalog.count(*)::integer into active_generation_count
  from production_control.future_annual_runtime_generations_v1 value
  where value.generation_status = 'ACTIVE';
  select value.* into generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = pointer.tournament_id
    and value.generation_status = 'ACTIVE';
  if input->>'expected_current_tournament_id'
       is distinct from pointer.tournament_id
     or coalesce((input->>'expected_pointer_revision')::bigint, -1)
       <> pointer.pointer_revision
     or input->>'expected_runtime_generation_id'
       is distinct from generation.runtime_generation_id::text
     or input->>'expected_annual_authority_generation_id'
       is distinct from generation.authority_generation_id::text
     or input->>'expected_annual_admission_generation_id'
       is distinct from generation.admission_generation_id::text
     or active_generation_count <> 1
     or generation.runtime_generation_id is null
     or generation.pointer_revision <> pointer.pointer_revision
     or generation.authority <> 'SUPABASE'
     or generation.ingress_state <> 'OPEN'
     or catalog.tournament_id is null
     or catalog.lifecycle <> 'ACTIVE'
     or catalog.lifecycle_revision <> pointer.lifecycle_revision
     or not exists (
       select 1 from scoring_authority.tournaments tournament_value
       where tournament_value.tournament_id = pointer.tournament_id
         and tournament_value.scoring_authority = 'SUPABASE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_SCORING_RUNTIME_REQUIRED';
  end if;
  return pointer.tournament_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_SCORING_RUNTIME_REQUIRED';
end;
$$;

create or replace function
  production_control.assert_future_production_scoring_actor_v1(
    input jsonb,
    target_tournament text,
    require_director boolean default false
  )
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_role text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,role}', 'PLAYER'
  )));
  actor_auth_user uuid;
begin
  begin
    actor_auth_user := nullif(
      input#>>'{authorization,auth_user_id}', ''
    )::uuid;
  exception when others then actor_auth_user := null;
  end;
  if input#>>'{authorization,tournament_id}' is distinct from target_tournament
     or actor = '' or actor_auth_user is null
     or actor_role not in ('PLAYER', 'DIRECTOR')
     or (require_director and actor_role <> 'DIRECTOR') then
    raise exception using errcode = '42501', message = case
      when require_director then 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED'
      else 'PRODUCTION_SCORING_AUTHORIZATION_REQUIRED' end;
  end if;
  if not exists (
    select 1
    from participant_identity.user_player_links link
    join auth.users auth_user
      on auth_user.id = link.auth_user_id
     and auth_user.email_confirmed_at is not null
    join participant_identity.participant_auth_identifiers identifier
      on identifier.auth_user_id = link.auth_user_id
     and identifier.player_id = link.player_id
     and identifier.identifier_type = 'EMAIL'
     and identifier.status = 'VERIFIED'
    join participant_identity.tournament_roles tournament_role
      on tournament_role.tournament_id = target_tournament
     and tournament_role.auth_user_id = link.auth_user_id
     and tournament_role.role = case when actor_role = 'DIRECTOR'
       then 'DIRECTOR' else 'PARTICIPANT' end
     and tournament_role.role_active
     and tournament_role.revoked_at is null
    join scoring_authority.tournament_players membership
      on membership.tournament_id = target_tournament
     and membership.player_id = link.player_id
     and membership.participation_status = 'ACTIVE'
    where link.auth_user_id = actor_auth_user
      and link.player_id = actor
      and link.status = 'ACTIVE'
      and link.revoked_at is null
  ) then
    raise exception using errcode = '42501', message = case
      when require_director then 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED'
      else 'PRODUCTION_SCORING_AUTHORIZATION_REQUIRED' end;
  end if;
  if actor_role = 'DIRECTOR' and not exists (
    select 1 from production_control.director_entitlements entitlement
    where entitlement.auth_user_id = actor_auth_user
      and entitlement.tournament_id = '2026'
      and entitlement.player_id = actor
      and entitlement.role in ('DIRECTOR', 'OWNER')
      and entitlement.status = 'ACTIVE'
      and entitlement.revoked_at is null
  ) then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_AUTHORIZATION_REQUIRED';
  end if;
end;
$$;

create or replace function
  production_control.assert_future_production_match_scoring_ready_v1(
    target_match_id text,
    target_tournament text
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  reasons jsonb := '[]'::jsonb;
  match_value scoring_authority.matches%rowtype;
  round_value scoring_authority.rounds%rowtype;
  detail_value scoring_authority.tournament_setup_match_details_v1%rowtype;
  binding production_control.future_runtime_match_bindings_v2%rowtype;
  assignment scoring_authority.tournament_setup_round_courses_v1%rowtype;
  course_value scoring_authority.tournament_setup_course_tees_v1%rowtype;
  snapshot_value scoring_authority.scoring_snapshots%rowtype;
  current_handicap uuid;
  expected_count integer;
  participant_count integer;
  holes_value jsonb;
  match_holes_value jsonb;
  context_value jsonb;
  current_participant_values jsonb;
begin
  select value.* into match_value from scoring_authority.matches value
  where value.match_id = target_match_id
    and value.tournament_id = target_tournament;
  if match_value.match_id is null then
    return pg_catalog.jsonb_build_object(
      'ready', false,
      'contractVersion', 'production-match-scoring-readiness-v1',
      'matchId', target_match_id,
      'reasons', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'code', 'MATCH_NOT_FOUND',
        'message', 'The canonical Production match does not exist.'
      ))
    );
  end if;
  select value.* into round_value from scoring_authority.rounds value
  where value.tournament_id = target_tournament
    and value.round_number = match_value.round_number;
  select value.* into detail_value
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.tournament_id = target_tournament
    and value.match_id = target_match_id;
  select value.* into binding
  from production_control.future_runtime_match_bindings_v2 value
  where value.tournament_id = target_tournament
    and value.match_id = target_match_id;
  select value.* into snapshot_value
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = match_value.scoring_snapshot_id
    and value.tournament_id = target_tournament
    and value.match_id = target_match_id;
  if round_value.tournament_id is null
     or round_value.format not in ('BB', 'SC', 'SI')
     or round_value.format is distinct from match_value.format then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_CONFIGURATION_INVALID',
        'message', 'The match does not match its canonical round configuration.'
      )
    );
  end if;
  if detail_value.match_id is null
     or binding.match_id is null
     or binding.runtime_state <> 'PREPARED'
     or detail_value.prepared_setup_revision is distinct from detail_value.setup_revision
     or detail_value.prepared_configuration_fingerprint is null
     or detail_value.prepared_configuration_fingerprint
       is distinct from binding.configuration_fingerprint then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SETUP_SNAPSHOT_STALE',
        'message', 'The match setup changed after its scoring snapshot was prepared.'
      )
    );
  end if;
  if snapshot_value.snapshot_id is null
     or snapshot_value.snapshot_revision is distinct from (
       select pg_catalog.max(candidate.snapshot_revision)
       from scoring_authority.scoring_snapshots candidate
       where candidate.match_id = target_match_id
         and candidate.tournament_id = target_tournament
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_SNAPSHOT_NOT_CURRENT',
        'message', 'The match needs its latest scoring snapshot prepared.'
      )
    );
  end if;
  select value.* into assignment
  from scoring_authority.tournament_setup_round_courses_v1 value
  where value.tournament_id = target_tournament
    and value.round_number = match_value.round_number;
  select value.* into course_value
  from scoring_authority.tournament_setup_course_tees_v1 value
  where value.tournament_id = target_tournament
    and value.course_id = detail_value.course_id
    and value.tee_id = detail_value.tee_id;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'hole_number', hole.hole_number, 'par', hole.par,
    'stroke_index', hole.stroke_index, 'yardage', hole.yardage
  ) order by hole.hole_number) into holes_value
  from scoring_authority.tournament_setup_course_holes_v1 hole
  where hole.tournament_id = target_tournament
    and hole.course_id = detail_value.course_id
    and hole.tee_id = detail_value.tee_id;
  if assignment.tournament_id is null
     or assignment.course_id is distinct from detail_value.course_id
     or assignment.tee_id is distinct from detail_value.tee_id
     or course_value.tournament_id is null
     or course_value.rating is null
     or course_value.slope not between 55 and 155
     or course_value.par not between 54 and 90
     or pg_catalog.jsonb_typeof(holes_value) is distinct from 'array'
     or pg_catalog.jsonb_array_length(coalesce(holes_value, '[]'::jsonb)) <> 18
     or (select pg_catalog.count(distinct (hole->>'hole_number')::integer)
       from pg_catalog.jsonb_array_elements(coalesce(holes_value, '[]'::jsonb)) hole) <> 18
     or (select pg_catalog.count(distinct (hole->>'stroke_index')::integer)
       from pg_catalog.jsonb_array_elements(coalesce(holes_value, '[]'::jsonb)) hole) <> 18
     or (select pg_catalog.sum((hole->>'par')::integer)
       from pg_catalog.jsonb_array_elements(coalesce(holes_value, '[]'::jsonb)) hole)
       is distinct from course_value.par then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'COURSE_HOLES_INCOMPLETE',
        'message', 'The course requires 18 complete, valid hole definitions.'
      )
    );
  end if;
  if snapshot_value.snapshot_id is not null and (
       snapshot_value.format is distinct from match_value.format
       or snapshot_value.handicap_allowance is distinct from round_value.handicap_allowance
       or snapshot_value.course_id is distinct from course_value.course_id
       or snapshot_value.tee is distinct from course_value.tee_id
       or snapshot_value.rating is distinct from course_value.rating
       or snapshot_value.slope is distinct from course_value.slope
       or snapshot_value.par is distinct from course_value.par
       or snapshot_value.hole_definitions is distinct from holes_value
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_SNAPSHOT_CONFIGURATION_STALE',
        'message', 'The scoring snapshot no longer matches the current setup facts.'
      )
    );
  end if;
  expected_count := case when match_value.format = 'SI' then 2 else 4 end;
  select pg_catalog.count(*)::integer into participant_count
  from scoring_authority.match_participants participant
  where participant.match_id = target_match_id;
  if participant_count <> expected_count
     or (select pg_catalog.count(distinct participant.player_id)
       from scoring_authority.match_participants participant
       where participant.match_id = target_match_id) <> expected_count
     or (select pg_catalog.count(*) from scoring_authority.match_participants participant
       where participant.match_id = target_match_id and participant.team_side = 1)
       <> expected_count / 2
     or (select pg_catalog.count(*) from scoring_authority.match_participants participant
       where participant.match_id = target_match_id and participant.team_side = 2)
       <> expected_count / 2 then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PAIRINGS_INCOMPLETE',
        'message', 'The match requires complete, unique Player pairings.'
      )
    );
  end if;
  if exists (
    select 1 from scoring_authority.match_participants participant
    left join scoring_authority.tournament_players membership
      on membership.tournament_id = target_tournament
     and membership.player_id = participant.player_id
    left join scoring_authority.teams team
      on team.tournament_id = membership.tournament_id
     and team.team_id = membership.team_id
     and team.team_side = membership.team_side
    where participant.match_id = target_match_id
      and (membership.player_id is null
        or membership.participation_status <> 'ACTIVE'
        or membership.team_side <> participant.team_side
        or team.team_id is null)
  ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PAIRING_TEAM_MEMBERSHIP_INVALID',
        'message', 'A paired Player does not have the required active team membership.'
      )
    );
  end if;
  if exists (
    select 1 from scoring_authority.match_participants participant
    join scoring_authority.matches other_match
      on other_match.match_id = participant.match_id
     and other_match.tournament_id = target_tournament
     and other_match.round_number = match_value.round_number
    where participant.player_id in (
      select current_participant.player_id
      from scoring_authority.match_participants current_participant
      where current_participant.match_id = target_match_id
    )
    group by participant.player_id having pg_catalog.count(*) > 1
  ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_DUPLICATE_PLAYER',
        'message', 'A paired Player appears more than once in this round.'
      )
    );
  end if;
  select value.revision_id into current_handicap
  from scoring_authority.handicap_revision_current value
  where value.tournament_id = target_tournament;
  if current_handicap is null
     or snapshot_value.handicap_revision_id is distinct from current_handicap
     or exists (
       select 1 from scoring_authority.match_participants participant
       left join scoring_authority.handicap_revision_entries entry
         on entry.revision_id = current_handicap
        and entry.tournament_id = target_tournament
        and entry.player_id = participant.player_id
       where participant.match_id = target_match_id
         and (entry.player_id is null
           or participant.handicap_revision_id is distinct from current_handicap)
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'HANDICAP_CONTEXT_NOT_CURRENT',
        'message', 'Every paired Player needs the current approved handicap context.'
      )
    );
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'hole_number', hole.hole_number, 'par', hole.par,
    'stroke_index', hole.stroke_index, 'yardage', hole.yardage
  ) order by hole.hole_number) into match_holes_value
  from scoring_authority.match_holes hole
  where hole.match_id = target_match_id
    and hole.snapshot_id = snapshot_value.snapshot_id;
  if match_holes_value is distinct from holes_value then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_HOLES_NOT_CURRENT',
        'message', 'The match hole scoring context is not current.'
      )
    );
  end if;
  if (select pg_catalog.count(*) from scoring_authority.scoring_permissions permission
      where permission.match_id = target_match_id) <> participant_count
     or exists (
       select 1 from scoring_authority.match_participants participant
       left join scoring_authority.scoring_permissions permission
         on permission.match_id = participant.match_id
        and permission.player_id = participant.player_id
       where participant.match_id = target_match_id
         and (permission.player_id is null
           or permission.permission_revision <> match_value.permission_revision)
     )
     or exists (
       select 1 from scoring_authority.scoring_permissions permission
       left join scoring_authority.match_participants participant
         on participant.match_id = permission.match_id
        and participant.player_id = permission.player_id
       where permission.match_id = target_match_id
         and participant.player_id is null
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_PERMISSION_COVERAGE_INVALID',
        'message', 'Scoring access records do not match the current pairings.'
      )
    );
  end if;
  if match_value.scored_holes <> 0 or match_value.current_hole <> 0
     or match_value.holes_remaining <> 18
     or match_value.team_1_holes_won <> 0 or match_value.team_2_holes_won <> 0
     or match_value.running_result <> 'Scheduled'
     or match_value.result_winner <> '' or match_value.clinched
     or match_value.scorecard_complete or match_value.finalized_at is not null
     or match_value.unresolved_mutations <> 0
     or exists (select 1 from scoring_authority.hole_scores score
       where score.match_id = target_match_id)
     or exists (select 1 from scoring_authority.score_mutations mutation
       where mutation.match_id = target_match_id)
     or exists (select 1 from scoring_authority.finalized_scorecard_snapshots final_value
       where final_value.match_id = target_match_id)
     or exists (select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = target_tournament
         and lease.match_id = target_match_id
         and lease.expires_at > pg_catalog.clock_timestamp()) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'MATCH_ALREADY_HAS_SCORING_ACTIVITY',
        'message', 'The match already has scoring activity and cannot be started from setup.'
      )
    );
  end if;
  if pg_catalog.jsonb_array_length(reasons) = 0 then
    begin
      context_value := production_control.future_handicap_match_context_v2(
        target_match_id, current_handicap
      );
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'player_id', participant.player_id,
        'team_side', participant.team_side,
        'player_slot', participant.player_slot,
        'tournament_handicap', participant.tournament_handicap,
        'handicap_index', participant.handicap_index,
        'course_handicap', participant.course_handicap,
        'playing_handicap', participant.playing_handicap,
        'final_strokes', participant.final_strokes
      ) order by participant.team_side, participant.player_slot)
      into current_participant_values
      from scoring_authority.match_participants participant
      where participant.match_id = target_match_id;
      if current_participant_values is distinct from
           context_value->'participants' then
        reasons := reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'SCORING_PARTICIPANT_HANDICAPS_STALE',
            'message', 'The paired Player handicap values must be refreshed.'
          )
        );
      end if;
      if snapshot_value.participant_configuration is distinct from
           context_value->'participant_configuration'
         or snapshot_value.team_configuration is distinct from
           context_value->'team_configuration' then
        reasons := reasons || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'code', 'SCORING_HANDICAP_PROJECTION_STALE',
            'message', 'The scoring handicap projection must be refreshed.'
          )
        );
      end if;
    exception when others then
      reasons := reasons || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'SCORING_HANDICAP_PROJECTION_INCOMPLETE',
          'message', 'The scoring handicap projection is incomplete.'
        )
      );
    end;
  end if;
  return pg_catalog.jsonb_build_object(
    'ready', pg_catalog.jsonb_array_length(reasons) = 0,
    'contractVersion', 'production-match-scoring-readiness-v1',
    'matchId', target_match_id, 'source', 'TOURNAMENT_SETUP_V1',
    'reasons', reasons
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'ready', false,
    'contractVersion', 'production-match-scoring-readiness-v1',
    'matchId', target_match_id,
    'reasons', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'code', 'SCORING_READINESS_UNAVAILABLE',
      'message', 'Scoring readiness could not be verified safely.'
    ))
  );
end;
$$;
create or replace function public.future_production_read_scoring_authority_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  target_match text := input->>'match_id';
  mode text := pg_catalog.upper(coalesce(input->>'mode', 'DIAGNOSTICS'));
  payload jsonb;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input);
  select value.* into strict generation
  from production_control.future_annual_runtime_generations_v1 value
  where value.tournament_id = target_tournament and value.generation_status = 'ACTIVE';
  if mode = 'MATCH' then
    select pg_catalog.to_jsonb(match_value) into payload
    from scoring_authority.matches match_value
    where match_id = target_match and tournament_id = target_tournament;
  elsif mode = 'SCORECARD' then
    select pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(match_value),
      'holes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(hole) order by hole_number)
        from scoring_authority.hole_scores hole where hole.match_id = match_value.match_id), '[]'::jsonb)
    ) into payload from scoring_authority.matches match_value
    where match_id = target_match and tournament_id = target_tournament;
  elsif mode = 'CURRENT_STATE' then
    select pg_catalog.jsonb_build_object(
      'matches', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value) order by round_number, match_id)
        from scoring_authority.matches value where tournament_id = target_tournament), '[]'::jsonb),
      'holes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(hole) order by hole.match_id, hole.hole_number)
        from scoring_authority.hole_scores hole join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament), '[]'::jsonb),
      'players', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value) order by player_id)
        from scoring_authority.tournament_players value where tournament_id = target_tournament), '[]'::jsonb),
      'snapshots', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(value) order by match_id)
        from scoring_authority.scoring_snapshots value where tournament_id = target_tournament), '[]'::jsonb),
      'permissions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission) order by match_id, player_id)
        from scoring_authority.scoring_permissions permission join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament), '[]'::jsonb),
      'checkpoints', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(checkpoint) order by match_id)
        from scoring_authority.google_match_checkpoints checkpoint join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament), '[]'::jsonb)
    ) into payload;
  elsif mode = 'DIAGNOSTICS' then
    select pg_catalog.jsonb_build_object(
      'matches', (select pg_catalog.count(*) from scoring_authority.matches where tournament_id = target_tournament),
      'holes', (select pg_catalog.count(*) from scoring_authority.hole_scores hole join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament),
      'permissions', (select pg_catalog.count(*) from scoring_authority.scoring_permissions permission join scoring_authority.matches match_value using (match_id)
        where match_value.tournament_id = target_tournament),
      'pending_outbox', (select pg_catalog.count(*) from scoring_authority.google_outbox_events
        where tournament_id = target_tournament and status <> 'DELIVERED'),
      'authority', (select scoring_authority from scoring_authority.tournaments where tournament_id = target_tournament),
      'ingress', pg_catalog.jsonb_build_object(
        'tournament_id', target_tournament, 'state', generation.ingress_state,
        'authority', generation.authority,
        'active_epoch_id', generation.authority_generation_id,
        'unresolved_client_queues', 0, 'updated_at', generation.updated_at)
    ) into payload;
  else
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_READ_MODE');
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'mode', mode, 'data', payload);
end;
$$;

create or replace function public.future_production_read_scoring_participant_context_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  target_match text := input->>'match_id';
  actor text := input->>'player_id';
  actor_auth_user uuid := nullif(input->>'auth_user_id', '')::uuid;
  participant_role text := pg_catalog.upper(coalesce(input->>'role', 'PLAYER'));
  supplied_permission_revision bigint := coalesce((input->>'permission_revision')::bigint, -1);
  match_row scoring_authority.matches%rowtype;
  permission_ok boolean := false;
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input);
  select * into match_row from scoring_authority.matches
  where match_id = target_match and tournament_id = target_tournament;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if actor_auth_user is not null
     and supplied_permission_revision = match_row.permission_revision
     and exists (
       select 1 from participant_identity.user_player_links link
       join auth.users auth_user on auth_user.id = link.auth_user_id and auth_user.email_confirmed_at is not null
       join participant_identity.participant_auth_identifiers identifier
         on identifier.auth_user_id = link.auth_user_id and identifier.player_id = link.player_id
        and identifier.identifier_type = 'EMAIL' and identifier.status = 'VERIFIED'
       join participant_identity.tournament_roles tournament_role
         on tournament_role.tournament_id = target_tournament and tournament_role.auth_user_id = link.auth_user_id
        and tournament_role.role = case when participant_role = 'DIRECTOR' then 'DIRECTOR' else 'PARTICIPANT' end
        and tournament_role.role_active and tournament_role.revoked_at is null
       join scoring_authority.tournament_players membership
         on membership.tournament_id = target_tournament and membership.player_id = link.player_id
        and membership.participation_status = 'ACTIVE'
       where link.auth_user_id = actor_auth_user and link.player_id = actor
         and link.status = 'ACTIVE' and link.revoked_at is null
     )
     and (participant_role <> 'DIRECTOR' or exists (
       select 1 from production_control.director_entitlements entitlement
       where entitlement.auth_user_id = actor_auth_user and entitlement.tournament_id = '2026'
         and entitlement.player_id = actor and entitlement.role in ('DIRECTOR', 'OWNER')
         and entitlement.status = 'ACTIVE' and entitlement.revoked_at is null
     )) then
    if participant_role = 'PLAYER' then
      select exists (select 1 from scoring_authority.scoring_permissions
        where match_id = target_match and player_id = actor and can_score and revoked_at is null
          and permission_revision = match_row.permission_revision) into permission_ok;
    elsif participant_role = 'DIRECTOR' then permission_ok := true;
    end if;
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'data', pg_catalog.jsonb_build_object(
    'match', pg_catalog.to_jsonb(match_row),
    'holes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(hole) order by hole_number)
      from scoring_authority.hole_scores hole where hole.match_id = target_match), '[]'::jsonb),
    'authorization', pg_catalog.jsonb_build_object(
      'verified', permission_ok,
      'writable', permission_ok and match_row.status <> 'FINAL' and not match_row.scoring_locked,
      'permission_revision', match_row.permission_revision)
  ));
end;
$$;

revoke all on function public.future_production_read_scoring_authority_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.future_production_read_scoring_participant_context_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.future_production_read_scoring_authority_v1(jsonb) to service_role;
grant execute on function public.future_production_read_scoring_participant_context_v1(jsonb) to service_role;
create or replace function public.future_production_submit_hole_score_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  match_row scoring_authority.matches%rowtype;
  hole_row scoring_authority.hole_scores%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  permission_row scoring_authority.scoring_permissions%rowtype;
  target_match text := input->>'match_id';
  target_hole integer := nullif(input->>'hole_number', '')::integer;
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  actor_role text := pg_catalog.upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  team_1_gross jsonb := input->'team_1_gross_scores';
  team_2_gross jsonb := input->'team_2_gross_scores';
  expected_match bigint := coalesce(nullif(input->>'expected_match_revision', '')::bigint, -1);
  expected_hole bigint := coalesce(nullif(input->>'expected_hole_revision', '')::bigint, -1);
  expected_count integer;
  current_hole_revision bigint := 0;
  hole_exists boolean := false;
  next_hole_revision bigint;
  next_match_revision bigint;
  stroke_index_value integer;
  team_1_strokes jsonb;
  team_2_strokes jsonb;
  team_1_net integer;
  team_2_net integer;
  winner text;
  progress jsonb;
  before_state jsonb;
  payload_hash_value text;
  result_value jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input);
  perform production_control.assert_future_production_scoring_actor_v1(input, target_tournament, false);
  if coalesce(target_match, '') = '' or coalesce(mutation_identity, '') = '' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  select * into match_row from scoring_authority.matches
  where match_id = target_match and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  if actor_role = 'PLAYER' then
    select * into permission_row from scoring_authority.scoring_permissions
    where match_id = target_match and player_id = actor;
    if not found or not permission_row.can_score or permission_row.revoked_at is not null then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
    end if;
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> permission_row.permission_revision
       or permission_row.permission_revision <> match_row.permission_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
        'current_permission_revision', match_row.permission_revision);
    end if;
  elsif actor_role = 'DIRECTOR' then
    if coalesce((input#>>'{authorization,permission_revision}')::bigint, -1) <> match_row.permission_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
        'current_permission_revision', match_row.permission_revision);
    end if;
  else return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(pg_catalog.jsonb_build_object(
    'match_id', target_match, 'hole_number', target_hole,
    'team_1_gross_scores', team_1_gross, 'team_2_gross_scores', team_2_gross,
    'actor_id', actor));
  select * into mutation_row from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object('idempotent', true);
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if match_row.scoring_locked then return pg_catalog.jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if match_row.status = 'FINAL' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if target_hole not between 1 and 18 then return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_HOLE'); end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  select * into hole_row from scoring_authority.hole_scores
  where match_id = target_match and hole_number = target_hole;
  hole_exists := found;
  if hole_exists then current_hole_revision := hole_row.hole_revision; end if;
  if expected_hole <> current_hole_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'HOLE_REVISION_CONFLICT',
      'current_hole_revision', current_hole_revision);
  end if;
  expected_count := case when match_row.format = 'BB' then 2 else 1 end;
  if not scoring_authority.valid_gross_scores(team_1_gross, expected_count)
     or not scoring_authority.valid_gross_scores(team_2_gross, expected_count) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_GROSS_SCORES');
  end if;
  if hole_exists and hole_row.team_1_gross_scores = team_1_gross
     and hole_row.team_2_gross_scores = team_2_gross then
    progress := scoring_authority.match_progress(target_match, match_row.format);
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
      'semantic_noop', true, 'idempotent', true, 'match_id', target_match,
      'hole_number', target_hole, 'hole_revision', hole_row.hole_revision,
      'match_revision', match_row.match_revision, 'updated_at', hole_row.updated_at,
      'match', progress, 'audit_created', false, 'google_outbox_created', false);
  end if;
  select stroke_index into stroke_index_value from scoring_authority.match_holes
  where match_id = target_match and hole_number = target_hole;
  if stroke_index_value is null then return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_SCORING_SNAPSHOT'); end if;
  if match_row.format = 'SC' then
    select pg_catalog.jsonb_build_array(scoring_authority.strokes_on_hole((snapshot.team_configuration->>'team_1_strokes')::integer, stroke_index_value)),
      pg_catalog.jsonb_build_array(scoring_authority.strokes_on_hole((snapshot.team_configuration->>'team_2_strokes')::integer, stroke_index_value))
    into team_1_strokes, team_2_strokes from scoring_authority.scoring_snapshots snapshot
    where snapshot.snapshot_id = match_row.scoring_snapshot_id and snapshot.tournament_id = target_tournament;
  else
    select pg_catalog.jsonb_agg(scoring_authority.strokes_on_hole(participant.final_strokes, stroke_index_value) order by participant.player_slot)
    into team_1_strokes from scoring_authority.match_participants participant
    where match_id = target_match and team_side = 1;
    select pg_catalog.jsonb_agg(scoring_authority.strokes_on_hole(participant.final_strokes, stroke_index_value) order by participant.player_slot)
    into team_2_strokes from scoring_authority.match_participants participant
    where match_id = target_match and team_side = 2;
  end if;
  if match_row.format = 'BB' then
    select pg_catalog.min(gross::integer - stroke::integer) into team_1_net
    from pg_catalog.jsonb_array_elements_text(team_1_gross) with ordinality g(gross, n)
    join pg_catalog.jsonb_array_elements_text(team_1_strokes) with ordinality s(stroke, n2) on n = n2;
    select pg_catalog.min(gross::integer - stroke::integer) into team_2_net
    from pg_catalog.jsonb_array_elements_text(team_2_gross) with ordinality g(gross, n)
    join pg_catalog.jsonb_array_elements_text(team_2_strokes) with ordinality s(stroke, n2) on n = n2;
  else
    team_1_net := (team_1_gross->>0)::integer - (team_1_strokes->>0)::integer;
    team_2_net := (team_2_gross->>0)::integer - (team_2_strokes->>0)::integer;
  end if;
  winner := case when team_1_net = team_2_net then 'Halved'
    when team_1_net < team_2_net then 'Team 1' else 'Team 2' end;
  before_state := case when current_hole_revision = 0 then '{}'::jsonb else pg_catalog.to_jsonb(hole_row) end;
  next_hole_revision := current_hole_revision + 1;
  next_match_revision := match_row.match_revision + 1;
  insert into scoring_authority.hole_scores (
    match_id, hole_number, hole_revision, team_1_gross_scores, team_2_gross_scores,
    team_1_strokes, team_2_strokes, team_1_net_score, team_2_net_score,
    hole_winner, mutation_key, actor_id
  ) values (
    target_match, target_hole, next_hole_revision, team_1_gross, team_2_gross,
    team_1_strokes, team_2_strokes, team_1_net, team_2_net, winner, mutation_identity, actor
  ) on conflict (match_id, hole_number) do update set
    hole_revision = excluded.hole_revision,
    team_1_gross_scores = excluded.team_1_gross_scores,
    team_2_gross_scores = excluded.team_2_gross_scores,
    team_1_strokes = excluded.team_1_strokes,
    team_2_strokes = excluded.team_2_strokes,
    team_1_net_score = excluded.team_1_net_score,
    team_2_net_score = excluded.team_2_net_score,
    hole_winner = excluded.hole_winner, mutation_key = excluded.mutation_key,
    actor_id = excluded.actor_id, updated_at = transition_at;
  progress := scoring_authority.match_progress(target_match, match_row.format);
  update scoring_authority.matches set
    match_revision = next_match_revision,
    scored_holes = (progress->>'scored_holes')::integer,
    current_hole = (progress->>'current_hole')::integer,
    holes_remaining = (progress->>'holes_remaining')::integer,
    team_1_holes_won = (progress->>'team_1_holes_won')::integer,
    team_2_holes_won = (progress->>'team_2_holes_won')::integer,
    running_result = progress->>'running_result', result_winner = progress->>'result_winner',
    clinched = (progress->>'clinched')::boolean,
    scorecard_complete = (progress->>'scorecard_complete')::boolean,
    authority_updated_at = transition_at, updated_at = transition_at
  where match_id = target_match and tournament_id = target_tournament;
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'ACCEPTED', 'match_id', target_match,
    'google_target_match_id', target_match, 'hole_number', target_hole,
    'hole_revision', next_hole_revision, 'match_revision', next_match_revision,
    'permission_revision', match_row.permission_revision, 'updated_at', transition_at,
    'gross', pg_catalog.jsonb_build_object('team_1', team_1_gross, 'team_2', team_2_gross),
    'strokes', pg_catalog.jsonb_build_object('team_1', team_1_strokes, 'team_2', team_2_strokes),
    'net', pg_catalog.jsonb_build_object('team_1', team_1_net, 'team_2', team_2_net),
    'hole_winner', winner, 'match', progress,
    'audit_created', true, 'google_outbox_created', true);
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, hole_number, payload_hash,
    previous_match_revision, next_match_revision, previous_hole_revision,
    next_hole_revision, result, actor_id
  ) values (target_match, mutation_identity, 'HOLE_SCORE', target_hole, payload_hash_value,
    match_row.match_revision, next_match_revision, current_hole_revision,
    next_hole_revision, result_value, actor);
  insert into scoring_authority.score_revision_history (
    match_id, hole_number, mutation_key, action, previous_match_revision,
    next_match_revision, previous_hole_revision, next_hole_revision,
    before_state, after_state, actor_id
  ) values (target_match, target_hole, mutation_identity, 'HOLE_SCORE_UPSERTED',
    match_row.match_revision, next_match_revision, current_hole_revision,
    next_hole_revision, before_state, result_value, actor);
  insert into scoring_authority.audit_events
    (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (target_tournament, target_match, mutation_identity, 'HOLE_SCORE_UPSERTED', actor, result_value);
  insert into scoring_authority.google_outbox_events (
    tournament_id, match_id, match_revision, hole_number, hole_revision,
    mutation_key, event_type, payload, payload_hash
  ) values (target_tournament, target_match, next_match_revision, target_hole,
    next_hole_revision, mutation_identity, 'HOLE_SCORE_UPSERTED', result_value, payload_hash_value);
  return result_value;
end;
$$;

-- Finalize/reopen bodies are exact copies of migration 021 with only:
-- (1) target_tournament := assert_future_production_scoring_runtime_v1(input),
-- (2) assert_future_production_scoring_actor_v1(input,target_tournament,...),
-- (3) every tournament filter/audit/outbox value uses target_tournament.
-- The scoring_authority.capture/invalidate_finalized_scorecard_snapshot helpers
-- are already match-tournament scoped and require no replacement.

revoke all on function public.future_production_submit_hole_score_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.future_production_submit_hole_score_v1(jsonb)
  to service_role;
create or replace function public.future_production_mutate_match_control_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  operation text := pg_catalog.upper(coalesce(input->>'operation', ''));
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  expected_permission bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
  next_match_revision bigint;
  next_permission_revision bigint;
  permission_changes boolean;
  target_locked boolean;
  target_access boolean;
  event_type text;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  readiness_value jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input);
  perform production_control.assert_future_production_scoring_actor_v1(input, target_tournament, true);
  if operation not in ('MARK_LIVE', 'SCORING_LOCK', 'SCORING_UNLOCK', 'ACCESS_ACTIVATE', 'ACCESS_REVOKE')
     or coalesce(target_match, '') = '' or coalesce(mutation_identity, '') = '' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_CONTROL_OPERATION');
  end if;
  if operation = 'MARK_LIVE' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-access-governance-v1:' || target_tournament, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-tournament-setup-v1:' || target_tournament, 0));
  end if;
  select * into match_row from scoring_authority.matches
  where match_id = target_match and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(pg_catalog.jsonb_build_object(
    'match_id', target_match, 'operation', operation, 'actor_id', actor));
  select * into mutation_row from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object('idempotent', true);
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  if expected_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  if match_row.status = 'FINAL' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if operation = 'MARK_LIVE' and match_row.status = 'LIVE' then
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
      'semantic_noop', true, 'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'status', match_row.status, 'scoring_locked', match_row.scoring_locked,
      'google_outbox_created', false);
  end if;
  if operation = 'MARK_LIVE' and match_row.status <> 'UPCOMING' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_UPCOMING');
  end if;
  if operation = 'MARK_LIVE' then
    readiness_value := production_control.assert_future_production_match_scoring_ready_v1(
      target_match, target_tournament);
    if coalesce((readiness_value->>'ready')::boolean, false) is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'PRODUCTION_MATCH_NOT_SCORING_READY',
        'match_id', target_match, 'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'status', match_row.status, 'scoring_locked', match_row.scoring_locked,
        'scoring_readiness_contract', 'production-match-scoring-readiness-v1',
        'reasons', coalesce(readiness_value->'reasons', '[]'::jsonb),
        'audit_created', false, 'google_outbox_created', false);
    end if;
  end if;
  if operation in ('SCORING_UNLOCK', 'ACCESS_ACTIVATE') and (
       (operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked)
       or (operation = 'SCORING_UNLOCK' and not match_row.scoring_locked)
     ) then
    if operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED');
    end if;
    if not exists (select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and (not can_score or revoked_at is not null
        or permission_revision <> match_row.permission_revision)) then
      return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
        'semantic_noop', true, 'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'scoring_locked', match_row.scoring_locked,
        'access_active', true, 'google_outbox_created', false);
    end if;
  end if;
  if operation = 'SCORING_LOCK' and match_row.scoring_locked and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision)
  ) then
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
      'semantic_noop', true, 'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', true, 'access_active', false,
      'google_outbox_created', false);
  end if;
  if operation = 'ACCESS_REVOKE' and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision)
  ) then
    return pg_catalog.jsonb_build_object('ok', true, 'code', 'NO_CHANGE',
      'semantic_noop', true, 'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', match_row.scoring_locked, 'access_active', false,
      'google_outbox_created', false);
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by permission.player_id), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  next_match_revision := match_row.match_revision + 1;
  permission_changes := operation <> 'MARK_LIVE';
  next_permission_revision := match_row.permission_revision + case when permission_changes then 1 else 0 end;
  target_locked := case operation when 'SCORING_LOCK' then true
    when 'SCORING_UNLOCK' then false else match_row.scoring_locked end;
  target_access := case operation when 'SCORING_LOCK' then false
    when 'SCORING_UNLOCK' then true when 'ACCESS_ACTIVATE' then true
    when 'ACCESS_REVOKE' then false else exists (select 1
      from scoring_authority.scoring_permissions where match_id = target_match
        and can_score and revoked_at is null) end;
  event_type := case operation when 'MARK_LIVE' then 'MATCH_MARKED_LIVE'
    when 'SCORING_LOCK' then 'SCORING_LOCKED'
    when 'SCORING_UNLOCK' then 'SCORING_UNLOCKED'
    when 'ACCESS_ACTIVATE' then 'SCORING_ACCESS_ACTIVATED'
    else 'SCORING_ACCESS_REVOKED' end;
  update scoring_authority.matches set
    status = case when operation = 'MARK_LIVE' then 'LIVE' else status end,
    scoring_locked = target_locked, match_revision = next_match_revision,
    permission_revision = next_permission_revision,
    authority_updated_at = transition_at, updated_at = transition_at
  where match_id = target_match and tournament_id = target_tournament returning * into next_match_row;
  if permission_changes then
    update scoring_authority.scoring_permissions set can_score = target_access,
      permission_revision = next_permission_revision,
      revoked_at = case when target_access then null else transition_at end,
      updated_at = transition_at where match_id = target_match;
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by permission.player_id), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', operation, 'match_id', target_match,
    'google_target_match_id', target_match, 'match_revision', next_match_revision,
    'previous_permission_revision', match_row.permission_revision,
    'permission_revision', next_permission_revision, 'status', next_match_row.status,
    'scoring_locked', target_locked, 'access_active', target_access,
    'updated_at', transition_at,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', true);
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (target_match, mutation_identity, operation, payload_hash_value,
    match_row.match_revision, next_match_revision, result_value, actor);
  insert into scoring_authority.score_revision_history (
    match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id
  ) values (target_match, mutation_identity, event_type, match_row.match_revision,
    next_match_revision,
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(match_row), 'permissions', before_permissions),
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(next_match_row), 'permissions', after_permissions), actor);
  insert into scoring_authority.audit_events
    (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (target_tournament, target_match, mutation_identity, event_type, actor, result_value);
  insert into scoring_authority.google_outbox_events
    (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)
  values (target_tournament, target_match, next_match_revision, mutation_identity,
    event_type, result_value, payload_hash_value);
  return result_value;
end;
$$;

revoke all on function public.future_production_mutate_match_control_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.future_production_mutate_match_control_v1(jsonb)
  to service_role;
create or replace function public.future_production_finalize_match_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  actor_role text := pg_catalog.upper(coalesce(input#>>'{authorization,role}', 'PLAYER'));
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  supplied_permission bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
  next_revision bigint;
  next_permission_revision bigint;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  progress jsonb;
  archive_result jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input);
  perform production_control.assert_future_production_scoring_actor_v1(input, target_tournament, false);
  select * into match_row from scoring_authority.matches
  where match_id = target_match and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match or actor_role not in ('PLAYER', 'DIRECTOR') then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(pg_catalog.jsonb_build_object(
    'match_id', target_match, 'action', 'FINALIZE', 'actor_id', actor));
  select * into mutation_row from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object('idempotent', true);
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if supplied_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  if actor_role = 'PLAYER' and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and player_id = actor and can_score
      and revoked_at is null and permission_revision = match_row.permission_revision
  ) then return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); end if;
  if match_row.status = 'FINAL' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_FINAL'); end if;
  if match_row.scoring_locked then return pg_catalog.jsonb_build_object('ok', false, 'code', 'SCORING_LOCKED'); end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  if match_row.scored_holes <> 18 or not match_row.scorecard_complete then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'SCORECARD_INCOMPLETE',
      'scored_holes', match_row.scored_holes);
  end if;
  if match_row.unresolved_mutations > 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'UNRESOLVED_MUTATIONS');
  end if;
  progress := scoring_authority.match_progress(target_match, match_row.format);
  if pg_catalog.btrim(coalesce(progress->>'result_winner', '')) = ''
     or progress->>'result_winner' <> match_row.result_winner
     or coalesce((progress->>'scorecard_complete')::boolean, false) is not true
     or progress->>'team_1_points' is null or progress->>'team_2_points' is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'RESULT_UNAVAILABLE');
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by player_id), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  next_revision := match_row.match_revision + 1;
  next_permission_revision := match_row.permission_revision + 1;
  update scoring_authority.matches set status = 'FINAL', scoring_locked = true,
    match_revision = next_revision, permission_revision = next_permission_revision,
    finalized_at = transition_at, authority_updated_at = transition_at,
    updated_at = transition_at
  where match_id = target_match and tournament_id = target_tournament returning * into next_match_row;
  update scoring_authority.scoring_permissions set can_score = false,
    permission_revision = next_permission_revision, revoked_at = transition_at,
    updated_at = transition_at where match_id = target_match;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by player_id), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  archive_result := scoring_authority.capture_finalized_scorecard_snapshot(target_match, actor);
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'FINALIZED', 'match_id', target_match,
    'google_target_match_id', target_match, 'match_revision', next_revision,
    'permission_revision', next_permission_revision,
    'previous_permission_revision', match_row.permission_revision,
    'scoring_locked', true, 'access_active', false,
    'result_winner', match_row.result_winner, 'scorecard_complete', true,
    'scored_holes', 18, 'updated_at', transition_at, 'match', progress,
    'team_1_points', (progress->>'team_1_points')::numeric,
    'team_2_points', (progress->>'team_2_points')::numeric,
    'scorecard_archive', archive_result,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', true);
  insert into scoring_authority.score_mutations
    (match_id, mutation_key, mutation_type, payload_hash,
      previous_match_revision, next_match_revision, result, actor_id)
  values (target_match, mutation_identity, 'FINALIZE', payload_hash_value,
    match_row.match_revision, next_revision, result_value, actor);
  insert into scoring_authority.score_revision_history
    (match_id, mutation_key, action, previous_match_revision,
      next_match_revision, before_state, after_state, actor_id)
  values (target_match, mutation_identity, 'MATCH_FINALIZED', match_row.match_revision,
    next_revision,
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(match_row), 'permissions', before_permissions),
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(next_match_row), 'permissions', after_permissions), actor);
  insert into scoring_authority.audit_events
    (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (target_tournament, target_match, mutation_identity, 'MATCH_FINALIZED', actor, result_value);
  insert into scoring_authority.google_outbox_events
    (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)
  values (target_tournament, target_match, next_revision, mutation_identity,
    'MATCH_FINALIZED', result_value, payload_hash_value);
  return result_value;
end;
$$;

create or replace function public.future_production_reopen_match_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce((input->>'expected_match_revision')::bigint, -1);
  supplied_permission bigint := coalesce((input#>>'{authorization,permission_revision}')::bigint, -1);
  next_revision bigint;
  next_permission_revision bigint;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  archive_result jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input);
  perform production_control.assert_future_production_scoring_actor_v1(input, target_tournament, true);
  select * into match_row from scoring_authority.matches
  where match_id = target_match and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FOUND'); end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'DIRECTOR_REQUIRED');
  end if;
  payload_hash_value := production_control.cutover_payload_hash(pg_catalog.jsonb_build_object(
    'match_id', target_match, 'action', 'REOPEN', 'actor_id', actor));
  select * into mutation_row from scoring_authority.score_mutations
  where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object('idempotent', true);
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if supplied_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision);
  end if;
  if match_row.status <> 'FINAL' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_NOT_FINAL'); end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision);
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by player_id), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  next_revision := match_row.match_revision + 1;
  next_permission_revision := match_row.permission_revision + 1;
  update scoring_authority.matches set status = 'LIVE', scoring_locked = false,
    match_revision = next_revision, permission_revision = next_permission_revision,
    finalized_at = null, authority_updated_at = transition_at, updated_at = transition_at
  where match_id = target_match and tournament_id = target_tournament returning * into next_match_row;
  update scoring_authority.scoring_permissions set can_score = true,
    permission_revision = next_permission_revision, revoked_at = null,
    updated_at = transition_at where match_id = target_match;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(permission)
    order by player_id), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission where match_id = target_match;
  archive_result := scoring_authority.invalidate_finalized_scorecard_snapshot(target_match, next_revision, actor);
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', 'REOPENED', 'match_id', target_match,
    'google_target_match_id', target_match, 'match_revision', next_revision,
    'permission_revision', next_permission_revision,
    'previous_permission_revision', match_row.permission_revision,
    'scoring_locked', false, 'access_active', true,
    'scorecard_complete', match_row.scorecard_complete, 'updated_at', transition_at,
    'official_points_active', false, 'scorecard_archive', archive_result,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions),
    'audit_created', true, 'google_outbox_created', true);
  insert into scoring_authority.score_mutations
    (match_id, mutation_key, mutation_type, payload_hash,
      previous_match_revision, next_match_revision, result, actor_id)
  values (target_match, mutation_identity, 'REOPEN', payload_hash_value,
    match_row.match_revision, next_revision, result_value, actor);
  insert into scoring_authority.score_revision_history
    (match_id, mutation_key, action, previous_match_revision,
      next_match_revision, before_state, after_state, actor_id)
  values (target_match, mutation_identity, 'MATCH_REOPENED', match_row.match_revision,
    next_revision,
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(match_row), 'permissions', before_permissions),
    pg_catalog.jsonb_build_object('match', pg_catalog.to_jsonb(next_match_row), 'permissions', after_permissions), actor);
  insert into scoring_authority.audit_events
    (tournament_id, match_id, mutation_key, action, actor_id, metadata)
  values (target_tournament, target_match, mutation_identity, 'MATCH_REOPENED', actor, result_value);
  insert into scoring_authority.google_outbox_events
    (tournament_id, match_id, match_revision, mutation_key, event_type, payload, payload_hash)
  values (target_tournament, target_match, next_revision, mutation_identity,
    'MATCH_REOPENED', result_value, payload_hash_value);
  return result_value;
end;
$$;

revoke all on function public.future_production_finalize_match_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.future_production_reopen_match_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.future_production_finalize_match_v1(jsonb) to service_role;
grant execute on function public.future_production_reopen_match_v1(jsonb) to service_role;
create or replace function public.future_production_claim_google_outbox_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  event_row scoring_authority.google_outbox_events%rowtype;
  worker text := pg_catalog.left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
  lease integer := pg_catalog.greatest(5, pg_catalog.least(coalesce((input->>'lease_seconds')::integer, 30), 300));
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input, 'SCORING_GOOGLE_OUTBOX');
  if worker = '' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'WORKER_ID_REQUIRED'); end if;
  select event.* into event_row
  from scoring_authority.google_outbox_events event
  join scoring_authority.google_match_checkpoints checkpoint using (match_id)
  where event.tournament_id = target_tournament
    and event.status in ('PENDING', 'RETRYABLE', 'PROCESSING')
    and event.available_at <= pg_catalog.now()
    and (event.status <> 'PROCESSING' or event.lease_expires_at < pg_catalog.now())
    and event.match_revision = checkpoint.last_supabase_match_revision + 1
  order by event.created_at, event.match_id, event.match_revision
  for update of event skip locked limit 1;
  if not found then return pg_catalog.jsonb_build_object('ok', true, 'event', null); end if;
  update scoring_authority.google_outbox_events set
    status = 'PROCESSING', attempts = attempts + 1, claimed_by = worker,
    lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => lease),
    last_attempt_at = pg_catalog.now()
  where id = event_row.id returning * into event_row;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'event', pg_catalog.to_jsonb(event_row),
    'checkpoint', (select pg_catalog.to_jsonb(checkpoint)
      from scoring_authority.google_match_checkpoints checkpoint
      where checkpoint.match_id = event_row.match_id));
end;
$$;

create or replace function public.future_production_claim_google_outbox_event_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  event_row scoring_authority.google_outbox_events%rowtype;
  checkpoint_row scoring_authority.google_match_checkpoints%rowtype;
  target_event uuid := nullif(input->>'event_id', '')::uuid;
  worker text := pg_catalog.left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
  lease integer := pg_catalog.greatest(5, pg_catalog.least(coalesce((input->>'lease_seconds')::integer, 45), 300));
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input, 'SCORING_GOOGLE_OUTBOX');
  if worker = '' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'WORKER_ID_REQUIRED'); end if;
  select * into event_row from scoring_authority.google_outbox_events
  where id = target_event and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_NOT_FOUND'); end if;
  select * into checkpoint_row from scoring_authority.google_match_checkpoints
  where match_id = event_row.match_id for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'CHECKPOINT_NOT_FOUND'); end if;
  if event_row.status = 'DELIVERED' then
    return pg_catalog.jsonb_build_object('ok', true, 'idempotent', true,
      'event', pg_catalog.to_jsonb(event_row), 'checkpoint', pg_catalog.to_jsonb(checkpoint_row));
  end if;
  if event_row.status = 'BLOCKED' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_BLOCKED'); end if;
  if event_row.status = 'PROCESSING' and event_row.lease_expires_at >= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_LEASE_ACTIVE');
  end if;
  if event_row.status not in ('PENDING', 'RETRYABLE', 'PROCESSING')
     or event_row.available_at > pg_catalog.now() then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'OUTBOX_EVENT_NOT_READY');
  end if;
  if event_row.match_revision <> checkpoint_row.last_supabase_match_revision + 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'CHECKPOINT_ORDER_CONFLICT');
  end if;
  update scoring_authority.google_outbox_events set
    status = 'PROCESSING', attempts = attempts + 1, claimed_by = worker,
    lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => lease),
    last_attempt_at = pg_catalog.now()
  where id = event_row.id returning * into event_row;
  return pg_catalog.jsonb_build_object('ok', true, 'event', pg_catalog.to_jsonb(event_row),
    'checkpoint', pg_catalog.to_jsonb(checkpoint_row));
end;
$$;

create or replace function public.future_production_complete_google_outbox_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  event_row scoring_authority.google_outbox_events%rowtype;
  checkpoint_row scoring_authority.google_match_checkpoints%rowtype;
  worker text := pg_catalog.left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input, 'SCORING_GOOGLE_OUTBOX');
  select * into event_row from scoring_authority.google_outbox_events
  where id = nullif(input->>'event_id', '')::uuid and tournament_id = target_tournament for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'EVENT_NOT_FOUND'); end if;
  select * into checkpoint_row from scoring_authority.google_match_checkpoints
  where match_id = event_row.match_id for update;
  if event_row.status = 'DELIVERED' then
    return pg_catalog.jsonb_build_object('ok', true, 'idempotent', true,
      'checkpoint', pg_catalog.to_jsonb(checkpoint_row));
  end if;
  if event_row.status <> 'PROCESSING' or worker = '' or event_row.claimed_by <> worker
     or event_row.lease_expires_at < pg_catalog.now() then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'OUTBOX_CLAIM_STALE');
  end if;
  if event_row.match_revision <> checkpoint_row.last_supabase_match_revision + 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'CHECKPOINT_ORDER_CONFLICT',
      'current_revision', checkpoint_row.last_supabase_match_revision);
  end if;
  if coalesce(input->>'verified_fingerprint', '') !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'OUTBOX_READBACK_FINGERPRINT_REQUIRED');
  end if;
  update scoring_authority.google_outbox_events set
    status = 'DELIVERED', delivered_at = pg_catalog.now(), lease_expires_at = null,
    claimed_by = null, last_error_code = null, last_error_safe = null
  where id = event_row.id;
  update scoring_authority.google_match_checkpoints set
    last_supabase_match_revision = event_row.match_revision,
    google_match_updated_at = nullif(input->>'google_match_updated_at', '')::timestamptz,
    google_match_revision = coalesce((input->>'google_match_revision')::bigint, google_match_revision),
    google_hole_revisions = case when event_row.hole_number is null then google_hole_revisions
      else google_hole_revisions || pg_catalog.jsonb_build_object(event_row.hole_number::text,
        coalesce((input->>'google_hole_revision')::bigint, event_row.hole_revision)) end,
    last_outbox_event_id = event_row.id, verified_fingerprint = input->>'verified_fingerprint',
    verified_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where match_id = event_row.match_id returning * into checkpoint_row;
  return pg_catalog.jsonb_build_object('ok', true, 'idempotent', false,
    'checkpoint', pg_catalog.to_jsonb(checkpoint_row));
end;
$$;

create or replace function public.future_production_fail_google_outbox_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  worker text := pg_catalog.left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
  delay_seconds integer := pg_catalog.greatest(1, pg_catalog.least(coalesce((input->>'retry_after_seconds')::integer, 1), 300));
  updated_count integer;
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input, 'SCORING_GOOGLE_OUTBOX');
  update scoring_authority.google_outbox_events set
    status = case when coalesce((input->>'block')::boolean, false) then 'BLOCKED' else 'RETRYABLE' end,
    available_at = pg_catalog.now() + pg_catalog.make_interval(secs => delay_seconds),
    lease_expires_at = null, claimed_by = null,
    last_error_code = pg_catalog.left(coalesce(input->>'error_code', 'DELIVERY_FAILED'), 80),
    last_error_safe = pg_catalog.left(coalesce(input->>'error_safe', 'Google mirror delivery will retry.'), 240)
  where id = nullif(input->>'event_id', '')::uuid and tournament_id = target_tournament
    and status = 'PROCESSING' and claimed_by = worker and lease_expires_at >= pg_catalog.now();
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then return pg_catalog.jsonb_build_object('ok', false, 'code', 'OUTBOX_CLAIM_STALE'); end if;
  return pg_catalog.jsonb_build_object('ok', true,
    'status', case when coalesce((input->>'block')::boolean, false) then 'BLOCKED' else 'RETRYABLE' end);
end;
$$;

create or replace function public.future_production_inspect_scoring_workers_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  generation production_control.future_annual_runtime_generations_v1%rowtype;
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input);
  select * into strict generation from production_control.future_annual_runtime_generations_v1
  where tournament_id = target_tournament and generation_status = 'ACTIVE';
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'authority', (select scoring_authority from scoring_authority.tournaments where tournament_id = target_tournament),
    'ingress', pg_catalog.jsonb_build_object('tournament_id', target_tournament,
      'state', generation.ingress_state, 'authority', generation.authority,
      'active_epoch_id', generation.authority_generation_id,
      'unresolved_client_queues', 0, 'updated_at', generation.updated_at),
    'worker_controls', (select coalesce(pg_catalog.jsonb_object_agg(worker_name,
      pg_catalog.jsonb_build_object('enabled', enabled,
        'google_writes_allowed', google_writes_allowed,
        'scheduler_installed', scheduler_installed) order by worker_name), '{}'::jsonb)
      from production_control.worker_controls
      where worker_name in ('SCORING_GOOGLE_OUTBOX', 'ROUND_SCORECARDS_ARCHIVE')),
    'outbox_counts', (select coalesce(pg_catalog.jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, pg_catalog.count(*)::integer total from scoring_authority.google_outbox_events
        where tournament_id = target_tournament group by status) grouped),
    'archive_counts', (select coalesce(pg_catalog.jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, pg_catalog.count(*)::integer total from scoring_authority.scorecard_archive_jobs
        where tournament_id = target_tournament group by status) grouped),
    'no_automatic_fallback', true);
end;
$$;

create or replace function public.future_production_claim_scorecard_archive_job_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  job_row scoring_authority.scorecard_archive_jobs%rowtype;
  worker text := pg_catalog.left(coalesce(nullif(input->>'worker_id', ''), ''), 160);
  token uuid := extensions.gen_random_uuid();
  lease integer := pg_catalog.greatest(15, pg_catalog.least(coalesce((input->>'lease_seconds')::integer, 60), 300));
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input, 'ROUND_SCORECARDS_ARCHIVE');
  if worker = '' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'WORKER_ID_REQUIRED'); end if;
  update scoring_authority.scorecard_archive_jobs older set
    status = 'SUPERSEDED', lease_expires_at = null, claimed_by = null,
    claim_token = null, updated_at = pg_catalog.now()
  where older.tournament_id = target_tournament
    and older.status in ('PENDING', 'RETRYABLE', 'PROCESSING')
    and (older.status <> 'PROCESSING' or older.lease_expires_at < pg_catalog.now())
    and exists (select 1 from scoring_authority.scorecard_archive_jobs newer
      where newer.match_id = older.match_id and newer.match_revision > older.match_revision
        and newer.status in ('PENDING', 'RETRYABLE', 'PROCESSING', 'VERIFIED'));
  select * into job_row from scoring_authority.scorecard_archive_jobs job
  where job.tournament_id = target_tournament
    and (job.status in ('PENDING', 'RETRYABLE')
      or (job.status = 'PROCESSING' and job.lease_expires_at < pg_catalog.now()))
    and job.available_at <= pg_catalog.now()
    and not exists (select 1 from scoring_authority.scorecard_archive_jobs newer
      where newer.match_id = job.match_id and newer.match_revision > job.match_revision
        and newer.status in ('PENDING', 'RETRYABLE', 'PROCESSING', 'VERIFIED'))
  order by job.available_at, job.created_at, job.match_id for update skip locked limit 1;
  if not found then return pg_catalog.jsonb_build_object('ok', true, 'job', null); end if;
  update scoring_authority.scorecard_archive_jobs set
    status = 'PROCESSING', attempts = attempts + 1, claimed_by = worker,
    claim_token = token, lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => lease),
    updated_at = pg_catalog.now()
  where job_id = job_row.job_id returning * into job_row;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'job', pg_catalog.to_jsonb(job_row) || pg_catalog.jsonb_build_object('id', job_row.job_id),
    'snapshot', (select pg_catalog.to_jsonb(snapshot) from scoring_authority.finalized_scorecard_snapshots snapshot
      where snapshot.snapshot_id = job_row.snapshot_id and snapshot.tournament_id = target_tournament),
    'checkpoint', (select pg_catalog.to_jsonb(checkpoint) from scoring_authority.scorecard_archive_checkpoints checkpoint
      where checkpoint.match_id = job_row.match_id and checkpoint.tournament_id = target_tournament));
end;
$$;

create or replace function public.future_production_complete_scorecard_archive_job_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  job_row scoring_authority.scorecard_archive_jobs%rowtype;
  match_row scoring_authority.matches%rowtype;
  snapshot_row scoring_authority.finalized_scorecard_snapshots%rowtype;
  newer_job scoring_authority.scorecard_archive_jobs%rowtype;
  requested_status text := pg_catalog.upper(coalesce(input->>'verified_status', ''));
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input, 'ROUND_SCORECARDS_ARCHIVE');
  select * into job_row from scoring_authority.scorecard_archive_jobs
  where job_id = nullif(input->>'job_id', '')::uuid and tournament_id = target_tournament for update;
  if not found or job_row.status <> 'PROCESSING'
     or job_row.claim_token <> nullif(input->>'claim_token', '')::uuid
     or job_row.claimed_by <> pg_catalog.left(coalesce(input->>'worker_id', ''), 160)
     or job_row.lease_expires_at < pg_catalog.now() then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'ARCHIVE_CLAIM_STALE');
  end if;
  select * into newer_job from scoring_authority.scorecard_archive_jobs
  where match_id = job_row.match_id and tournament_id = target_tournament
    and match_revision > job_row.match_revision order by match_revision desc limit 1;
  if found then
    update scoring_authority.scorecard_archive_jobs set status = 'SUPERSEDED',
      claim_token = null, claimed_by = null, lease_expires_at = null,
      updated_at = pg_catalog.now() where job_id = job_row.job_id;
    update scoring_authority.scorecard_archive_jobs set status = 'RETRYABLE',
      available_at = pg_catalog.now(), verified_at = null, updated_at = pg_catalog.now()
    where job_id = newer_job.job_id and status in ('VERIFIED', 'PENDING', 'RETRYABLE');
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'ARCHIVE_STALE_WORKER_REQUEUED');
  end if;
  select * into match_row from scoring_authority.matches
  where match_id = job_row.match_id and tournament_id = target_tournament;
  select * into snapshot_row from scoring_authority.finalized_scorecard_snapshots
  where snapshot_id = job_row.snapshot_id and tournament_id = target_tournament;
  if snapshot_row.snapshot_id is null
     or coalesce(input->>'source_fingerprint', '') <> job_row.source_fingerprint
     or coalesce(input->>'archive_payload_hash', '') <> job_row.archive_payload_hash
     or coalesce((input->>'snapshot_revision')::bigint, -1) <> job_row.snapshot_revision
     or coalesce((input->>'finalized_match_revision')::bigint, -1) <> job_row.match_revision
     or coalesce(input->>'google_readback_hash', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(coalesce(input->'expected_logical_identities', 'null'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(input->'google_row_numbers', 'null'::jsonb)) <> 'array' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'ARCHIVE_CHECKPOINT_PAYLOAD_INVALID');
  end if;
  if (job_row.event_type = 'SCORECARD_ARCHIVE_UPSERT'
      and (match_row.status <> 'FINAL' or snapshot_row.state <> 'CURRENT' or requested_status <> 'VERIFIED'))
     or (job_row.event_type = 'SCORECARD_ARCHIVE_INVALIDATE'
      and (match_row.status = 'FINAL' or requested_status <> 'INVALIDATED')) then
    update scoring_authority.scorecard_archive_jobs set status = 'SUPERSEDED',
      claim_token = null, claimed_by = null, lease_expires_at = null,
      updated_at = pg_catalog.now() where job_id = job_row.job_id;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'ARCHIVE_LIFECYCLE_SUPERSEDED');
  end if;
  update scoring_authority.scorecard_archive_jobs set status = 'VERIFIED',
    verified_at = pg_catalog.now(), claim_token = null, claimed_by = null,
    lease_expires_at = null, last_error_code = null, last_error_safe = null,
    updated_at = pg_catalog.now() where job_id = job_row.job_id;
  insert into scoring_authority.scorecard_archive_checkpoints (
    match_id, tournament_id, current_snapshot_id, finalized_snapshot_revision,
    finalized_match_revision, source_fingerprint, archive_payload_hash,
    expected_logical_identities, google_row_numbers, google_readback_hash,
    status, last_job_id, last_error_code, last_error_safe, verified_at
  ) values (job_row.match_id, target_tournament, job_row.snapshot_id,
    job_row.snapshot_revision, job_row.match_revision, job_row.source_fingerprint,
    job_row.archive_payload_hash, input->'expected_logical_identities',
    input->'google_row_numbers', input->>'google_readback_hash', requested_status,
    job_row.job_id, null, null, pg_catalog.now())
  on conflict (match_id) do update set
    tournament_id = excluded.tournament_id,
    current_snapshot_id = excluded.current_snapshot_id,
    finalized_snapshot_revision = excluded.finalized_snapshot_revision,
    finalized_match_revision = excluded.finalized_match_revision,
    source_fingerprint = excluded.source_fingerprint,
    archive_payload_hash = excluded.archive_payload_hash,
    expected_logical_identities = excluded.expected_logical_identities,
    google_row_numbers = excluded.google_row_numbers,
    google_readback_hash = excluded.google_readback_hash,
    status = excluded.status, last_job_id = excluded.last_job_id,
    last_error_code = null, last_error_safe = null,
    verified_at = excluded.verified_at, updated_at = pg_catalog.now();
  return pg_catalog.jsonb_build_object('ok', true, 'checkpoint',
    (select pg_catalog.to_jsonb(checkpoint)
      from scoring_authority.scorecard_archive_checkpoints checkpoint
      where checkpoint.match_id = job_row.match_id
        and checkpoint.tournament_id = target_tournament));
end;
$$;

create or replace function public.future_production_fail_scorecard_archive_job_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  target_tournament text;
  job_row scoring_authority.scorecard_archive_jobs%rowtype;
  delay_seconds integer := pg_catalog.greatest(2, pg_catalog.least(coalesce((input->>'retry_after_seconds')::integer, 30), 3600));
  blocked boolean := coalesce((input->>'block')::boolean, false);
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input, 'ROUND_SCORECARDS_ARCHIVE');
  select * into job_row from scoring_authority.scorecard_archive_jobs
  where job_id = nullif(input->>'job_id', '')::uuid and tournament_id = target_tournament for update;
  if not found or job_row.status <> 'PROCESSING'
     or job_row.claim_token <> nullif(input->>'claim_token', '')::uuid
     or job_row.claimed_by <> pg_catalog.left(coalesce(input->>'worker_id', ''), 160)
     or job_row.lease_expires_at < pg_catalog.now() then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'ARCHIVE_CLAIM_STALE');
  end if;
  update scoring_authority.scorecard_archive_jobs set
    status = case when blocked then 'BLOCKED' else 'RETRYABLE' end,
    available_at = pg_catalog.now() + pg_catalog.make_interval(secs => delay_seconds),
    lease_expires_at = null, claimed_by = null, claim_token = null,
    last_error_code = pg_catalog.left(coalesce(input->>'error_code', 'ARCHIVE_DELIVERY_FAILED'), 120),
    last_error_safe = pg_catalog.left(coalesce(input->>'error_safe', 'Round Scorecards archive delivery failed.'), 500),
    updated_at = pg_catalog.now() where job_id = job_row.job_id;
  update scoring_authority.scorecard_archive_checkpoints set status = 'FAILED',
    last_job_id = job_row.job_id,
    last_error_code = pg_catalog.left(coalesce(input->>'error_code', 'ARCHIVE_DELIVERY_FAILED'), 120),
    last_error_safe = pg_catalog.left(coalesce(input->>'error_safe', 'Round Scorecards archive delivery failed.'), 500),
    updated_at = pg_catalog.now()
  where match_id = job_row.match_id and tournament_id = target_tournament
    and finalized_match_revision <= job_row.match_revision;
  return pg_catalog.jsonb_build_object('ok', true,
    'status', case when blocked then 'BLOCKED' else 'RETRYABLE' end);
end;
$$;

create or replace function public.future_production_inspect_scorecard_archive_state_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare target_tournament text;
begin
  target_tournament := production_control.assert_future_production_scoring_runtime_v1(input);
  return pg_catalog.jsonb_build_object(
    'ok', true, 'tournament_id', target_tournament,
    'snapshots', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(snapshot)
      order by match_id, snapshot_revision)
      from scoring_authority.finalized_scorecard_snapshots snapshot
      where tournament_id = target_tournament), '[]'::jsonb),
    'jobs', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(job) - 'claim_token'
      order by created_at, match_id) from scoring_authority.scorecard_archive_jobs job
      where tournament_id = target_tournament), '[]'::jsonb),
    'checkpoints', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(checkpoint)
      order by match_id) from scoring_authority.scorecard_archive_checkpoints checkpoint
      where tournament_id = target_tournament), '[]'::jsonb));
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.future_production_claim_google_outbox_v1(jsonb)',
    'public.future_production_claim_google_outbox_event_v1(jsonb)',
    'public.future_production_complete_google_outbox_v1(jsonb)',
    'public.future_production_fail_google_outbox_v1(jsonb)',
    'public.future_production_inspect_scoring_workers_v1(jsonb)',
    'public.future_production_claim_scorecard_archive_job_v1(jsonb)',
    'public.future_production_complete_scorecard_archive_job_v1(jsonb)',
    'public.future_production_fail_scorecard_archive_job_v1(jsonb)',
    'public.future_production_inspect_scorecard_archive_state_v1(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
    execute pg_catalog.format('grant execute on function %s to service_role', signature);
  end loop;
end;
$$;
revoke all on function production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function production_control.assert_future_production_scoring_runtime_v1(jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function production_control.assert_future_production_scoring_actor_v1(jsonb,text,boolean)
  from public, anon, authenticated, service_role;
revoke all on function production_control.assert_future_production_match_scoring_ready_v1(text,text)
  from public, anon, authenticated, service_role;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.future_production_read_scoring_authority_v1(jsonb)',
    'public.future_production_read_scoring_participant_context_v1(jsonb)',
    'public.future_production_submit_hole_score_v1(jsonb)',
    'public.future_production_mutate_match_control_v1(jsonb)',
    'public.future_production_finalize_match_v1(jsonb)',
    'public.future_production_reopen_match_v1(jsonb)',
    'public.future_production_claim_google_outbox_v1(jsonb)',
    'public.future_production_claim_google_outbox_event_v1(jsonb)',
    'public.future_production_complete_google_outbox_v1(jsonb)',
    'public.future_production_fail_google_outbox_v1(jsonb)',
    'public.future_production_inspect_scoring_workers_v1(jsonb)',
    'public.future_production_claim_scorecard_archive_job_v1(jsonb)',
    'public.future_production_complete_scorecard_archive_job_v1(jsonb)',
    'public.future_production_fail_scorecard_archive_job_v1(jsonb)',
    'public.future_production_inspect_scorecard_archive_state_v1(jsonb)'
  ] loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      signature
    );
    execute pg_catalog.format(
      'grant execute on function %s to service_role', signature
    );
  end loop;
end;
$$;

comment on function production_control.assert_future_scoring_runtime_capability_v1(text,uuid,uuid,uuid) is
  'Internal activation handshake proving the independently admitted annual scoring runtime is installed and inert before pointer CAS.';
comment on function production_control.assert_future_production_scoring_runtime_v1(jsonb,text) is
  'Internal exact-pointer and independent annual-generation assertion for future Production scoring/worker RPCs.';
comment on function production_control.assert_future_production_scoring_actor_v1(jsonb,text,boolean) is
  'Internal target-tournament identity, membership, and Director-root assertion for future Production scoring.';
comment on function production_control.assert_future_production_match_scoring_ready_v1(text,text) is
  'Internal target-tournament MARK_LIVE setup/snapshot readiness assertion.';

commit;
