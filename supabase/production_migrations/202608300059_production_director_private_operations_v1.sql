-- Production Director-private operational visibility for Calcutta, Net Skins,
-- bounded job state, and a sanitized audit timeline. Installation is inert:
-- this migration adds read functions only and changes no tournament fact,
-- authority, ingress, worker, publication, identity, or maintenance state.
begin;

create or replace function production_control.director_private_net_skins_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.net_skins_v1_configuration_current%rowtype;
  total_matches integer := 0;
  ready_matches integer := 0;
  round_issue_count integer := 0;
  match_reference_count integer := 0;
  incomplete_pairing_count integer := 0;
  missing_assignment_count integer := 0;
  invalid_player_count integer := 0;
  individual_input_count integer := 0;
  scramble_pairing_count integer := 0;
  scramble_match_count integer := 0;
  scramble_player_slot_count integer := 0;
  scramble_stroke_count integer := 0;
  scramble_stroke_match_count integer := 0;
  hole_match_count integer := 0;
  missing_hole_count integer := 0;
  duplicate_player_count integer := 0;
  issues_value jsonb := '[]'::jsonb;
  by_round_value jsonb;
  jobs_value jsonb := '[]'::jsonb;
begin
  select value.* into strict current_value
  from scoring_authority.net_skins_v1_configuration_current value
  where value.tournament_id = '2026';

  with expected(round_number, expected_format, expected_players) as (
    values (1, 'BB'::text, 4), (2, 'SC'::text, 4), (3, 'SI'::text, 2)
  )
  select pg_catalog.count(*)::integer into round_issue_count
  from expected
  left join scoring_authority.rounds round_value
    on round_value.tournament_id = '2026'
   and round_value.round_number = expected.round_number
  where round_value.round_number is null
     or round_value.format is distinct from expected.expected_format;

  if round_issue_count > 0 then
    with expected(round_number, expected_format) as (
      values (1, 'BB'::text), (2, 'SC'::text), (3, 'SI'::text)
    )
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'round', expected.round_number,
      'affected_matches', 0,
      'missing_count', 1
    ) order by expected.round_number), '[]'::jsonb) into by_round_value
    from expected
    left join scoring_authority.rounds round_value
      on round_value.tournament_id = '2026'
     and round_value.round_number = expected.round_number
    where round_value.round_number is null
       or round_value.format is distinct from expected.expected_format;
    issues_value := issues_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_DEFINITIONS',
        'label', 'Tournament rounds',
        'affected_matches', 0,
        'missing_count', round_issue_count,
        'summary', pg_catalog.format(
          '%s approved tournament %s still need a supported Net Skins format.',
          round_issue_count,
          case when round_issue_count = 1 then 'round' else 'rounds' end
        ),
        'by_round', by_round_value
      )
    );
  end if;

  with expected(round_number, expected_format, expected_players) as (
    values (1, 'BB'::text, 4), (2, 'SC'::text, 4), (3, 'SI'::text, 2)
  ), match_base as (
    select match_value.match_id, match_value.round_number,
      match_value.format, expected.expected_format,
      expected.expected_players, match_value.scoring_snapshot_id,
      snapshot.snapshot_id,
      (select pg_catalog.count(*)::integer
       from scoring_authority.match_participants participant
       where participant.match_id = match_value.match_id) participant_count,
      (select pg_catalog.count(*)::integer
       from scoring_authority.match_participants participant
       where participant.match_id = match_value.match_id
         and participant.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
         and exists (
           select 1 from scoring_authority.tournament_players membership
           where membership.tournament_id = '2026'
             and membership.player_id = participant.player_id
             and membership.participation_status = 'ACTIVE'
         )) stable_participant_count,
      (select pg_catalog.count(distinct hole.hole_number)::integer
       from scoring_authority.match_holes hole
       where hole.match_id = match_value.match_id
         and hole.hole_number between 1 and 18) hole_count,
      snapshot.team_configuration
    from scoring_authority.matches match_value
    join expected on expected.round_number = match_value.round_number
    left join scoring_authority.scoring_snapshots snapshot
      on snapshot.snapshot_id = match_value.scoring_snapshot_id
     and snapshot.tournament_id = match_value.tournament_id
     and snapshot.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
  )
  select pg_catalog.count(*)::integer into total_matches from match_base;

  with expected(round_number) as (values (1), (2), (3)), missing as (
    select expected.round_number
    from expected
    where not exists (
      select 1 from scoring_authority.matches match_value
      where match_value.tournament_id = '2026'
        and match_value.round_number = expected.round_number
    )
    union all
    select match_value.round_number
    from scoring_authority.matches match_value
    join scoring_authority.rounds round_value
      on round_value.tournament_id = match_value.tournament_id
     and round_value.round_number = match_value.round_number
    left join scoring_authority.scoring_snapshots snapshot
      on snapshot.snapshot_id = match_value.scoring_snapshot_id
     and snapshot.tournament_id = match_value.tournament_id
     and snapshot.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
      and match_value.round_number between 1 and 3
      and (snapshot.snapshot_id is null
        or match_value.format is distinct from round_value.format)
  )
  select pg_catalog.count(*)::integer into match_reference_count from missing;

  if match_reference_count > 0 then
    with expected(round_number) as (values (1), (2), (3)), missing as (
      select expected.round_number, 1 as missing_count
      from expected
      where not exists (
        select 1 from scoring_authority.matches match_value
        where match_value.tournament_id = '2026'
          and match_value.round_number = expected.round_number
      )
      union all
      select match_value.round_number, 1
      from scoring_authority.matches match_value
      join scoring_authority.rounds round_value
        on round_value.tournament_id = match_value.tournament_id
       and round_value.round_number = match_value.round_number
      left join scoring_authority.scoring_snapshots snapshot
        on snapshot.snapshot_id = match_value.scoring_snapshot_id
       and snapshot.tournament_id = match_value.tournament_id
       and snapshot.match_id = match_value.match_id
      where match_value.tournament_id = '2026'
        and match_value.round_number between 1 and 3
        and (snapshot.snapshot_id is null
          or match_value.format is distinct from round_value.format)
    )
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'round', grouped.round_number,
      'affected_matches', grouped.affected,
      'missing_count', grouped.missing_count
    ) order by grouped.round_number), '[]'::jsonb) into by_round_value
    from (
      select round_number, pg_catalog.count(*)::integer affected,
        pg_catalog.sum(missing_count)::integer missing_count
      from missing group by round_number
    ) grouped;
    issues_value := issues_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'MATCH_REFERENCES',
        'label', 'Canonical match references',
        'affected_matches', match_reference_count,
        'missing_count', match_reference_count,
        'summary', pg_catalog.format(
          '%s canonical match %s still need a complete scoring snapshot and supported round reference.',
          match_reference_count,
          case when match_reference_count = 1 then 'reference' else 'references' end
        ),
        'by_round', by_round_value
      )
    );
  end if;

  with expected(round_number, expected_players) as (
    values (1, 4), (2, 4), (3, 2)
  ), counts as (
    select match_value.match_id, match_value.round_number,
      expected.expected_players,
      pg_catalog.count(participant.player_id)::integer participant_count
    from scoring_authority.matches match_value
    join expected on expected.round_number = match_value.round_number
    left join scoring_authority.match_participants participant
      on participant.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
    group by match_value.match_id, match_value.round_number,
      expected.expected_players
  )
  select
    pg_catalog.count(*) filter (
      where participant_count <> expected_players
    )::integer,
    coalesce(pg_catalog.sum(greatest(
      expected_players - participant_count, 0
    )), 0)::integer
  into incomplete_pairing_count, missing_assignment_count
  from counts;

  if incomplete_pairing_count > 0 then
    with expected(round_number, expected_players) as (
      values (1, 4), (2, 4), (3, 2)
    ), counts as (
      select match_value.match_id, match_value.round_number,
        expected.expected_players,
        pg_catalog.count(participant.player_id)::integer participant_count
      from scoring_authority.matches match_value
      join expected on expected.round_number = match_value.round_number
      left join scoring_authority.match_participants participant
        on participant.match_id = match_value.match_id
      where match_value.tournament_id = '2026'
      group by match_value.match_id, match_value.round_number,
        expected.expected_players
    )
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'round', grouped.round_number,
      'affected_matches', grouped.affected_matches,
      'missing_count', grouped.missing_count
    ) order by grouped.round_number), '[]'::jsonb) into by_round_value
    from (
      select round_number,
        pg_catalog.count(*) filter (
          where participant_count <> expected_players
        )::integer affected_matches,
        coalesce(pg_catalog.sum(greatest(
          expected_players - participant_count, 0
        )), 0)::integer missing_count
      from counts group by round_number
      having pg_catalog.count(*) filter (
        where participant_count <> expected_players
      ) > 0
    ) grouped;
    issues_value := issues_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'MATCH_PARTICIPANTS',
        'label', 'Complete pairings',
        'affected_matches', incomplete_pairing_count,
        'missing_count', missing_assignment_count,
        'summary', pg_catalog.format(
          '%s %s still need complete pairings (%s participant assignments missing).',
          incomplete_pairing_count,
          case when incomplete_pairing_count = 1 then 'match' else 'matches' end,
          missing_assignment_count
        ),
        'by_round', by_round_value
      )
    );
  end if;

  select pg_catalog.count(*)::integer into invalid_player_count
  from scoring_authority.match_participants participant
  join scoring_authority.matches match_value
    on match_value.match_id = participant.match_id
  where match_value.tournament_id = '2026'
    and match_value.round_number between 1 and 3
    and (participant.player_id !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
      or not exists (
        select 1 from scoring_authority.tournament_players membership
        where membership.tournament_id = '2026'
          and membership.player_id = participant.player_id
          and membership.participation_status = 'ACTIVE'
      ));

  if invalid_player_count > 0 then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'round', grouped.round_number,
      'affected_matches', grouped.affected_matches,
      'missing_count', grouped.missing_count
    ) order by grouped.round_number), '[]'::jsonb) into by_round_value
    from (
      select match_value.round_number,
        pg_catalog.count(distinct match_value.match_id)::integer affected_matches,
        pg_catalog.count(*)::integer missing_count
      from scoring_authority.match_participants participant
      join scoring_authority.matches match_value
        on match_value.match_id = participant.match_id
      where match_value.tournament_id = '2026'
        and match_value.round_number between 1 and 3
        and (participant.player_id !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
          or not exists (
            select 1 from scoring_authority.tournament_players membership
            where membership.tournament_id = '2026'
              and membership.player_id = participant.player_id
              and membership.participation_status = 'ACTIVE'
          ))
      group by match_value.round_number
    ) grouped;
    issues_value := issues_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PLAYER_IDENTITIES',
        'label', 'Active Player IDs',
        'affected_matches', (
          select pg_catalog.count(distinct match_value.match_id)::integer
          from scoring_authority.match_participants participant
          join scoring_authority.matches match_value
            on match_value.match_id = participant.match_id
          where match_value.tournament_id = '2026'
            and (participant.player_id !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
              or not exists (
                select 1 from scoring_authority.tournament_players membership
                where membership.tournament_id = '2026'
                  and membership.player_id = participant.player_id
                  and membership.participation_status = 'ACTIVE'
              ))
        ),
        'missing_count', invalid_player_count,
        'summary', pg_catalog.format(
          '%s assigned %s still need a valid active Player ID.',
          invalid_player_count,
          case when invalid_player_count = 1 then 'participant' else 'participants' end
        ),
        'by_round', by_round_value
      )
    );
  end if;

  with expected(round_number, expected_players) as (
    values (1, 4), (3, 2)
  ), match_rows as (
    select match_value.match_id, match_value.round_number,
      expected.expected_players,
      pg_catalog.count(participant.player_id) filter (
        where participant.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
          and participant.final_strokes is not null
          and exists (
            select 1 from scoring_authority.tournament_players membership
            where membership.tournament_id = '2026'
              and membership.player_id = participant.player_id
              and membership.participation_status = 'ACTIVE'
          )
      )::integer ready_entries
    from scoring_authority.matches match_value
    join expected on expected.round_number = match_value.round_number
    left join scoring_authority.match_participants participant
      on participant.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
    group by match_value.match_id, match_value.round_number,
      expected.expected_players
  )
  select coalesce(pg_catalog.sum(greatest(
    expected_players - ready_entries, 0
  )), 0)::integer into individual_input_count
  from match_rows;

  if individual_input_count > 0 then
    with expected(round_number, expected_players) as (
      values (1, 4), (3, 2)
    ), match_rows as (
      select match_value.match_id, match_value.round_number,
        expected.expected_players,
        pg_catalog.count(participant.player_id) filter (
          where participant.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
            and participant.final_strokes is not null
            and exists (
              select 1 from scoring_authority.tournament_players membership
              where membership.tournament_id = '2026'
                and membership.player_id = participant.player_id
                and membership.participation_status = 'ACTIVE'
            )
        )::integer ready_entries
      from scoring_authority.matches match_value
      join expected on expected.round_number = match_value.round_number
      left join scoring_authority.match_participants participant
        on participant.match_id = match_value.match_id
      where match_value.tournament_id = '2026'
      group by match_value.match_id, match_value.round_number,
        expected.expected_players
    )
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'round', grouped.round_number,
      'affected_matches', grouped.affected_matches,
      'missing_count', grouped.missing_count
    ) order by grouped.round_number), '[]'::jsonb) into by_round_value
    from (
      select round_number,
        pg_catalog.count(*) filter (
          where ready_entries <> expected_players
        )::integer affected_matches,
        pg_catalog.sum(greatest(
          expected_players - ready_entries, 0
        ))::integer missing_count
      from match_rows group by round_number
      having pg_catalog.sum(greatest(
        expected_players - ready_entries, 0
      )) > 0
    ) grouped;
    issues_value := issues_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'INDIVIDUAL_STROKES',
        'label', 'Individual stroke allocations',
        'affected_matches', (
          select coalesce(pg_catalog.sum(
            (item->>'affected_matches')::integer
          ), 0)::integer
          from pg_catalog.jsonb_array_elements(by_round_value) item
        ),
        'missing_count', individual_input_count,
        'summary', pg_catalog.format(
          '%s individual %s still need an active Player and canonical final-stroke allocation.',
          individual_input_count,
          case when individual_input_count = 1 then 'entry' else 'entries' end
        ),
        'by_round', by_round_value
      )
    );
  end if;

  with sides as (
    select match_value.match_id, match_value.round_number, side_value.side,
      pg_catalog.count(participant.player_id)::integer participant_count,
      pg_catalog.count(participant.player_id) filter (
        where participant.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
          and exists (
            select 1 from scoring_authority.tournament_players membership
            where membership.tournament_id = '2026'
              and membership.player_id = participant.player_id
              and membership.participation_status = 'ACTIVE'
          )
      )::integer stable_count
    from scoring_authority.matches match_value
    cross join (values (1), (2)) side_value(side)
    left join scoring_authority.match_participants participant
      on participant.match_id = match_value.match_id
     and participant.team_side = side_value.side
    where match_value.tournament_id = '2026'
      and match_value.round_number = 2
    group by match_value.match_id, match_value.round_number, side_value.side
  )
  select pg_catalog.count(*) filter (
      where participant_count <> 2 or stable_count <> 2
    )::integer,
    coalesce(pg_catalog.sum(greatest(2 - stable_count, 0)), 0)::integer,
    pg_catalog.count(distinct match_id) filter (
      where participant_count <> 2 or stable_count <> 2
    )::integer
  into scramble_pairing_count, scramble_player_slot_count,
    scramble_match_count
  from sides;

  if scramble_pairing_count > 0 then
    issues_value := issues_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCRAMBLE_PAIRINGS',
        'label', 'Scramble sides',
        'affected_matches', scramble_match_count,
        'missing_count', scramble_player_slot_count,
        'summary', pg_catalog.format(
          '%s Scramble %s still need complete two-player pairings.',
          scramble_pairing_count,
          case when scramble_pairing_count = 1 then 'side' else 'sides' end
        ),
        'by_round', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'round', 2,
            'affected_matches', scramble_match_count,
            'missing_count', scramble_player_slot_count
          )
        )
      )
    );
  end if;

  select pg_catalog.count(*)::integer,
    pg_catalog.count(distinct match_value.match_id)::integer
  into scramble_stroke_count, scramble_stroke_match_count
  from scoring_authority.matches match_value
  left join scoring_authority.scoring_snapshots snapshot
    on snapshot.snapshot_id = match_value.scoring_snapshot_id
   and snapshot.tournament_id = match_value.tournament_id
   and snapshot.match_id = match_value.match_id
  cross join (values ('team_1_strokes'), ('team_2_strokes')) key_value(key)
  where match_value.tournament_id = '2026'
    and match_value.round_number = 2
    and (
      snapshot.snapshot_id is null
      or pg_catalog.btrim(coalesce(
        snapshot.team_configuration->>key_value.key, ''
      )) !~ '^-?[0-9]+(?:\.[0-9]+)?$'
    );

  if scramble_stroke_count > 0 then
    issues_value := issues_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'SCRAMBLE_TEAM_STROKES',
        'label', 'Scramble team handicaps',
        'affected_matches', (
          select pg_catalog.count(distinct match_value.match_id)::integer
          from scoring_authority.matches match_value
          left join scoring_authority.scoring_snapshots snapshot
            on snapshot.snapshot_id = match_value.scoring_snapshot_id
           and snapshot.tournament_id = match_value.tournament_id
           and snapshot.match_id = match_value.match_id
          where match_value.tournament_id = '2026'
            and match_value.round_number = 2
            and (snapshot.snapshot_id is null
              or pg_catalog.btrim(coalesce(
                snapshot.team_configuration->>'team_1_strokes', ''
              )) !~ '^-?[0-9]+(?:\.[0-9]+)?$'
              or pg_catalog.btrim(coalesce(
                snapshot.team_configuration->>'team_2_strokes', ''
              )) !~ '^-?[0-9]+(?:\.[0-9]+)?$')
        ),
        'missing_count', scramble_stroke_count,
        'summary', pg_catalog.format(
          '%s Scramble team handicap %s still need canonical values.',
          scramble_stroke_count,
          case when scramble_stroke_count = 1 then 'input' else 'inputs' end
        ),
        'by_round', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'round', 2,
            'affected_matches', scramble_stroke_match_count,
            'missing_count', scramble_stroke_count
          )
        )
      )
    );
  end if;

  with hole_counts as (
    select match_value.match_id, match_value.round_number,
      pg_catalog.count(distinct hole.hole_number) filter (
        where hole.hole_number between 1 and 18
      )::integer hole_count
    from scoring_authority.matches match_value
    left join scoring_authority.match_holes hole
      on hole.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
      and match_value.round_number between 1 and 3
    group by match_value.match_id, match_value.round_number
  )
  select pg_catalog.count(*) filter (where hole_count <> 18)::integer,
    coalesce(pg_catalog.sum(greatest(18 - hole_count, 0)), 0)::integer
  into hole_match_count, missing_hole_count
  from hole_counts;

  if hole_match_count > 0 then
    with hole_counts as (
      select match_value.match_id, match_value.round_number,
        pg_catalog.count(distinct hole.hole_number) filter (
          where hole.hole_number between 1 and 18
        )::integer hole_count
      from scoring_authority.matches match_value
      left join scoring_authority.match_holes hole
        on hole.match_id = match_value.match_id
      where match_value.tournament_id = '2026'
        and match_value.round_number between 1 and 3
      group by match_value.match_id, match_value.round_number
    )
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'round', grouped.round_number,
      'affected_matches', grouped.affected_matches,
      'missing_count', grouped.missing_count
    ) order by grouped.round_number), '[]'::jsonb) into by_round_value
    from (
      select round_number,
        pg_catalog.count(*) filter (where hole_count <> 18)::integer
          affected_matches,
        pg_catalog.sum(greatest(18 - hole_count, 0))::integer
          missing_count
      from hole_counts group by round_number
      having pg_catalog.count(*) filter (where hole_count <> 18) > 0
    ) grouped;
    issues_value := issues_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'HOLE_DEFINITIONS',
        'label', '18-hole course definitions',
        'affected_matches', hole_match_count,
        'missing_count', missing_hole_count,
        'summary', pg_catalog.format(
          '%s %s still need complete 18-hole definitions (%s holes missing).',
          hole_match_count,
          case when hole_match_count = 1 then 'match' else 'matches' end,
          missing_hole_count
        ),
        'by_round', by_round_value
      )
    );
  end if;

  select pg_catalog.count(*)::integer into duplicate_player_count
  from (
    select match_value.round_number, participant.player_id
    from scoring_authority.match_participants participant
    join scoring_authority.matches match_value
      on match_value.match_id = participant.match_id
    where match_value.tournament_id = '2026'
      and match_value.round_number between 1 and 3
    group by match_value.round_number, participant.player_id
    having pg_catalog.count(*) > 1
  ) duplicate_values;

  if duplicate_player_count > 0 then
    issues_value := issues_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ROUND_PLAYER_UNIQUENESS',
        'label', 'One entry per player per round',
        'affected_matches', 0,
        'missing_count', duplicate_player_count,
        'summary', pg_catalog.format(
          '%s duplicate round %s must be corrected.',
          duplicate_player_count,
          case when duplicate_player_count = 1 then 'assignment' else 'assignments' end
        ),
        'by_round', '[]'::jsonb
      )
    );
  end if;

  -- A match is ready only when the exact V1 builder predicates are true.
  with expected(round_number, expected_format, expected_players) as (
    values (1, 'BB'::text, 4), (2, 'SC'::text, 4), (3, 'SI'::text, 2)
  ), match_checks as (
    select match_value.match_id, match_value.round_number,
      match_value.format, expected.expected_format,
      expected.expected_players,
      snapshot.snapshot_id,
      snapshot.team_configuration,
      (select pg_catalog.count(*) from scoring_authority.match_participants p
       where p.match_id = match_value.match_id) participant_count,
      (select pg_catalog.count(*) from scoring_authority.match_participants p
       where p.match_id = match_value.match_id
         and p.player_id ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
         and exists (
           select 1 from scoring_authority.tournament_players membership
           where membership.tournament_id = '2026'
             and membership.player_id = p.player_id
             and membership.participation_status = 'ACTIVE'
         )) stable_count,
      (select pg_catalog.count(*) from scoring_authority.match_participants p
       where p.match_id = match_value.match_id
         and p.final_strokes is not null) individual_stroke_count,
      (select pg_catalog.count(distinct hole.hole_number)
       from scoring_authority.match_holes hole
       where hole.match_id = match_value.match_id
         and hole.hole_number between 1 and 18) hole_count,
      (select pg_catalog.count(*) from (values (1), (2)) side_value(side)
       where (select pg_catalog.count(*)
         from scoring_authority.match_participants p
         where p.match_id = match_value.match_id
           and p.team_side = side_value.side) = 2) complete_sides
    from scoring_authority.matches match_value
    join expected on expected.round_number = match_value.round_number
    left join scoring_authority.scoring_snapshots snapshot
      on snapshot.snapshot_id = match_value.scoring_snapshot_id
     and snapshot.tournament_id = match_value.tournament_id
     and snapshot.match_id = match_value.match_id
    where match_value.tournament_id = '2026'
  )
  select pg_catalog.count(*) filter (
    where format = expected_format
      and snapshot_id is not null
      and participant_count = expected_players
      and stable_count = expected_players
      and hole_count = 18
      and (expected_format = 'SC'
        or individual_stroke_count = expected_players)
      and (expected_format <> 'SC' or (
        complete_sides = 2
        and pg_catalog.btrim(coalesce(
          team_configuration->>'team_1_strokes', ''
        )) ~ '^-?[0-9]+(?:\.[0-9]+)?$'
        and pg_catalog.btrim(coalesce(
          team_configuration->>'team_2_strokes', ''
        )) ~ '^-?[0-9]+(?:\.[0-9]+)?$'
      ))
  )::integer into ready_matches
  from match_checks;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'domain', 'NET_SKINS',
    'round', job.round_number,
    'status', case
      when job.status = 'PENDING' then 'PENDING'
      when job.status = 'RUNNING' then 'PROCESSING'
      when job.status = 'SUCCEEDED' then 'COMPLETE'
      when job.status = 'FAILED' then 'FAILED'
      else 'STALE'
    end,
    'configuration_revision', job.configuration_revision,
    'result_revision', (
      select pg_catalog.max(result_value.result_revision)
      from scoring_authority.net_skins_v1_result_revisions result_value
      where result_value.job_id = job.job_id
    ),
    'requested_at', job.requested_at,
    'started_at', job.started_at,
    'completed_at', job.completed_at,
    'updated_at', job.updated_at,
    'failure_description', case when job.status = 'FAILED'
      then 'Net Skins recalculation did not complete.' else null end,
    'retry_eligible', false
  ) order by job.requested_at desc), '[]'::jsonb) into jobs_value
  from (
    select value.*
    from scoring_authority.net_skins_v1_recalculation_jobs value
    where value.tournament_id = '2026'
    order by value.requested_at desc, value.round_number
    limit 8
  ) job;

  return pg_catalog.jsonb_build_object(
    'state', current_value.state,
    'configuration_revision', current_value.configuration_revision,
    'result_revision', (
      select pg_catalog.max(value.result_revision)
      from scoring_authority.net_skins_v1_result_revisions value
      where value.tournament_id = '2026' and value.is_current
    ),
    'readiness', pg_catalog.jsonb_build_object(
      'state', case when round_issue_count = 0
        and match_reference_count = 0
        and total_matches > 0
        and ready_matches = total_matches
        and duplicate_player_count = 0
        then 'READY' else 'NEEDS_SETUP' end,
      'can_configure', round_issue_count = 0
        and match_reference_count = 0
        and total_matches > 0
        and ready_matches = total_matches
        and duplicate_player_count = 0,
      'total_matches', total_matches,
      'ready_matches', ready_matches,
      'issues', issues_value
    ),
    'jobs', jobs_value
  );
