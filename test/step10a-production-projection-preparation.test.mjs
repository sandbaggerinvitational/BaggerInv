import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PRODUCTION_PROJECTION_READ_TABS,
  PRODUCTION_PROJECTION_RESOURCE,
  PRODUCTION_PROJECTION_SPECS,
  assertProductionProjectionResource,
  buildDraftHistoryAdapter,
  productionProjectionCanonicalJson,
  prepareProductionProjectionPayloads,
  productionProjectionFingerprint,
  writeProductionProjectionArtifacts,
} from "../scripts/step10a-prepare-production-projections.mjs";
import { PRODUCTION_PROJECTION_SHADOW_SHEETS } from "../lib/google-sheets-data.js";

const hash = (value, options) => productionProjectionFingerprint(value, options);
const recordSheet = (records = []) => ({
  headers: Object.keys(records[0] || {}),
  records: records.map((record, index) => ({ rowNumber: index + 2, record })),
});

const sourceGuide = { tournamentId: "2026", source: { guide: true } };
const guideContent = { tournamentIdentity: { id: "2026", year: 2026 }, overview: [] };
const guidePayload = { schemaVersion: "guide-projection-v1", content: guideContent };

function builders() {
  return {
    guide: () => ({
      schemaVersion: "guide-projection-v1",
      sourceFingerprint: hash(sourceGuide),
      contentFingerprint: hash(guideContent),
      payloadHash: hash(guidePayload),
      sourceCanonicalJson: productionProjectionCanonicalJson(sourceGuide),
      contentCanonicalJson: productionProjectionCanonicalJson(guideContent),
      payloadCanonicalJson: productionProjectionCanonicalJson(guidePayload),
      validation: { valid: true, issues: [] },
      sourceCounts: {},
      content: guideContent,
    }),
    playerEditorial: () => {
      const projection = {
        contract_version: "player-public-profile-v1",
        source_workbook_id: PRODUCTION_PROJECTION_RESOURCE.workbookId,
        players: [{ player_id: "P1", public_profile: { "Display Name": "Player One", Slug: "player-one" } }],
      };
      return { ...projection, source_fingerprint: hash(projection) };
    },
    predictionSettings: () => {
      const settings = [{ sourceKey: "Prediction Model", canonicalKey: "Prediction Model", rawValue: "SBI v1.0" }];
      const canonicalSettings = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`K${index + 1}`, index]));
      const effectiveSettings = { ...canonicalSettings };
      return {
        source_tab: "Prediction Settings",
        settings,
        settings_fingerprint: hash(settings),
        canonical_settings: canonicalSettings,
        effective_settings: effectiveSettings,
        effective_settings_fingerprint: hash(effectiveSettings),
        source_fingerprint: hash({ sourceTab: "Prediction Settings", rows: settings }),
        settings_contract_version: "prediction-settings-v1",
        validation_diagnostics: { recognizedKeyCount: 30 },
      };
    },
    draft: () => ({
      synchronization_fingerprint: hash("draft-sync"),
      drafts: [{
        tournament_id: "2026",
        tournament_year: 2026,
        source_fingerprint: hash("draft-source"),
        configuration_fingerprint: hash("draft-config"),
        picks_fingerprint: hash("draft-picks"),
        payload_fingerprint: hash("draft-payload"),
        configuration: { total_picks: 2 },
        picks: [{ pick_number: 1 }, { pick_number: 2 }],
        presentation_seed: { year: 2026 },
        source_settings: { Year: 2026 },
        source_picks: [],
        validation_status: "VALID",
        validation_diagnostics: {},
      }],
    }),
    netSkins: () => ({
      rounds: [{
        round_number: 1,
        format: "SI",
        entries: [{ source_payload: { Year: 2026, "Player ID 1": "P1" } }],
      }],
    }),
    calcutta: () => ({
      purchases: [{ player_id: "P1", purchase_price: 100 }],
      ownership: [{ player_id: "P1", owner_player_id: "P2", ownership_fraction: 1 }],
      point_structure: [{ place: 1, round_1_award: 1, round_2_award: 1, round_3_award: 1 }],
      payout_structure: [{ place: 1, round_1_fraction: 0.25, round_2_fraction: 0.25, round_3_fraction: 0.25, overall_fraction: 0.25 }],
      financial_contract: { total_market_value: 100, total_payout_fraction: 1 },
    }),
    publishedOdds: () => {
      const snapshots = [{
        milestone: "Pre-Tournament",
        publication_verified: true,
        published_payload: { year: 2026, phase: "Pre-Tournament" },
        payload_hash: hash({ year: 2026, phase: "Pre-Tournament" }),
      }];
      return {
        current_official_milestone: "Pre-Tournament",
        import_fingerprint: hash({ tournamentId: "2026", year: 2026, currentPhase: "Pre-Tournament", snapshots }),
        snapshots,
      };
    },
  };
}

