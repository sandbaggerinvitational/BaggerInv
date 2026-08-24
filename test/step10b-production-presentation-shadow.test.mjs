import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  prepareProductionPresentationShadowImport,
  PRODUCTION_PRESENTATION_SHADOW_CONTRACT,
  PRODUCTION_PRESENTATION_SHADOW_OPERATION,
  PRODUCTION_PRESENTATION_SHADOW_RPC,
  PRODUCTION_PRESENTATION_SOURCE_TABS,
} from "../lib/production-presentation-shadow.js";
import { productionCurrentShadowSourceFingerprint } from
  "../lib/production-shadow-payload-preparation.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608240016_production_presentation_shadow_import.sql",
  import.meta.url,
);

function sheet(records = [], headers = undefined) {
  const resolvedHeaders = headers || [...new Set(records.flatMap((row) => Object.keys(row)))];
  return { headers: resolvedHeaders, records: records.map((record) => ({ record })) };
}

function fixture() {
  const players = Array.from({ length: 24 }, (_, index) => ({
    "Player ID": `P${String(index + 1).padStart(2, "0")}`,
    "Display Name": `Player ${index + 1}`,
    Slug: `player-${index + 1}`,
    "Photo Filename": `player-${index + 1}`,
    Active: true,
  }));
  const handicaps = players.map((player, index) => ({
    Year: 2026,
    "Player ID": player["Player ID"],
    "Team Side": index < 12 ? "Team 1" : "Team 2",
  }));
  const courseRows = [
    { "Course ID": "TPGC01", Year: 2026, Course: "Turtle Point Golf Course", "Course Logo": "turtle-point-logo", Yardage: 6510 },
    { "Course ID": "CPGC01", Year: 2026, Course: "Cougar Point Golf Course", "Course Logo": "cougar-point-logo", Yardage: 6620 },
    { "Course ID": "OCGC01", Year: 2026, Course: "The Ocean Course", "Course Logo": "ocean-course-logo", Yardage: 6793 },
  ];
  const roundSpecs = [
    { round: 1, count: 6, format: "BB", course: "TPGC01", start: "7:30 AM" },
    { round: 2, count: 6, format: "SC", course: "CPGC01", start: "2:00 PM" },
    { round: 3, count: 12, format: "SI", course: "OCGC01", start: "10:10 AM" },
  ];
  const matches = roundSpecs.flatMap(({ round, count, format, course, start }) =>
    Array.from({ length: count }, (_, index) => ({
      "Match ID": `2026-R${round}-${index + 1}`,
      Year: 2026,
      Round: round,
      Format: format,
      Match: index + 1,
      "Course ID": course,
      "Tee Time": start,
      "Team 1 Player 1": round === 1 && index === 0 ? "P01" : "",
      "Match Status": "Scheduled",
      "Updated At": round === 2 && index === 0 ? "2026-08-24T12:34:56.789Z" : "",
    }))
  );
  const currentSource = {
    Tournaments: sheet([{
      Year: 2026,
      Annual: "10th Annual Sandbagger Invitational",
      Dates: "September 25 - 26, 2026",
      Destination: "Kiawah Island",
      "Tournament Status": "Upcoming",
      "Start Time": "",
      "Time Zone": "America/New_York",
      "Updated At": "2026-07-22T23:35:10.565Z",
    }]),
    "Live Tournaments": sheet([{
      Year: 2026,
      "Tournament Status": "Upcoming",
      "Current Round": 1,
      "Live Message": "",
    }]),
    Players: sheet(players),
    Handicaps: sheet(handicaps),
    "Team Names": sheet([
      { Year: 2026, "Team Side": "Team 1", "Team ID": "PICKLES", "Team Names": "The Pickles", Captain: "P01", "Team Logo": "pickles-logo" },
      { Year: 2026, "Team Side": "Team 2", "Team ID": "LIPPIT", "Team Names": "Lipp it and Rip it", Captain: "P13", "Team Logo": "lippit-logo" },
    ]),
    Rounds: sheet([]),
    "Tournament Rules": sheet([]),
    Courses: sheet(courseRows),
    "Course Holes": sheet([]),
    "Live Matches": sheet(matches),
    Matches: sheet([]),
    "Live Hole Scores": sheet([]),
    "Match Update Log": sheet([]),
    "Admin Audit Log": sheet([]),
  };
  const projectionSource = {
    "Tournament Timeline": sheet([], [
      "Year", "Tournament Day", "Event Date", "Start Time", "End Time", "Event Type",
      "Title", "Subtitle", "Location", "Display on Home", "Notification Minutes",
      "Sort Order", "Status Override",
    ]),
    "Net Skins": sheet([]),
    "Calcutta Purchases": sheet([]),
    "Calcutta Ownership": sheet([]),
    "Calcutta Point Structure": sheet([]),
    "Calcutta Payout": sheet([]),
  };
  return { currentSource, projectionSource };
}

