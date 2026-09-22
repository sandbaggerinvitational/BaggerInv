CREATE OR REPLACE FUNCTION production_control.match_scoring_context_readiness_v1(target_match_id text, allow_scoring_activity boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  reasons jsonb := '[]'::jsonb;
  match_value scoring_authority.matches%rowtype;
  round_value scoring_authority.rounds%rowtype;
  detail_value scoring_authority.tournament_setup_match_details_v1%rowtype;
  assignment_value scoring_authority.tournament_setup_round_courses_v1%rowtype;
  course_value scoring_authority.tournament_setup_course_tees_v1%rowtype;
  snapshot_value scoring_authority.scoring_snapshots%rowtype;
  current_handicap uuid;
  holes_value jsonb;
  match_holes_value jsonb;
  context_value jsonb;
  current_participant_values jsonb;
  expected_count integer;
  participant_count integer;
begin
  select value.* into match_value
  from scoring_authority.matches value
  where value.tournament_id = '2026'
    and value.match_id = target_match_id;
  if match_value.match_id is null then
    return pg_catalog.jsonb_build_object(
      'ready', false,
      'contractVersion', 'production-match-scoring-readiness-v1',
      'matchId', target_match_id,
      'reasons', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'MATCH_NOT_FOUND',
          'message', 'The canonical Production match does not exist.'
        )
      )
    );
  end if;

  select value.* into round_value
  from scoring_authority.rounds value
  where value.tournament_id = '2026'
    and value.round_number = match_value.round_number;
  if round_value.tournament_id is null
     or round_value.round_number not between 1 and 3
     or round_value.format not in ('BB', 'SC', 'SI')
     or round_value.format is distinct from match_value.format then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_CONFIGURATION_INVALID',
        'message', 'The match does not match its canonical round configuration.'
      )
    );
  end if;

  select value.* into snapshot_value
  from scoring_authority.scoring_snapshots value
  where value.snapshot_id = match_value.scoring_snapshot_id
    and value.tournament_id = '2026'
    and value.match_id = target_match_id;
  if snapshot_value.snapshot_id is null
     or snapshot_value.snapshot_revision is distinct from (
       select pg_catalog.max(candidate.snapshot_revision)
       from scoring_authority.scoring_snapshots candidate
       where candidate.match_id = target_match_id
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_SNAPSHOT_NOT_CURRENT',
        'message', 'The match needs its latest scoring snapshot prepared.'
      )
    );
  end if;

  select value.* into detail_value
  from scoring_authority.tournament_setup_match_details_v1 value
  where value.tournament_id = '2026'
    and value.match_id = target_match_id;
  if detail_value.match_id is not null then
    if detail_value.round_number is distinct from match_value.round_number
       or detail_value.prepared_setup_revision is distinct from
         detail_value.setup_revision
       or detail_value.prepared_configuration_fingerprint is null then
      reasons := reasons || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'SETUP_SNAPSHOT_STALE',
          'message', 'The match setup changed after its scoring snapshot was prepared.'
        )
      );
    end if;
    select value.* into assignment_value
    from scoring_authority.tournament_setup_round_courses_v1 value
    where value.tournament_id = '2026'
      and value.round_number = match_value.round_number;
    if assignment_value.tournament_id is null
       or assignment_value.course_id is distinct from detail_value.course_id
       or assignment_value.tee_id is distinct from detail_value.tee_id then
      reasons := reasons || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'ROUND_COURSE_ASSIGNMENT_INVALID',
          'message', 'The match course and tee do not match the round assignment.'
        )
      );
    end if;
    select value.* into course_value
    from scoring_authority.tournament_setup_course_tees_v1 value
    where value.tournament_id = '2026'
      and value.course_id = detail_value.course_id
      and value.tee_id = detail_value.tee_id;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'hole_number', hole.hole_number,
      'par', hole.par,
      'stroke_index', hole.stroke_index,
      'yardage', hole.yardage
    ) order by hole.hole_number) into holes_value
    from scoring_authority.tournament_setup_course_holes_v1 hole
    where hole.tournament_id = '2026'
      and hole.course_id = detail_value.course_id
      and hole.tee_id = detail_value.tee_id;
  else
    -- Migration installation is inert. Existing certified snapshots remain the
    -- canonical setup source until a Director explicitly edits this match.
    course_value.tournament_id := '2026';
    course_value.course_id := snapshot_value.course_id;
    course_value.tee_id := snapshot_value.tee;
    course_value.rating := snapshot_value.rating;
    course_value.slope := snapshot_value.slope;
    course_value.par := snapshot_value.par;
    holes_value := snapshot_value.hole_definitions;
  end if;
  if course_value.tournament_id is null
     or course_value.rating is null
     or course_value.slope not between 55 and 155
     or course_value.par not between 54 and 90 then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'COURSE_CONFIGURATION_INVALID',
        'message', 'The match course and tee scoring facts are incomplete.'
      )
    );
  end if;
  if pg_catalog.jsonb_typeof(holes_value) is distinct from 'array'
     or pg_catalog.jsonb_array_length(coalesce(holes_value, '[]'::jsonb)) <> 18
     or (select pg_catalog.count(distinct (hole->>'hole_number')::integer)
       from pg_catalog.jsonb_array_elements(coalesce(holes_value, '[]'::jsonb)) hole)
       <> 18
     or (select pg_catalog.count(distinct (hole->>'stroke_index')::integer)
       from pg_catalog.jsonb_array_elements(coalesce(holes_value, '[]'::jsonb)) hole)
       <> 18
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
       or snapshot_value.handicap_allowance is distinct from
         round_value.handicap_allowance
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
     or (select pg_catalog.count(*)
       from scoring_authority.match_participants participant
       where participant.match_id = target_match_id and participant.team_side = 1)
       <> expected_count / 2
     or (select pg_catalog.count(*)
       from scoring_authority.match_participants participant
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
    select 1
    from scoring_authority.match_participants participant
    left join scoring_authority.tournament_players membership
      on membership.tournament_id = '2026'
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
    select 1
    from scoring_authority.match_participants participant
    join scoring_authority.matches other_match
      on other_match.match_id = participant.match_id
     and other_match.tournament_id = '2026'
     and other_match.round_number = match_value.round_number
    where participant.player_id in (
      select current_participant.player_id
      from scoring_authority.match_participants current_participant
      where current_participant.match_id = target_match_id
    )
    group by participant.player_id
    having pg_catalog.count(*) > 1
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
  where value.tournament_id = '2026';
  if current_handicap is null
     or snapshot_value.handicap_revision_id is distinct from current_handicap
     or exists (
       select 1
       from scoring_authority.match_participants participant
       left join scoring_authority.handicap_revision_entries entry
         on entry.revision_id = current_handicap
        and entry.tournament_id = '2026'
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
    'hole_number', hole.hole_number,
    'par', hole.par,
    'stroke_index', hole.stroke_index,
    'yardage', hole.yardage
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
  if (select pg_catalog.count(*)
      from scoring_authority.scoring_permissions permission
      where permission.match_id = target_match_id) <> participant_count
     or exists (
       select 1
       from scoring_authority.match_participants participant
       left join scoring_authority.scoring_permissions permission
         on permission.match_id = participant.match_id
        and permission.player_id = participant.player_id
       where participant.match_id = target_match_id
         and (permission.player_id is null
           or permission.permission_revision <> match_value.permission_revision
           or (detail_value.match_id is not null and not (
              (permission.can_score and permission.revoked_at is null)
              or (not permission.can_score and permission.revoked_at is not null)
            ))
           or (detail_value.match_id is null
             and permission.can_score and permission.revoked_at is not null))
     )
     or exists (
       select 1
       from scoring_authority.scoring_permissions permission
       left join scoring_authority.match_participants participant
         on participant.match_id = permission.match_id
        and participant.player_id = permission.player_id
       where permission.match_id = target_match_id
         and participant.player_id is null
     )
     or (
       exists (
         select 1 from scoring_authority.scoring_permissions permission
         where permission.match_id = target_match_id and permission.can_score
       )
       and exists (
         select 1 from scoring_authority.scoring_permissions permission
         where permission.match_id = target_match_id and not permission.can_score
       )
     ) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_PERMISSION_COVERAGE_INVALID',
        'message', 'Scoring access records do not match the current pairings.'
      )
    );
  end if;
  if not allow_scoring_activity and (match_value.scored_holes <> 0
     or match_value.current_hole <> 0
     or match_value.holes_remaining <> 18
     or match_value.team_1_holes_won <> 0
     or match_value.team_2_holes_won <> 0
     or match_value.running_result <> 'Scheduled'
     or match_value.result_winner <> ''
     or match_value.clinched
     or match_value.scorecard_complete
     or match_value.finalized_at is not null
     or match_value.unresolved_mutations <> 0
     or exists (
       select 1 from scoring_authority.hole_scores score
       where score.match_id = target_match_id
     )
     or exists (
       select 1 from scoring_authority.score_mutations mutation
       where mutation.match_id = target_match_id
         and mutation.mutation_type in ('HOLE_SCORE', 'FINALIZE', 'REOPEN')
     )
     or exists (
       select 1 from scoring_authority.finalized_scorecard_snapshots final_value
       where final_value.match_id = target_match_id
     )
     or exists (
       select 1 from scoring_authority.scoring_ingress_leases lease
       where lease.tournament_id = '2026'
         and lease.match_id = target_match_id
         and lease.expires_at > pg_catalog.clock_timestamp()
     )) then
    reasons := reasons || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'MATCH_ALREADY_HAS_SCORING_ACTIVITY',
        'message', 'The match already has scoring activity and cannot be started from setup.'
      )
    );
  end if;

  if pg_catalog.jsonb_array_length(reasons) = 0 then
    begin
      context_value := production_control.handicap_v1_match_context(
        target_match_id, current_handicap
      );
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'match_id', participant.match_id,
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
    'matchId', target_match_id,
    'source', case when detail_value.match_id is null
      then 'CERTIFIED_CANONICAL_SNAPSHOT'
      else 'TOURNAMENT_SETUP_V1' end,
    'reasons', reasons
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'ready', false,
    'contractVersion', 'production-match-scoring-readiness-v1',
    'matchId', target_match_id,
    'reasons', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCORING_READINESS_UNAVAILABLE',
        'message', 'Scoring readiness could not be verified safely.'
      )
    )
  );
end;
$function$
;
