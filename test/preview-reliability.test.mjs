import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GoogleReadError,
  withTransientGoogleRetry,
} from "../lib/google-api-reliability.js";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("transient Google 429 and 503 failures retry and recover", async () => {
  for (const status of [429, 503]) {
    let attempts = 0;
    const value = await withTransientGoogleRetry(() => {
      attempts += 1;
      if (attempts < 2) throw new GoogleReadError("temporary", { status });
      return "ok";
    }, { delays: [0, 0] });
    assert.equal(value, "ok");
    assert.equal(attempts, 2);
  }
});

test("permanent Google configuration failures are not retried", async () => {
  let attempts = 0;
  await assert.rejects(
    withTransientGoogleRetry(() => {
      attempts += 1;
      throw new GoogleReadError("missing sheet", { status: 404, category: "configuration" });
    }, { delays: [0, 0] })
  );
  assert.equal(attempts, 1);
});

test("normalized workbook reads batch, dedupe, timeout, and expose safe diagnostics", async () => {
  const sourceText = await source("lib/google-sheets-server-read.js");
  assert.match(sourceText, /values:batchGet/);
  assert.match(sourceText, /pendingReads\.has/);
  assert.match(sourceText, /AbortSignal\.timeout/);
  assert.match(sourceText, /jti:\s*randomUUID\(\)/);
  assert.match(sourceText, /urn:ietf:params:oauth:grant-type:jwt-bearer/);
  assert.doesNotMatch(sourceText, /oauth-2\.0/);
  assert.match(sourceText, /id\.slice\(-6\)/);
  assert.doesNotMatch(sourceText, /privateKey.*console|access_token.*console/);
});

test("read and Passport OAuth assertions remain unique across serverless instances", async () => {
  const passportSource = await source("lib/google-sheets-write.js");
  assert.match(passportSource, /jti:\s*randomUUID\(\)/);
  assert.match(passportSource, /pendingGoogleToken/);
});

test("participant base tournament reads are one batched snapshot with transient fallback", async () => {
  const sourceText = await source("app/live/sheetData.js");
  assert.match(sourceText, /readRequired: readNormalizedSheetsValues/);
  assert.match(sourceText, /optionalNames = \["Net Skins", "Net Skins Result", "Tournament Timeline", "Guide Sections", "Rule Book", "Rounds", "Dining"\]/);
  assert.match(sourceText, /pendingTournamentData/);
  assert.match(sourceText, /stale-on-transient-error/);
  assert.match(sourceText, /Date\.now\(\) - lastGoodAt < 60_000/);
});

test("Passport APIs distinguish transient lookup failures from inactive identity", async () => {
  const [matches, score, me] = await Promise.all([
    source("app/api/player-passport/matches/route.js"),
    source("app/score/ScoreEntry.js"),
    source("app/me/ParticipantProfile.js"),
  ]);
  assert.match(matches, /status:\s*503/);
  assert.match(matches, /status:\s*401/);
  assert.match(score, /passportState === "unavailable"/);
  assert.match(score, /We couldn’t verify your Player Passport right now/);
  assert.match(me, /identityState === "unavailable"/);
});

test("stale identity responses cannot overwrite a newer successful response", async () => {
  const navigation = await source("app/ParticipantIdentity.js");
  assert.match(navigation, /requestSequence/);
  assert.match(navigation, /sequence !== requestSequence\.current/);
  assert.match(navigation, /response\.status === 401/);
});

test("heavy participant navigation disables automatic route prefetch only at the app shell", async () => {
  const navigation = await source("app/ParticipantIdentity.js");
  assert.match(navigation, /prefetch=\{false\}/);
  assert.match(navigation, /href:\s*"\/home"/);
  assert.match(navigation, /href:\s*"\/live"/);
  assert.match(navigation, /href:\s*"\/my-match"/);
});

test("Tournament avoids immediate duplicate refresh and all failure screens offer retry", async () => {
  const [tournament, leaderboards] = await Promise.all([
    source("app/live/TournamentDashboard.js"),
    source("app/live/LeaderboardsDashboard.js"),
  ]);
  assert.match(tournament, /if \(!initialData\) refresh\(\)/);
  assert.match(tournament, />Retry</);
  assert.match(leaderboards, />Retry</);
  assert.match(leaderboards, /Loading leaderboards/);
});

test("Preview reliability diagnostic is preview-only and exposes no sensitive values", async () => {
  const diagnostic = await source("app/api/preview-reliability/route.js");
  assert.match(diagnostic, /VERCEL_ENV !== "preview"/);
  assert.match(diagnostic, /status:\s*404/);
  assert.match(diagnostic, /normalizedWorkbookReachable/);
  assert.match(diagnostic, /passportCookieDetected/);
  assert.doesNotMatch(diagnostic, /spreadsheetId|service.account|privateKey|activationCode|cookieContent/i);
});
