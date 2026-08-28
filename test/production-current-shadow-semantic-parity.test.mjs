import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_CONTRACT,
  compareProductionCurrentShadowSemanticParity,
  productionCurrentShadowSemanticFingerprint,
  productionCurrentShadowSemanticProjection,
} from "../lib/production-current-shadow-semantic-parity.js";

function semanticFixture() {
  return {
    source_workbook_id: "production-workbook",
    tournament: {
      tournament_id: "2026",
      tournament_year: 2026,
      name: "Sandbagger Invitational",
      scoring_authority: "GOOGLE",
      lifecycle: "UPCOMING",
      current_round: 1,
      team_1_score: 0,
      team_2_score: 0,
      live_message: "Pairings pending",
    },
    players: [{
      player_id: "CB01",
      display_name: "Director",
      source_payload: { Slug: "director", Active: "TRUE" },
    }],
    teams: [
      {
        tournament_id: "2026",
        team_id: "PICKLES",
        team_side: 1,
        name: "The Pickles",
        source_payload: { Captain: "CB01" },
      },
      {
        tournament_id: "2026",
        team_id: "LIPPIT",
        team_side: 2,
        name: "Team Lippit",
        source_payload: {},
      },
    ],
    tournament_players: [{
      tournament_id: "2026",
      player_id: "CB01",
      team_id: "PICKLES",
      team_side: 1,
      participation_status: "ACTIVE",
      source_roster_key: "2026:CB01",
      source_payload: { "Tournament Handicap": 6.4 },
    }],
    rounds: [{
      tournament_id: "2026",
      round_number: 1,
      format: "BB",
      name: "Round 1",
      handicap_allowance: "",
      status: "UPCOMING",
    }],
    rules: [{
      tournament_id: "2026",
      round_number: 1,
      format: "BB",
      points_available: 6,
    }],
    pairing_contract: { state: "PARTIAL" },
    identity_reconciliation: {
      current_only_player_ids: [{
        player_id: "CB01",
        player_source_present: true,
        roster_source_present: true,
      }],
      missing_player_source_ids: [],
      unresolved_current_only_ids: [],
      join_key: "Player ID",
      historical_appearances_inferred: false,
    },
    snapshots: [{
      snapshot_id: "2026-R1-1:S1",
      tournament_id: "2026",
      match_id: "2026-R1-1",
      snapshot_revision: 1,
      scoring_rules_version: "production-v1",
      format: "BB",
      handicap_allowance: "",
      course_id: "COURSE-1",
      tee: "Gold",
      rating: 72.1,
      slope: 130,
      par: 72,
      match_netting_baseline: "LOW",
      hole_definitions: [{ hole_number: 1, stroke_index: 1, par: 4, yardage: 410 }],
      participant_configuration: { team_1: [{ id: "CB01", slot: 1 }] },
      team_configuration: { team_1_strokes: 0, team_2_strokes: 1 },
      effective_at: "2026-08-27T12:00:00.000Z",
      canonical_hash: "a".repeat(64),
      imported_at: "2026-08-27T12:00:00.000Z",
    }],
    matches: [{
      match_id: "2026-R1-1",
      tournament_id: "2026",
      round_number: 1,
      format: "BB",
      scoring_snapshot_id: "2026-R1-1:S1",
      status: "UPCOMING",
      scoring_locked: false,
      permission_revision: 1,
      match_revision: 0,
      source_google_revision: 0,
      scored_holes: 0,
      current_hole: 0,
      holes_remaining: 18,
      team_1_holes_won: 0,
      team_2_holes_won: 0,
      running_result: "Scheduled",
      result_winner: "",
      clinched: false,
      scorecard_complete: false,
      unresolved_mutations: 0,
      finalized_at: "",
      authority_updated_at: "2026-08-27T12:00:00.000Z",
      source_google_updated_at: "2026-08-27T12:00:00.000Z",
      created_at: "2026-08-27T12:00:00.000Z",
      updated_at: "2026-08-27T12:00:00.000Z",
    }],
    match_participants: [{
      match_id: "2026-R1-1",
      player_id: "CB01",
      team_side: 1,
      player_slot: 1,
      handicap_index: "",
      course_handicap: "",
      playing_handicap: 6,
      final_strokes: 6,
    }],
    permissions: [{
      match_id: "2026-R1-1",
      player_id: "CB01",
      can_score: false,
      permission_revision: 1,
      revoked_at: "",
      updated_at: "2026-08-27T12:00:00.000Z",
    }],
    match_holes: [{
      match_id: "2026-R1-1",
      hole_number: 1,
      snapshot_id: "2026-R1-1:S1",
      stroke_index: 1,
      par: 4,
      yardage: 410,
    }],
    hole_scores: [{
      match_id: "2026-R1-1",
      hole_number: 1,
      hole_revision: 1,
      team_1_gross_scores: [4, 5],
      team_2_gross_scores: [5, 6],
      team_1_strokes: [1, 0],
      team_2_strokes: [0, 1],
      team_1_net_score: 4,
      team_2_net_score: 5,
      hole_winner: "Team 1",
      source_google_revision: 1,
      source_google_updated_at: "2026-08-27T12:00:00.000Z",
      mutation_key: "google:2026-R1-1:H1:R1",
      actor_id: "CB01",
      created_at: "2026-08-27T12:00:00.000Z",
      updated_at: "2026-08-27T12:00:00.000Z",
    }],
    checkpoints: [{
      match_id: "2026-R1-1",
      last_supabase_match_revision: 0,
      google_match_revision: 0,
      google_hole_revisions: { 1: 1 },
      google_match_updated_at: "2026-08-27T12:00:00.000Z",
      verified_fingerprint: "b".repeat(64),
      verified_at: "2026-08-27T12:00:00.000Z",
      last_outbox_event_id: null,
      updated_at: "2026-08-27T12:00:00.000Z",
    }],
    ingress: {
      state: "PAUSED",
      authority: "GOOGLE",
      updated_by: "bootstrap",
      boundary_mode: "PROVIDER_FENCE_V2",
    },
  };
}

