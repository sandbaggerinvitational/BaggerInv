-- Local candidate only. Function-only correction; installation writes no match data.
begin;
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
$function$;

-- Preserve the public initial-readiness contract and all of its strict checks.
create or replace function production_control.assert_production_match_scoring_ready_v1(target_match_id text)
returns jsonb language sql stable security definer
set search_path = pg_catalog, production_control
as $$ select production_control.match_scoring_context_readiness_v1(target_match_id, false) $$;

-- Store the authority binding in existing server-written mutation receipts.
-- No new scoring context, authority table, client input or recalculation write.
create function production_control.match_resume_context_hash_v1(target_match_id text)
returns text language sql stable security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
 select production_control.cutover_payload_hash(jsonb_build_object(
   'match_id', m.match_id, 'tournament_id', m.tournament_id,
   'round_number', m.round_number, 'format', m.format,
   'snapshot', to_jsonb(s),
   'participants', (select jsonb_agg(to_jsonb(p) order by p.team_side,p.player_slot)
     from scoring_authority.match_participants p where p.match_id=m.match_id),
   'holes', (select jsonb_agg(to_jsonb(h) order by h.hole_number)
     from scoring_authority.match_holes h where h.match_id=m.match_id),
   'approved_handicaps', (select jsonb_agg(to_jsonb(e) order by e.player_id)
     from scoring_authority.handicap_revision_entries e where e.revision_id=s.handicap_revision_id
       and e.player_id in(select p.player_id from scoring_authority.match_participants p where p.match_id=m.match_id)),
   'setup', (select jsonb_build_object('course_id',d.course_id,'tee_id',d.tee_id,
     'setup_revision',d.setup_revision,'prepared_setup_revision',d.prepared_setup_revision,
     'fingerprint',d.prepared_configuration_fingerprint)
     from scoring_authority.tournament_setup_match_details_v1 d where d.match_id=m.match_id)
 )) from scoring_authority.matches m join scoring_authority.scoring_snapshots s
 on s.snapshot_id=m.scoring_snapshot_id and s.match_id=m.match_id and s.tournament_id=m.tournament_id
 where m.match_id=target_match_id and m.tournament_id='2026'
$$;

