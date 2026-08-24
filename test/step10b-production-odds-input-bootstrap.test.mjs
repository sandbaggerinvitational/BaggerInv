import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PRODUCTION_ODDS_INPUT_BOOTSTRAP_ACTOR,
  PRODUCTION_ODDS_INPUT_BOOTSTRAP_CONTRACT,
  buildProductionOddsInputBootstrap,
  canonicalProductionPairingSequence,
  productionOddsFingerprint,
} from "../lib/production-odds-input-bootstrap.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const hash = (value) => productionOddsFingerprint(value);
const playerProfile = (id, displayName) => ({
  player_id: id,
  public_profile: {
    "Player ID": id,
    "Display Name": displayName,
    Slug: displayName.toLowerCase().replaceAll(" ", "-"),
  },
});

function completedPayload(year) {
  const appearance = `${year}-R1`;
  const matchId = `${year}-R1-1`;
  return {
    tournament: {
      tournament_id: String(year), tournament_year: year,
      name: `${year} Sandbagger Invitational`, destination: "Test",
      lifecycle: "FINAL", score_availability: "RECORDED",
      official_team_1_points: 1, official_team_2_points: 0,
      champion_team_side: 1, champion_team_id: `A${year}`,
      source_payload: { runner_up_team_id: `B${year}` },
    },
    players: [
      { player_id: "P1", display_name: "Player One" },
      { player_id: "P2", display_name: "Player Two" },
    ],
    teams: [
      { team_id: `A${year}`, team_side: 1, name: "Team One", captain_player_id: "P1", presentation_identity: {} },
      { team_id: `B${year}`, team_side: 2, name: "Team Two", captain_player_id: "P2", presentation_identity: {} },
    ],
    roster: [
      { player_id: "P1", team_id: `A${year}`, team_side: 1, tournament_handicap: 5, participation_status: "ACTIVE" },
      { player_id: "P2", team_id: `B${year}`, team_side: 2, tournament_handicap: 7, participation_status: "ACTIVE" },
    ],
    rounds: [{ round_number: 1, format: "SI", name: "Singles", team_size: 1, points_per_match: 1, course_appearance_id: appearance }],
    courses: [{ course_id: `C${year}`, canonical_name: "Test Course", canonical_location: "Test" }],
    course_appearances: [{
      appearance_id: appearance, round_number: 1, course_id: `C${year}`,
      source_course_id: `C${year}`, display_name: "Test Course",
      canonical_name: "Test Course", canonical_location: "Test", location: "Test",
      tee: "Gold", rating: 72, slope: 130, yardage: 6500, par: 72,
      hole_definitions: [], source_payload: {},
    }],
    matches: [{
      match_id: matchId, round_number: 1, format: "SI", course_appearance_id: appearance,
      lifecycle: "FINAL", completion_state: "FINAL", scorecard_coverage: "UNAVAILABLE",
      result: "Team 1", result_winner: "Team 1", team_1_points: 1, team_2_points: 0,
      points_available: 1, points_availability: "RECORDED",
      source_payload: { match_number: 1, segments: { overall: "Team 1" }, source_match_status: "Complete" },
    }],
    match_participants: [
      { match_id: matchId, player_id: "P1", team_side: 1, player_slot: 1, applied_handicap: 5, applied_strokes: 0, source_payload: {} },
      { match_id: matchId, player_id: "P2", team_side: 2, player_slot: 1, applied_handicap: 7, applied_strokes: 0, source_payload: {} },
    ],
    scorecards: [], awards: [], corrections: [],
    record_eligibility: [
      { match_id: matchId, player_id: "P1", is_record_eligible: true, reason_code: "CANONICAL_OFFICIAL_MATCH", source_payload: {} },
      { match_id: matchId, player_id: "P2", is_record_eligible: true, reason_code: "CANONICAL_OFFICIAL_MATCH", source_payload: {} },
    ],
  };
}

function projectionEnvelope(domain, contractVersion, payload, sourceTabs) {
  const sourcePayload = { source: "Production Google", tabs: sourceTabs };
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: "2026",
    tournament_year: 2026,
    domain,
    contract_version: contractVersion,
    source_tabs: sourceTabs,
    validation_status: "VALID",
    source_payload: sourcePayload,
    payload,
    source_fingerprint: hash(sourcePayload),
    payload_fingerprint: hash(payload),
  };
}