test("identical Google facts retain one semantic fingerprint across regenerated metadata", () => {
  const first = semanticFixture();
  const second = structuredClone(first);
  second.snapshots[0].effective_at = "2026-08-28T01:00:00.000Z";
  second.snapshots[0].canonical_hash = "c".repeat(64);
  second.matches[0].authority_updated_at = "2026-08-28T01:00:00.000Z";
  second.matches[0].source_google_updated_at = "2026-08-28T01:00:00.000Z";
  second.matches[0].created_at = "2026-08-28T01:00:00.000Z";
  second.matches[0].updated_at = "2026-08-28T01:00:00.000Z";
  second.hole_scores[0].source_google_updated_at = "2026-08-28T01:00:00.000Z";
  second.hole_scores[0].created_at = "2026-08-28T01:00:00.000Z";
  second.hole_scores[0].updated_at = "2026-08-28T01:00:00.000Z";
  second.checkpoints[0].google_match_updated_at = "2026-08-28T01:00:00.000Z";
  second.checkpoints[0].verified_fingerprint = "d".repeat(64);
  second.checkpoints[0].verified_at = "2026-08-28T01:00:00.000Z";
  second.checkpoints[0].updated_at = "2026-08-28T01:00:00.000Z";

  assert.equal(
    productionCurrentShadowSemanticFingerprint(first),
    productionCurrentShadowSemanticFingerprint(second),
  );
  assert.equal(
    productionCurrentShadowSemanticProjection(first).contract_version,
    PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_CONTRACT,
  );
});

test("ingress and control-plane metadata remain outside factual tournament parity", () => {
  const google = semanticFixture();
  const supabase = structuredClone(google);
  supabase.ingress = {
    state: "CLOSED",
    authority: "SUPABASE",
    updated_by: "later-transition",
    admission_state: "CLOSED",
    boundary_mode: "MAINTENANCE_WINDOW_V1",
    admission_revision: 12,
  };
  supabase.worker_controls_enabled = 3;
  supabase.outbox_count = 9;

  assert.deepEqual(compareProductionCurrentShadowSemanticParity(google, supabase), {
    contractVersion: PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_CONTRACT,
    googleFingerprint: productionCurrentShadowSemanticFingerprint(google),
    supabaseFingerprint: productionCurrentShadowSemanticFingerprint(google),
    parity: true,
  });
});