end;
$$;

revoke all on function production_control.director_private_net_skins_v1()
  from public, anon, authenticated, service_role;

create or replace function production_control.director_private_calcutta_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
declare
  current_value scoring_authority.calcutta_v1_current%rowtype;
  configuration_value scoring_authority.calcutta_v1_configuration_revisions%rowtype;
  auction_value scoring_authority.calcutta_v1_auction_fact_revisions%rowtype;
  publication_value scoring_authority.calcutta_v1_publication_revisions%rowtype;
  result_value scoring_authority.calcutta_v1_result_revisions%rowtype;
  source_fingerprint_value text;
  active_job boolean := false;
  configuration_view jsonb := null;
  auction_view jsonb := null;
  result_view jsonb := null;
  jobs_value jsonb := '[]'::jsonb;
  purchase_count integer := 0;
  owner_count integer := 0;
  unique_owner_count integer := 0;
  purchase_total numeric := 0;
  ownership_complete boolean := false;
  active_players_complete boolean := false;
  configuration_valid boolean := false;
  auction_valid boolean := false;
begin
  select value.* into strict current_value
  from scoring_authority.calcutta_v1_current value
  where value.tournament_id = '2026';
  select value.* into strict configuration_value
  from scoring_authority.calcutta_v1_configuration_revisions value
  where value.configuration_revision_id =
    current_value.configuration_revision_id;

  if current_value.state <> 'NOT_CONFIGURED' then
    configuration_valid :=
      production_control.calcutta_v1_hash(
        configuration_value.configuration_manifest
      ) = current_value.configuration_fingerprint
      and pg_catalog.jsonb_array_length(
        configuration_value.configuration_manifest->'point_structure'
      ) > 0
      and pg_catalog.jsonb_array_length(
        configuration_value.configuration_manifest->'payout_structure'
      ) > 0
      and (
        select coalesce(pg_catalog.sum(
          (row_value->>'round_1_fraction')::numeric
          + (row_value->>'round_2_fraction')::numeric
          + (row_value->>'round_3_fraction')::numeric
          + (row_value->>'overall_fraction')::numeric
        ), 0)
        from pg_catalog.jsonb_array_elements(
          configuration_value.configuration_manifest->'payout_structure'
        ) row_value
      ) = 1;

    configuration_view := pg_catalog.jsonb_build_object(
      'revision', current_value.configuration_revision,
      'configured_at', configuration_value.configured_at,
      'validation_status', case when configuration_valid
        then 'VALIDATED' else 'ATTENTION' end,
      'currency_code', 'USD',
      'point_structure', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'place', (row_value->>'place')::integer,
          'round_1_award', (row_value->>'round_1_award')::numeric,
          'round_2_award', (row_value->>'round_2_award')::numeric,
          'round_3_award', (row_value->>'round_3_award')::numeric
        ) order by (row_value->>'place')::integer)
        from pg_catalog.jsonb_array_elements(
          configuration_value.configuration_manifest->'point_structure'
        ) row_value
      ), '[]'::jsonb),
      'payout_structure', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'place', (row_value->>'place')::integer,
          'round_1_fraction',
            (row_value->>'round_1_fraction')::numeric::text,
          'round_2_fraction',
            (row_value->>'round_2_fraction')::numeric::text,
          'round_3_fraction',
            (row_value->>'round_3_fraction')::numeric::text,
          'overall_fraction',
            (row_value->>'overall_fraction')::numeric::text
        ) order by (row_value->>'place')::integer)
        from pg_catalog.jsonb_array_elements(
          configuration_value.configuration_manifest->'payout_structure'
        ) row_value
      ), '[]'::jsonb),
      'rules', pg_catalog.jsonb_build_object(
        'auction_unit', 'PLAYER',
        'auction_workflow', 'MANUAL_FINAL_AUCTION_FACTS',
        'pot_rule', 'SUM_PURCHASE_PRICES',
        'tie_rule',
          'COMPETITION_RANK_WITH_OCCUPIED_PLACE_AWARD_AVERAGING',
        'payout_rounding', 'NONE',
        'scramble_asset',
          'PLAYER_PURCHASE_WITH_PAIRING_PERFORMANCE_SPLIT_EQUALLY',
        'completion_rule',
          'ALL_PURCHASED_PLAYERS_HAVE_OFFICIAL_COMPLETED_ROUND_RESULT',
        'settlement_tracking', 'NOT_MODELED'
      )
    );
  end if;

  if current_value.auction_revision > 0 then
    select value.* into strict auction_value
    from scoring_authority.calcutta_v1_auction_fact_revisions value
    where value.auction_revision_id = current_value.auction_revision_id;
    purchase_count := pg_catalog.jsonb_array_length(
      auction_value.auction_manifest->'purchases'
    );
    owner_count := pg_catalog.jsonb_array_length(
      auction_value.auction_manifest->'ownership'
    );
    select coalesce(pg_catalog.sum(
      (row_value->>'purchase_price')::numeric
    ), 0) into purchase_total
    from pg_catalog.jsonb_array_elements(
      auction_value.auction_manifest->'purchases'
    ) row_value;
    select pg_catalog.count(distinct row_value->>'owner_player_id')::integer
      into unique_owner_count
    from pg_catalog.jsonb_array_elements(
      auction_value.auction_manifest->'ownership'
    ) row_value;
    ownership_complete := not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        auction_value.auction_manifest->'purchases'
      ) purchase
      where coalesce((
        select pg_catalog.sum(
          (ownership->>'ownership_fraction')::numeric
        )
        from pg_catalog.jsonb_array_elements(
          auction_value.auction_manifest->'ownership'
        ) ownership
        where ownership->>'player_id' = purchase->>'player_id'
      ), 0) <> 1
    );
    active_players_complete := not exists (
      select 1 from (
        select purchase->>'player_id' player_id
        from pg_catalog.jsonb_array_elements(
          auction_value.auction_manifest->'purchases'
        ) purchase
        union all
        select ownership->>'owner_player_id'
        from pg_catalog.jsonb_array_elements(
          auction_value.auction_manifest->'ownership'
        ) ownership
      ) player_values
      where not exists (
        select 1 from scoring_authority.tournament_players membership
        where membership.tournament_id = '2026'
          and membership.player_id = player_values.player_id
          and membership.participation_status = 'ACTIVE'
      )
    );
    auction_valid := production_control.calcutta_v1_hash(
        auction_value.auction_manifest
      ) = current_value.auction_fingerprint
      and purchase_total = (
        auction_value.auction_manifest->>'pot'
      )::numeric
      and ownership_complete and active_players_complete;

    auction_view := pg_catalog.jsonb_build_object(
      'revision', current_value.auction_revision,
      'recorded_at', auction_value.recorded_at,
      'currency_code', 'USD',
      'pot', (auction_value.auction_manifest->>'pot')::numeric::text,
      'purchase_count', purchase_count,
      'owner_count', unique_owner_count,
      'ownership_row_count', owner_count,
      'reconciliation_status', case when auction_valid
        then 'RECONCILED' else 'ATTENTION' end,
      'pot_reconciled', purchase_total = (
        auction_value.auction_manifest->>'pot'
      )::numeric,
      'ownership_complete', ownership_complete,
      'active_players_complete', active_players_complete,
      'purchases', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'player', pg_catalog.jsonb_build_object(
            'player_id', purchase->>'player_id',
            'display_name', entrant.display_name
          ),
          'purchase_price',
            (purchase->>'purchase_price')::numeric::text,
          'owners', coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'player', pg_catalog.jsonb_build_object(
                'player_id', ownership->>'owner_player_id',
                'display_name', owner_player.display_name
              ),
              'ownership_fraction',
                (ownership->>'ownership_fraction')::numeric::text
            ) order by ownership->>'owner_player_id')
            from pg_catalog.jsonb_array_elements(
              auction_value.auction_manifest->'ownership'
            ) ownership
            join scoring_authority.players owner_player
              on owner_player.player_id = ownership->>'owner_player_id'
            where ownership->>'player_id' = purchase->>'player_id'
          ), '[]'::jsonb)
        ) order by purchase->>'player_id')
        from pg_catalog.jsonb_array_elements(
          auction_value.auction_manifest->'purchases'
        ) purchase
        join scoring_authority.players entrant
          on entrant.player_id = purchase->>'player_id'
      ), '[]'::jsonb)
    );

    source_fingerprint_value := production_control.calcutta_v1_hash(
      production_control.calcutta_v1_source_revision('2026')
    );
    select value.* into result_value
    from scoring_authority.calcutta_v1_result_revisions value
    where value.tournament_id = '2026'
      and value.configuration_revision = current_value.configuration_revision
      and value.auction_revision = current_value.auction_revision
      and value.is_current
    limit 1;
    active_job := exists (
      select 1 from scoring_authority.calcutta_v1_recalculation_jobs value
      where value.tournament_id = '2026'
        and value.configuration_revision = current_value.configuration_revision
        and value.auction_revision = current_value.auction_revision
        and value.source_fingerprint = source_fingerprint_value
        and value.status in ('PENDING', 'RUNNING')
    );
    result_view := pg_catalog.jsonb_build_object(
      'revision', case when result_value.result_id is null
        then null else result_value.result_revision end,
      'state', case
        when result_value.result_id is null and active_job then 'PROCESSING'
        when result_value.result_id is null then 'NOT_CALCULATED'
        when result_value.source_fingerprint = source_fingerprint_value
          then result_value.result_state
        when active_job then 'RECALCULATION_REQUIRED'
        else 'STALE' end,
      'completed_rounds', case when result_value.result_id is null
        then '[]'::jsonb
        else coalesce(result_value.engine_result_payload->'completedRounds',
          '[]'::jsonb) end,
      'calculated_at', result_value.calculated_at,
      'freshness', case
        when result_value.result_id is null and active_job then 'UPDATING'
        when result_value.result_id is null then 'MISSING'
        when result_value.source_fingerprint = source_fingerprint_value
          then 'CURRENT'
        when active_job then 'UPDATING'
        else 'STALE' end,
      'recalculation_required', result_value.result_id is null
        or result_value.source_fingerprint <> source_fingerprint_value,
      'validation_status', case when result_value.result_id is null
        then 'NOT_APPLICABLE'
        when result_value.configuration_revision =
          current_value.configuration_revision
          and result_value.auction_revision = current_value.auction_revision
        then 'VALIDATED' else 'ATTENTION' end
    );
  end if;

  if current_value.publication_revision > 0 then
    select value.* into strict publication_value
    from scoring_authority.calcutta_v1_publication_revisions value
    where value.publication_revision_id =
      current_value.publication_revision_id;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'domain', 'CALCUTTA',
    'status', case
      when job.status = 'PENDING' then 'PENDING'
      when job.status = 'RUNNING' then 'PROCESSING'
      when job.status = 'SUCCEEDED' then 'COMPLETE'
      when job.status = 'FAILED' then 'FAILED'
      else 'STALE'
    end,
    'configuration_revision', job.configuration_revision,
    'auction_revision', job.auction_revision,
    'result_revision', (
      select pg_catalog.max(result_row.result_revision)
      from scoring_authority.calcutta_v1_result_revisions result_row
      where result_row.job_id = job.job_id
    ),
    'requested_at', job.requested_at,
    'started_at', job.started_at,
    'completed_at', job.completed_at,
    'updated_at', job.updated_at,
    'failure_description', case when job.status = 'FAILED'
      then 'Calcutta recalculation did not complete.' else null end,
    'retry_eligible', false
  ) order by job.requested_at desc), '[]'::jsonb) into jobs_value
  from (
    select value.*
    from scoring_authority.calcutta_v1_recalculation_jobs value
    where value.tournament_id = '2026'
    order by value.requested_at desc
    limit 8
  ) job;

  return pg_catalog.jsonb_build_object(
    'state', current_value.state,
    'publication_state', current_value.publication_state,
    'currency_code', 'USD',
    'configuration_revision', current_value.configuration_revision,
    'auction_revision', current_value.auction_revision,
    'publication_revision', current_value.publication_revision,
    'result_revision', nullif(current_value.result_revision, 0),
    'configuration', configuration_view,
    'auction', auction_view,
    'publication', pg_catalog.jsonb_build_object(
      'revision', current_value.publication_revision,
      'state', current_value.publication_state,
      'published_at', case when current_value.publication_state = 'PUBLISHED'
        then publication_value.published_at else null end
    ),
    'result', result_view,
    'jobs', jobs_value
  );
