import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  activePreparedStorylines,
  calculateCompetitionDerivedFromData,
  competitionDerivedDataFromView,
  TEAM_MOMENTUM_ENGINE_VERSION,
  TOURNAMENT_STORYLINES_ENGINE_VERSION,
} from "../lib/competition-derived-supabase.js";
import { momentumReadEnvironment, storylinesReadEnvironment } from "../lib/competition-derived-read-source.js";

const referenceTime = Date.parse("2026-08-12T18:00:00Z");
const official = (id, match, winner, { format = "BB", frontWinner = winner, backWinner = winner } = {}) => ({
  id, match: String(match), round: 1, format, status: "Final", finalizedAt: "2026-08-12T17:30:00Z",
  frontWinner, backWinner, overallWinner: winner, matchupWinner: winner,
  team1Points: winner === "Team 1" ? 3 : 0, team2Points: winner === "Team 2" ? 3 : 0,
  pointsAvailable: 3,
});

function data() {
  return {
    tournament: { id: "2026", year: 2026, status: "Live", currentRound: 2,
      teamOne: { name: "The Pickles", score: 6 }, teamTwo: { name: "Lipp It and Rip It", score: 3 } },
    rounds: [{ number: 1, label: "Round 1", matches: [
      official("2026-R1-1", 1, "Team 1"), official("2026-R1-2", 2, "Team 2"),
    ] }, { number: 2, label: "Round 2", matches: [{
      id: "2026-R2-1", match: "1", round: 2, format: "BB", status: "Live", currentHole: 3,
      holeResults: [{ holeNumber: 1, winner: "Team 1", updatedAt: "2026-08-12T17:59:00Z" }],
    }] }],
    leaderboard: [{ id: "CB01", player: "Clay Beltran", points: 2, wins: 1, losses: 0, halves: 0, matchesPlayed: 1 }],
    scoreLeaderboard: [{ id: "CB01", round: 1, entityType: "PLAYER", holes: 18, gross: 72, net: 68 }],
    netSkins: { rounds: [{ round: 1, finalized: true, resultState: "OFFICIAL", sourceFingerprint: "a", configurationFingerprint: "b", payloadHash: "c",
      skins: [{ winnerPlayerId: "CB01", winner: "Clay Beltran", skinValue: 120 }] }] },
    sourceRevision: { matches: [{ matchId: "2026-R2-1", matchRevision: 1 }], holes: [{ matchId: "2026-R2-1", holeNumber: 1, holeRevision: 1 }] },
    presentation: { fingerprint: "presentation-1" },
  };
}

test("shared derived adapter reuses the existing engines with deterministic fingerprints", () => {
  const first = calculateCompetitionDerivedFromData(data(), { referenceTime });
  const second = calculateCompetitionDerivedFromData(data(), { referenceTime });
  assert.equal(first.momentum.sourceFingerprint, second.momentum.sourceFingerprint);
  assert.equal(first.storylines.sourceFingerprint, second.storylines.sourceFingerprint);
  assert.equal(TEAM_MOMENTUM_ENGINE_VERSION, "team-momentum-js-v1");
  assert.equal(TOURNAMENT_STORYLINES_ENGINE_VERSION, "tournament-storylines-js-v1");
});

test("an in-flight hole revision invalidates Storylines but not official-result Momentum", () => {
  const before = calculateCompetitionDerivedFromData(data(), { referenceTime });
  const changed = data();
  changed.rounds[1].matches[0].holeResults.push({ holeNumber: 2, winner: "Team 2", updatedAt: "2026-08-12T18:00:00Z" });
  changed.sourceRevision.holes.push({ matchId: "2026-R2-1", holeNumber: 2, holeRevision: 1 });
  const after = calculateCompetitionDerivedFromData(changed, { referenceTime });
  assert.equal(after.momentum.sourceFingerprint, before.momentum.sourceFingerprint);
  assert.notEqual(after.storylines.sourceFingerprint, before.storylines.sourceFingerprint);
});

test("an official result transition changes the Momentum dependency and output", () => {
  const before = calculateCompetitionDerivedFromData(data(), { referenceTime });
  const changed = data();
  changed.rounds[0].matches.push(official("2026-R1-3", 3, "Team 1"));
  const after = calculateCompetitionDerivedFromData(changed, { referenceTime });
  assert.notEqual(after.momentum.sourceFingerprint, before.momentum.sourceFingerprint);
  assert.match(after.momentum.value.teamOne, /last/);
});

