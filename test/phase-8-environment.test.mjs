import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCTION_SPREADSHEET_ID,
  assertLiveScoringWriteEnvironment,
  assertPreviewSpreadsheetIsolation,
  liveTournamentV2Enabled,
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

test("preview routes expose a test-data label and a redacted environment check", () => {
  const scorePage = fs.readFileSync(new URL("../app/score/page.js", import.meta.url), "utf8");
  const livePage = fs.readFileSync(new URL("../app/live/page.js", import.meta.url), "utf8");
  const adminPage = fs.readFileSync(new URL("../app/admin/page.js", import.meta.url), "utf8");
  const diagnostic = fs.readFileSync(new URL("../app/api/preview-environment/route.js", import.meta.url), "utf8");
  assert.match(scorePage, /PreviewModeBadge/);
  assert.match(livePage, /PreviewModeBadge/);
  assert.match(adminPage, /previewMode/);
  assert.match(diagnostic, /productionIsolated/);
  assert.doesNotMatch(diagnostic, /GOOGLE_PRIVATE_KEY|GOOGLE_SERVICE_ACCOUNT_EMAIL/);
});
