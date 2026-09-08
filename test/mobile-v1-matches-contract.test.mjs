import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MOBILE_MATCHES_LIMITS } from "../lib/mobile-v1-tournament-reads.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function fixtureResponse() {
  const fixtures = JSON.parse(await source("contracts/mobile/v1/fixtures.json"));
  return {
    ok: true,
    apiVersion: "v1",
    data: {
      tournament: {
        tournamentId: "2026",
        name: "Fixture Invitational",
        year: 2026,
        status: "Live",
        currentRound: 2,
        timeZone: "America/Chicago",
      },
      matches: fixtures.matches,
    },
    meta: { generatedAt: "2026-09-24T12:00:00.000Z", revision: "fixture-matches-r1" },
  };
}

test("strict matches schema accepts bounded BB, SC, and SI participant fixtures", async () => {
  const response = await fixtureResponse();
  await assertMobileV1Schema("matches", response);
  assert.equal(response.data.matches.length, 3);
  assert.ok(response.data.matches.length <= MOBILE_MATCHES_LIMITS.matches);
  assert.ok(Buffer.byteLength(JSON.stringify(response), "utf8") <= MOBILE_MATCHES_LIMITS.responseBytes);

  const [bestBall, scramble, singles] = response.data.matches;
  assert.equal(bestBall.round.format, "Best Ball");
  assert.deepEqual(bestBall.teams[0].participants.map((player) => player.strokesReceived), [0, 4]);
  assert.equal(bestBall.teams[0].participants[0].playingHandicap, 7.5);
  assert.equal(bestBall.teams[1].participants[1].playingHandicap, null);

  assert.equal(scramble.round.format, "Scramble");
  assert.deepEqual(scramble.teams.map((team) => [team.playingHandicap, team.strokesReceived]), [
    [3.5, 1], [4.25, 0],
  ]);
  assert.ok(scramble.teams.flatMap((team) => team.participants)
    .every((player) => player.strokesReceived === null));

  assert.equal(singles.round.format, "Singles");
  assert.deepEqual(singles.teams.map((team) => team.participants.length), [1, 1]);
  assert.equal(singles.teams[0].participants[0].playingHandicap, -0.5);
  assert.equal(singles.teams[1].participants[0].strokesReceived, 0);
});

test("strict matches schema requires additive identity and Match intelligence keys", async () => {
  const response = await fixtureResponse();
  const missingTeamId = structuredClone(response);
  delete missingTeamId.data.matches[0].teams[0].teamId;
  await assert.rejects(() => assertMobileV1Schema("matches", missingTeamId));

  const missingPlayingHandicap = structuredClone(response);
  delete missingPlayingHandicap.data.matches[0].teams[0].participants[0].playingHandicap;
  await assert.rejects(() => assertMobileV1Schema("matches", missingPlayingHandicap));

  const missingStrokes = structuredClone(response);
  delete missingStrokes.data.matches[0].teams[0].participants[0].strokesReceived;
  await assert.rejects(() => assertMobileV1Schema("matches", missingStrokes));

  const missingDisplayNumber = structuredClone(response);
  delete missingDisplayNumber.data.matches[0].displayMatchNumber;
  await assert.rejects(() => assertMobileV1Schema("matches", missingDisplayNumber));

  const forbiddenAuthority = structuredClone(response);
  forbiddenAuthority.data.matches[0].teams[0].participants[0].courseHandicap = 8;
  await assert.rejects(() => assertMobileV1Schema("matches", forbiddenAuthority));
});

test("matches authority remains a service-only Tournament Live pass-through", async () => {
  const [migration, adapter, schema] = await Promise.all([
    source("supabase/migrations/202608120025_preview_tournament_live_reads.sql"),
    source("lib/mobile-v1-tournament-reads.js"),
    source("contracts/mobile/v1/matches.schema.json"),
  ]);
  for (const canonical of [
    "mp.playing_handicap",
    "mp.final_strokes",
    "ss.team_configuration",
    "gp.match_sort_order",
  ]) assert.match(migration, new RegExp(canonical.replaceAll(".", "\\.")));
  assert.match(migration, /grant execute on function public\.read_tournament_live_view\(text\) to service_role/);
  assert.match(migration, /revoke all on function public\.read_tournament_live_view\(text\) from public, anon, authenticated/);

  for (const passThrough of ["playingHcp", "stroke", "team1PlayingHcp", "team1Stroke", "match.match"]) {
    assert.match(adapter, new RegExp(passThrough.replaceAll(".", "\\.")));
  }
  for (const forbidden of ["courseHandicap", "handicapIndex", "scoring/current", "strokeIndex", "canScore"]) {
    assert.doesNotMatch(adapter, new RegExp(forbidden.replace("/", "\\/")));
    assert.doesNotMatch(schema, new RegExp(forbidden.replace("/", "\\/")));
  }
});
