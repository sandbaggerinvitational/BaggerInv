-- Calcutta calculation v2 separates BB/SI auction scoring from canonical
-- matchup-relative match play. Installation is inert: it permits and
-- fingerprints the new engine but creates no configuration, auction, job,
-- result, or publication fact.

begin;

alter table scoring_authority.calcutta_v1_result_revisions
  drop constraint calcutta_v1_result_revisions_engine_version_check;
alter table scoring_authority.calcutta_v1_result_revisions
  add constraint calcutta_v1_result_revisions_engine_version_check
  check (engine_version in ('calcutta-js-v1', 'calcutta-js-v2'));

comment on column scoring_authority.calcutta_v1_result_revisions.engine_version is
  'Immutable calculation identity. v2 uses frozen full rounded Course Handicap with signed hole allocation for BB/SI; v1 history remains readable.';

create or replace function production_control.calcutta_v1_source_revision(
  target_tournament_id text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, scoring_authority
as $$
  select pg_catalog.jsonb_build_object(
    'tournament_id', target_tournament_id,
    'calculation_policy', 'calcutta-bb-si-full-course-handicap-v1',
    'rounds', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'round_number', round_value.round_number,
        'format', round_value.format,
        'status', round_value.status
      ) order by round_value.round_number)
      from scoring_authority.rounds round_value
      where round_value.tournament_id = target_tournament_id
        and round_value.round_number between 1 and 3
    ), '[]'::jsonb),
    'matches', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'match_id', match_value.match_id,
        'round_number', match_value.round_number,
        'format', match_value.format,
        'status', match_value.status,
        'match_revision', match_value.match_revision,
        'permission_revision', match_value.permission_revision,
        'scored_holes', match_value.scored_holes,
        'scorecard_complete', match_value.scorecard_complete,
        'result_winner', match_value.result_winner,
        'finalized_at', match_value.finalized_at,
        'scoring_snapshot_id', match_value.scoring_snapshot_id,
        'participants', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'player_id', participant.player_id,
            'team_side', participant.team_side,
            'player_slot', participant.player_slot,
            'course_handicap', participant.course_handicap,
            'playing_handicap', participant.playing_handicap,
            'final_strokes', participant.final_strokes,
            'handicap_revision_id', participant.handicap_revision_id
          ) order by participant.team_side, participant.player_slot,
            participant.player_id)
          from scoring_authority.match_participants participant
          where participant.match_id = match_value.match_id
        ), '[]'::jsonb)
      ) order by match_value.round_number, match_value.match_id)
      from scoring_authority.matches match_value
      where match_value.tournament_id = target_tournament_id
        and match_value.round_number between 1 and 3
    ), '[]'::jsonb),
    'holes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'match_id', score.match_id,
        'round_number', match_value.round_number,
        'hole_number', score.hole_number,
        'hole_revision', score.hole_revision,
        'team_1_gross_scores', score.team_1_gross_scores,
        'team_2_gross_scores', score.team_2_gross_scores,
        'team_1_strokes', score.team_1_strokes,
        'team_2_strokes', score.team_2_strokes,
        'team_1_net_score', score.team_1_net_score,
        'team_2_net_score', score.team_2_net_score,
        'hole_winner', score.hole_winner
      ) order by match_value.round_number, score.match_id, score.hole_number)
      from scoring_authority.hole_scores score
      join scoring_authority.matches match_value
        on match_value.match_id = score.match_id
      where match_value.tournament_id = target_tournament_id
        and match_value.round_number between 1 and 3
    ), '[]'::jsonb)
  )
$$;

revoke all on function production_control.calcutta_v1_source_revision(text)
  from public, anon, authenticated, service_role;

-- Both installed completion paths contain two immutable v1 literals: the
-- accepted request version and the value persisted with the result. Replace
-- exactly those literals while retaining every existing lease, revision,
-- source-fingerprint, authorization, audit, and idempotency predicate.
do $calcutta_engine_v2$
declare
  signature text;
  definition text;
  occurrences integer;
begin
  foreach signature in array array[
    'public.complete_production_calcutta_v1_recalculation(jsonb)',
    'public.future_production_complete_calcutta_recalculation_v1(jsonb)'
  ] loop
    if pg_catalog.to_regprocedure(signature) is null then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_CALCUTTA_V1_COMPLETION_CONTRACT_MISSING';
    end if;
    select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(signature))
      into strict definition;
    occurrences := (
      pg_catalog.length(definition)
      - pg_catalog.length(pg_catalog.replace(
          definition, 'calcutta-js-v1', ''
        ))
    ) / pg_catalog.length('calcutta-js-v1');
    if occurrences <> 2 then
      raise exception using errcode = '55000',
        message = 'PRODUCTION_CALCUTTA_V1_ENGINE_LITERAL_MISMATCH';
    end if;
    execute pg_catalog.replace(
      definition, 'calcutta-js-v1', 'calcutta-js-v2'
    );
  end loop;
end;
$calcutta_engine_v2$;

revoke all on function public.complete_production_calcutta_v1_recalculation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_production_calcutta_v1_recalculation(jsonb)
  to service_role;
revoke all on function public.future_production_complete_calcutta_recalculation_v1(jsonb)
  from public, anon, authenticated, service_role;

commit;
