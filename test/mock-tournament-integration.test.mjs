import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  authenticatedPreviewReadsEnabled,
} from "../lib/google-sheets-server-read.js";

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

const sheetData = fs.readFileSync(new URL("../app/live/sheetData.js", import.meta.url), "utf8");
const homePage = fs.readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const livePage = fs.readFileSync(new URL("../app/live/page.js", import.meta.url), "utf8");
const matchCenter = fs.readFileSync(new URL("../app/live/MatchCenter.js", import.meta.url), "utf8");
const myMatch = fs.readFileSync(new URL("../app/score/page.js", import.meta.url), "utf8");
const scoreEntry = fs.readFileSync(new URL("../app/score/ScoreEntry.js", import.meta.url), "utf8");
const mePage = fs.readFileSync(new URL("../app/me/page.js", import.meta.url), "utf8");
const diagnostic = fs.readFileSync(new URL("../app/api/preview-environment/route.js", import.meta.url), "utf8");

test("Preview mobile tournament payload uses authenticated normalized tabs", () => {
  withEnvironment({ VERCEL_ENV: "preview" }, () => {
    assert.equal(authenticatedPreviewReadsEnabled(), true);
  });
  withEnvironment({ VERCEL_ENV: "production" }, () => {
    assert.equal(authenticatedPreviewReadsEnabled(), false);
  });
  assert.match(sheetData, /readNormalizedSheetValues/);
  for (const tab of [
    "Live Matches",
    "Matches",
    "Live Tournaments",
    "Players",
    "Team Names",
    "Tournaments",
    "Courses",
    "Tournament Rules",
  ]) {
    assert.match(sheetData, new RegExp(`fetchSheet\\("${tab}"\\)`));
  }
  assert.doesNotMatch(sheetData, /Website Feed/);
});

test("Home, Tournament, and Leaderboards share the normalized tournament payload", () => {
  assert.match(homePage, /getTournamentData/);
  assert.match(homePage, /mobileTournamentDashboardEnabled\(liveData\?\.tournament\)/);
  assert.match(livePage, /getTournamentData/);
  assert.match(matchCenter, /view"\) === "leaderboards"/);
  assert.doesNotMatch(homePage, /Website Feed/);
  assert.doesNotMatch(livePage, /Website Feed/);
  assert.doesNotMatch(matchCenter, /Website Feed/);
});

test("Upcoming normalized tournaments retain mobile dashboard and empty standings behavior", () => {
  assert.match(homePage, /TournamentCommandCenter/);
  assert.match(matchCenter, /Player Standings/);
  assert.match(matchCenter, /No points have been decided in this round yet/);
  assert.match(matchCenter, /tournament\.teamOne\.score/);
  assert.match(matchCenter, /tournament\.teamTwo\.score/);
});

test("My Match, Passport identity, Me, and Preview isolation remain wired", () => {
  assert.match(myMatch, /ScoreEntry/);
  assert.match(scoreEntry, /api\/player-passport\/matches/);
  assert.match(scoreEntry, /api\/player-passport\/session/);
  assert.match(mePage, /ParticipantProfile/);
  assert.match(diagnostic, /previewEnvironmentDiagnostic/);
  assert.doesNotMatch(sheetData, /PRODUCTION_SPREADSHEET_ID/);
});