end;
$$;

revoke all on function production_control.director_private_calcutta_v1()
  from public, anon, authenticated, service_role;

create or replace function production_control.director_private_audit_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority
as $$
  with event_rows as (
    select audit.created_at occurred_at,
      'MATCH'::text category,
      case audit.action
        when 'MATCH_MARKED_LIVE' then 'MARK_LIVE'
        when 'SCORING_ACCESS_ACTIVATED' then 'ACCESS_ACTIVATED'
        when 'SCORING_ACCESS_REVOKED' then 'ACCESS_REVOKED'
        when 'SCORING_LOCKED' then 'LOCK_SCORING'
        when 'SCORING_UNLOCKED' then 'UNLOCK_SCORING'
        when 'MATCH_FINALIZED' then 'FINALIZE_MATCH'
        else 'REOPEN_MATCH'
      end action,
      case audit.action
        when 'MATCH_MARKED_LIVE' then pg_catalog.format(
          'Round %s · Match %s marked Live', match_value.round_number,
          coalesce(nullif(presentation.display_match_number, ''), 'current')
        )
        when 'SCORING_ACCESS_ACTIVATED' then pg_catalog.format(
          'Round %s · Match %s scoring access activated',
          match_value.round_number,
          coalesce(nullif(presentation.display_match_number, ''), 'current')
        )
        when 'SCORING_ACCESS_REVOKED' then pg_catalog.format(
          'Round %s · Match %s scoring access revoked',
          match_value.round_number,
          coalesce(nullif(presentation.display_match_number, ''), 'current')
        )
        when 'SCORING_LOCKED' then pg_catalog.format(
          'Round %s · Match %s scoring locked', match_value.round_number,
          coalesce(nullif(presentation.display_match_number, ''), 'current')
        )
        when 'SCORING_UNLOCKED' then pg_catalog.format(
          'Round %s · Match %s scoring unlocked', match_value.round_number,
          coalesce(nullif(presentation.display_match_number, ''), 'current')
        )
        when 'MATCH_FINALIZED' then pg_catalog.format(
          'Round %s · Match %s finalized', match_value.round_number,
          coalesce(nullif(presentation.display_match_number, ''), 'current')
        )
        else pg_catalog.format(
          'Round %s · Match %s reopened', match_value.round_number,
          coalesce(nullif(presentation.display_match_number, ''), 'current')
        )
      end title,
      'Tournament match control was confirmed.'::text summary,
      'SUCCESS'::text status,
      coalesce(actor.display_name, 'Tournament Director') actor_name,
      match_value.round_number,
      nullif(presentation.display_match_number, '') display_match_number
    from scoring_authority.audit_events audit
    join scoring_authority.matches match_value
      on match_value.match_id = audit.match_id
     and match_value.tournament_id = audit.tournament_id
    left join scoring_authority.game_center_presentations presentation
      on presentation.match_id = match_value.match_id
     and presentation.tournament_id = match_value.tournament_id
    left join scoring_authority.players actor
      on actor.player_id = audit.actor_id
    where audit.tournament_id = '2026'
      and audit.action in (
        'MATCH_MARKED_LIVE', 'SCORING_ACCESS_ACTIVATED',
        'SCORING_ACCESS_REVOKED', 'SCORING_LOCKED', 'SCORING_UNLOCKED',
        'MATCH_FINALIZED', 'MATCH_REOPENED'
      )
      and audit.created_at >= pg_catalog.now() - interval '90 days'

    union all

    select audit.created_at, 'HANDICAP', case audit.action
      when 'REVISION_STAGED' then 'STAGE_HANDICAP_REVISION'
      else 'APPROVE_HANDICAP_REVISION' end,
      pg_catalog.format(
        'Handicap Revision %s %s', revision.revision_number,
        case audit.action when 'REVISION_STAGED' then 'staged'
          else 'approved' end
      ),
      'The canonical tournament handicap revision was recorded.',
      'SUCCESS', coalesce(actor.display_name, 'Tournament Director'),
      null::integer, null::text
    from scoring_authority.handicap_audit_events audit
    join scoring_authority.handicap_revisions revision
      on revision.revision_id = audit.revision_id
    left join scoring_authority.players actor
      on actor.player_id = audit.actor_player_id
    where audit.tournament_id = '2026'
      and audit.action in ('REVISION_STAGED', 'REVISION_APPROVED')
      and audit.created_at >= pg_catalog.now() - interval '90 days'

    union all

    select audit.created_at,
      case
        when audit.domain in (
          'CHAMPIONSHIP_ODDS_CALCULATION',
          'CHAMPIONSHIP_ODDS_PUBLICATION'
        ) then 'ODDS'
        when audit.domain in ('NET_SKINS', 'CALCUTTA') then 'SIDE_GAME'
        when audit.domain in ('GUIDE', 'DRAFT', 'PREDICTION_SETTINGS')
          then 'SYNCHRONIZATION'
        else 'RELEASE'
      end,
      case audit.event_type
        when 'PRODUCTION_ODDS_CALCULATION_REQUESTED'
          then 'REQUEST_ODDS_CALCULATION'
        when 'PRODUCTION_ODDS_CALCULATION_SUCCEEDED'
          then 'COMPLETE_ODDS_CALCULATION'
        when 'PRODUCTION_CHAMPIONSHIP_ODDS_PUBLISHED'
          then 'PUBLISH_ODDS'
        when 'PRODUCTION_NET_SKINS_V1_CONFIGURED'
          then 'CONFIGURE_NET_SKINS'
        when 'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED'
          then 'COMPLETE_NET_SKINS_RECALCULATION'
        when 'PRODUCTION_NET_SKINS_V1_RECALCULATION_FAILED'
          then 'FAIL_NET_SKINS_RECALCULATION'
        when 'PRODUCTION_CALCUTTA_V1_CONFIGURED'
          then 'CONFIGURE_CALCUTTA'
        when 'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED'
          then 'REPLACE_CALCUTTA_AUCTION'
        when 'PRODUCTION_CALCUTTA_V1_PUBLISHED'
          then 'PUBLISH_CALCUTTA'
        when 'PRODUCTION_CALCUTTA_V1_UNPUBLISHED'
          then 'UNPUBLISH_CALCUTTA'
        when 'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED'
          then 'COMPLETE_CALCUTTA_RECALCULATION'
        when 'PRODUCTION_CALCUTTA_V1_RECALCULATION_FAILED'
          then 'FAIL_CALCUTTA_RECALCULATION'
        when 'PRODUCTION_DIRECTOR_PROJECTION_SYNCHRONIZED'
          then 'SYNCHRONIZE_PROJECTION'
        else 'DEPLOY_APPLICATION_RELEASE'
      end,
      case audit.event_type
        when 'PRODUCTION_ODDS_CALCULATION_REQUESTED'
          then 'Odds calculation requested'
        when 'PRODUCTION_ODDS_CALCULATION_SUCCEEDED'
          then 'Odds calculation completed'
        when 'PRODUCTION_CHAMPIONSHIP_ODDS_PUBLISHED'
          then pg_catalog.format('Odds Revision %s published',
            coalesce(nullif(audit.details->>'publication_revision', ''),
              'current'))
        when 'PRODUCTION_NET_SKINS_V1_CONFIGURED'
          then pg_catalog.format('Net Skins Revision %s configured',
            coalesce(nullif(audit.details->>'configuration_revision', ''),
              'current'))
        when 'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED'
          then 'Net Skins recalculation completed'
        when 'PRODUCTION_NET_SKINS_V1_RECALCULATION_FAILED'
          then 'Net Skins recalculation stopped safely'
        when 'PRODUCTION_CALCUTTA_V1_CONFIGURED'
          then pg_catalog.format('Calcutta Revision %s configured',
            coalesce(nullif(audit.details->>'configuration_revision', ''),
              'current'))
        when 'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED'
          then pg_catalog.format('Calcutta Auction Revision %s recorded',
            coalesce(nullif(audit.details->>'auction_revision', ''),
              'current'))
        when 'PRODUCTION_CALCUTTA_V1_PUBLISHED'
          then 'Calcutta published to participants'
        when 'PRODUCTION_CALCUTTA_V1_UNPUBLISHED'
          then 'Calcutta unpublished from participants'
        when 'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED'
          then 'Calcutta recalculation completed'
        when 'PRODUCTION_CALCUTTA_V1_RECALCULATION_FAILED'
          then 'Calcutta recalculation stopped safely'
        when 'PRODUCTION_DIRECTOR_PROJECTION_SYNCHRONIZED'
          then pg_catalog.format('%s Revision %s synchronized',
            case audit.domain
              when 'GUIDE' then 'Tournament Guide'
              when 'DRAFT' then 'Draft'
              else 'Prediction Settings' end,
            coalesce(nullif(audit.details->>'revisionNumber', ''), 'current'))
        else pg_catalog.format('Production application Release %s deployed',
          coalesce(nullif(audit.details->>'release_sequence', ''), 'current'))
      end,
      case
        when audit.event_type like '%FAILED'
          then 'The operation stopped safely without replacing current facts.'
        when audit.event_type = 'PRODUCTION_DIRECTOR_PROJECTION_SYNCHRONIZED'
          then 'The validated source revision is now current in Supabase.'
        when audit.event_type =
          'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REBOUND'
          then 'The normal Production application release was bound.'
        else 'The bounded Production operation completed.'
      end,
      case when audit.event_type like '%FAILED' or audit.result <> 'SUCCEEDED'
        then 'FAILED' else 'SUCCESS' end,
      coalesce(actor.display_name, case
        when audit.domain in ('NET_SKINS', 'CALCUTTA',
          'CHAMPIONSHIP_ODDS_CALCULATION') then 'Background worker'
        else 'System' end),
      null::integer, null::text
    from production_control.operation_audit_events audit
    left join scoring_authority.players actor
      on actor.player_id = audit.actor
      or (
        audit.event_type = 'PRODUCTION_DIRECTOR_PROJECTION_SYNCHRONIZED'
        and audit.actor = 'Production Director ' || actor.player_id
      )
    where audit.tournament_id = '2026'
      and audit.created_at >= pg_catalog.now() - interval '90 days'
      and (
        (audit.domain = 'CHAMPIONSHIP_ODDS_CALCULATION'
          and audit.event_type in (
            'PRODUCTION_ODDS_CALCULATION_REQUESTED',
            'PRODUCTION_ODDS_CALCULATION_SUCCEEDED'
          ))
        or (audit.domain = 'CHAMPIONSHIP_ODDS_PUBLICATION'
          and audit.event_type = 'PRODUCTION_CHAMPIONSHIP_ODDS_PUBLISHED')
        or (audit.domain = 'NET_SKINS' and audit.event_type in (
          'PRODUCTION_NET_SKINS_V1_CONFIGURED',
          'PRODUCTION_NET_SKINS_V1_RECALCULATION_COMPLETED',
          'PRODUCTION_NET_SKINS_V1_RECALCULATION_FAILED'
        ))
        or (audit.domain = 'CALCUTTA' and audit.event_type in (
          'PRODUCTION_CALCUTTA_V1_CONFIGURED',
          'PRODUCTION_CALCUTTA_V1_AUCTION_REPLACED',
          'PRODUCTION_CALCUTTA_V1_PUBLISHED',
          'PRODUCTION_CALCUTTA_V1_UNPUBLISHED',
          'PRODUCTION_CALCUTTA_V1_RECALCULATION_COMPLETED',
          'PRODUCTION_CALCUTTA_V1_RECALCULATION_FAILED'
        ))
        or (audit.domain in ('GUIDE', 'DRAFT', 'PREDICTION_SETTINGS')
          and audit.event_type =
            'PRODUCTION_DIRECTOR_PROJECTION_SYNCHRONIZED')
        or (audit.domain = 'APPLICATION_RELEASE'
          and audit.event_type =
            'PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_REBOUND')
      )
  ), bounded as (
    select pg_catalog.row_number() over (
      order by event_rows.occurred_at desc, event_rows.title
    )::integer sequence, event_rows.*
    from event_rows
    order by event_rows.occurred_at desc, event_rows.title
    limit 60
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'sequence', bounded.sequence,
    'category', bounded.category,
    'action', bounded.action,
    'title', bounded.title,
    'summary', bounded.summary,
    'status', bounded.status,
    'actor', pg_catalog.jsonb_build_object(
      'display_name', bounded.actor_name
    ),
    'context', pg_catalog.jsonb_build_object(
      'tournament_id', '2026',
      'round_number', bounded.round_number,
      'display_match_number', bounded.display_match_number
    ),
    'occurred_at', bounded.occurred_at
  ) order by bounded.occurred_at desc, bounded.sequence), '[]'::jsonb)
  from bounded
