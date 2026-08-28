-- Replace the schema-open current-shadow parity hash with a versioned,
-- explicit tournament-fact projection. This migration establishes one
-- control-plane baseline only after proving that the immutable V2 import is
-- still byte-exact outside the already-diagnosed ingress metadata drift.
-- It does not update tournament facts, authority, ingress, workers, or Google.
begin;

create table production_control.current_shadow_semantic_baselines (
  baseline_id uuid primary key default extensions.gen_random_uuid(),
  tournament_id text not null check (tournament_id = '2026'),
  tournament_year integer not null check (tournament_year = 2026),
  contract_version text not null check (
    contract_version = 'production-current-shadow-semantic-parity-v1'
  ),
  import_run_id uuid not null
    references production_control.import_runs(import_run_id) on delete restrict,
  source_workbook_id text not null check (
    source_workbook_id =
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
  ),
  source_fingerprint text not null check (
    source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  expected_payload_semantic_fingerprint text not null check (
    expected_payload_semantic_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  legacy_database_fingerprint text not null check (
    legacy_database_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  legacy_reconstructed_fingerprint text not null check (
    legacy_reconstructed_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  semantic_projection jsonb not null check (
    jsonb_typeof(semantic_projection) = 'object'
  ),
  semantic_database_fingerprint text not null check (
    semantic_database_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  section_fingerprints jsonb not null check (
    jsonb_typeof(section_fingerprints) = 'object'
  ),
  established_by text not null check (
    established_by = 'production-migration-048'
  ),
  established_at timestamptz not null default now(),
  unique (tournament_id, contract_version),
  unique (import_run_id, contract_version),
  check (legacy_database_fingerprint = legacy_reconstructed_fingerprint)
);

alter table production_control.current_shadow_semantic_baselines
  enable row level security;
revoke all on production_control.current_shadow_semantic_baselines
  from public, anon, authenticated, service_role;

create or replace function
  production_control.current_tournament_shadow_semantic_projection_v1(
    target_tournament text
  )
returns jsonb
language sql
security definer
stable
set search_path = pg_catalog
as $$
  with revision as (
    select value.*
    from production_control.current_shadow_revisions value
    where value.tournament_id = target_tournament
    order by value.imported_at desc
    limit 1
  )
  select pg_catalog.jsonb_build_object(
    'contract_version',
      'production-current-shadow-semantic-parity-v1',
    'tournament', coalesce((
      select pg_catalog.jsonb_build_object(
        'tournament_id', tournament.tournament_id,
        'tournament_year', tournament.tournament_year,
        'name', tournament.name,
        'source_workbook_id', tournament.source_workbook_id,
        'scoring_authority', pg_catalog.upper(tournament.scoring_authority),
        'lifecycle', pg_catalog.upper(coalesce(
          (select value.current_context->>'lifecycle' from revision value), ''
        )),
        'current_round', coalesce(
          ((select value.current_context->>'current_round'
            from revision value))::integer, 0
        ),
        'team_1_score', coalesce(
          ((select value.current_context->>'team_1_score'
            from revision value))::numeric, 0
        ),
        'team_2_score', coalesce(
          ((select value.current_context->>'team_2_score'
            from revision value))::numeric, 0
        ),
        'live_message', coalesce(
          (select value.current_context->>'live_message' from revision value), ''
        )
      )
      from scoring_authority.tournaments tournament
      where tournament.tournament_id = target_tournament
    ), '{}'::jsonb),
    'players', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'player_id', player.player_id,
          'display_name', player.display_name,
          'slug', coalesce(player.source_payload->>'Slug', ''),
          'active', coalesce(player.source_payload->>'Active', '')
        ) order by player.player_id collate "C"
      )
      from scoring_authority.players player
    ), '[]'::jsonb),
    'teams', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'tournament_id', team.tournament_id,
          'team_id', team.team_id,
          'team_side', team.team_side,
          'name', team.name,
          'captain_player_id', coalesce(team.source_payload->>'Captain', '')
        ) order by team.team_side, team.team_id collate "C"
      )
      from scoring_authority.teams team
      where team.tournament_id = target_tournament
    ), '[]'::jsonb),
    'tournament_players', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'tournament_id', roster.tournament_id,
          'player_id', roster.player_id,
          'team_id', roster.team_id,
          'team_side', roster.team_side,
          'participation_status', pg_catalog.upper(
            roster.participation_status
          ),
          'source_roster_key', roster.source_roster_key,
          'tournament_handicap', nullif(
            pg_catalog.btrim(coalesce(
              roster.source_payload->>'Tournament Handicap', ''
            )), ''
          )::numeric
        ) order by roster.team_side, roster.player_id collate "C"
      )
      from scoring_authority.tournament_players roster
      where roster.tournament_id = target_tournament
    ), '[]'::jsonb),
    'rounds', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'tournament_id', round_value.tournament_id,
          'round_number', round_value.round_number,
          'format', pg_catalog.upper(round_value.format),
          'name', round_value.name,
          'handicap_allowance', round_value.handicap_allowance,
          'status', pg_catalog.upper(round_value.status)
        ) order by round_value.round_number
      )
      from scoring_authority.rounds round_value
      where round_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'rules', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'tournament_id', rule->>'tournament_id',
          'round_number', (rule->>'round_number')::integer,
          'format', pg_catalog.upper(rule->>'format'),
          'points_available', (rule->>'points_available')::numeric
        ) order by (rule->>'round_number')::integer
      )
      from revision value
      cross join lateral pg_catalog.jsonb_array_elements(
        value.tournament_rules
      ) rule
    ), '[]'::jsonb),
    'pairing_state', coalesce((
      select pg_catalog.upper(value.pairing_state) from revision value
    ), ''),
    'identity_reconciliation', coalesce((
      select pg_catalog.jsonb_build_object(
        'current_only_player_ids', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'player_id', item->>'player_id',
              'player_source_present',
                (item->>'player_source_present')::boolean,
              'roster_source_present',
                (item->>'roster_source_present')::boolean
            ) order by item->>'player_id' collate "C"
          )
          from pg_catalog.jsonb_array_elements(
            value.identity_reconciliation->'current_only_player_ids'
          ) item
        ), '[]'::jsonb),
        'historical_appearances_inferred',
          (value.identity_reconciliation
            ->>'historical_appearances_inferred')::boolean,
        'join_key', value.identity_reconciliation->>'join_key',
        'missing_player_source_ids', coalesce((
          select pg_catalog.jsonb_agg(identifier order by identifier collate "C")
          from (
            select distinct identifier
            from pg_catalog.jsonb_array_elements_text(
              value.identity_reconciliation->'missing_player_source_ids'
            ) as identifiers_source(identifier)
          ) identifiers
        ), '[]'::jsonb),
        'unresolved_current_only_ids', coalesce((
          select pg_catalog.jsonb_agg(identifier order by identifier collate "C")
          from (
            select distinct identifier
            from pg_catalog.jsonb_array_elements_text(
              value.identity_reconciliation->'unresolved_current_only_ids'
            ) as identifiers_source(identifier)
          ) identifiers
        ), '[]'::jsonb)
      ) from revision value
    ), '{}'::jsonb),
    'snapshots', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'snapshot_id', snapshot.snapshot_id,
          'tournament_id', snapshot.tournament_id,
          'match_id', snapshot.match_id,
          'snapshot_revision', snapshot.snapshot_revision,
          'scoring_rules_version', snapshot.scoring_rules_version,
          'format', pg_catalog.upper(snapshot.format),
          'handicap_allowance', snapshot.handicap_allowance,
          'course_id', snapshot.course_id,
          'tee', snapshot.tee,
          'rating', snapshot.rating,
          'slope', snapshot.slope,
          'par', snapshot.par,
          'match_netting_baseline', snapshot.match_netting_baseline,
          'hole_definitions', snapshot.hole_definitions,
          'participant_configuration', snapshot.participant_configuration,
          'team_configuration', snapshot.team_configuration
        ) order by snapshot.snapshot_id collate "C"
      )
      from scoring_authority.scoring_snapshots snapshot
      where snapshot.tournament_id = target_tournament
    ), '[]'::jsonb),
    'matches', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'match_id', match_value.match_id,
          'tournament_id', match_value.tournament_id,
          'round_number', match_value.round_number,
          'format', pg_catalog.upper(match_value.format),
          'scoring_snapshot_id', match_value.scoring_snapshot_id,
          'status', pg_catalog.upper(match_value.status),
          'scoring_locked', match_value.scoring_locked,
          'permission_revision', match_value.permission_revision,
          'match_revision', match_value.match_revision,
          'source_google_revision', match_value.source_google_revision,
          'scored_holes', match_value.scored_holes,
          'current_hole', match_value.current_hole,
          'holes_remaining', match_value.holes_remaining,
          'team_1_holes_won', match_value.team_1_holes_won,
          'team_2_holes_won', match_value.team_2_holes_won,
          'running_result', match_value.running_result,
          'result_winner', match_value.result_winner,
          'clinched', match_value.clinched,
          'scorecard_complete', match_value.scorecard_complete,
          'unresolved_mutations', match_value.unresolved_mutations,
          'finalized_at', case when match_value.finalized_at is null
            then null
            else pg_catalog.to_char(
              match_value.finalized_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          end
        ) order by match_value.match_id collate "C"
      )
      from scoring_authority.matches match_value
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'match_participants', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'match_id', participant.match_id,
          'player_id', participant.player_id,
          'team_side', participant.team_side,
          'player_slot', participant.player_slot,
          'handicap_index', participant.handicap_index,
          'course_handicap', participant.course_handicap,
          'playing_handicap', participant.playing_handicap,
          'final_strokes', participant.final_strokes
        ) order by participant.match_id collate "C",
          participant.team_side, participant.player_slot,
          participant.player_id collate "C"
      )
      from scoring_authority.match_participants participant
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'permissions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'match_id', permission.match_id,
          'player_id', permission.player_id,
          'can_score', permission.can_score,
          'permission_revision', permission.permission_revision,
          'revoked_at', case when permission.revoked_at is null
            then null
            else pg_catalog.to_char(
              permission.revoked_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          end
        ) order by permission.match_id collate "C",
          permission.player_id collate "C"
      )
      from scoring_authority.scoring_permissions permission
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'match_holes', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'match_id', hole.match_id,
          'hole_number', hole.hole_number,
          'snapshot_id', hole.snapshot_id,
          'stroke_index', hole.stroke_index,
          'par', hole.par,
          'yardage', hole.yardage
        ) order by hole.match_id collate "C", hole.hole_number
      )
      from scoring_authority.match_holes hole
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'hole_scores', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'match_id', score.match_id,
          'hole_number', score.hole_number,
          'hole_revision', score.hole_revision,
          'team_1_gross_scores', score.team_1_gross_scores,
          'team_2_gross_scores', score.team_2_gross_scores,
          'team_1_strokes', score.team_1_strokes,
          'team_2_strokes', score.team_2_strokes,
          'team_1_net_score', score.team_1_net_score,
          'team_2_net_score', score.team_2_net_score,
          'hole_winner', score.hole_winner,
          'source_google_revision', score.source_google_revision,
          'mutation_key', score.mutation_key,
          'actor_id', score.actor_id
        ) order by score.match_id collate "C", score.hole_number
      )
      from scoring_authority.hole_scores score
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb),
    'checkpoints', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'match_id', checkpoint.match_id,
          'last_supabase_match_revision',
            checkpoint.last_supabase_match_revision,
          'google_match_revision', checkpoint.google_match_revision,
          'google_hole_revisions', checkpoint.google_hole_revisions
        ) order by checkpoint.match_id collate "C"
      )
      from scoring_authority.google_match_checkpoints checkpoint
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ), '[]'::jsonb)
  );
