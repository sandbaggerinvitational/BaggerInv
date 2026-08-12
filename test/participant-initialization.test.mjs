import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("every participant entry point uses one shared initialization pipeline", async () => {
  const [pipeline, activation, initializeRoute, matches, home, score, reset] = await Promise.all([
    source("lib/participant-initialization.js"),
    source("app/api/player-passport/activation/route.js"),
    source("app/api/player-passport/initialize/route.js"),
    source("app/api/player-passport/matches/route.js"),
    source("app/PersonalizedPlayerHome.js"),
    source("app/score/ScoreEntry.js"),
    source("app/api/director/reset-preview/route.js"),
  ]);
  assert.match(pipeline, /await getTournamentData\(\)[\s\S]*await readPlayerPassportMatches\(session,/);
  assert.match(pipeline, /const cache = new Map/);
  assert.match(pipeline, /const pending = new Map/);
  assert.match(activation, /initializeParticipantTournament\(session\)/);
  assert.match(initializeRoute, /initializeParticipantTournament\(session\)/);
  assert.match(initializeRoute, /resolveSupabaseParticipantIdentity/);
  assert.match(initializeRoute, /readMyMatchView/);
  assert.match(matches, /initializeParticipantTournament\(identity\.session\)/);
  assert.match(matches, /resolveSupabaseParticipantIdentity/);
  assert.match(home, /\/api\/player-passport\/initialize/);
  assert.match(score, /\/api\/player-passport\/initialize/);
  assert.match(reset, /invalidateParticipantInitialization\(session\)[\s\S]*initializeParticipantTournament\(session\)/);
});

test("personalized Home uses a focused loading state until initialization resolves", async () => {
  const [home, route] = await Promise.all([
    source("app/PersonalizedPlayerHome.js"),
    source("app/api/player-passport/initialize/route.js"),
  ]);
  assert.match(home, /state === "loading"/);
  assert.match(home, /Loading your personalized tournament/);
  assert.match(route, /initializing: true/);
  assert.match(route, /status: 503/);
  assert.doesNotMatch(route, /Workbook check failed|Required normalized-sheet snapshot|Passport verification failed/);
});

test("fresh activation commits the Passport before best-effort cache warming", async () => {
  const activation = await source("app/api/player-passport/activation/route.js");
  const activate = activation.indexOf("await activatePlayerPassport");
  const token = activation.indexOf("createPlayerPassportSession", activate);
  const warm = activation.indexOf("initializeParticipantTournament(session)", token);
  const cookie = activation.indexOf("response.cookies.set", warm);
  assert.ok(activate >= 0 && activate < token && token < warm && warm < cookie);
  assert.match(activation, /Activation is already committed/);
});
