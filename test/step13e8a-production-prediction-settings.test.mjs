import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  normalizeProductionPredictionSettingsAuthoring,
  predictionSettingsChangedKeys,
  PRODUCTION_PREDICTION_SETTING_CATEGORIES,
  PRODUCTION_PREDICTION_SETTING_SPECS,
} from "../lib/production-prediction-settings-contract.js";

const migration = await readFile(new URL(
  "../supabase/production_migrations/202608310080_production_prediction_settings_authoring_v1.sql",
  import.meta.url,
), "utf8");

const complete = () => Object.fromEntries(PRODUCTION_PREDICTION_SETTING_SPECS
  .map((setting) => [setting.canonicalKey, setting.defaultValue]));

test("Production authoring exposes the exact typed 30-setting contract in five justified groups", () => {
  assert.equal(PRODUCTION_PREDICTION_SETTING_SPECS.length, 30);
  assert.equal(new Set(PRODUCTION_PREDICTION_SETTING_SPECS
    .map((setting) => setting.canonicalKey)).size, 30);
  assert.equal(PRODUCTION_PREDICTION_SETTING_CATEGORIES.length, 5);
  assert.equal(PRODUCTION_PREDICTION_SETTING_CATEGORIES
    .flatMap((category) => category.settings).length, 30);
  for (const setting of PRODUCTION_PREDICTION_SETTING_SPECS) {
    assert.ok(setting.description);
    assert.ok(setting.categoryLabel);
    assert.ok(["number", "integer", "boolean", "enum", "string"]
      .includes(setting.type));
  }
});

test("Production authoring preserves all supported types, bounds, relationships, aliases, and legacy effective settings", () => {
  const proposed = complete();
  proposed["Player Category Weight"] = "42%";
  proposed["Scorecard Influence Enabled"] = "YES";
  proposed["Minimum Scorecard Confidence"] = "strong";
  proposed["Minimum Scorecard Recorded Rounds"] = "2.4";
  proposed["Prediction Model"] = " SBI v1.0 ";
  const normalized = normalizeProductionPredictionSettingsAuthoring(proposed);
  assert.equal(normalized.canonicalSettings["Player Category Weight"], 42);
  assert.equal(normalized.canonicalSettings["Scorecard Influence Enabled"], true);
  assert.equal(normalized.canonicalSettings["Minimum Scorecard Confidence"], "Strong");
  assert.equal(normalized.canonicalSettings["Minimum Scorecard Recorded Rounds"], 2);
  assert.equal(normalized.canonicalSettings["Prediction Model"], "SBI v1.0");
  assert.equal(Object.keys(normalized.canonicalSettings).length, 30);
  assert.equal(Object.keys(normalized.effectiveSettings).length, 30);

  const rows = Object.entries(complete()).map(([Setting, Value]) => ({ Setting, Value }));
  const format = rows.find((row) => row.Setting === "Format Win Percentage");
  format.Setting = "Player - Format Win Percentage Weight";
  assert.equal(normalizeProductionPredictionSettingsAuthoring(rows)
    .canonicalSettings["Format Win Percentage"], 28);

  assert.throws(() => normalizeProductionPredictionSettingsAuthoring({
    ...complete(), "Maximum Win Probability": 101,
  }), (error) => error.code === "PREDICTION_SETTINGS_INVALID");
  assert.throws(() => normalizeProductionPredictionSettingsAuthoring({
    ...complete(), "Minimum Win Probability": 80,
    "Maximum Win Probability": 20,
  }), (error) => error.code === "PREDICTION_SETTINGS_INVALID" &&
    error.diagnostics.errors.some((issue) =>
      issue.code === "PROBABILITY_BOUNDS_REVERSED"));
});

test("Production authoring rejects unknown or incomplete schemas and reports direct/effective change sets", () => {
  assert.throws(() => normalizeProductionPredictionSettingsAuthoring({
    ...complete(), "Mystery Weight": 5,
  }), (error) => error.code === "PREDICTION_SETTINGS_UNKNOWN_SETTING");
  const missing = complete();
  delete missing["Prediction Model"];
  assert.throws(() => normalizeProductionPredictionSettingsAuthoring(missing),
    (error) => error.code === "PREDICTION_SETTINGS_COMPLETE_SCHEMA_REQUIRED");

  const legacy = {
    ...complete(),
    "Handicap Category Weight": 15,
    "Player Category Weight": 35,
    "Team Category Weight": 30,
    "Opponent Category Weight": 15,
    "Tournament Category Weight": 5,
    "Better Player Handicap Difference": 2,
    "Lesser Player Handicap Difference": 2,
  };
  const normalized = normalizeProductionPredictionSettingsAuthoring(legacy);
  assert.equal(normalized.diagnostics.recalibratedV2, true);
  assert.ok(predictionSettingsChangedKeys(complete(), normalized.canonicalSettings).length >= 6);
  assert.ok(predictionSettingsChangedKeys(complete(), normalized.effectiveSettings).length === 0,
    "review can distinguish direct edits from the resulting effective runtime values");
});

