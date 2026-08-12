import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchWithTransientRetry } from "../lib/transient-fetch.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("participant requests recover automatically after repeated reset-cycle transients", async () => {
  for (let cycle = 0; cycle < 5; cycle += 1) {
    let attempts = 0;
    const response = await fetchWithTransientRetry("/api/player-passport/initialize", {}, {
      delays: [0, 0],
      fetcher: async () => {
        attempts += 1;
        return { ok: attempts === 3, status: attempts === 3 ? 200 : 503 };
      },
    });
    assert.equal(response.status, 200);
    assert.equal(attempts, 3);
  }
});

test("participant retry does not mask an inactive Passport", async () => {
  let attempts = 0;
  const response = await fetchWithTransientRetry("/api/player-passport/session", {}, {
    delays: [0, 0],
    fetcher: async () => { attempts += 1; return { ok: false, status: 401 }; },
  });
  assert.equal(response.status, 401);
  assert.equal(attempts, 1);
});

test("participant retry stops immediately when navigation aborts obsolete work", async () => {
  const controller = new AbortController();
  let attempts = 0;
  await assert.rejects(
    fetchWithTransientRetry("/api/player-passport/initialize", { signal: controller.signal }, {
      delays: [0, 0],
      fetcher: async () => {
        attempts += 1;
        controller.abort();
        throw new DOMException("This operation was aborted", "AbortError");
      },
    }),
    { name: "AbortError" }
  );
  assert.equal(attempts, 1);
});

test("reset invalidates and warms tournament plus selected Passport identity before responding", async () => {
  const route = await source("app/api/director/reset-preview/route.js");
  const reset = route.indexOf("await resetPreviewTournament");
  const nextCache = route.indexOf("revalidateTag(GOOGLE_SHEETS_CACHE_TAG)", reset);
  const invalidate = route.indexOf("invalidateTournamentDataCache()", nextCache);
  const session = route.indexOf("verifyPlayerPassportSession(token)", invalidate);
  const invalidateParticipant = route.indexOf("invalidateParticipantInitialization(session)", session);
  const initializeParticipant = route.indexOf("initializeParticipantTournament(session)", invalidateParticipant);
  const response = route.indexOf("return NextResponse.json", initializeParticipant);
  assert.ok(reset >= 0 && reset < nextCache && nextCache < invalidate && invalidate < session);
  assert.ok(session < invalidateParticipant && invalidateParticipant < initializeParticipant && initializeParticipant < response);
  assert.match(route, /const token = playerPassportTokenFromRequest\(request\)/);
});

test("cache invalidation prevents an old in-flight snapshot from becoming authoritative", async () => {
  const loader = await source("app/live/sheetData.js");
  assert.match(loader, /let tournamentDataGeneration = 0/);
  assert.match(loader, /const generation = tournamentDataGeneration/);
  assert.match(loader, /generation === tournamentDataGeneration/);
  assert.match(loader, /export function invalidateTournamentDataCache/);
  assert.match(loader, /lastGoodTournamentData = undefined/);
});

test("Home retries transient Passport reads while My Match retries its selected server read without manual action", async () => {
  const [home, score] = await Promise.all([
    source("app/PersonalizedPlayerHome.js"),
    source("app/score/ScoreEntry.js"),
  ]);
  assert.match(home, /fetchWithTransientRetry\("\/api\/player-passport\/initialize"/);
  assert.match(score, /fetchWithTransientRetry\(dashboardOnly \? "\/api\/my-match" : "\/api\/player-passport\/initialize"/);
});

test("recovering participant screens hide implementation diagnostics until retries finish", async () => {
  const [recovery, homePage, home, score, tournament, leaderboards] = await Promise.all([
    source("app/TournamentInitializationRecovery.js"),
    source("app/home/page.js"),
    source("app/PersonalizedPlayerHome.js"),
    source("app/score/ScoreEntry.js"),
    source("app/live/TournamentDashboard.js"),
    source("app/live/LeaderboardsDashboard.js"),
  ]);
  assert.match(recovery, /Preparing Tournament/);
  assert.match(recovery, /fetchWithTransientRetry\("\/api\/live"/);
  assert.match(recovery, /state === "failed"/);
  assert.match(homePage, /TournamentInitializationRecovery/);
  assert.match(home, /Loading your personalized tournament/);
  assert.match(score, /Preparing your tournament/);
  assert.match(tournament, /Preparing Tournament/);
  assert.match(leaderboards, /Preparing Tournament/);
  for (const participantSource of [recovery, homePage, home, score, tournament, leaderboards]) {
    assert.doesNotMatch(participantSource, /Workbook check failed|Required normalized-sheet snapshot|Passport verification failed/);
  }
});