$$;

revoke all on function
  production_control.current_tournament_shadow_semantic_projection_v1(text)
  from public, anon, authenticated, service_role;

do $migration$
declare
  latest production_control.import_runs%rowtype;
  revision production_control.current_shadow_revisions%rowtype;
  resource production_control.resource_scope%rowtype;
  activation production_control.cutover_activation_state%rowtype;
  gate scoring_authority.ingress_gates%rowtype;
  legacy_projection jsonb;
  reconstructed_legacy jsonb;
  semantic_projection_value jsonb;
  legacy_actual_fingerprint text;
  reconstructed_fingerprint text;
  semantic_database_fingerprint_value text;
  section_fingerprints_value jsonb;
begin
  select run.* into latest
  from production_control.import_runs run
  where run.domain = 'CURRENT_SCORING_SHADOW'
    and run.tournament_id = '2026'
    and run.tournament_year = 2026
    and run.source_workbook_id =
      '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
    and run.status = 'SUCCEEDED'
  order by run.completed_at desc
  limit 1;

  -- Keep empty test templates installable. Production must take the strict
  -- certified branch below because its V2 import exists.
  if latest.import_run_id is null then
    return;
  end if;

  if latest.importer_contract <> 'production-current-shadow-v2'
     or latest.actor <> 'step10b-production-shadow-bootstrap'
     or latest.source_fingerprint <>
       'a4f79ec3711bf0f5912bf1663a5ca019c3cd6e1a048e985c4b74ac1981a21d80'
     or latest.payload_fingerprint <>
       '23081294e99d5f5e20dfd4c1b369db2630ccf8da156735c70e6852e1dfc6fbeb'
     or latest.database_fingerprint <>
       '4e73f057dd6e61fcbc468343e3e11cad5bc3b83c4e93ecced8770d3d1ab5ce90'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CURRENT_SHADOW_SEMANTIC_V2_IMPORT_REQUIRED';
  end if;

  select value.* into strict revision
  from production_control.current_shadow_revisions value
  where value.import_run_id = latest.import_run_id
    and value.source_fingerprint = latest.source_fingerprint
    and value.payload_fingerprint = latest.payload_fingerprint;
  select value.* into strict resource
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict activation
  from production_control.cutover_activation_state value
  where value.scope_key = 'BAGGER_INV_PRODUCTION'
  for update;
  select value.* into strict gate
  from scoring_authority.ingress_gates value
  where value.tournament_id = '2026'
  for update;

  if resource.project_ref <> 'ymqhhtxaywtqllynrmxe'
     or resource.project_url <>
       'https://ymqhhtxaywtqllynrmxe.supabase.co'
     or resource.google_workbook_id <>
       '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
     or resource.current_tournament_id <> '2026'
     or resource.current_tournament_year <> 2026
     or resource.current_tournament_read_authority <> 'GOOGLE'
     or resource.scoring_authority <> 'GOOGLE'
     or resource.participant_identity_authority <> 'PASSPORT'
     or resource.public_supabase_reads_enabled
     or resource.scoring_ingress_enabled
     or resource.google_writes_enabled
     or resource.auth_user_creation_enabled
     or resource.odds_publication_enabled
     or resource.workers_enabled
     or activation.state <> 'DORMANT'
     or activation.current_authority <> 'GOOGLE'
     or activation.read_cutover_phase <> 'STATIC_BACKEND'
     or activation.maintenance_state <> 'NORMAL'
     or activation.active_transition_epoch_id is not null
     or activation.first_supabase_write_possible_at is not null
     or activation.first_supabase_write_observed_at is not null
     or gate.state <> 'PAUSED'
     or gate.authority <> 'GOOGLE'
     or gate.active_epoch_id is not null
     or gate.unresolved_client_queues <> 0
     or gate.admission_state <> 'OPEN'
     or gate.active_closure_id is not null
     or exists (
       select 1 from production_control.worker_controls worker
       where worker.enabled
          or worker.scheduler_installed
          or worker.google_writes_allowed
     )
     or exists (
       select 1 from scoring_authority.authority_epochs epoch
       where epoch.tournament_id = '2026'
         and epoch.status in ('PREPARED', 'COMMITTED')
     )
     or exists (
       select 1 from scoring_authority.google_outbox_events event
       where event.tournament_id = '2026'
     )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CURRENT_SHADOW_SEMANTIC_DORMANT_BASELINE_REQUIRED';
  end if;

  lock table scoring_authority.tournaments,
    scoring_authority.players,
    scoring_authority.teams,
    scoring_authority.tournament_players,
    scoring_authority.rounds,
    scoring_authority.scoring_snapshots,
    scoring_authority.matches,
    scoring_authority.match_participants,
    scoring_authority.scoring_permissions,
    scoring_authority.match_holes,
    scoring_authority.hole_scores,
    scoring_authority.google_match_checkpoints,
    scoring_authority.ingress_gates in share mode;

  legacy_projection :=
    production_control.current_tournament_shadow_projection('2026');
  legacy_actual_fingerprint := pg_catalog.encode(
    extensions.digest(legacy_projection::text, 'sha256'), 'hex'
  );
  if legacy_actual_fingerprint <>
     'a2bdc5b412e72f5b798eab88a17246a1301d6b95c20805314fcbb215bbb2f84c'
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CURRENT_SHADOW_UNEXPECTED_LEGACY_STATE';
  end if;

  reconstructed_legacy := pg_catalog.jsonb_set(
    legacy_projection,
    '{ingress}',
    pg_catalog.jsonb_build_object(
      'tournament_id', '2026',
      'state', 'PAUSED',
      'authority', 'GOOGLE',
      'active_epoch_id', null,
      'unresolved_client_queues', 0,
      'updated_by', 'step10b-production-shadow-bootstrap'
    ),
    false
  );
  reconstructed_fingerprint := pg_catalog.encode(
    extensions.digest(reconstructed_legacy::text, 'sha256'), 'hex'
  );
  if reconstructed_fingerprint <> latest.database_fingerprint then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_CURRENT_SHADOW_NON_INGRESS_DRIFT';
  end if;

  semantic_projection_value :=
    production_control.current_tournament_shadow_semantic_projection_v1(
      '2026'
    );
  semantic_database_fingerprint_value := pg_catalog.encode(
    extensions.digest(semantic_projection_value::text, 'sha256'), 'hex'
  );
  select pg_catalog.jsonb_object_agg(
    entry.key,
    pg_catalog.encode(extensions.digest(entry.value::text, 'sha256'), 'hex')
    order by entry.key
  ) into section_fingerprints_value
  from pg_catalog.jsonb_each(semantic_projection_value) entry;

  insert into production_control.current_shadow_semantic_baselines (
    tournament_id,
    tournament_year,
    contract_version,
    import_run_id,
    source_workbook_id,
    source_fingerprint,
    expected_payload_semantic_fingerprint,
    legacy_database_fingerprint,
    legacy_reconstructed_fingerprint,
    semantic_projection,
    semantic_database_fingerprint,
    section_fingerprints,
    established_by
  ) values (
    '2026',
    2026,
    'production-current-shadow-semantic-parity-v1',
    latest.import_run_id,
    latest.source_workbook_id,
    latest.source_fingerprint,
    '4c46ec19a06224a682985a9de5d1652cbb9bbeaf105cd67e4a363ecde55813d0',
    latest.database_fingerprint,
    reconstructed_fingerprint,
    semantic_projection_value,
    semantic_database_fingerprint_value,
    section_fingerprints_value,
    'production-migration-048'
  );

  insert into production_control.operation_audit_events (
    event_type,
    domain,
    tournament_id,
    actor,
    request_fingerprint,
    result,
    details
  ) values (
    'CURRENT_SHADOW_SEMANTIC_BASELINE_ESTABLISHED',
    'CURRENT_TOURNAMENT',
    '2026',
    'production-migration-048',
    semantic_database_fingerprint_value,
    'SUCCEEDED',
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-current-shadow-semantic-parity-v1',
      'importRunId', latest.import_run_id,
      'sourceFingerprint', latest.source_fingerprint,
      'expectedPayloadSemanticFingerprint',
        '4c46ec19a06224a682985a9de5d1652cbb9bbeaf105cd67e4a363ecde55813d0',
      'semanticDatabaseFingerprint',
        semantic_database_fingerprint_value,
      'legacyDatabaseFingerprint', latest.database_fingerprint,
      'proof', 'LEGACY_IMPORT_EXACT_EXCEPT_INGRESS_CONTROL'
    )
  );
