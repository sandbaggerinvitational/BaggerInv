import { jsonLiteral } from "./postgres17.mjs";
import {
  runtimeScope,
  scoreInput,
  syntheticActor,
  syntheticDirector,
} from "./synthetic-tournament.mjs";

const directorAuthorization = Object.freeze({
  tournament_id: "2026",
  player_id: syntheticDirector.playerId,
  auth_user_id: syntheticDirector.authUserId,
  role: "DIRECTOR",
});

const scope = runtimeScope();
const score = scoreInput({ mutation_key: "90000000-0000-4000-8000-000000000001" });

function call(name, input) {
  return `select public.${name}(${jsonLiteral(input)})`;
}

function roundCall(operation, index) {
  const input = jsonLiteral({
    ...scope, round: 3, operation,
    operation_id: `90000000-0000-4000-8000-${String(7 + index).padStart(12, "0")}`,
    authorization: directorAuthorization,
  });
  return `select public.mutate_production_round_scoring_v1(${input} || ` +
    "jsonb_build_object('expected_fingerprint'," +
    "production_control.round_scoring_state_v1(3)->>'fingerprint'))";
}

const resetRoundThreeForOpen = `
  set local session_replication_role=replica;
  delete from scoring_authority.finalized_scorecard_snapshots where match_id like '2026-R3-%';
  delete from scoring_authority.score_revision_history where match_id like '2026-R3-%';
  delete from scoring_authority.score_mutations where match_id like '2026-R3-%';
  delete from scoring_authority.google_outbox_events where match_id like '2026-R3-%';
  delete from scoring_authority.audit_events where match_id like '2026-R3-%';
  delete from scoring_authority.hole_scores where match_id like '2026-R3-%';
  update scoring_authority.matches set status='UPCOMING',scoring_locked=false,
    permission_revision=1,match_revision=0,scored_holes=0,current_hole=0,
    holes_remaining=18,team_1_holes_won=0,team_2_holes_won=0,
    running_result='Scheduled',result_winner='',clinched=false,
    scorecard_complete=false,unresolved_mutations=0,finalized_at=null
  where round_number=3 and tournament_id='2026';
  update scoring_authority.scoring_permissions set can_score=false,
    permission_revision=1,revoked_at=clock_timestamp() where match_id like '2026-R3-%';
  update scoring_authority.scoring_snapshots set
    handicap_revision_id=(select revision_id from scoring_authority.handicap_revision_current
      where tournament_id='2026')
  where snapshot_id in(select scoring_snapshot_id from scoring_authority.matches
    where tournament_id='2026' and round_number=3);
  update scoring_authority.match_participants set
    handicap_revision_id=(select revision_id from scoring_authority.handicap_revision_current
      where tournament_id='2026')
  where match_id like '2026-R3-%';
  set local session_replication_role=origin;`;

const alignCurrentHandicap = `
  update scoring_authority.scoring_snapshots set
    handicap_revision_id=(select revision_id from scoring_authority.handicap_revision_current
      where tournament_id='2026')
  where snapshot_id in(select scoring_snapshot_id from scoring_authority.matches
    where tournament_id='2026' and round_number=3);
  update scoring_authority.match_participants set
    handicap_revision_id=(select revision_id from scoring_authority.handicap_revision_current
      where tournament_id='2026')
  where match_id like '2026-R3-%';`;

function finalizeCall() {
  const input = jsonLiteral({
    ...scope, match_id: "2026-R3-1",
    mutation_key: "90000000-0000-4000-8000-000000000010",
    authorization: { ...directorAuthorization, match_id: "2026-R3-1" },
  });
  return `select public.finalize_production_match(${input} || jsonb_build_object(
    'expected_match_revision',(select match_revision from scoring_authority.matches where match_id='2026-R3-1'),
    'authorization',(${input}->'authorization') || jsonb_build_object(
      'permission_revision',(select permission_revision from scoring_authority.matches where match_id='2026-R3-1'))))`;
}

