import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  authorizePreparedProductionShadowInput,
  claimPreparedProductionCurrentShadowInput,
  currentShadowImportReadiness,
  prepareProductionShadowPayloadArtifact,
  productionCurrentPairingContract,
  productionCurrentShadowClaimInput,
  productionCurrentShadowSourceFingerprint,
  productionizeCompletedHistoryEnvelope,
} from "../lib/production-shadow-payload-preparation.js";
import {
  PRODUCTION_CURRENT_SHADOW_SHEETS,
} from "../lib/google-sheets-data.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "../lib/production-foundation-resource-contract.js";

const sheet = (rows) => ({
  headers: Object.keys(rows[0] || {}),
  records: rows.map((record, index) => ({ record, rowNumber: index + 2 })),
});

function currentWorkbook() {
  const players = [
    { "Player ID": "P1", "Display Name": "Player One" },
    { "Player ID": "P2", "Display Name": "Player Two" },
    { "Player ID": "P3", "Display Name": "Player Three" },
    { "Player ID": "P4", "Display Name": "Player Four" },
    { "Player ID": "CM01", "Display Name": "Current One" },
    { "Player ID": "JK02", "Display Name": "Current Two" },
    { "Player ID": "PN01", "Display Name": "Current Three" },
  ];
  const handicaps = players.map((player, index) => ({
    Year: 2026,
    "Player ID": player["Player ID"],
    "Team Side": index < 2 || index >= 4 ? "Team 1" : "Team 2",
    "Team ID": index < 2 || index >= 4 ? "T1" : "T2",
  }));
  const holes = Array.from({ length: 18 }, (_, index) => ({
    "Course ID": "C1",
    Tee: "Gold",
    "Hole Number": index + 1,
    "Stroke Index": index + 1,
    Par: 4,
    Yardage: 400,
  }));
  const match = {
    Year: 2026,
    "Tournament ID": "2026",
    "Match ID": "2026-R1-1",
    Round: 1,
    Match: 1,
    Format: "BB",
    "Course ID": "C1",
    Tee: "Gold",
    "Match Status": "Upcoming",
    "Access Active": false,
    "Access Version": 1,
    Revision: 0,
    "Updated At": "2026-08-23T12:00:00.000Z",
    "Team 1 Player 1": "P1",
    "Team 1 Player 2": "P2",
    "Team 2 Player 1": "P3",
    "Team 2 Player 2": "P4",
    "Team 1 Player 1 Playing HCP": 0,
    "Team 1 Player 2 Playing HCP": 2,
    "Team 2 Player 1 Playing HCP": 1,
    "Team 2 Player 2 Playing HCP": 3,
    "Team 1 Player 1 Stroke": 0,
    "Team 1 Player 2 Stroke": 2,
    "Team 2 Player 1 Stroke": 1,
    "Team 2 Player 2 Stroke": 3,
  };
  return {
    Tournaments: sheet([{ Year: 2026, "Tournament ID": "2026", "Tournament Name": "Sandbagger Invitational" }]),
    "Live Tournaments": sheet([{
      Year: 2026,
      "Tournament Status": "Upcoming",
      "Current Round": 1,
      "Team 1 Score": 0,
      "Team 2 Score": 0,
      "Live Message": "Pairings pending",
    }]),
    Players: sheet(players),
    Handicaps: sheet(handicaps),
    "Team Names": sheet([
      { Year: 2026, "Team Side": "Team 1", "Team ID": "T1", "Team Names": "One", Captain: "P1" },
      { Year: 2026, "Team Side": "Team 2", "Team ID": "T2", "Team Names": "Two", Captain: "P3" },
    ]),
    Rounds: sheet([
      { Year: 2026, Round: 1, Format: "BB" },
      { Year: 2026, Round: 2, Format: "SC" },
      { Year: 2026, Round: 3, Format: "SI" },
    ]),
    "Tournament Rules": sheet([
      { Year: 2026, Round: "Round 1", Format: "Best Ball", "Points Available": 6 },
      { Year: 2026, Round: "Round 2", Format: "Scramble", "Points Available": 6 },
      { Year: 2026, Round: "Round 3", Format: "Singles", "Points Available": 12 },
    ]),
    Courses: sheet([{ Year: 2026, Format: "BB", "Course ID": "C1", "Tee Played": "Gold", Rating: 72, Slope: 130, Par: 72 }]),
    "Course Holes": sheet(holes),
    "Live Matches": sheet([match]),
    Matches: sheet([]),
    "Live Hole Scores": sheet([]),
    "Match Update Log": sheet([]),
    "Admin Audit Log": sheet([]),
  };
}

