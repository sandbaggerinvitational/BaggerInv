import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shared Home content renders before personalized tournament content", async () => {
  const commandCenter = await source("app/TournamentCommandCenter.js");
  const identity = commandCenter.indexOf("<TournamentIdentityHeader");
  const pulse = commandCenter.indexOf("{pulse}", identity);
  const moments = commandCenter.indexOf("<TournamentMoments", pulse);
  const schedule = commandCenter.indexOf("<TournamentSchedule", moments);
  const personalized = commandCenter.indexOf("<PersonalizedPlayerHome", schedule);
  assert.ok(identity >= 0 && identity < pulse && pulse < moments && moments < schedule && schedule < personalized);
});

test("personalized loading copy does not block or duplicate shared Home modules", async () => {
  const personalized = await source("app/PersonalizedPlayerHome.js");
  assert.match(personalized, /Loading your personalized tournament/);
  assert.match(personalized, /state === "loading"/);
  assert.doesNotMatch(personalized, /Preparing Tournament|TournamentPulse|TournamentMoments|TournamentSchedule/);
});

test("Home defers secondary stories, Net Skins, and completed-round history until idle", async () => {
  const [commandCenter, deferred, personalized] = await Promise.all([
    source("app/TournamentCommandCenter.js"),
    source("app/DeferredHomeContent.js"),
    source("app/PersonalizedPlayerHome.js"),
  ]);
  assert.match(commandCenter, /<DeferredHomeContent><TournamentMoments/);
  assert.match(deferred, /requestIdleCallback/);
  assert.match(personalized, /secondaryReady \? <PlayerNetSkins/);
  assert.match(personalized, /secondaryReady && matches\.length \? <MyRounds/);
});

test("Home initialization exposes every requested timing stage without changing JSON data", async () => {
  const [pipeline, passport, route, home] = await Promise.all([
    source("lib/participant-initialization.js"),
    source("lib/google-sheets-write.js"),
    source("app/api/player-passport/initialize/route.js"),
    source("app/PersonalizedPlayerHome.js"),
  ]);
  assert.match(route, /sessionValidationMs/);
  assert.match(route, /passportLookupMs/);
  assert.match(route, /tournamentDataMs/);
  assert.match(route, /personalizedDataMs/);
  assert.match(route, /totalHomeLoadMs/);
  assert.match(route, /slowestStage/);
  assert.match(route, /Server-Timing/);
  assert.match(route, /X-Home-Initialization-Cache/);
  assert.match(pipeline, /tournamentDataMs/);
  assert.match(passport, /personalizedDataMs/);
  assert.match(home, /clientTotal/);
  assert.match(route, /NextResponse\.json\(\{ active: true, previewMode: isPreviewImpersonationSession\(session\), player: initialized\.player, data: initialized\.personalized \}\)/);
});