function fixture() {
  const currentPayload = {
    tournament: { tournament_id: "2026", tournament_year: 2026, lifecycle: "UPCOMING" },
    players: [
      { player_id: "P1", display_name: "Player One" },
      { player_id: "P2", display_name: "Player Two" },
    ],
    teams: [
      { tournament_id: "2026", team_id: "A2026", team_side: 1, name: "Team One", source_payload: { Captain: "P1" } },
      { tournament_id: "2026", team_id: "B2026", team_side: 2, name: "Team Two", source_payload: { Captain: "P2" } },
    ],
    tournament_players: [
      { player_id: "P1", team_id: "A2026", team_side: 1, participation_status: "ACTIVE", source_payload: { "Tournament Handicap": 5 } },
      { player_id: "P2", team_id: "B2026", team_side: 2, participation_status: "ACTIVE", source_payload: { "Tournament Handicap": 7 } },
    ],
    rounds: [{ round_number: 1, format: "SI" }],
    matches: [{ match_id: "2026-R1-1", round_number: 1, format: "SI", status: "UPCOMING" }],
    match_participants: [{ match_id: "2026-R1-1", player_id: "P1", team_side: 1, player_slot: 1 }],
    snapshots: [{ match_id: "2026-R1-1", course_id: "C2026", tee: "Gold" }],
    pairing_contract: { state: "PARTIAL" },
  };
  const currentSource = {
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: "2026",
    tournament_year: 2026,
    sheets: [{
      sheet: "Courses", headers: ["Year", "Course ID"],
      records: [{ Year: 2026, "Course ID": "C2026", Course: "Current Course", Round: "Round 1", Format: "SI" }],
    }],
  };
  const currentSourceFingerprint = hash(currentSource);
  const currentPayloadFingerprint = hash(currentPayload);
  const completedHistory = Array.from({ length: 9 }, (_, index) => {
    const year = 2017 + index;
    return {
      year,
      source_fingerprint: String(year).padEnd(64, "a").slice(0, 64),
      payload_fingerprint: String(year).padEnd(64, "b").slice(0, 64),
      input_template: {
        environment: "PRODUCTION", project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
        source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
        tournament_id: String(year), tournament_year: year,
        source_fingerprint: String(year).padEnd(64, "a").slice(0, 64),
        payload_fingerprint: String(year).padEnd(64, "b").slice(0, 64),
        correction_set_version: "completed-history-corrections-v1",
        payload: completedPayload(year),
      },
    };
  });
  const artifactDraft = {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    safety: {
      google_reads_only: true, supabase_requests: 0, google_writes: 0,
      scoring_ingress_enabled: false, google_mirror_enabled: false,
      public_read_source_changed: false,
    },
    completed_history: completedHistory,
    current_tournament: {
      source_fingerprint: currentSourceFingerprint,
      payload_fingerprint: currentPayloadFingerprint,
      input_template: {
        environment: "PRODUCTION", project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
        project_url: PRODUCTION_SUPABASE_URL,
        source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
        tournament_id: "2026", tournament_year: 2026,
        import_contract_version: "production-current-shadow-v2",
        source_fingerprint: currentSourceFingerprint,
        payload_fingerprint: currentPayloadFingerprint,
        source_payload: currentSource,
        payload: currentPayload,
      },
    },
  };
  const shadowArtifact = { ...artifactDraft, artifact_fingerprint: hash(artifactDraft) };
  const settingEntries = Array.from({ length: 30 }, (_, index) => [`Setting ${index + 1}`, index + 1]);
  const canonicalSettings = Object.fromEntries(settingEntries);
  const settings = settingEntries.map(([Setting, Value]) => ({ Setting, Value }));
  const settingsPayload = {
    settings,
    settings_fingerprint: hash(settings),
    canonical_settings: canonicalSettings,
    effective_settings: canonicalSettings,
    effective_settings_fingerprint: hash(canonicalSettings),
    settings_contract_version: "prediction-settings-v1",
    source_tab: "Prediction Settings",
  };
  const playerPayload = {
    contract_version: "player-public-profile-v1",
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    players: [playerProfile("P1", "Player One"), playerProfile("P2", "Player Two")],
  };
  return {
    shadowArtifact,
    predictionSettingsEnvelope: projectionEnvelope(
      "PREDICTION_SETTINGS", "prediction-settings-v1", settingsPayload, ["Prediction Settings"],
    ),
    playerEditorialEnvelope: projectionEnvelope(
      "PLAYER_EDITORIAL", "player-public-profile-v1", playerPayload, ["Players"],
    ),
    statsEngineSourceSha256: "c".repeat(64),
    repositorySha: "d".repeat(40),
  };
}

test("Production bootstrap reuses the deterministic ratings engine and is byte-repeatable", () => {
  const input = fixture();
  const first = buildProductionOddsInputBootstrap(input);
  const second = buildProductionOddsInputBootstrap(input);
  assert.deepEqual(first, second);
  assert.equal(first.bootstrap_contract_version, PRODUCTION_ODDS_INPUT_BOOTSTRAP_CONTRACT);
  assert.equal(first.actor_id, PRODUCTION_ODDS_INPUT_BOOTSTRAP_ACTOR);
  assert.equal(first.payload.validation_status, "VALID");
  assert.equal(Object.keys(first.payload.historical_ratings).length, 2);
  assert.equal(first.payload.historical_ratings.P1.sandbaggerRatings.OVERALL.matches, 9);
  assert.equal(first.payload.historical_ratings.P2.sandbaggerRatings.OVERALL.matches, 9);
  assert.equal(first.diagnostics.calculation_engine_reused, true);
  assert.equal(first.diagnostics.calculation_or_publication_performed, false);
  assert.equal(first.diagnostics.google_write, false);
  assert.equal(first.request_fingerprint, productionOddsFingerprint(first.request_canonical_json, { serialized: true }));
  assert.equal(first.payload_fingerprint, productionOddsFingerprint(first.payload_canonical_json, { serialized: true }));
});

