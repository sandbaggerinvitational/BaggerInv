import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  authorizePreparedProductionShadowInput,
  currentShadowImportReadiness,
  prepareProductionShadowPayloadArtifact,
  productionCurrentShadowSourceFingerprint,
  productionizeCompletedHistoryEnvelope,
} from "../lib/production-shadow-payload-preparation.js";
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
  ];
  const handicaps = players.map((player, index) => ({
    Year: 2026,
    "Player ID": player["Player ID"],
    "Team Side": index < 2 ? "Team 1" : "Team 2",
    "Team ID": index < 2 ? "T1" : "T2",
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
  assert.equal(first.current_tournament.input_template.director_authorization, null);
  assert.equal(first.current_tournament.readiness.ready, true);
  assert(first.completed_history.every((item) => item.input_template.director_authorization === null));
  assert.equal(first.safety.supabase_requests, 0);
  assert.equal(first.safety.google_writes, 0);
  assert.equal(first.safety.auth_users_created, 0);
  assert.doesNotMatch(JSON.stringify(first), /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
});

test("incomplete current pairings are diagnostic-only and cannot become an RPC template", async () => {
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
  assert.equal(artifact.current_tournament.readiness.ready, false);
  assert.deepEqual(artifact.current_tournament.readiness.codes, ["CURRENT_PAIRINGS_INCOMPLETE"]);
  assert.equal(artifact.current_tournament.input_template, null);
  assert(artifact.import_blockers.some((item) => item.code === "PRODUCTION_CURRENT_SHADOW_NOT_IMPORTABLE"));
  assert.equal(currentShadowImportReadiness({ payload: { matches: [], snapshots: [], match_participants: [], permissions: [], match_holes: [] } }).ready, false);
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