$$;

revoke all on function production_control.director_private_audit_v1()
  from public, anon, authenticated, service_role;

create or replace function public.read_production_director_operations_v1(
  input jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, production_control, scoring_authority,
  participant_identity, auth
as $$
begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_production_cutover_read_scope(
    input, 'OBSERVATION'
  );
  perform production_control.assert_production_scoring_actor(input, true);

  if input->>'contract_version' is distinct from
       'production-director-private-operations-v1'
     or input->>'operation' is distinct from
       'READ_PRODUCTION_DIRECTOR_OPERATIONS_V1'
     or pg_catalog.upper(coalesce(input->>'environment', '')) <> 'PRODUCTION'
     or input->>'project_ref' is distinct from
       'ymqhhtxaywtqllynrmxe'
     or input->>'project_url' is distinct from
       'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or input->>'source_workbook_id' is distinct from
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or input->>'tournament_id' is distinct from '2026'
     or input->>'vercel_project_id' is distinct from
       'prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU'
     or input->>'vercel_team_id' is distinct from
       'team_kPw5zaib8uaQJALAwj4fWI6R'
     or pg_catalog.lower(coalesce(input->>'vercel_environment', '')) <>
       'production'
  then
    raise exception using errcode = '42501',
      message = 'PRODUCTION_DIRECTOR_PRIVATE_RESOURCE_REQUIRED';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'data', pg_catalog.jsonb_build_object(
      'contract_version', 'production-director-private-operations-v1',
      'tournament_id', '2026',
      'calcutta', production_control.director_private_calcutta_v1(),
      'net_skins', production_control.director_private_net_skins_v1(),
      'audit_timeline', production_control.director_private_audit_v1(),
      'bounds', pg_catalog.jsonb_build_object(
        'job_limit_per_domain', 8,
        'audit_limit', 60,
        'audit_window_days', 90
      )
    )
  );
end;
$$;

revoke all on function public.read_production_director_operations_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_director_operations_v1(jsonb)
  to service_role;

comment on function public.read_production_director_operations_v1(jsonb) is
  'Director-entitlement-bound, fixed-Production, sanitized operational read for Calcutta, Net Skins readiness/jobs, and allowlisted audit activity. It performs no mutations and exposes no raw manifests, metadata, credentials, claims, leases, or identity records.';

notify pgrst, 'reload schema';
commit;