test("pairing fingerprint preserves exact pending slots, order, course and tee", () => {
  const current = fixture().shadowArtifact.current_tournament.input_template.payload;
  const sequence = canonicalProductionPairingSequence(current);
  assert.deepEqual(sequence, [{
    match_id: "2026-R1-1", round_number: 1, format: "SI", status: "UPCOMING",
    course_id: "C2026", tee: "Gold",
    participants: [{ player_id: "P1", team_side: 1, player_slot: 1 }],
  }]);
  const first = buildProductionOddsInputBootstrap(fixture());
  const changed = fixture();
  changed.shadowArtifact.current_tournament.input_template.payload.match_participants.push({
    match_id: "2026-R1-1", player_id: "P2", team_side: 2, player_slot: 1,
  });
  const payload = changed.shadowArtifact.current_tournament.input_template.payload;
  changed.shadowArtifact.current_tournament.payload_fingerprint = hash(payload);
  changed.shadowArtifact.current_tournament.input_template.payload_fingerprint = hash(payload);
  const { artifact_fingerprint: _old, ...artifactDraft } = changed.shadowArtifact;
  changed.shadowArtifact.artifact_fingerprint = hash(artifactDraft);
  const second = buildProductionOddsInputBootstrap(changed);
  assert.notEqual(first.payload.pairing_fingerprint, second.payload.pairing_fingerprint);
  assert.notEqual(first.payload.bundle_fingerprint, second.payload.bundle_fingerprint);
});

test("Preview resources and incomplete settings fail closed", () => {
  const contaminated = fixture();
  contaminated.shadowArtifact.project_ref = "idgigvjjqkfbqjeredpb";
  assert.throws(
    () => buildProductionOddsInputBootstrap(contaminated),
    { code: "PRODUCTION_ODDS_EXACT_RESOURCE_REQUIRED" },
  );
  const incomplete = fixture();
  incomplete.predictionSettingsEnvelope.payload.canonical_settings = {};
  incomplete.predictionSettingsEnvelope.payload_fingerprint = hash(incomplete.predictionSettingsEnvelope.payload);
  assert.throws(
    () => buildProductionOddsInputBootstrap(incomplete),
    { code: "PRODUCTION_ODDS_COMPLETE_SETTINGS_REQUIRED" },
  );
});

test("migration is one-time, service-role-only, dormant and cannot publish or mirror", async () => {
  const migration = await readFile(new URL(
    "../supabase/production_migrations/202608230010_production_odds_input_bootstrap.sql",
    import.meta.url,
  ), "utf8");
  assert.match(migration, /assert_current_shadow_v2_dormant\(\)/);
  assert.match(migration, /auth\.role\(\).*service_role/s);
  assert.match(migration, /STEP10B_PRODUCTION_ODDS_INPUT_V1/);
  assert.match(migration, /PRODUCTION_ODDS_INPUT_BOOTSTRAP_ALREADY_USED/);
  assert.match(migration, /PRODUCTION_ODDS_INPUT_PAIRING_REVISION_MISMATCH/);
  assert.match(migration, /PRODUCTION_ODDS_INPUT_HISTORY_REVISION_MISMATCH/);
  assert.match(migration, /revoke all on function public\.bootstrap_production_odds_input_configuration/);
  assert.match(migration, /grant execute on function public\.bootstrap_production_odds_input_configuration\(jsonb\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (anon|authenticated)/);
  assert.match(migration, /calculationPerformed.*false/);
  assert.match(migration, /publicationCreated.*false/);
  assert.match(migration, /googleWrite.*false/);
  assert.match(migration, /authorityChanged.*false/);
  assert.match(migration, /pre_calculation_job_count/);
  assert.match(migration, /pre_published_snapshot_count/);
  assert.match(migration, /pre_mirror_job_count/);
  assert.match(migration, /pre_active_worker_flag_count/);
  assert.match(migration, /odds_published_snapshots\) <> pre_published_snapshot_count/);
  assert.doesNotMatch(migration, /exists \(select 1 from scoring_authority\.odds_published_snapshots\)/);
  assert.doesNotMatch(migration, /insert into scoring_authority\.odds_published_snapshots/);
  assert.doesNotMatch(migration, /insert into scoring_authority\.odds_calculation_jobs/);
  assert.doesNotMatch(migration, /insert into scoring_authority\.odds_google_mirror_jobs/);
});