test("prepared Storylines persist semantic copy without time-relative labels", () => {
  const calculated = calculateCompetitionDerivedFromData(data(), { referenceTime });
  assert.ok(calculated.storylines.stories.length > 0);
  for (const story of calculated.storylines.stories) {
    assert.equal(Object.hasOwn(story, "freshnessLabel"), false);
    assert.equal(Object.hasOwn(story, "priorityScore"), false);
    assert.equal(typeof story.headline, "string");
    assert.equal(typeof story.detail, "string");
  }
});

test("read-time expiry removes a prepared recent-clinch story without recalculating the engine", () => {
  const payload = { stories: [{ id: "clinch-x", expiresAt: "2026-08-12T18:01:00Z" }, { id: "team-race", expiresAt: null }] };
  assert.deepEqual(activePreparedStorylines(payload, Date.parse("2026-08-12T18:00:00Z")).map((row) => row.id), ["clinch-x", "team-race"]);
  assert.deepEqual(activePreparedStorylines(payload, Date.parse("2026-08-12T18:02:00Z")).map((row) => row.id), ["team-race"]);
});

test("derived read marks an engine stale from its coalesced dependency job", () => {
  const result = competitionDerivedDataFromView({
    snapshots: [{ engine_key: "TEAM_MOMENTUM", result_payload: { momentum: { teamOne: "A", teamTwo: "B" } }, source_fingerprint: "a" }],
    jobs: [{ engine_key: "TEAM_MOMENTUM", status: "PENDING" }], query_ms: 1,
  });
  assert.equal(result.metadata.momentum.stale, true);
  assert.deepEqual(result.momentum, { teamOne: "A", teamTwo: "B" });
});

test("Preview flags fail closed to application outside an isolated Preview deployment", () => {
  const preview = { VERCEL_ENV: "preview", GOOGLE_SHEETS_ID: "preview", PREVIEW_SCORING_SHEET_ID: "preview",
    SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY: "server",
    MOMENTUM_READ_SOURCE: "supabase", STORYLINES_READ_SOURCE: "supabase" };
  assert.equal(momentumReadEnvironment(preview).resolved, "supabase");
  assert.equal(storylinesReadEnvironment(preview).resolved, "supabase");
  assert.equal(momentumReadEnvironment({ ...preview, VERCEL_ENV: "production" }).resolved, "application");
  assert.equal(storylinesReadEnvironment({ ...preview, VERCEL_ENV: "production" }).resolved, "application");
});

test("migration preserves restrictive RLS and event-driven coalesced jobs", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202608120035_preview_momentum_storylines_derived_state.sql", import.meta.url), "utf8");
  assert.match(sql, /competition_derived_runs enable row level security/);
  assert.match(sql, /revoke all on scoring_authority\.competition_derived_runs from public, anon, authenticated/);
  assert.match(sql, /TOURNAMENT_STORYLINES', 'SCORE_CHANGE'/);
  assert.match(sql, /TEAM_MOMENTUM', 'OFFICIAL_RESULT_CHANGE'/);
  assert.match(sql, /on conflict \(tournament_id, round_number, engine_key\) do update/);
  assert.doesNotMatch(sql, /using\s*\(true\)/i);
});

test("participant reads consume prepared state and never calculate Storylines on Home", async () => {
  const [home, command, tournament, scoring] = await Promise.all([
    readFile(new URL("../app/api/participant/home/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentCommandCenter.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tournament/live/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/scoring/current/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(home, /currentCompetitionDerivedState/);
  assert.match(command, /preparedStorylines/);
  assert.match(tournament, /momentumSource = "supabase"/);
  assert.doesNotMatch(home, /tournamentStorylines\(/);
  assert.match(scoring, /after\(async \(\) =>/);
  assert.match(scoring, /recalculateCompetitionDerivedTournament/);
});

test("secondary failures retain the core Home and Tournament payload with explicit unavailable state", async () => {
  const [home, tournament] = await Promise.all([
    readFile(new URL("../app/api/participant/home/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tournament/live/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(home, /STORYLINES_UNAVAILABLE/);
  assert.match(home, /preparedStorylines = prepared\?\.moments \|\| \[\]/);
  assert.match(tournament, /MOMENTUM_UNAVAILABLE/);
  assert.match(tournament, /data\.momentum = prepared\.momentum/);
});