test("every protected tournament-fact class changes semantic parity and blocks", () => {
  const mutations = [
    ["roster", (value) => { value.tournament_players[0].team_id = "LIPPIT"; }],
    ["team", (value) => { value.teams[0].name = "Changed"; }],
    ["round", (value) => { value.rounds[0].format = "SC"; }],
    ["pairing", (value) => { value.match_participants[0].player_id = "OTHER"; }],
    ["course/tee", (value) => { value.snapshots[0].tee = "Blue"; }],
    ["lifecycle/lock", (value) => { value.matches[0].scoring_locked = true; }],
    ["permission", (value) => { value.permissions[0].can_score = true; }],
    ["scoring result", (value) => { value.hole_scores[0].team_1_net_score = 3; }],
    ["revision", (value) => { value.checkpoints[0].google_match_revision = 2; }],
    ["authorization", (value) => { value.hole_scores[0].actor_id = "OTHER"; }],
    ["canonical result", (value) => { value.matches[0].result_winner = "Team 1"; }],
    ["finalization", (value) => { value.matches[0].finalized_at = "2026-08-28T02:00:00Z"; }],
  ];
  const baseline = semanticFixture();
  for (const [label, mutate] of mutations) {
    const changed = structuredClone(baseline);
    mutate(changed);
    const result = compareProductionCurrentShadowSemanticParity(baseline, changed);
    assert.equal(result.parity, false, label);
    assert.notEqual(result.googleFingerprint, result.supabaseFingerprint, label);
  }
});

test("duplicate semantic primary keys fail closed", () => {
  const duplicate = semanticFixture();
  duplicate.matches.push(structuredClone(duplicate.matches[0]));
  assert.throws(
    () => productionCurrentShadowSemanticFingerprint(duplicate),
    (error) => error.code === "PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_INVALID",
  );

  const duplicateRosterPlayer = semanticFixture();
  duplicateRosterPlayer.tournament_players.push({
    ...structuredClone(duplicateRosterPlayer.tournament_players[0]),
    team_id: "LIPPIT",
    team_side: 2,
  });
  assert.throws(
    () => productionCurrentShadowSemanticFingerprint(duplicateRosterPlayer),
    (error) => error.code === "PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_INVALID",
  );

  const duplicateParticipantSlot = semanticFixture();
  duplicateParticipantSlot.match_participants.push({
    ...structuredClone(duplicateParticipantSlot.match_participants[0]),
    player_id: "OTHER",
  });
  assert.throws(
    () => productionCurrentShadowSemanticFingerprint(duplicateParticipantSlot),
    (error) => error.code === "PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_INVALID",
  );
});

test("missing authority and unresolved-mutation facts fail closed", () => {
  const missingAuthority = semanticFixture();
  delete missingAuthority.tournament.scoring_authority;
  assert.throws(
    () => productionCurrentShadowSemanticFingerprint(missingAuthority),
    (error) => error.code === "PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_INVALID",
  );

  const missingUnresolved = semanticFixture();
  delete missingUnresolved.matches[0].unresolved_mutations;
  assert.throws(
    () => productionCurrentShadowSemanticFingerprint(missingUnresolved),
    (error) => error.code === "PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_INVALID",
  );
});

test("semantic ordering matches PostgreSQL text and numeric tuple ordering", () => {
  const value = semanticFixture();
  for (const matchId of ["2026-R1-10", "2026-R1-2"]) {
    value.matches.push({ ...structuredClone(value.matches[0]), match_id: matchId });
  }
  for (const holeNumber of [10, 2]) {
    value.match_holes.push({
      ...structuredClone(value.match_holes[0]),
      hole_number: holeNumber,
    });
  }
  const projection = productionCurrentShadowSemanticProjection(value);
  assert.deepEqual(
    projection.matches.map((row) => row.match_id),
    ["2026-R1-1", "2026-R1-10", "2026-R1-2"],
  );
  assert.deepEqual(
    projection.match_holes.map((row) => row.hole_number),
    [1, 2, 10],
  );
});