function configuredSheets() {
  return {
    Players: recordSheet([{ "Player ID": "P1" }]),
    "Prediction Settings": recordSheet([{ Setting: "Prediction Model", Value: "SBI v1.0" }]),
    "Draft Settings": recordSheet([{ Year: 2026 }]),
    "Draft Picks": recordSheet([]),
    "Net Skins": recordSheet([{ Year: 2026 }]),
    "Live Matches": recordSheet([]),
    "Calcutta Purchases": recordSheet([{ Year: 2026 }]),
    "Calcutta Ownership": recordSheet([{ Year: 2026 }]),
    "Calcutta Point Structure": recordSheet([{ Year: 2026 }]),
    "Calcutta Payout": recordSheet([{ Year: 2026 }]),
    "Odds Control": recordSheet([{ Year: 2026 }]),
    "Odds Snapshots": recordSheet([]),
    "Odds Team Results": recordSheet([]),
    "Odds Player Results": recordSheet([]),
  };
}

const draftContext = {
  tournaments: [{ id: "2026", year: 2026, teams: [] }],
  players: [{ "Player ID": "P1" }],
  tournament_handicaps: [],
};

test("exact Production resource contract rejects every non-production identity", () => {
  assert.equal(assertProductionProjectionResource().workbookId, PRODUCTION_PROJECTION_RESOURCE.workbookId);
  for (const resource of [
    { workbookId: "wrong" },
    { projectRef: "wrong" },
    { projectUrl: "https://wrong.supabase.co" },
    { tournamentId: "3026" },
    { tournamentYear: 3026 },
  ]) {
    assert.throws(() => assertProductionProjectionResource(resource), { code: "PRODUCTION_PROJECTION_EXACT_RESOURCE_REQUIRED" });
  }
});

test("the exact Production GViz source and payload contracts cover the same tabs", () => {
  assert.deepEqual([...PRODUCTION_PROJECTION_SHADOW_SHEETS], [...PRODUCTION_PROJECTION_READ_TABS]);
  assert.equal(new Set(PRODUCTION_PROJECTION_SHADOW_SHEETS).size, PRODUCTION_PROJECTION_SHADOW_SHEETS.length);
});

test("all seven certified parsers produce immutable Production-only import envelopes", () => {
  const prepared = prepareProductionProjectionPayloads({
    sheets: configuredSheets(),
    actor: "Director P1",
    canonicalCourseContext: [{ course_id: "C1" }],
    draftHistory: draftContext,
    builders: builders(),
  });
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.blockers, []);
  assert.deepEqual(Object.keys(prepared.envelopes).sort(), Object.keys(PRODUCTION_PROJECTION_SPECS).sort());
  for (const [domain, envelope] of Object.entries(prepared.envelopes)) {
    assert.equal(envelope.environment, "PRODUCTION");
    assert.equal(envelope.project_ref, PRODUCTION_PROJECTION_RESOURCE.projectRef);
    assert.equal(envelope.project_url, PRODUCTION_PROJECTION_RESOURCE.projectUrl);
    assert.equal(envelope.source_workbook_id, PRODUCTION_PROJECTION_RESOURCE.workbookId);
    assert.equal(envelope.tournament_id, "2026");
    assert.equal(envelope.tournament_year, 2026);
    assert.equal(envelope.domain, domain);
    assert.equal(envelope.contract_version, PRODUCTION_PROJECTION_SPECS[domain].contractVersion);
    assert.deepEqual(envelope.source_tabs, [...PRODUCTION_PROJECTION_SPECS[domain].sourceTabs]);
    assert.match(envelope.source_fingerprint, /^[0-9a-f]{64}$/);
    assert.match(envelope.payload_fingerprint, /^[0-9a-f]{64}$/);
    assert.deepEqual(JSON.parse(envelope.source_canonical_json), envelope.source_payload);
    assert.deepEqual(JSON.parse(envelope.payload_canonical_json), envelope.payload);
    assert.equal(envelope.source_fingerprint, hash(envelope.source_canonical_json, { serialized: true }));
    assert.equal(envelope.payload_fingerprint, hash(envelope.payload_canonical_json, { serialized: true }));
    assert.equal(JSON.stringify(envelope).includes("idgigvjjqkfbqjeredpb"), false);
  }
  assert.equal(
    prepared.envelopes.PREDICTION_SETTINGS.settings_canonical_json,
    productionProjectionCanonicalJson(prepared.envelopes.PREDICTION_SETTINGS.payload.settings),
  );
  assert.equal(
    prepared.envelopes.PREDICTION_SETTINGS.effective_settings_canonical_json,
    productionProjectionCanonicalJson(prepared.envelopes.PREDICTION_SETTINGS.payload.effective_settings),
  );
  for (const snapshot of prepared.envelopes.PUBLISHED_ODDS.payload.snapshots) {
    assert.equal(snapshot.published_payload_canonical_json, productionProjectionCanonicalJson(snapshot.published_payload));
    assert.equal(snapshot.payload_hash, hash(snapshot.published_payload));
  }
  assert.deepEqual(prepared.safety, {
    google_read_only: true,
    google_writes: 0,
    supabase_requests: 0,
    auth_users_created: 0,
    otp_sends: 0,
    source_or_authority_changes: 0,
  });
});