test("server mutations bind exact Production scope, canonical payload hashes, and no Google transport", () => {
  const script = `
    import {
      stageProductionPredictionSettings,
      commitProductionPredictionSettings,
      copyProductionPredictionSettingsDraft,
    } from "./lib/production-prediction-settings-server.js";
    import { PRODUCTION_PREDICTION_SETTING_SPECS } from
      "./lib/production-prediction-settings-contract.js";
    const settings = Object.fromEntries(PRODUCTION_PREDICTION_SETTING_SPECS
      .map((item) => [item.canonicalKey, item.defaultValue]));
    settings["Player Category Weight"] = 43;
    const calls = [];
    const options = {
      env: {},
      getActivation: () => ({ phase: "OBSERVATION", resources: {} }),
      rpc: async (name, input) => {
        calls.push({ name, input });
        return { payload: { ok: true } };
      },
    };
    const actor = {
      actorAuthUserId: "10000000-0000-4000-8000-000000000001",
      actorPlayerId: "CB01", actorTournamentId: "2026",
    };
    await stageProductionPredictionSettings({ ...actor,
      targetTournamentId: "2026", expectedRevision: 2,
      operationRequestId: "20000000-0000-4000-8000-000000000002",
      settings, reason: "Director approved model update" }, options);
    await commitProductionPredictionSettings({ ...actor,
      targetTournamentId: "2026", expectedRevision: 2,
      operationRequestId: "30000000-0000-4000-8000-000000000003",
      draftId: "40000000-0000-4000-8000-000000000004",
      confirmation: "SAVE PREDICTION SETTINGS REVISION" }, options);
    await copyProductionPredictionSettingsDraft({ ...actor,
      targetTournamentId: "2027", sourceTournamentId: "2026",
      expectedRevision: 0,
      operationRequestId: "50000000-0000-4000-8000-000000000005",
      reason: "Copy values for future Director review" }, options);
    process.stdout.write(JSON.stringify(calls));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const calls = JSON.parse(child.stdout);
  assert.deepEqual(calls.map((call) => call.name), [
    "stage_production_prediction_settings_revision_v1",
    "commit_production_prediction_settings_revision_v1",
    "copy_production_prediction_settings_draft_v1",
  ]);
  for (const { input } of calls) {
    assert.equal(input.environment, "PRODUCTION");
    assert.equal(input.tournament_id, "2026");
    assert.equal(input.authorization.player_id, "CB01");
    assert.match(input.request_payload_hash, /^[0-9a-f]{64}$/);
    assert.equal(Object.keys(input).some((key) => /google.*read/i.test(key)), false);
  }
  assert.equal(calls[2].input.target_tournament_id, "2027");
  assert.equal(calls[2].input.source_tournament_id, "2026");
});

test("migration 080 is additive and inert while implementing the bounded revision lifecycle", () => {
  assert.match(migration, /create table production_control\.prediction_settings_drafts_v1/);
  assert.match(migration, /create table production_control\.prediction_settings_operation_receipts_v1/);
  assert.match(migration, /create table production_control\.prediction_settings_revision_provenance_v1/);
  assert.match(migration, /create table production_control\.prediction_settings_audit_events_v1/);
  assert.match(migration, /create function public\.stage_production_prediction_settings_revision_v1/);
  assert.match(migration, /create function public\.validate_production_prediction_settings_revision_v1/);
  assert.match(migration, /create function public\.commit_production_prediction_settings_revision_v1/);
  assert.match(migration, /create function public\.copy_production_prediction_settings_draft_v1/);
  assert.match(migration, /PREDICTION_SETTINGS_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /SUPABASE_DIRECTOR/);
  assert.match(migration, /future_annual_projection_bindings_v1/);
  assert.match(migration, /automaticCalculationRequested[^\n]*false/);
  assert.match(migration, /automaticPublicationRequested[^\n]*false/);
  assert.doesNotMatch(migration,
    /insert into scoring_authority\.odds_calculation_jobs/i);
  assert.doesNotMatch(migration,
    /insert into scoring_authority\.odds_published_snapshots/i);
  assert.doesNotMatch(migration,
    /update scoring_authority\.odds_publication_current/i);
});

test("Production Google Prediction Settings authoring is retired without retiring Preview, Guide, Draft, or archives", async () => {
  const [syncRoute, syncService, cmsRoute, calibration, credential,
    intent, inventory, directorOperations] = await Promise.all([
    readFile(new URL("../app/api/admin/production-director-synchronization/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-director-projection-synchronization.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/cms/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/ScorecardCalibration.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-service-account-credential-context.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-workbook-mutation-intent.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-google-writer-inventory.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/director/ProductionDirectorOperations.js", import.meta.url), "utf8"),
  ]);
  for (const source of [syncRoute, syncService, cmsRoute]) {
    assert.match(source, /PRODUCTION_PREDICTION_SETTINGS_GOOGLE_AUTHORING_RETIRED/);
  }
  assert.match(calibration, /previewMode \? <CmsManager/);
  assert.doesNotMatch(credential,
    /^\s*PREDICTION_SETTINGS_SYNCHRONIZATION:\s*Object\.freeze/m);
  assert.doesNotMatch(intent,
    /\[GOOGLE_AUTHORING_OPERATIONS\.ADMIN_CMS_PREDICTION_SETTINGS\]:/);
  assert.doesNotMatch(inventory,
    /^\s*PREDICTION_SETTINGS:\s*GOOGLE_AUTHORING_OPERATIONS/m);
  assert.match(credential, /GUIDE_SYNCHRONIZATION/);
  assert.match(credential, /DRAFT_SYNCHRONIZATION/);
  assert.match(credential, /ROUND_SCORECARDS_ARCHIVE/);
  assert.match(inventory, /DRAFT_GUIDE_PRESENTATION/);
  assert.doesNotMatch(directorOperations,
    /<ProjectionSyncCard\s+domain="PREDICTION_SETTINGS"/);
  assert.match(directorOperations, /domain="GUIDE"/);
  assert.match(directorOperations, /domain="DRAFT"/);
});

test("Supabase-native settings remain current in Production War Room reads without a Vercel fingerprint rebind", async () => {
  const service = await readFile(new URL(
    "../lib/war-room-input-service.js", import.meta.url), "utf8");
  const bundle = await readFile(new URL(
    "../lib/prediction-input-bundle-service.js", import.meta.url), "utf8");
  assert.match(service, /CURRENT_SUPABASE_CONFIGURATION/);
  assert.match(service, /trustCurrentSupabaseConfiguration: true/);
  assert.match(bundle, /configuration_is_current !== true/);
  assert.match(bundle, /validation_status !== "VALID"/);
  assert.match(bundle, /freshness: "CURRENT"/);
});

test("Director UI implements Edit, Validate, Review, Save, history, and future-copy without Odds side effects", async () => {
  const [editor, operations, route] = await Promise.all([
    readFile(new URL("../app/admin/director/ProductionPredictionSettingsEditor.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/director/ProductionDirectorOperations.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/director/prediction-settings/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(operations, /<ProductionPredictionSettingsEditor onChanged=\{refresh\}/);
  assert.match(editor, /Edit Settings/);
  assert.match(editor, /Validate & Review/);
  assert.match(editor, /Save Revision/);
  assert.match(editor, /Current effective/);
  assert.match(editor, /Proposed effective/);
  assert.match(editor, />Current <b>/);
  assert.match(editor, />Proposed</);
  assert.match(editor, /changed \? "Changed" : "Unchanged"/);
  const percentDeclaration = editor.match(/const PERCENT_SETTING_KEYS = new Set\(\[([^\]]+)]\)/);
  assert.ok(percentDeclaration, "editor must declare its percentage-valued settings explicitly");
  assert.deepEqual(
    [...percentDeclaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]),
    ["Maximum Win Probability", "Minimum Win Probability"],
    "relative weights and win-percentage history inputs must not be presented as percentages",
  );
  assert.match(editor, /Revision history/);
  assert.match(editor, /Copy Previous as Draft/);
  assert.match(editor, /READY_FOR_ACTIVATION/);
  assert.match(editor, /Published snapshot unchanged/);
  assert.match(editor, /Prediction Settings revision \{receipt\.revision\}/);
  assert.match(editor, /Effective time/);
  assert.match(editor, /Director/);
  assert.match(editor, /Changed settings/);
  assert.match(editor, /Recalculation/);
  assert.match(editor, /readback\?\.current\?\.effectiveAt/);
  assert.match(editor, /history\?\.actorPlayerId/);
  assert.match(editor, /result\.data\.effectiveAt/);
  assert.match(editor, /result\.data\.directorPlayerId/);
  assert.match(editor, /result\.data\.changedSettingCount/);
  assert.match(editor, /result\.data\.recalculationRequired/);
  assert.match(editor, /No calculation or publication was requested/);
  assert.doesNotMatch(editor, /sourceFingerprint|effectiveSettingsFingerprint|payloadHash/);
  assert.doesNotMatch(editor, /\/api\/odds\/publish|production-odds-calculations/);
  assert.doesNotMatch(editor, /Google/);
  assert.match(route, /authorizePreviewDirector/);
  assert.match(route, /production-director-entitlement/);
  assert.match(route, /requireOrigin: true/);
  assert.match(route, /withDataAuthorityRequestScope/);
  assert.match(route, /googleRequests: 0/);
  assert.doesNotMatch(route, /google-sheets|readWorkbook|GOOGLE_DIRECTOR_SYNC/);
});