function historyEnvelope(year) {
  return {
    environment: "PREVIEW",
    project_ref: "idgigvjjqkfbqjeredpb",
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: String(year),
    tournament_year: year,
    actor_id: "preview-director",
    director_authorization: {},
    source_fingerprint: String(year).padEnd(64, "a").slice(0, 64),
    payload_fingerprint: String(year).padEnd(64, "b").slice(0, 64),
    import_contract_version: "completed-history-v1",
    source_counts: { matches: year - 2000 },
    certification: { tournament_result_reconciles: true },
    payload: { tournament: { tournament_id: String(year), tournament_year: year } },
  };
}

test("offline preparation produces inert Production-only templates deterministically", async () => {
  const dependencies = {
    actorId: "director-owner",
    loadHistorySource: async () => ({ source: "production" }),
    loadCurrentSource: async () => currentWorkbook(),
    buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
  };
  const first = await prepareProductionShadowPayloadArtifact(dependencies);
  const second = await prepareProductionShadowPayloadArtifact(dependencies);
  assert.equal(first.artifact_fingerprint, second.artifact_fingerprint);
  assert.equal(first.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(first.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(first.completed_history.length, 9);
  assert.equal(first.current_tournament.counts.matches, 1);
  assert.equal(first.current_tournament.input_template.actor_id, "step10b-production-shadow-bootstrap");
  assert.equal(first.current_tournament.input_template.operation, "CURRENT_TOURNAMENT_SHADOW_IMPORT");
  assert.equal("director_authorization" in first.current_tournament.input_template, false);
  assert.equal(first.current_tournament.readiness.ready, true);
  assert(first.completed_history.every((item) => item.input_template.director_authorization === null));
  assert.equal(first.safety.supabase_requests, 0);
  assert.equal(first.safety.google_writes, 0);
  assert.equal(first.safety.auth_users_created, 0);
  assert.doesNotMatch(JSON.stringify(first), /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
});

test("Upcoming partial pairings remain exact and produce an inert V2 import template", async () => {
  const incomplete = currentWorkbook();
  for (const field of ["Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2"]) {
    incomplete["Live Matches"].records[0].record[field] = "";
  }
  const artifact = await prepareProductionShadowPayloadArtifact({
    actorId: "director-owner",
    loadHistorySource: async () => ({}),
    loadCurrentSource: async () => incomplete,
    buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
  });
  assert.equal(artifact.current_tournament.readiness.ready, true);
  assert.deepEqual(artifact.current_tournament.readiness.codes, []);
  assert.equal(artifact.current_tournament.readiness.diagnostics.pairing_state, "PARTIAL");
  assert.equal(artifact.current_tournament.input_template.import_contract_version, "production-current-shadow-v2");
  assert.equal(artifact.current_tournament.input_template.payload.match_participants.length, 1);
  assert.equal(artifact.current_tournament.input_template.payload.permissions.length, 1);
  assert.equal(artifact.current_tournament.input_template.payload.permissions[0].can_score, false);
  assert.equal(artifact.current_tournament.input_template.payload.pairing_contract.no_pairings_inferred, true);
  assert.equal(artifact.current_tournament.input_template.payload.shadow_safety.scoring_ingress_enabled, false);
  assert.equal(artifact.current_tournament.input_template.payload.shadow_safety.google_outbox_enabled, false);
  assert.equal(artifact.current_tournament.input_template.payload.shadow_safety.scorecard_archive_enabled, false);
  assert.equal(artifact.current_tournament.input_template.payload.shadow_safety.google_mirror_enabled, false);
  assert(!artifact.import_blockers.some((item) => item.code === "PRODUCTION_CURRENT_SHADOW_NOT_IMPORTABLE"));
  assert.equal(currentShadowImportReadiness({ payload: { matches: [], snapshots: [], match_participants: [], permissions: [], match_holes: [] } }).ready, false);
});

test("Upcoming entirely pending pairings are a valid source state and never synthesize participants", async () => {
  const pending = currentWorkbook();
  for (const field of ["Team 1 Player 1", "Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2"]) {
    pending["Live Matches"].records[0].record[field] = "";
  }
  const contract = productionCurrentPairingContract(pending);
  assert.equal(contract.state, "PENDING");
  assert.equal(contract.matches[0].supplied_slots.length, 0);
  const artifact = await prepareProductionShadowPayloadArtifact({
    actorId: "director-owner",
    loadHistorySource: async () => ({}),
    loadCurrentSource: async () => pending,
    buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
  });
  assert.equal(artifact.current_tournament.readiness.ready, true);
  assert.equal(artifact.current_tournament.input_template.payload.match_participants.length, 0);
  assert.equal(artifact.current_tournament.input_template.payload.permissions.length, 0);
});

test("current-only 2026 Player IDs are seeded from Players and roster sources without historical inference", async () => {
  const artifact = await prepareProductionShadowPayloadArtifact({
    actorId: "director-owner",
    loadHistorySource: async () => ({}),
    loadCurrentSource: async () => currentWorkbook(),
    buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
  });
  const reconciliation = artifact.current_tournament.input_template.payload.identity_reconciliation;
  assert.deepEqual(reconciliation.current_only_player_ids.map((entry) => entry.player_id), ["CM01", "JK02", "PN01"]);
  assert(reconciliation.current_only_player_ids.every((entry) => entry.player_source_present && entry.roster_source_present));
  assert.deepEqual(reconciliation.unresolved_current_only_ids, []);
  assert.equal(reconciliation.join_key, "Player ID");
  assert.equal(reconciliation.historical_appearances_inferred, false);
  const importedIds = new Set(artifact.current_tournament.input_template.payload.players.map((row) => row.player_id));
  assert.deepEqual(["CM01", "JK02", "PN01"].map((id) => importedIds.has(id)), [true, true, true]);
});

test("Production-shaped Tournament Rules parse explicit Round 1/2/3 tokens exactly", async () => {
  const source = currentWorkbook();
  const artifact = await prepareProductionShadowPayloadArtifact({
    actorId: "director-owner",
    loadHistorySource: async () => ({}),
    loadCurrentSource: async () => source,
    buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
  });
  assert.equal(artifact.current_tournament.readiness.ready, true);
  assert.deepEqual(
    artifact.current_tournament.input_template.payload.rules.map((rule) => ({
      round: rule.round_number,
      format: rule.format,
      sourceRound: rule.source_payload.Round,
    })),
    [
      { round: 1, format: "BB", sourceRound: "Round 1" },
      { round: 2, format: "SC", sourceRound: "Round 2" },
      { round: 3, format: "SI", sourceRound: "Round 3" },
    ],
  );
});

test("Tournament Rules require exactly rounds 1, 2, and 3 without inferred or duplicate rounds", async () => {
  for (const roundValue of ["Round One", "R1", "Round 4", ""]) {
    const source = currentWorkbook();
    source["Tournament Rules"].records[0].record.Round = roundValue;
    const artifact = await prepareProductionShadowPayloadArtifact({
      actorId: "director-owner",
      loadHistorySource: async () => ({}),
      loadCurrentSource: async () => source,
      buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
    });
    assert.equal(artifact.current_tournament.readiness.ready, false, roundValue || "blank");
    assert(artifact.current_tournament.readiness.codes.includes("CURRENT_RULES_UNAVAILABLE"));
    assert.equal(artifact.current_tournament.input_template, null);
  }
  const duplicate = currentWorkbook();
  duplicate["Tournament Rules"].records[2].record.Round = "Round 2";
  const artifact = await prepareProductionShadowPayloadArtifact({
    actorId: "director-owner",
    loadHistorySource: async () => ({}),
    loadCurrentSource: async () => duplicate,
    buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
  });
  assert.equal(artifact.current_tournament.readiness.ready, false);
  assert(artifact.current_tournament.readiness.codes.includes("CURRENT_RULES_UNAVAILABLE"));
});

test("V2 canonical evidence is independently hashable and requires the one-time service bootstrap claim", async () => {
  const claimId = "1f34d9e0-8208-4f77-aeb6-790e63e737c0";
  const artifact = await prepareProductionShadowPayloadArtifact({
    actorId: "ignored-caller-actor",
    loadHistorySource: async () => ({}),
    loadCurrentSource: async () => currentWorkbook(),
    buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
  });
  const template = artifact.current_tournament.input_template;
  assert.deepEqual(JSON.parse(template.source_canonical_json), template.source_payload);
  assert.deepEqual(template.source_payload.sheets.map((entry) => entry.sheet), PRODUCTION_CURRENT_SHADOW_SHEETS);
  assert(template.source_payload.sheets.some((entry) => entry.sheet === "Live Tournaments"));
  assert(template.source_payload.sheets.some((entry) => entry.sheet === "Tournament Rules"));
  assert.deepEqual(JSON.parse(template.payload_canonical_json), template.payload);
  assert.equal(template.claim_id, null);
  assert.equal(template.actor_id, "step10b-production-shadow-bootstrap");
  assert.equal(template.operation, "CURRENT_TOURNAMENT_SHADOW_IMPORT");
  assert.match(template.request_fingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(JSON.parse(template.request_canonical_json), {
    actor_id: template.actor_id,
    environment: template.environment,
    import_contract_version: template.import_contract_version,
    operation: template.operation,
    payload_fingerprint: template.payload_fingerprint,
    project_ref: template.project_ref,
    project_url: template.project_url,
    source_fingerprint: template.source_fingerprint,
    source_workbook_id: template.source_workbook_id,
    tournament_id: template.tournament_id,
    tournament_year: template.tournament_year,
  });
  const claim = productionCurrentShadowClaimInput(template);
  assert.equal(claim.import_contract_version, "production-current-shadow-v2");
  assert.equal(claim.source_fingerprint, template.source_fingerprint);
  assert.equal(claim.payload_fingerprint, template.payload_fingerprint);
  assert.equal(claim.request_fingerprint, template.request_fingerprint);
  const authorized = claimPreparedProductionCurrentShadowInput(template, { claimId });
  assert.equal(authorized.claim_id, claimId);
  assert.equal(authorized.actor_id, "step10b-production-shadow-bootstrap");
  assert.throws(
    () => claimPreparedProductionCurrentShadowInput(template, { claimId: "bad" }),
    (error) => error.code === "PRODUCTION_CURRENT_SHADOW_V2_CLAIM_REQUIRED",
  );
});

test("current shadow fails closed for active, scored, access-enabled, locked, finalized, or invalid pairing states", async () => {
  const cases = [
    ["active", (source) => { source["Live Matches"].records[0].record["Match Status"] = "Live"; }, "CURRENT_ACTIVE_MATCH_PRESENT"],
    ["scored", (source) => { source["Live Hole Scores"] = sheet([{
      "Match ID": "2026-R1-1",
      "Hole Number": 1,
      "Stroke Index": 1,
      "Team 1 Gross Scores": "[4,5]",
      "Team 2 Gross Scores": "[5,6]",
      "Hole Winner": "Team 1",
      Revision: 1,
      "Updated At": "2026-08-23T13:00:00.000Z",
    }]); }, "CURRENT_SCORED_HOLES_PRESENT"],
    ["access", (source) => { source["Live Matches"].records[0].record["Access Active"] = true; }, "CURRENT_ACCESS_ACTIVE"],
    ["locked", (source) => { source["Live Matches"].records[0].record["Scoring Locked"] = true; }, "CURRENT_SCORING_LOCKED"],
    ["finalized", (source) => { source.Matches = sheet([{ "Match ID": "2026-R1-1", "Match Status": "Final", "Finalized At": "2026-08-23T13:00:00.000Z" }]); }, "CURRENT_FINALIZED_ARCHIVE_PRESENT"],
    ["duplicate", (source) => { source["Live Matches"].records[0].record["Team 2 Player 1"] = "P1"; }, "CURRENT_PAIRINGS_INVALID"],
  ];
  for (const [label, mutate, code] of cases) {
    const source = currentWorkbook();
    mutate(source);
    const artifact = await prepareProductionShadowPayloadArtifact({
      actorId: "director-owner",
      loadHistorySource: async () => ({}),
      loadCurrentSource: async () => source,
      buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
    });
    assert.equal(artifact.current_tournament.readiness.ready, false, label);
    assert(artifact.current_tournament.readiness.codes.includes(code), label);
    assert.equal(artifact.current_tournament.input_template, null, label);
  }
});

test("current shadow fails closed when an explicit 2026 current-only identity is absent", async () => {
  const source = currentWorkbook();
  source.Players.records = source.Players.records.filter(({ record }) => record["Player ID"] !== "CM01");
  await assert.rejects(
    prepareProductionShadowPayloadArtifact({
      actorId: "director-owner",
      loadHistorySource: async () => ({}),
      loadCurrentSource: async () => source,
      buildHistoryEnvelope: ({ year }) => historyEnvelope(year),
    }),
    /Active tournament player CM01 is missing from Players/,
  );
});

test("current source fingerprint covers ordered headers and records", () => {
  const source = currentWorkbook();
  const original = productionCurrentShadowSourceFingerprint(source);
  const changed = structuredClone(source);
  changed.Players.records[0].record["Display Name"] = "Changed";
  assert.notEqual(productionCurrentShadowSourceFingerprint(changed), original);
  const reordered = structuredClone(source);
  reordered.Players.records.reverse();
  assert.notEqual(productionCurrentShadowSourceFingerprint(reordered), original);
});

test("history productionization rejects wrong source and strips Preview scope", () => {
  const input = productionizeCompletedHistoryEnvelope(historyEnvelope(2025));
  assert.equal(input.environment, "PRODUCTION");
  assert.equal(input.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(input.director_authorization, null);
  assert.throws(
    () => productionizeCompletedHistoryEnvelope({ ...historyEnvelope(2025), source_workbook_id: "wrong" }),
    (error) => error.code === "PRODUCTION_HISTORY_PAYLOAD_INVALID",
  );
});

test("fresh Director authorization can be attached without invoking an RPC", () => {
  const template = productionizeCompletedHistoryEnvelope({ ...historyEnvelope(2025), actor_id: "director-owner" });
  const authorization = {
    authorized: true,
    scope: "PRODUCTION_COMPLETED_HISTORY_SHADOW_IMPORT",
    actor_id: "director-owner",
    authorization_id: "approval-123",
    authorized_at: "2026-08-23T12:00:00.000Z",
  };
  assert.deepEqual(authorizePreparedProductionShadowInput(template, authorization).director_authorization, authorization);
  assert.throws(
    () => authorizePreparedProductionShadowInput(template, { ...authorization, actor_id: "other" }),
    (error) => error.code === "PRODUCTION_SHADOW_IMPORT_AUTHORIZATION_REQUIRED",
  );
});

test("CLI is local-write-only and canonical source readers pin Production", async () => {
  const [script, cliSource, serverSource, sheets] = await Promise.all([
    readFile(new URL("../scripts/prepare-production-shadow-payloads.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-shadow-payload-cli-source.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-shadow-payload-source.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-sheets-data.js", import.meta.url), "utf8"),
  ]);
  assert.match(script, /flag: "wx"/);
  assert.match(script, /production-shadow-payload-cli-source\.js/);
  assert.doesNotMatch(script, /production-shadow-payload-source\.js/);
  assert.doesNotMatch(script, /supabase|\.rpc\(|googleapis|method:\s*["']POST/i);
  assert.doesNotMatch(cliSource, /import\s+["']server-only["']/);
  assert.match(serverSource, /^import "server-only";/);
  assert.match(sheets, /loadCanonicalProductionCurrentShadowSource/);
  assert.match(sheets, /spreadsheetId: PRODUCTION_SPREADSHEET_ID/);
});

test("CLI help executes successfully in an ordinary Node process", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/prepare-production-shadow-payloads.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath, "--help"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Usage: prepare-production-shadow-payloads /);
  assert.equal(result.stderr, "");
});