function prepare(overrides = {}) {
  const sources = fixture();
  const evidence = {
    importRunId: "4e9d1ea9-66a8-428b-819a-b4a502623951",
    sourceFingerprint: productionCurrentShadowSourceFingerprint(sources.currentSource),
    databaseFingerprint: "4".repeat(64),
  };
  return prepareProductionPresentationShadowImport({
    ...sources,
    actor: "step10b-production-presentation-shadow",
    currentShadowEvidence: evidence,
    ...overrides,
  });
}

test("Production presentation payload covers every match with per-round numeric order and Production course names", () => {
  const artifact = prepare();
  assert.equal(artifact.rpc, PRODUCTION_PRESENTATION_SHADOW_RPC);
  assert.equal(artifact.input.operation, PRODUCTION_PRESENTATION_SHADOW_OPERATION);
  assert.equal(artifact.input.contract_version, PRODUCTION_PRESENTATION_SHADOW_CONTRACT);
  assert.deepEqual(artifact.input.source_tabs, PRODUCTION_PRESENTATION_SOURCE_TABS);
  assert.equal(artifact.input.payload.game_center_rows.length, 24);
  assert.deepEqual(artifact.diagnostics.round_match_order, {
    1: [1, 2, 3, 4, 5, 6],
    2: [1, 2, 3, 4, 5, 6],
    3: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  });
  const r2 = artifact.input.payload.game_center_rows.filter((row) => row.match_id.includes("-R2-"));
  const r3 = artifact.input.payload.game_center_rows.filter((row) => row.match_id.includes("-R3-"));
  assert.deepEqual(r2.map((row) => row.display_match_number), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(r3.map((row) => row.match_sort_order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(r2[0].source_updated_at, "2026-08-24T12:34:56.789Z");
  assert.equal(r3.findIndex((row) => row.match_id === "2026-R3-10"), 9,
    "R3-10 follows R3-9 instead of sorting lexically before R3-2");
  assert.deepEqual(artifact.diagnostics.course_names, [
    "Turtle Point Golf Course", "Cougar Point Golf Course", "The Ocean Course",
  ]);
});

test("Production Home presentation is complete, deterministic and non-authoritative", () => {
  const first = prepare();
  const second = prepare();
  assert.equal(first.input.request_fingerprint, second.input.request_fingerprint);
  assert.equal(first.input.source_fingerprint, second.input.source_fingerprint);
  assert.equal(first.input.payload_fingerprint, second.input.payload_fingerprint);
  assert.equal(first.diagnostics.home_roster_players, 24);
  assert.equal(Object.keys(first.input.payload.participant_home_presentation.tournamentMatchDisplay).length, 24);
  assert.equal(first.input.payload.participant_home_presentation.tournament.location, "Kiawah Island");
  assert.equal(first.input.payload.participant_home_presentation.timeline.available, false);
  assert.equal(first.input.safety.shadow_only, true);
  assert.equal(first.input.safety.authoritative, false);
  assert.equal(first.input.safety.google_writes, 0);
  assert.equal(first.input.safety.scoring_ingress_enabled, false);
});

test("Production presentation preparation fails closed on resource, source-revision and configured-module ambiguity", () => {
  assert.throws(
    () => prepare({ resource: { projectRef: "idgigvjjqkfbqjeredpb" } }),
    (error) => error.code === "PRODUCTION_PRESENTATION_EXACT_RESOURCE_REQUIRED",
  );
  const sources = fixture();
  assert.throws(
    () => prepareProductionPresentationShadowImport({
      ...sources,
      currentShadowEvidence: {
        importRunId: "4e9d1ea9-66a8-428b-819a-b4a502623951",
        sourceFingerprint: "a".repeat(64),
        databaseFingerprint: "b".repeat(64),
      },
    }),
    (error) => error.code === "PRODUCTION_PRESENTATION_CURRENT_SOURCE_CHANGED",
  );
  sources.projectionSource["Net Skins"] = sheet([{ Year: 2026, Round: 1 }]);
  assert.throws(
    () => prepareProductionPresentationShadowImport({
      ...sources,
      currentShadowEvidence: {
        importRunId: "4e9d1ea9-66a8-428b-819a-b4a502623951",
        sourceFingerprint: productionCurrentShadowSourceFingerprint(sources.currentSource),
        databaseFingerprint: "b".repeat(64),
      },
    }),
    (error) => error.code === "PRODUCTION_PRESENTATION_CONFIGURED_MODULE_DERIVATION_REQUIRED",
  );
});

test("Production presentation migration is service-role-only, provenance-bound, idempotent and side-effect closed", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table production_control\.presentation_shadow_revisions/i);
  assert.match(sql, /alter table production_control\.presentation_shadow_revisions enable row level security/i);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(sql, /ymqhhtxaywtqllynrmxe/);
  assert.match(sql, new RegExp(PRODUCTION_GOOGLE_WORKBOOK_ID));
  assert.match(sql, /current_shadow_import_run_id/i);
  assert.match(sql, /current_tournament_shadow_projection\('2026'\)/i);
  assert.match(sql, /PRODUCTION_PRESENTATION_CANONICAL_EVIDENCE_MISMATCH/);
  assert.match(sql, /jsonb_array_length\(rows_value\) <> 24/i);
  assert.match(sql, /match_sort_order[\s\S]*display_match_number/i);
  assert.match(sql, /source_sheet->>'sheet' = 'Live Matches'/i);
  assert.match(sql, /source_match->>'Match'[\s\S]*display_match_number/i);
  assert.match(sql, /source_match->>'Round'[\s\S]*match_value\.round_number/i);
  assert.match(sql, /course_name[\s\S]*= ''/i);
  assert.match(sql, /PRODUCTION_PRESENTATION_DUPLICATE_READBACK_DRIFT/);
  assert.match(sql, /'changed', false, 'duplicate', true/i);
  assert.match(sql, /PRODUCTION_PRESENTATION_IMPORT_CREATED_DELIVERY_WORK/);
  assert.match(sql, /grant execute on function public\.import_production_presentation_shadow_v1\(jsonb\) to service_role/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:anon|authenticated)/i);
  assert.doesNotMatch(sql, /replace_preview_game_center_presentations|replace_preview_participant_home_presentation/i);
  assert.doesNotMatch(sql, /split_part\([^;]+match_id/i);
  assert.doesNotMatch(sql, /match_id' like '2026-R[123]-%'/i);
  assert.doesNotMatch(sql, /insert into scoring_authority\.(?:hole_scores|google_outbox_events|scorecard_archive_jobs|odds_google_mirror_jobs)/i);
  assert.match(sql, /set search_path = pg_catalog, production_control, scoring_authority, auth, extensions, pg_temp/i);
});

test("preparation CLI is read-only and the server wrapper remains server-only", async () => {
  const [script, serverSource, cliSource] = await Promise.all([
    readFile(new URL("../scripts/prepare-production-presentation-shadow.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-presentation-shadow-source.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-presentation-shadow-cli-source.js", import.meta.url), "utf8"),
  ]);
  assert.match(serverSource, /^import "server-only";/);
  for (const source of [serverSource, cliSource]) {
    assert.match(source, /loadCanonicalProductionCurrentShadowSource/);
    assert.match(source, /loadCanonicalProductionProjectionShadowSource/);
    assert.doesNotMatch(source, /scoringShadowRpc|fetch\(/i);
  }
  assert.match(script, /flag: "wx", mode: 0o600/);
  assert.match(script, /googleWrites: 0/);
  assert.match(script, /supabaseRequests: 0/);
  assert.doesNotMatch(script, /fetch\(|scoringShadowRpc/);
});

test("Production presentation operation is allowed only by the dormant foundation gate", async () => {
  const { productionFoundationResourceEnvironment } = await import(
    "../lib/production-foundation-resource-contract.js"
  );
  const productionEnv = {
    VERCEL_ENV: "production",
    PRODUCTION_FOUNDATION_ENABLED: "true",
    PRODUCTION_SUPABASE_PROJECT_REF,
    PRODUCTION_SUPABASE_URL,
    PRODUCTION_SUPABASE_SECRET_KEY: "server-only-test",
    GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID,
    SCORING_AUTHORITY: "google",
    PARTICIPANT_IDENTITY_AUTHORITY: "passport",
  };
  const safe = productionFoundationResourceEnvironment({
    operation: PRODUCTION_PRESENTATION_SHADOW_OPERATION,
    env: productionEnv,
  });
  assert.equal(safe.allowed, true);
  assert.equal(safe.policy.googleWrite, false);
  assert.equal(safe.policy.scoringIngress, false);
  const unsafe = productionFoundationResourceEnvironment({
    operation: PRODUCTION_PRESENTATION_SHADOW_OPERATION,
    env: {
      ...productionEnv,
      VERCEL_ENV: "preview",
    },
  });
  assert.equal(unsafe.allowed, false);
});