create function production_control.assert_production_match_resume_ready_v1(target_match_id text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
 m scoring_authority.matches%rowtype;
 anchor scoring_authority.score_mutations%rowtype;
 context_result jsonb;
 reason text;
 progress jsonb;
 context_hash text;
begin
 select * into m from scoring_authority.matches where match_id=target_match_id and tournament_id='2026';
 context_result := production_control.match_scoring_context_readiness_v1(target_match_id,true);
 if coalesce((context_result->>'ready')::boolean,false) is not true then
   return context_result || jsonb_build_object('contractVersion','production-match-resume-readiness-v1');
 end if;
 context_hash := production_control.match_resume_context_hash_v1(target_match_id);
 select * into anchor from scoring_authority.score_mutations
 where match_id=target_match_id and mutation_type in ('ACCESS_ACTIVATE','SCORING_UNLOCK')
   and result->>'scoring_context_hash' is not null
 order by next_match_revision limit 1;
 if m.status <> 'LIVE' or m.finalized_at is not null then
   reason := 'RESUME_REQUIRES_LIVE_NONFINAL_MATCH';
 elsif m.unresolved_mutations <> 0 or exists(
   select 1 from scoring_authority.scoring_ingress_leases l
   where l.tournament_id=m.tournament_id and l.match_id=m.match_id and l.expires_at>clock_timestamp()
 ) or exists(select 1 from scoring_authority.finalized_scorecard_snapshots f where f.match_id=m.match_id)
   or exists(select 1 from scoring_authority.score_mutations r where r.match_id=m.match_id and r.mutation_type in('FINALIZE','REOPEN')) then
   reason := 'RESUME_CORRECTION_OR_MUTATION_CONFLICT';
 elsif anchor.mutation_key is null or context_hash is null
   or anchor.result->>'scoring_context_hash' is distinct from context_hash then
   reason := 'RESUME_AUTHORITY_BINDING_MISMATCH';
 elsif exists(select 1 from scoring_authority.scoring_permissions p where p.match_id=m.match_id
   and (p.can_score or p.revoked_at is null)) then
   reason := 'RESUME_REQUIRES_REVOKED_ACCESS';
 elsif exists(select 1 from scoring_authority.score_mutations r where r.match_id=m.match_id
   and r.previous_match_revision>=anchor.previous_match_revision
   and (r.next_match_revision<>r.previous_match_revision+1
     or r.next_match_revision>m.match_revision
     or r.mutation_type not in('ACCESS_ACTIVATE','SCORING_UNLOCK','ACCESS_REVOKE','SCORING_LOCK','MARK_LIVE','HOLE_SCORE')
     or (r.mutation_type in('ACCESS_ACTIVATE','SCORING_UNLOCK')
         and r.result->>'scoring_context_hash' is distinct from context_hash)
     or (select count(*) from scoring_authority.score_revision_history h
         where h.match_id=r.match_id and h.mutation_key=r.mutation_key
           and h.previous_match_revision=r.previous_match_revision and h.next_match_revision=r.next_match_revision
           and h.actor_id=r.actor_id
           and (case when r.mutation_type='HOLE_SCORE' then h.after_state=r.result
             else h.after_state#>>'{match,scoring_snapshot_id}'=m.scoring_snapshot_id
               and h.before_state#>>'{match,scoring_snapshot_id}'=m.scoring_snapshot_id end))<>1))
   or (select count(*) from scoring_authority.score_mutations r where r.match_id=m.match_id
       and r.previous_match_revision>=anchor.previous_match_revision)<>m.match_revision-anchor.previous_match_revision
   or (select count(distinct r.next_match_revision) from scoring_authority.score_mutations r where r.match_id=m.match_id
       and r.previous_match_revision>=anchor.previous_match_revision)<>m.match_revision-anchor.previous_match_revision then
   reason := 'RESUME_REVISION_HISTORY_INVALID';
 elsif exists(select 1 from scoring_authority.hole_scores h left join scoring_authority.score_mutations r
     on r.match_id=h.match_id and r.mutation_key=h.mutation_key
   where h.match_id=m.match_id and (r.mutation_key is null or r.mutation_type<>'HOLE_SCORE'
     or r.previous_match_revision<anchor.next_match_revision
     or r.hole_number is distinct from h.hole_number or r.next_hole_revision is distinct from h.hole_revision
     or r.result->'gross' is distinct from jsonb_build_object('team_1',h.team_1_gross_scores,'team_2',h.team_2_gross_scores)
     or r.result->'strokes' is distinct from jsonb_build_object('team_1',h.team_1_strokes,'team_2',h.team_2_strokes)
     or r.result->'net' is distinct from jsonb_build_object('team_1',h.team_1_net_score,'team_2',h.team_2_net_score)
     or r.result->>'hole_winner' is distinct from h.hole_winner
     or (select count(*) from scoring_authority.score_mutations q where q.match_id=h.match_id
          and q.mutation_type='HOLE_SCORE' and q.hole_number=h.hole_number)<>h.hole_revision
     or (select count(distinct q.next_hole_revision) from scoring_authority.score_mutations q where q.match_id=h.match_id
          and q.mutation_type='HOLE_SCORE' and q.hole_number=h.hole_number
          and q.next_hole_revision=q.previous_hole_revision+1 and q.next_hole_revision between 1 and h.hole_revision)<>h.hole_revision))
   or exists(select 1 from scoring_authority.score_mutations r where r.match_id=m.match_id and r.mutation_type='HOLE_SCORE'
     and not exists(select 1 from scoring_authority.hole_scores h where h.match_id=r.match_id and h.hole_number=r.hole_number)) then
   reason := 'RESUME_SCORE_HISTORY_INVALID';
 end if;
 if reason is null then
   progress := scoring_authority.match_progress(m.match_id,m.format);
   if (select jsonb_object_agg(k,to_jsonb(m)->k) from unnest(array[
       'scored_holes','current_hole','holes_remaining','team_1_holes_won','team_2_holes_won',
       'running_result','result_winner','clinched','scorecard_complete']) k)
      is distinct from (select jsonb_object_agg(k,progress->k) from unnest(array[
       'scored_holes','current_hole','holes_remaining','team_1_holes_won','team_2_holes_won',
       'running_result','result_winner','clinched','scorecard_complete']) k) then
     reason := 'RESUME_PROGRESS_MISMATCH';
   end if;
 end if;
 return jsonb_build_object('ready',reason is null,'contractVersion','production-match-resume-readiness-v1',
   'matchId',target_match_id,'scoring_context_hash',context_hash,
   'reasons',case when reason is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('code',reason)) end);
exception when others then
 return jsonb_build_object('ready',false,'contractVersion','production-match-resume-readiness-v1',
   'reasons',jsonb_build_array(jsonb_build_object('code','RESUME_READINESS_UNAVAILABLE')));
end $$;
CREATE OR REPLACE FUNCTION public.mutate_production_match_control(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  match_row scoring_authority.matches%rowtype;
  next_match_row scoring_authority.matches%rowtype;
  mutation_row scoring_authority.score_mutations%rowtype;
  target_match text := input->>'match_id';
  operation text := pg_catalog.upper(coalesce(input->>'operation', ''));
  mutation_identity text := input->>'mutation_key';
  actor text := input#>>'{authorization,player_id}';
  expected_match bigint := coalesce(
    (input->>'expected_match_revision')::bigint, -1
  );
  expected_permission bigint := coalesce(
    (input#>>'{authorization,permission_revision}')::bigint, -1
  );
  next_match_revision bigint;
  next_permission_revision bigint;
  permission_changes boolean;
  target_locked boolean;
  target_access boolean;
  event_type text;
  mutation_type text;
  payload_hash_value text;
  result_value jsonb;
  before_permissions jsonb;
  after_permissions jsonb;
  readiness_value jsonb;
  transition_at timestamptz := pg_catalog.clock_timestamp();
begin
  perform production_control.assert_production_scoring_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  if operation not in (
       'MARK_LIVE', 'SCORING_LOCK', 'SCORING_UNLOCK',
       'ACCESS_ACTIVATE', 'ACCESS_REVOKE'
     ) or coalesce(target_match, '') = ''
       or coalesce(mutation_identity, '') = '' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'INVALID_CONTROL_OPERATION'
    );
  end if;
  -- Tournament Setup always acquires this lock before locking a match. Use the
  -- same order so a setup commit and MARK_LIVE cannot pass one another.
  if operation in ('MARK_LIVE', 'ACCESS_ACTIVATE', 'SCORING_UNLOCK') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-access-governance-v1:2026', 0
    ));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'production-tournament-setup-v1:2026', 0
    ));
  end if;
  select * into match_row from scoring_authority.matches
    where match_id = target_match and tournament_id = '2026' for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_FOUND'
    );
  end if;
  if input#>>'{authorization,match_id}' <> target_match then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'DIRECTOR_REQUIRED'
    );
  end if;
  -- Access-granting operations must validate the current canonical readiness
  -- inside the same transaction, before receipt replay or any permission write.
  -- Setup/access governance hold the advisory locks above; handicap approval
  -- takes all affected match row locks before advancing its current pointer.
  -- READ COMMITTED ensures a waiter sees authority committed before its lock.
  if operation in ('ACCESS_ACTIVATE', 'SCORING_UNLOCK') then
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'SCORING_READINESS_REFRESH_REQUIRED'
      );
    end if;
    perform production_control.assert_production_scoring_runtime(input);
    perform production_control.assert_production_scoring_actor(input, true);
    if match_row.status = 'FINAL' then
      return pg_catalog.jsonb_build_object('ok',false,'code','MATCH_FINAL');
    end if;
    if exists(select 1 from scoring_authority.score_mutations r where r.match_id=target_match
      and ((r.mutation_type in('ACCESS_ACTIVATE','SCORING_UNLOCK') and r.result->>'scoring_context_hash' is not null)
        or r.mutation_type in('HOLE_SCORE','FINALIZE','REOPEN')))
      or exists(select 1 from scoring_authority.hole_scores h where h.match_id=target_match)
      or match_row.scored_holes>0 then
      readiness_value := production_control.assert_production_match_resume_ready_v1(target_match);
    else
      readiness_value := production_control.assert_production_match_scoring_ready_v1(target_match);
    end if;
    if coalesce((readiness_value->>'ready')::boolean, false) is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', case when readiness_value->>'contractVersion'='production-match-resume-readiness-v1'
          then 'PRODUCTION_MATCH_NOT_RESUME_READY' else 'PRODUCTION_MATCH_NOT_SCORING_READY' end,
        'match_id', target_match,
        'scoring_readiness_contract', readiness_value->>'contractVersion',
        'reasons', coalesce(readiness_value->'reasons', '[]'::jsonb),
        'audit_created', false, 'google_outbox_created', false
      );
    end if;
    if expected_match <> match_row.match_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'MATCH_REVISION_CONFLICT');
    end if;
    if expected_permission <> match_row.permission_revision then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'PERMISSION_STALE');
    end if;
  end if;
  payload_hash_value := production_control.cutover_payload_hash(
    pg_catalog.jsonb_build_object(
      'match_id', target_match, 'operation', operation, 'actor_id', actor
    )
  );
  select * into mutation_row from scoring_authority.score_mutations
    where match_id = target_match and mutation_key = mutation_identity;
  if found then
    if mutation_row.payload_hash = payload_hash_value then
      return mutation_row.result || pg_catalog.jsonb_build_object(
        'idempotent', true
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'IDEMPOTENCY_CONFLICT'
    );
  end if;
  if expected_match <> match_row.match_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_REVISION_CONFLICT',
      'current_match_revision', match_row.match_revision
    );
  end if;
  if expected_permission <> match_row.permission_revision then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'PERMISSION_STALE',
      'current_permission_revision', match_row.permission_revision
    );
  end if;
  if match_row.status = 'FINAL' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_FINAL'
    );
  end if;
  if operation = 'MARK_LIVE' and match_row.status = 'LIVE' then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'status', match_row.status,
      'scoring_locked', match_row.scoring_locked,
      'google_outbox_created', false
    );
  end if;
  if operation = 'MARK_LIVE' and match_row.status <> 'UPCOMING' then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'code', 'MATCH_NOT_UPCOMING'
    );
  end if;
  if operation = 'MARK_LIVE' then
    readiness_value :=
      production_control.assert_production_match_scoring_ready_v1(
        target_match
      );
    if coalesce((readiness_value->>'ready')::boolean, false) is not true then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'code', 'PRODUCTION_MATCH_NOT_SCORING_READY',
        'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'status', match_row.status,
        'scoring_locked', match_row.scoring_locked,
        'scoring_readiness_contract',
          'production-match-scoring-readiness-v1',
        'reasons', coalesce(readiness_value->'reasons', '[]'::jsonb),
        'audit_created', false,
        'google_outbox_created', false
      );
    end if;
  end if;
  if operation in ('SCORING_UNLOCK', 'ACCESS_ACTIVATE') and (
       (operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked)
       or (operation = 'SCORING_UNLOCK' and not match_row.scoring_locked)
     ) then
    if operation = 'ACCESS_ACTIVATE' and match_row.scoring_locked then
      return pg_catalog.jsonb_build_object(
        'ok', false, 'code', 'SCORING_LOCKED'
      );
    end if;
    if not exists (
      select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and (
        not can_score or revoked_at is not null
        or permission_revision <> match_row.permission_revision
      )
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
        'match_id', target_match,
        'match_revision', match_row.match_revision,
        'permission_revision', match_row.permission_revision,
        'scoring_locked', match_row.scoring_locked,
        'access_active', true,
        'google_outbox_created', false
      );
    end if;
  end if;
  if operation = 'SCORING_LOCK' and match_row.scoring_locked and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (
      can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', true,
      'access_active', false,
      'google_outbox_created', false
    );
  end if;
  if operation = 'ACCESS_REVOKE' and not exists (
    select 1 from scoring_authority.scoring_permissions
    where match_id = target_match and (
      can_score or revoked_at is null
      or permission_revision <> match_row.permission_revision
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'code', 'NO_CHANGE', 'semantic_noop', true,
      'match_id', target_match,
      'match_revision', match_row.match_revision,
      'permission_revision', match_row.permission_revision,
      'scoring_locked', match_row.scoring_locked,
      'access_active', false,
      'google_outbox_created', false
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(permission) order by player_id
  ), '[]'::jsonb) into before_permissions
  from scoring_authority.scoring_permissions permission
  where match_id = target_match;
  next_match_revision := match_row.match_revision + 1;
  permission_changes := operation <> 'MARK_LIVE';
  next_permission_revision := match_row.permission_revision
    + case when permission_changes then 1 else 0 end;
  target_locked := case operation
    when 'SCORING_LOCK' then true
    when 'SCORING_UNLOCK' then false
    else match_row.scoring_locked end;
  target_access := case operation
    when 'SCORING_LOCK' then false
    when 'SCORING_UNLOCK' then true
    when 'ACCESS_ACTIVATE' then true
    when 'ACCESS_REVOKE' then false
    else exists (
      select 1 from scoring_authority.scoring_permissions
      where match_id = target_match and can_score and revoked_at is null
    ) end;
  event_type := case operation
    when 'MARK_LIVE' then 'MATCH_MARKED_LIVE'
    when 'SCORING_LOCK' then 'SCORING_LOCKED'
    when 'SCORING_UNLOCK' then 'SCORING_UNLOCKED'
    when 'ACCESS_ACTIVATE' then 'SCORING_ACCESS_ACTIVATED'
    else 'SCORING_ACCESS_REVOKED' end;
  mutation_type := operation;

  update scoring_authority.matches set
    status = case when operation = 'MARK_LIVE' then 'LIVE' else status end,
    scoring_locked = target_locked,
    match_revision = next_match_revision,
    permission_revision = next_permission_revision,
    authority_updated_at = transition_at,
    updated_at = transition_at
  where match_id = target_match returning * into next_match_row;
  if permission_changes then
    update scoring_authority.scoring_permissions set
      can_score = target_access,
      permission_revision = next_permission_revision,
      revoked_at = case when target_access then null else transition_at end,
      updated_at = transition_at
    where match_id = target_match;
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(permission) order by player_id
  ), '[]'::jsonb) into after_permissions
  from scoring_authority.scoring_permissions permission
  where match_id = target_match;
  result_value := pg_catalog.jsonb_build_object(
    'ok', true, 'code', operation,
    'match_id', target_match,
    'google_target_match_id', target_match,
    'match_revision', next_match_revision,
    'previous_permission_revision', match_row.permission_revision,
    'permission_revision', next_permission_revision,
    'status', next_match_row.status,
    'scoring_locked', target_locked,
    'access_active', target_access,
    'updated_at', transition_at,
    'permission_transition', pg_catalog.jsonb_build_object(
      'before', before_permissions, 'after', after_permissions
    ),
    'scoring_context_hash', case when operation in('ACCESS_ACTIVATE','SCORING_UNLOCK')
      then production_control.match_resume_context_hash_v1(target_match) else null end,
    'audit_created', true,
    'google_outbox_created', true
  );
  insert into scoring_authority.score_mutations (
    match_id, mutation_key, mutation_type, payload_hash,
    previous_match_revision, next_match_revision, result, actor_id
  ) values (
    target_match, mutation_identity, mutation_type, payload_hash_value,
    match_row.match_revision, next_match_revision, result_value, actor
  );
  insert into scoring_authority.score_revision_history (
    match_id, mutation_key, action, previous_match_revision,
    next_match_revision, before_state, after_state, actor_id
  ) values (
    target_match, mutation_identity, event_type,
    match_row.match_revision, next_match_revision,
    pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(match_row),
      'permissions', before_permissions
    ),
    pg_catalog.jsonb_build_object(
      'match', pg_catalog.to_jsonb(next_match_row),
      'permissions', after_permissions
    ),
    actor
  );
  insert into scoring_authority.audit_events (
    tournament_id, match_id, mutation_key, action, actor_id, metadata
  ) values (
    '2026', target_match, mutation_identity, event_type, actor, result_value
  );
  insert into scoring_authority.google_outbox_events (
    tournament_id, match_id, match_revision, mutation_key,
    event_type, payload, payload_hash
  ) values (
    '2026', target_match, next_match_revision, mutation_identity,
    event_type, result_value, payload_hash_value
  );
  return result_value;
end;
$function$;

revoke all on function production_control.match_scoring_context_readiness_v1(text,boolean),
 production_control.match_resume_context_hash_v1(text),
 production_control.assert_production_match_resume_ready_v1(text) from public,anon,authenticated,service_role;
-- Existing public mutation and initial-readiness ACLs remain unchanged.
commit;