end;
$migration$;

create or replace function public.read_production_current_tournament_shadow(
  input jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, production_control, scoring_authority,
  extensions, pg_temp
as $$
declare
  production_project constant text := 'ymqhhtxaywtqllynrmxe';
  production_url constant text :=
    'https://ymqhhtxaywtqllynrmxe.supabase.co';
  production_workbook constant text :=
    '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  target_tournament constant text := '2026';
  semantic_contract constant text :=
    'production-current-shadow-semantic-parity-v1';
  mode_value text := upper(btrim(coalesce(input->>'mode', 'DIAGNOSTICS')));
  provided_semantic_fingerprint text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(input->>'semantic_payload_fingerprint', ''))
  );
  provided_semantic_canonical_json text :=
    coalesce(input->>'semantic_payload_canonical_json', '');
  provided_semantic_projection jsonb;
  legacy_projection jsonb;
  semantic_projection_value jsonb;
  latest_run production_control.import_runs%rowtype;
  baseline production_control.current_shadow_semantic_baselines%rowtype;
  counts_value jsonb;
  actual_counts jsonb;
  actual_section_fingerprints jsonb;
  semantic_difference_sections jsonb;
  google_supabase_difference_sections jsonb;
  legacy_fingerprint text;
  semantic_fingerprint_value text;
  semantic_payload_parity boolean;
  semantic_database_parity boolean;
  parity boolean;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PRODUCTION'
     or btrim(coalesce(input->>'project_ref', '')) <> production_project
     or btrim(coalesce(input->>'project_url', production_url)) <>
       production_url
     or btrim(coalesce(input->>'source_workbook_id', '')) <>
       production_workbook
     or btrim(coalesce(input->>'tournament_id', '')) <> target_tournament
     or btrim(coalesce(input->>'tournament_year', '')) <> '2026'
     or not exists (
       select 1 from production_control.resource_scope resource
       where resource.scope_key = 'BAGGER_INV_PRODUCTION'
         and resource.project_ref = production_project
         and resource.project_url = production_url
         and resource.google_workbook_id = production_workbook
         and resource.current_tournament_read_authority = 'GOOGLE'
         and resource.scoring_authority = 'GOOGLE'
         and resource.participant_identity_authority = 'PASSPORT'
         and not resource.public_supabase_reads_enabled
         and not resource.scoring_ingress_enabled
         and not resource.google_writes_enabled
         and not resource.auth_user_creation_enabled
         and not resource.odds_publication_enabled
         and not resource.workers_enabled
     )
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PRODUCTION_CURRENT_SHADOW_SCOPE_REQUIRED'
    );
  end if;
  if mode_value not in ('DIAGNOSTICS', 'CURRENT_STATE') then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'INVALID_CURRENT_SHADOW_READ_MODE'
    );
  end if;
  if input->>'semantic_parity_contract' is distinct from semantic_contract
     or provided_semantic_fingerprint !~ '^[0-9a-f]{64}$'
     or provided_semantic_canonical_json = ''
     or pg_catalog.encode(extensions.digest(
       provided_semantic_canonical_json,
       'sha256'
     ), 'hex') <> provided_semantic_fingerprint then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PRODUCTION_CURRENT_SHADOW_SEMANTIC_FINGERPRINT_REQUIRED',
      'semantic_parity_contract', semantic_contract
    );
  end if;
  begin
    provided_semantic_projection := provided_semantic_canonical_json::jsonb;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PRODUCTION_CURRENT_SHADOW_SEMANTIC_FINGERPRINT_REQUIRED',
      'semantic_parity_contract', semantic_contract
    );
  end;
  if pg_catalog.jsonb_typeof(provided_semantic_projection) <> 'object'
     or provided_semantic_projection->>'contract_version' is distinct from
       semantic_contract then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PRODUCTION_CURRENT_SHADOW_SEMANTIC_FINGERPRINT_REQUIRED',
      'semantic_parity_contract', semantic_contract
    );
  end if;

  select run.* into latest_run
  from production_control.import_runs run
  where run.domain = 'CURRENT_SCORING_SHADOW'
    and run.tournament_id = target_tournament
    and run.tournament_year = 2026
    and run.source_workbook_id = production_workbook
    and run.status = 'SUCCEEDED'
  order by run.completed_at desc
  limit 1;
  if latest_run.import_run_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PRODUCTION_CURRENT_SHADOW_NOT_IMPORTED'
    );
  end if;

  select value.* into baseline
  from production_control.current_shadow_semantic_baselines value
  where value.import_run_id = latest_run.import_run_id
    and value.contract_version = semantic_contract;
  if baseline.baseline_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'PRODUCTION_CURRENT_SHADOW_SEMANTIC_BASELINE_REQUIRED'
    );
  end if;

  legacy_projection :=
    production_control.current_tournament_shadow_projection(
      target_tournament
    );
  legacy_fingerprint := pg_catalog.encode(
    extensions.digest(legacy_projection::text, 'sha256'), 'hex'
  );
  semantic_projection_value :=
    production_control.current_tournament_shadow_semantic_projection_v1(
      target_tournament
    );
  semantic_fingerprint_value := pg_catalog.encode(
    extensions.digest(semantic_projection_value::text, 'sha256'), 'hex'
  );
  select pg_catalog.jsonb_object_agg(
    entry.key,
    pg_catalog.encode(extensions.digest(entry.value::text, 'sha256'), 'hex')
    order by entry.key
  ) into actual_section_fingerprints
  from pg_catalog.jsonb_each(semantic_projection_value) entry;
  select coalesce(pg_catalog.jsonb_agg(value.key order by value.key), '[]'::jsonb)
  into semantic_difference_sections
  from (
    select key
    from pg_catalog.jsonb_object_keys(
      baseline.section_fingerprints || actual_section_fingerprints
    ) as keys(key)
    where baseline.section_fingerprints->>key is distinct from
      actual_section_fingerprints->>key
  ) value;
  select coalesce(pg_catalog.jsonb_agg(value.key order by value.key), '[]'::jsonb)
  into google_supabase_difference_sections
  from (
    select key
    from pg_catalog.jsonb_object_keys(
      provided_semantic_projection || semantic_projection_value
    ) as keys(key)
    where provided_semantic_projection->key is distinct from
      semantic_projection_value->key
  ) value;

  counts_value := latest_run.counts;
  actual_counts := pg_catalog.jsonb_build_object(
    'players', (
      select pg_catalog.count(*) from scoring_authority.players
    ),
    'tournament_players', (
      select pg_catalog.count(*)
      from scoring_authority.tournament_players
      where tournament_id = target_tournament
    ),
    'teams', (
      select pg_catalog.count(*) from scoring_authority.teams
      where tournament_id = target_tournament
    ),
    'rounds', (
      select pg_catalog.count(*) from scoring_authority.rounds
      where tournament_id = target_tournament
    ),
    'snapshots', (
      select pg_catalog.count(*) from scoring_authority.scoring_snapshots
      where tournament_id = target_tournament
    ),
    'matches', (
      select pg_catalog.count(*) from scoring_authority.matches
      where tournament_id = target_tournament
    ),
    'match_participants', (
      select pg_catalog.count(*)
      from scoring_authority.match_participants participant
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ),
    'permissions', (
      select pg_catalog.count(*)
      from scoring_authority.scoring_permissions permission
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ),
    'match_holes', (
      select pg_catalog.count(*)
      from scoring_authority.match_holes hole
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ),
    'hole_scores', (
      select pg_catalog.count(*)
      from scoring_authority.hole_scores score
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    ),
    'checkpoints', (
      select pg_catalog.count(*)
      from scoring_authority.google_match_checkpoints checkpoint
      join scoring_authority.matches match_value using (match_id)
      where match_value.tournament_id = target_tournament
    )
  );
  semantic_payload_parity :=
    baseline.expected_payload_semantic_fingerprint =
      provided_semantic_fingerprint
    and provided_semantic_projection = semantic_projection_value
    and google_supabase_difference_sections = '[]'::jsonb;
  semantic_database_parity := baseline.semantic_database_fingerprint =
      semantic_fingerprint_value
    and baseline.semantic_projection = semantic_projection_value
    and semantic_difference_sections = '[]'::jsonb
    and not exists (
      select 1 from pg_catalog.jsonb_each_text(actual_counts) actual
      where counts_value ? actual.key
        and counts_value->>actual.key <> actual.value
    );
  parity := semantic_payload_parity and semantic_database_parity;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'mode', mode_value,
    'tournament_id', target_tournament,
    'tournament_year', 2026,
    'source_fingerprint', latest_run.source_fingerprint,
    'payload_fingerprint_contract', semantic_contract,
    'payload_fingerprint', provided_semantic_fingerprint,
    'expected_payload_fingerprint',
      baseline.expected_payload_semantic_fingerprint,
    'actual_payload_fingerprint', provided_semantic_fingerprint,
    'semantic_parity_contract', semantic_contract,
    'expected_semantic_payload_fingerprint',
      baseline.expected_payload_semantic_fingerprint,
    'provided_semantic_payload_fingerprint',
      provided_semantic_fingerprint,
    'semantic_payload_parity', semantic_payload_parity,
    'google_supabase_difference_sections',
      google_supabase_difference_sections,
    'database_fingerprint_contract', semantic_contract,
    'expected_database_fingerprint',
      baseline.semantic_database_fingerprint,
    'actual_database_fingerprint', semantic_fingerprint_value,
    'semantic_expected_database_fingerprint',
      baseline.semantic_database_fingerprint,
    'semantic_actual_database_fingerprint', semantic_fingerprint_value,
    'semantic_difference_sections', semantic_difference_sections,
    'semantic_database_parity', semantic_database_parity,
    'legacy_payload_fingerprint', latest_run.payload_fingerprint,
    'legacy_expected_database_fingerprint',
      latest_run.database_fingerprint,
    'legacy_actual_database_fingerprint', legacy_fingerprint,
    'legacy_parity', latest_run.database_fingerprint = legacy_fingerprint,
    'expected_counts', counts_value,
    'actual_counts', actual_counts,
    'parity', parity,
    'semantic_parity', parity,
    'authority', 'GOOGLE',
    'ingress', (
      select to_jsonb(gate) from scoring_authority.ingress_gates gate
      where gate.tournament_id = target_tournament
    ),
    'outbox_count', (
      select pg_catalog.count(*)
      from scoring_authority.google_outbox_events
      where tournament_id = target_tournament
    ),
    'worker_controls_enabled', (
      select pg_catalog.count(*)
      from production_control.worker_controls
      where enabled or scheduler_installed or google_writes_allowed
    ),
    'import_run', to_jsonb(latest_run),
    'data', case when mode_value = 'CURRENT_STATE'
      then legacy_projection else null end,
    'semantic_data', case when mode_value = 'CURRENT_STATE'
      then semantic_projection_value else null end
  );
end;
$$;

revoke all on function public.read_production_current_tournament_shadow(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_production_current_tournament_shadow(jsonb)
  to service_role;

comment on function
  production_control.current_tournament_shadow_semantic_projection_v1(text)
is
  'Builds the explicit Production current-tournament factual parity projection. Generated timestamps, derived timestamp hashes, and ingress/control-plane metadata are excluded.';
comment on function public.read_production_current_tournament_shadow(jsonb)
is
  'Reads Production current-shadow state and evaluates the versioned semantic factual baseline while retaining immutable legacy fingerprint diagnostics.';

notify pgrst, 'reload schema';
commit;