test("parser-declared fingerprints must match the exact semantic source and payload evidence", () => {
  const localBuilders = builders();
  localBuilders.playerEditorial = () => ({
    contract_version: "player-public-profile-v1",
    source_workbook_id: PRODUCTION_PROJECTION_RESOURCE.workbookId,
    players: [{ player_id: "P1", public_profile: { "Display Name": "Player One", Slug: "player-one" } }],
    source_fingerprint: hash({ different: "self-attested-source" }),
  });
  const prepared = prepareProductionProjectionPayloads({
    sheets: configuredSheets(),
    actor: "Director P1",
    canonicalCourseContext: [{ course_id: "C1" }],
    draftHistory: draftContext,
    builders: localBuilders,
  });
  assert.equal(prepared.envelopes.PLAYER_EDITORIAL, undefined);
  assert.equal(
    prepared.blockers.find((item) => item.domain === "PLAYER_EDITORIAL")?.code,
    "PRODUCTION_PROJECTION_SOURCE_FINGERPRINT_MISMATCH",
  );
});

test("unconfigured Net Skins and Calcutta are explicit and never invoke configuration builders", () => {
  const localBuilders = builders();
  localBuilders.netSkins = () => assert.fail("Net Skins builder must not run for an empty Production configuration");
  localBuilders.calcutta = () => assert.fail("Calcutta builder must not run for an empty Production configuration");
  const sheets = configuredSheets();
  sheets["Net Skins"] = recordSheet([]);
  for (const tab of ["Calcutta Purchases", "Calcutta Ownership", "Calcutta Point Structure", "Calcutta Payout"]) sheets[tab] = recordSheet([]);
  const prepared = prepareProductionProjectionPayloads({
    sheets,
    actor: "Director P1",
    canonicalCourseContext: [{ course_id: "C1" }],
    draftHistory: draftContext,
    builders: localBuilders,
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.envelopes.NET_SKINS_CONFIGURATION.validation_status, "NOT_CONFIGURED");
  assert.deepEqual(prepared.envelopes.NET_SKINS_CONFIGURATION.payload.rounds, []);
  assert.equal(prepared.envelopes.CALCUTTA_CONFIGURATION.validation_status, "NOT_CONFIGURED");
  assert.deepEqual(prepared.envelopes.CALCUTTA_CONFIGURATION.payload.purchases, []);
});

test("missing certified context is reported per domain without guessing or fallback", () => {
  const localBuilders = builders();
  localBuilders.predictionSettings = () => {
    const error = Object.assign(new Error("Malformed Production settings."), {
      code: "MALFORMED_NUMERIC_VALUE",
      diagnostics: { access_token: "must-not-leak", row: 4 },
    });
    throw error;
  };
  const prepared = prepareProductionProjectionPayloads({
    sheets: configuredSheets(),
    actor: "Director P1",
    builders: localBuilders,
  });
  assert.equal(prepared.ok, false);
  assert.deepEqual(prepared.blockers.map((item) => item.domain).sort(), ["DRAFT", "GUIDE", "PREDICTION_SETTINGS"]);
  assert.equal(prepared.blockers.find((item) => item.domain === "GUIDE").code, "PRODUCTION_GUIDE_CANONICAL_COURSE_CONTEXT_REQUIRED");
  assert.equal(prepared.blockers.find((item) => item.domain === "DRAFT").code, "PRODUCTION_DRAFT_CANONICAL_HISTORY_REQUIRED");
  assert.equal(prepared.blockers.find((item) => item.domain === "PREDICTION_SETTINGS").diagnostics.access_token, "[REDACTED]");
});

test("retained private/editorial Player fields block instead of being dropped or leaked", () => {
  const sheets = configuredSheets();
  sheets.Players = recordSheet([{ "Player ID": "P1", GHIN: "private-number", "Home Club": "Home Course" }]);
  const prepared = prepareProductionProjectionPayloads({
    sheets,
    actor: "Director P1",
    canonicalCourseContext: [{ course_id: "C1" }],
    draftHistory: draftContext,
    builders: builders(),
  });
  const blocker = prepared.blockers.find((item) => item.domain === "PLAYER_EDITORIAL");
  assert.equal(blocker.code, "PRODUCTION_PLAYER_EDITORIAL_CONTRACT_INCOMPLETE");
  assert.deepEqual(blocker.diagnostics.fields, [
    { field: "GHIN", populated_rows: 1 },
    { field: "Home Club", populated_rows: 1 },
  ]);
  assert.equal(JSON.stringify(blocker).includes("private-number"), false);
  assert.equal(prepared.envelopes.PLAYER_EDITORIAL, undefined);
});

test("domain parser divergence details survive as sanitized exact blockers", () => {
  const localBuilders = builders();
  localBuilders.publishedOdds = () => {
    const error = Object.assign(new Error("Published rows diverge."), {
      code: "PUBLISHED_ODDS_REPORTING_DIVERGENCE",
      divergences: [{ scope: "TEAM", identity: "Team 1", code: "VALUE_DIVERGENCE" }],
    });
    throw error;
  };
  const prepared = prepareProductionProjectionPayloads({
    sheets: configuredSheets(),
    actor: "Director P1",
    canonicalCourseContext: [{ course_id: "C1" }],
    draftHistory: draftContext,
    builders: localBuilders,
  });
  assert.deepEqual(prepared.blockers.find((item) => item.domain === "PUBLISHED_ODDS").diagnostics.divergences,
    [{ scope: "TEAM", identity: "Team 1", code: "VALUE_DIVERGENCE" }]);
});

test("JSON Draft context is adapted only to the three certified calculation methods", () => {
  const adapter = buildDraftHistoryAdapter({
    tournaments: [{ id: "2025", year: 2025 }],
    players: [{ "Player ID": "P1", "Display Name": "Player One" }],
    tournament_handicaps: [{ tournament_year: 2025, player_id: "P1", handicap: 7.2 }],
  });
  assert.equal(adapter.getTournament(2025).id, "2025");
  assert.equal(adapter.getPlayerMap().P1["Display Name"], "Player One");
  assert.equal(adapter.getTournamentHandicap("P1", 2025), 7.2);
  assert.equal(buildDraftHistoryAdapter({ tournaments: [], players: [] }), null);
});

test("artifact writer creates owner-only sanitized files and a non-authoritative manifest", async () => {
  const prepared = prepareProductionProjectionPayloads({
    sheets: configuredSheets(),
    actor: "Director P1",
    canonicalCourseContext: [{ course_id: "C1" }],
    draftHistory: draftContext,
    builders: builders(),
  });
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "step10a-production-projections-"));
  const written = await writeProductionProjectionArtifacts(outputDir, prepared, {
    googleReadDiagnostics: { httpRequests: 1, workbookWrites: 0, authorization: "must-not-leak" },
  });
  assert.equal((await stat(outputDir)).mode & 0o777, 0o700);
  for (const file of [...written.manifest.files.map((item) => item.file), "manifest.json"]) {
    assert.equal((await stat(path.join(outputDir, file))).mode & 0o777, 0o600);
  }
  const manifest = JSON.parse(await readFile(written.manifestPath, "utf8"));
  assert.equal(manifest.complete, true);
  assert.equal(manifest.google_read_diagnostics.workbookWrites, 0);
  assert.equal(manifest.google_read_diagnostics.authorization, "[REDACTED]");
  assert.equal(manifest.safety.supabase_requests, 0);
  assert.equal(manifest.safety.source_or_authority_changes, 0);
  await assert.rejects(
    () => writeProductionProjectionArtifacts(outputDir, prepared),
    { code: "PRODUCTION_PROJECTION_OUTPUT_NOT_EMPTY" },
  );
});

test("CLI implementation is local/read-only and contains no remote import or Auth-send path", async () => {
  const source = await readFile(new URL("../scripts/step10a-prepare-production-projections.mjs", import.meta.url), "utf8");
  const googleSource = await readFile(new URL("../lib/google-sheets-data.js", import.meta.url), "utf8");
  assert.match(source, /loadCanonicalProductionProjectionShadowSource\(\)/);
  assert.match(source, /googleWriterOperations \|\| 0\) !== 0/);
  assert.match(source, /PRODUCTION_PROJECTION_LOCAL_ONLY/);
  assert.match(googleSource, /loadCanonicalProductionProjectionShadowSource/);
  assert.match(googleSource, /spreadsheetId: PRODUCTION_SPREADSHEET_ID/);
  assert.match(googleSource, /transport: "gviz"/);
  assert.doesNotMatch(source, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
  assert.doesNotMatch(source, /import_production_[a-z_]+\s*\(|scoringShadowRpc\s*\(|auth\.admin|signInWithOtp/);
});
