import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCTION_SPREADSHEET_ID,
  assertLiveScoringWriteEnvironment,
  assertPreviewSpreadsheetIsolation,
  liveTournamentV2Enabled,
  mobileTournamentDashboardEnabled,
  previewEnvironmentDiagnostic,
} from "../lib/spreadsheet-environment.js";
import fs from "node:fs";

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try {
    return callback();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

test("preview reads cannot target the production spreadsheet", () => {
  withEnvironment({ VERCEL_ENV: "preview" }, () => {
    assert.throws(
      () => assertPreviewSpreadsheetIsolation(PRODUCTION_SPREADSHEET_ID),
      /blocked from the production spreadsheet/,
    );
  });
});

test("preview reads require an explicit spreadsheet", () => {
  withEnvironment({ VERCEL_ENV: "preview" }, () => {
    assert.throws(
      () => assertPreviewSpreadsheetIsolation(""),
      /preview-only GOOGLE_SHEETS_ID/,
    );
  });
});

test("live writes require test mode and a non-production spreadsheet", () => {
  withEnvironment({
    VERCEL_ENV: "preview",
    SCORING_ENVIRONMENT: "test",
    GOOGLE_SHEETS_ID: "preview-test-spreadsheet",
  }, () => assert.equal(assertLiveScoringWriteEnvironment(), "preview-test-spreadsheet"));

  withEnvironment({
    VERCEL_ENV: "preview",
    SCORING_ENVIRONMENT: "test",
    GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID,
  }, () => assert.throws(() => assertLiveScoringWriteEnvironment(), /blocked from the production spreadsheet/));
});

test("Phase 8 is enabled only by its explicit feature flag", () => {
  withEnvironment({ NEXT_PUBLIC_LIVE_TOURNAMENT_V2_ENABLED: undefined }, () => {
    assert.equal(liveTournamentV2Enabled(), false);
  });
  withEnvironment({ NEXT_PUBLIC_LIVE_TOURNAMENT_V2_ENABLED: "true" }, () => {
    assert.equal(liveTournamentV2Enabled(), true);
  });
});

test("preview routes expose a safe environment check", () => {
  const scorePage = fs.readFileSync(new URL("../app/score/page.js", import.meta.url), "utf8");
  const livePage = fs.readFileSync(new URL("../app/live/page.js", import.meta.url), "utf8");
  const adminPage = fs.readFileSync(new URL("../app/admin/page.js", import.meta.url), "utf8");
  const diagnostic = fs.readFileSync(new URL("../app/api/preview-environment/route.js", import.meta.url), "utf8");
  const environmentHelper = fs.readFileSync(new URL("../lib/spreadsheet-environment.js", import.meta.url), "utf8");
  assert.match(scorePage, /PreviewModeBadge/);
  assert.match(livePage, /PreviewModeBadge/);
  assert.match(adminPage, /previewMode/);
  assert.match(diagnostic, /previewEnvironmentDiagnostic/);
  assert.match(environmentHelper, /productionIsolated/);
  assert.doesNotMatch(diagnostic, /GOOGLE_PRIVATE_KEY|GOOGLE_SERVICE_ACCOUNT_EMAIL/);
  assert.doesNotMatch(environmentHelper, /GOOGLE_PRIVATE_KEY|GOOGLE_SERVICE_ACCOUNT_EMAIL/);
});

test("preview diagnostic exposes only safe environment state", () => {
  withEnvironment({
    GOOGLE_SHEETS_ID: "isolated-preview-sheet",
    SCORING_ENVIRONMENT: "test",
    NEXT_PUBLIC_LIVE_TOURNAMENT_V2_ENABLED: "true",
  }, () => {
    const diagnostic = previewEnvironmentDiagnostic();
    assert.deepEqual(Object.keys(diagnostic), [
      "environment",
      "productionIsolated",
      "scoringEnvironment",
      "liveTournamentV2Enabled",
      "scoringEnabled",
      "tournamentModeEnabled",
      "googleSheetsIdConfigured",
    ]);
    assert.deepEqual(diagnostic, {
      environment: "preview",
      productionIsolated: true,
      scoringEnvironment: "test",
      liveTournamentV2Enabled: true,
      scoringEnabled: true,
      tournamentModeEnabled: true,
      googleSheetsIdConfigured: true,
    });
    assert.equal(JSON.stringify(diagnostic).includes("isolated-preview-sheet"), false);
  });
});

test("preview diagnostic blocks scoring when data is missing or production-backed", () => {
  withEnvironment({
    GOOGLE_SHEETS_ID: undefined,
    SCORING_ENVIRONMENT: "test",
    NEXT_PUBLIC_LIVE_TOURNAMENT_V2_ENABLED: undefined,
  }, () => {
    assert.deepEqual(previewEnvironmentDiagnostic(), {
      environment: "preview",
      productionIsolated: false,
      scoringEnvironment: "test",
      liveTournamentV2Enabled: false,
      scoringEnabled: false,
      tournamentModeEnabled: false,
      googleSheetsIdConfigured: false,
    });
  });

  withEnvironment({
    GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID,
    SCORING_ENVIRONMENT: "test",
    NEXT_PUBLIC_LIVE_TOURNAMENT_V2_ENABLED: "true",
  }, () => {
    const diagnostic = previewEnvironmentDiagnostic();
    assert.equal(diagnostic.productionIsolated, false);
    assert.equal(diagnostic.scoringEnabled, false);
    assert.equal(diagnostic.googleSheetsIdConfigured, true);
  });
});

test("Tournament Mode remains available to participant Home without replacing the public homepage", () => {
  const homePage = fs.readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const participantHomePage = fs.readFileSync(new URL("../app/home/page.js", import.meta.url), "utf8");
  const mobileHome = fs.readFileSync(new URL("../app/MobileTournamentHome.js", import.meta.url), "utf8");
  const commandCenter = fs.readFileSync(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8");
  const tournamentSchedule = fs.readFileSync(new URL("../app/TournamentSchedule.js", import.meta.url), "utf8");
  const menu = fs.readFileSync(new URL("../app/Menu.js", import.meta.url), "utf8");

  withEnvironment({ NEXT_PUBLIC_LIVE_TOURNAMENT_V2_ENABLED: "true" }, () => {
    assert.equal(mobileTournamentDashboardEnabled({ status: "Upcoming" }), true);
    assert.equal(mobileTournamentDashboardEnabled({ status: "Live" }), true);
    assert.equal(mobileTournamentDashboardEnabled(null), false);
  });
  assert.doesNotMatch(homePage, /mobileTournamentDashboardEnabled|MobileTournamentHome/);
  assert.match(participantHomePage, /MobileTournamentHome/);
  for (const section of [
    "Today’s Schedule",
    "Tournament Pulse",
  ]) {
    assert.match(`${commandCenter}\n${tournamentSchedule}`, new RegExp(section));
  }
  assert.match(commandCenter, /View Leaderboards/);
  assert.doesNotMatch(commandCenter, /Tournament Leaders/);
  assert.doesNotMatch(commandCenter, /Featured Match|Tournament Timeline|Live Records/);
  assert.match(menu, /Open Tournament Hub/);
});