export const benchmarkOperations = Object.freeze([
  {
    id: "score-write", label: "canonical score write", coverage: "ACTUAL_RPC_ROLLBACK",
    sql: call("submit_production_hole_score", score),
  },
  {
    id: "score-readback", label: "score canonical readback", coverage: "ACTUAL_RPC",
    sql: call("read_production_scoring_authority", { ...scope, mode: "SCORECARD", match_id: "2026-R3-12" }),
  },
  {
    id: "participant-today", label: "participant Today", coverage: "ACTUAL_RPC",
    sql: call("read_production_scoring_participant_context", {
      ...scope, match_id: "2026-R3-12", player_id: syntheticActor.playerId,
      auth_user_id: syntheticActor.authUserId, role: "PLAYER", permission_revision: 1,
    }),
  },
  {
    id: "matches", label: "Matches", coverage: "ACTUAL_RPC",
    sql: call("read_production_scoring_authority", { ...scope, mode: "CURRENT_STATE" }),
  },
  {
    id: "leaders", label: "Leaders", coverage: "ACTUAL_SQL_FUNCTION",
    sql: "select public.read_leaderboards_core_view('2026')",
  },
  {
    id: "prepare-match", label: "Prepare match", coverage: "ACTUAL_RPC_ROLLBACK_RESULT_CLASSIFIED",
    fixtureVariant: "SYNTHETIC_PRE_SIDE_GAME_TEMPLATE",
    setupSql: resetRoundThreeForOpen,
    sql: call("mutate_production_tournament_setup_v1", {
      ...scope, contract_version: "production-tournament-setup-v1",
      actor_player_id: syntheticDirector.playerId,
      actor_auth_user_id: syntheticDirector.authUserId,
      authorization: directorAuthorization,
      operation: "PREPARE_SCORING_CONTEXT", expected_revision: 1,
      operation_request_id: "90000000-0000-4000-8000-000000000006",
      request_payload_hash: "6".repeat(64),
      scoring_context: { match_id: "2026-R3-12" },
    }),
  },
  ...["OPEN", "LOCK", "RESUME"].map((operation, index) => ({
    id: `round-${operation.toLowerCase()}`,
    label: `${operation[0]}${operation.slice(1).toLowerCase()} Round`,
    coverage: "ACTUAL_RPC_ROLLBACK_RESULT_CLASSIFIED",
    fixtureVariant: operation === "OPEN" ? "SYNTHETIC_R3_RESET_PRISTINE"
      : operation === "RESUME" ? "SYNTHETIC_R3_ACTUAL_OPEN_THEN_LOCK"
        : "SYNTHETIC_CURRENT_LIVE_MATCHES",
    sql: roundCall(operation, index),
    setupSql: operation === "OPEN" ? resetRoundThreeForOpen
      : operation === "RESUME"
        ? `${resetRoundThreeForOpen}
          do $bench$ begin
            ${roundCall("OPEN", 91).replace(/^select /, "perform ")};
            ${roundCall("LOCK", 90).replace(/^select /, "perform ")};
          end $bench$;`
        : alignCurrentHandicap,
  })),
  {
    id: "finalize", label: "Finalize", coverage: "ACTUAL_RPC_ROLLBACK_RESULT_CLASSIFIED",
    setupSql: `set local session_replication_role=replica;
      update scoring_authority.matches set status='LIVE',scoring_locked=false
      where match_id='2026-R3-1';
      update scoring_authority.scoring_permissions set can_score=true,revoked_at=null
      where match_id='2026-R3-1';
      set local session_replication_role=origin;`,
    sql: finalizeCall(),
  },
  {
    id: "net-skins-read", label: "Net Skins participant read", coverage: "ACTUAL_RPC",
    sql: call("read_production_net_skins_v1", scope),
  },
  {
    id: "net-skins-calculation", label: "Net Skins calculation path",
    coverage: "ACTUAL_SQL_INPUT_ASSEMBLY_ONLY",
    sql: "select production_control.full_net_tournament_v1('2026')",
  },
  {
    id: "calcutta-read", label: "Calcutta participant read", coverage: "ACTUAL_RPC",
    sql: call("read_production_calcutta_v1", { ...scope, player_id: syntheticActor.playerId }),
  },
  {
    id: "calcutta-calculation", label: "Calcutta calculation path",
    coverage: "ACTUAL_SQL_INPUT_ASSEMBLY_ONLY",
    sql: "select production_control.calcutta_v1_source_revision('2026')",
  },
  {
    id: "odds-read", label: "Odds participant read", coverage: "ACTUAL_RPC",
    sql: call("read_production_odds_publication_v1", {
      ...scope, operation: "READ_PRODUCTION_ODDS_PUBLICATION_V1",
      contract_version: "production-odds-publication-v1",
      canonical_domain: "https://baggerinv.com", tournament_year: 2026,
    }),
  },
  {
    id: "odds-calculation", label: "Odds calculation path",
    coverage: "ACTUAL_RPC_INPUT_READ_ONLY",
    setupSql: `update production_control.cutover_activation_state set
      state='SCORING_COMMITTED',current_authority='SUPABASE',
      scoring_ingress_enabled=true,read_cutover_phase='ODDS_WAR_ROOM'
      where scope_key='BAGGER_INV_PRODUCTION';
      update production_control.odds_calculation_runtime set enabled=true,
        operation_mode='PRODUCTION_CUTOVER',cutover_phase='ODDS_WAR_ROOM',
        deployment_commit='${scope.deployment_commit}',activation_revision=139,
        candidate_hostname=null,configured_by='reliability-fixture',configured_at=now()
      where scope_key='BAGGER_INV_PRODUCTION';
      update production_control.worker_controls set enabled=true,
        scheduler_installed=false,google_writes_allowed=false
      where worker_name='ODDS_CALCULATION';
      update production_control.resource_scope set scoring_authority='SUPABASE',
        scoring_ingress_enabled=true,google_writes_enabled=false,workers_enabled=true,
        odds_publication_authority='SUPABASE',odds_publication_enabled=true
      where scope_key='BAGGER_INV_PRODUCTION';`,
    sql: call("read_production_odds_calculation_inputs", {
      ...scope, operation_mode: "PRODUCTION_CUTOVER", cutover_phase: "ODDS_WAR_ROOM",
      worker_name: "ODDS_CALCULATION", tournament_year: 2026,
      canonical_domain: "https://baggerinv.com",
    }),
  },
  {
    id: "director-current", label: "Director readiness/current-state read", coverage: "ACTUAL_RPC",
    sql: call("read_production_director_operations_v1", {
      ...scope, contract_version: "production-director-private-operations-v1",
      operation: "READ_PRODUCTION_DIRECTOR_OPERATIONS_V1", authorization: directorAuthorization,
    }),
  },
]);

export const reusableScoreInput = Object.freeze(score);