test("meaningful semantic timestamps normalize to UTC milliseconds", () => {
  const value = semanticFixture();
  value.matches[0].finalized_at = "2026-08-28T02:00:00+00:00";
  value.permissions[0].revoked_at = "2026-08-28T03:00:00.125+00:00";
  const projection = productionCurrentShadowSemanticProjection(value);
  assert.equal(projection.matches[0].finalized_at, "2026-08-28T02:00:00.000Z");
  assert.equal(projection.permissions[0].revoked_at, "2026-08-28T03:00:00.125Z");
});

test("migration 048 installs a fixed semantic allowlist without fact mutation", async () => {
  const sql = await readFile(new URL(
    "../supabase/production_migrations/202608270048_production_current_shadow_semantic_fingerprint.sql",
    import.meta.url,
  ), "utf8");
  const semanticFunction = sql.match(
    /create or replace function\s+production_control\.current_tournament_shadow_semantic_projection_v1[\s\S]+?revoke all on function\s+production_control\.current_tournament_shadow_semantic_projection_v1/i,
  )?.[0] || "";

  assert.match(sql, /production-current-shadow-semantic-parity-v1/);
  assert.match(sql, /alter table production_control\.current_shadow_semantic_baselines\s+enable row level security/i);
  assert.match(sql, /LEGACY_IMPORT_EXACT_EXCEPT_INGRESS_CONTROL/);
  assert.match(sql, /PRODUCTION_CURRENT_SHADOW_NON_INGRESS_DRIFT/);
  assert.match(sql, /semantic_difference_sections/);
  assert.match(sql, /PRODUCTION_CURRENT_SHADOW_SEMANTIC_FINGERPRINT_REQUIRED/);
  assert.match(sql, /provided_semantic_canonical_json[\s\S]*extensions\.digest[\s\S]*provided_semantic_fingerprint/i);
  assert.match(sql, /provided_semantic_projection = semantic_projection_value/i);
  assert.match(sql, /google_supabase_difference_sections/);
  assert.match(semanticFunction, /collate "C"/);
  assert.match(semanticFunction, /YYYY-MM-DD"T"HH24:MI:SS\.MS"Z"/);
  assert.match(sql, /semantic_payload_parity :=[\s\S]*expected_payload_semantic_fingerprint[\s\S]*provided_semantic_fingerprint/i);
  assert.match(sql, /parity := semantic_payload_parity and semantic_database_parity/i);
  assert.match(sql, /'payload_fingerprint_contract', semantic_contract/i);
  assert.match(sql, /'legacy_payload_fingerprint', latest_run\.payload_fingerprint/i);
  assert.match(sql, /grant execute on function public\.read_production_current_tournament_shadow\(jsonb\)\s+to service_role/i);
  for (const field of [
    "tournament_players", "team_id", "round_number", "pairing_state",
    "course_id", "tee", "scoring_locked", "permission_revision",
    "match_revision", "source_google_revision", "unresolved_mutations",
    "can_score", "revoked_at", "hole_revision", "hole_winner",
    "mutation_key", "actor_id", "google_hole_revisions",
  ]) assert.match(semanticFunction, new RegExp(`'${field}'`), field);
  for (const excluded of [
    "effective_at", "canonical_hash", "authority_updated_at",
    "source_google_updated_at", "google_match_updated_at",
    "verified_fingerprint", "verified_at", "ingress_gates",
  ]) assert.doesNotMatch(semanticFunction, new RegExp(excluded), excluded);
  assert.doesNotMatch(semanticFunction, /to_jsonb\s*\(/i);
  assert.doesNotMatch(sql, /update\s+scoring_authority\./i);
  assert.doesNotMatch(sql, /insert\s+into\s+scoring_authority\./i);
  assert.doesNotMatch(sql, /delete\s+from\s+scoring_authority\./i);
});
