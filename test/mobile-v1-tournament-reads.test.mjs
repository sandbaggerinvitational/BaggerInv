import assert from "node:assert/strict";
import test from "node:test";
import {
  MOBILE_MATCHES_LIMITS,
  mobileLeadersResult,
  mobileMatchesResult,
  mobileRoundStandings,
  mobileScheduleResult,
  mobileTodayResult,
} from "../lib/mobile-v1-tournament-reads.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

const now = new Date("2026-09-24T12:00:00.000Z");
const identity = {
  playerId: "P1", tournamentId: "2026", displayName: "Player One",
  context: { team: { id: "T1", name: "Pickles" }, tournament: { id: "2026" } },
};
const source = () => ({ resolved: "supabase" });
const rpc = (data) => ({ payload: { ok: true, data } });

const guide = (rows = [{
  "Event ID": "welcome", "Event Date": "2026-09-24", "Start Time": "6:00 PM", "End Time": "7:30 PM",
  "Event Type": "Reception", Title: "Welcome Reception", Subtitle: "Opening night", Location: "Clubhouse",
}]) => rpc({
  projection_revision: 7, delivery_fingerprint: "guide-revision-7", published_at: "2026-09-20T12:00:00.000Z",
  content: { content: { tournamentIdentity: { timeZone: "America/New_York" }, schedule: rows } },
});

function tournament(status = "Live") {
  return {
    id: "2026", year: 2026, name: "Bagger Invitational", status, currentRound: 2, timeZone: "America/New_York",
    teamOne: { id: "T1", name: "Pickles", score: 4 }, teamTwo: { id: "T2", name: "Rippers", score: 3 },
  };
}

function match(id, status, playerIds = ["P1", "P2", "P3", "P4"], overrides = {}) {
  const playingHandicaps = [7.5, 11, 5.25, null];
  const strokes = [0, 4, 1, null];
  return {
    id, match: id.replace(/^M-?/, "") || "1", round: 2, format: "BB", formatName: "Best Ball", status,
    currentHole: status === "Live" ? 7 : 0,
    course: { id: "C1", name: "Ocean Course", tee: "Blue" }, teeTime: "8:10 AM",
    team1Players: playerIds.slice(0, 2).map((idValue, index) => ({
      id: idValue, name: `Player ${idValue}`, playingHcp: playingHandicaps[index], stroke: strokes[index],
    })),
    team2Players: playerIds.slice(2).map((idValue, index) => ({
      id: idValue, name: `Player ${idValue}`, playingHcp: playingHandicaps[index + 2], stroke: strokes[index + 2],
    })),
    team1PlayingHcp: null, team2PlayingHcp: null, team1Stroke: null, team2Stroke: null,
    finalResult: status === "Final" ? "Pickles win 2–1" : "", team1Points: 2, team2Points: 1,
    ...overrides,
  };
}

function matchesDependencies(rows, revision = "live-r2") {
  return {
    requireTournamentReadSource: source,
    readTournamentLiveView: async () => rpc({ marker: true }),
    readGuideProjection: async () => guide(),
    tournamentLiveDataFromSupabaseView: () => ({ revision, tournament: tournament(),
      rounds: [{ number: 2, label: "Round 2", format: "BB", matches: rows }] }),
    applyGuideCoursesToTournament: (value) => value,
  };
}

test("today maps canonical participant, live match, published schedule, and no-match states", async () => {
  const home = (matches) => rpc({ marker: matches });
  const dependencies = (matches) => ({
    requireHomeReadSource: source,
    readParticipantHomeView: async () => home(matches), readGuideProjection: async () => guide(),
    participantHomeDataFromSupabaseView: (view) => ({ revision: "home-r1", player: { id: "P1", name: "Player One" },
      participant: {}, liveData: { tournament: tournament(), rounds: [{ number: 2, label: "Round 2", format: "Best Ball", matches: view.marker }] } }),
    applyGuideProjectionToHome: (value) => value,
  });
  const live = await mobileTodayResult(identity, { now, dependencies: dependencies([match("M-LIVE", "Live")]) });
  assert.equal(live.body.data.currentMatch.matchId, "M-LIVE");
  assert.equal(live.body.data.currentMatch.status, "inProgress");
  assert.equal(live.body.data.currentMatch.authenticatedPlayer.involved, true);
  assert.deepEqual(live.body.data.currentMatch.authenticatedPlayer.partnerPlayerIds, ["P2"]);
  assert.equal(live.body.data.immediateSchedule[0].startAt, "2026-09-24T22:00:00.000Z");
  assert.equal(live.body.data.player.playerId, "P1");
  assert.equal(JSON.stringify(live.body).includes("canScore"), false);

  const complete = await mobileTodayResult(identity, { now, dependencies: dependencies([match("M-FINAL", "Final")]) });
  assert.equal(complete.body.data.currentMatch.status, "completed");
  assert.equal(complete.body.data.currentMatch.result.summary, "Pickles win 2–1");
  const none = await mobileTodayResult(identity, { now, dependencies: dependencies([match("OTHER", "Upcoming", ["P5", "P6", "P7", "P8"])]) });
  assert.equal(none.body.data.currentMatch, null);
});

test("matches preserves canonical ordering, lifecycle, relationships, and excludes scoring authority", async () => {
  const rows = [match("M3", "Final"), match("M1", "Upcoming"), match("M2", "Live")];
  const result = await mobileMatchesResult(identity, { now, dependencies: matchesDependencies(rows) });
  assert.deepEqual(result.body.data.matches.map((row) => row.matchId), ["M1", "M2", "M3"]);
  assert.deepEqual(result.body.data.matches.map((row) => row.status), ["scheduled", "inProgress", "completed"]);
  assert.deepEqual(result.body.data.matches.map((row) => row.displayMatchNumber), ["1", "2", "3"]);
  assert.equal(result.body.data.matches[1].progress.currentHole, 7);
  assert.equal(result.body.data.matches[2].result.teamOnePoints, 2);
  assert.equal(result.body.data.matches[0].teams[0].teamId, "T1");
  assert.equal(result.body.data.matches[0].teams[1].teamId, "T2");
  const serialized = JSON.stringify(result.body);
  for (const forbidden of ["scoringEnabled", "scoringLocked", "permission", "revision", "canScore", "Director"]) {
    if (forbidden === "revision") continue;
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("matches passes through canonical BB, SC, and SI Playing Handicap and stroke semantics", async () => {
  const rows = [
    match("M-BB", "Upcoming", ["P1", "P2", "P3", "P4"], { match: "1" }),
    match("M-SC", "Live", ["P1", "P2", "P3", "P4"], {
      match: "2", format: "SC", formatName: "Scramble",
      team1PlayingHcp: 3.5, team2PlayingHcp: 4.25, team1Stroke: 1, team2Stroke: 0,
    }),
    match("M-SI", "Final", ["P1", "P3"], {
      match: "3", format: "SI", formatName: "Singles",
      team1Players: [{ id: "P1", name: "Player One", playingHcp: -0.5, stroke: 2 }],
      team2Players: [{ id: "P3", name: "Player Three", playingHcp: 2.25, stroke: 0 }],
    }),
  ];
  const result = await mobileMatchesResult(identity, { now, dependencies: matchesDependencies(rows) });
  assertMobileV1Schema("matches", result.body);
  const [bestBall, scramble, singles] = result.body.data.matches;

  assert.deepEqual(bestBall.teams.map((team) => ({
    teamId: team.teamId,
    playingHandicap: team.playingHandicap,
    strokesReceived: team.strokesReceived,
  })), [
    { teamId: "T1", playingHandicap: null, strokesReceived: null },
    { teamId: "T2", playingHandicap: null, strokesReceived: null },
  ]);
  assert.deepEqual(bestBall.teams[0].participants.map((player) => [player.playingHandicap, player.strokesReceived]), [
    [7.5, 0], [11, 4],
  ]);
  assert.equal(bestBall.displayMatchNumber, "1");

  assert.deepEqual(scramble.teams.map((team) => [team.playingHandicap, team.strokesReceived]), [
    [3.5, 1], [4.25, 0],
  ]);
  assert.deepEqual(scramble.teams.flatMap((team) => team.participants).map((player) => player.strokesReceived),
    [null, null, null, null]);
  assert.equal(scramble.teams[0].participants[0].playingHandicap, 7.5);

  assert.deepEqual(singles.teams.map((team) => team.participants[0]).map((player) => [
    player.playingHandicap, player.strokesReceived,
  ]), [[-0.5, 2], [2.25, 0]]);
  assert.equal(singles.teams[0].participants.length, 1);
  assert.equal(singles.teams[1].participants.length, 1);

  const serialized = JSON.stringify(result.body);
  for (const forbidden of ["courseHandicap", "handicapIndex", "scoringEnabled", "permission", "holeScores", "matchRevision"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("matches ETag fingerprints the complete bounded representation", async () => {
  const build = async (playingHcp) => mobileMatchesResult(identity, { now, dependencies: matchesDependencies([
    match("M-ETAG", "Upcoming", ["P1", "P2", "P3", "P4"], {
      team1Players: [{ id: "P1", name: "Player One", playingHcp, stroke: 0 }],
    }),
  ], "same-live-revision") });
  const first = await build(7.5);
  const unchanged = await build(7.5);
  const changed = await build(7.75);
  assert.equal(first.revision, unchanged.revision);
  assert.notEqual(first.revision, changed.revision);
  assert.equal(first.body.meta.revision, first.revision);
});

test("matches fails closed when canonical participant, item, or byte bounds are exceeded", async () => {
  const tooManyParticipants = match("M-PARTICIPANTS", "Upcoming", ["P1", "P2", "P3", "P4"]);
  tooManyParticipants.team1Players.push({ id: "P5", name: "Player Five", playingHcp: 4, stroke: 0 });
  await assert.rejects(
    () => mobileMatchesResult(identity, { now, dependencies: matchesDependencies([tooManyParticipants]) }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  const tooManyMatches = Array.from({ length: MOBILE_MATCHES_LIMITS.matches + 1 }, (_, index) =>
    match(`M-${String(index + 1).padStart(3, "0")}`, "Upcoming"));
  await assert.rejects(
    () => mobileMatchesResult(identity, { now, dependencies: matchesDependencies(tooManyMatches) }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  const oversized = match("M-OVERSIZED", "Upcoming");
  oversized.team1Players[0].name = "X".repeat(MOBILE_MATCHES_LIMITS.responseBytes);
  await assert.rejects(
    () => mobileMatchesResult(identity, { now, dependencies: matchesDependencies([oversized]) }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );

  for (const invalid of [
    match("M-INVALID-HCP", "Upcoming", ["P1", "P2", "P3", "P4"], {
      team1Players: [{ id: "P1", name: "Player One", playingHcp: "not-a-number", stroke: 0 }],
    }),
    match("M-INVALID-STROKES", "Upcoming", ["P1", "P2", "P3", "P4"], {
      team1Players: [{ id: "P1", name: "Player One", playingHcp: 7.5, stroke: -1 }],
    }),
  ]) {
    await assert.rejects(
      () => mobileMatchesResult(identity, { now, dependencies: matchesDependencies([invalid]) }),
      (error) => error.code === "MOBILE_API_UNAVAILABLE",
    );
  }

  const whitespace = await mobileMatchesResult(identity, { now, dependencies: matchesDependencies([
    match("M-WHITESPACE", "Upcoming", ["P1", "P2", "P3", "P4"], {
      team1Players: [{ id: "P1", name: "Player One", playingHcp: "   ", stroke: "   " }],
    }),
  ]) });
  assert.equal(whitespace.body.data.matches[0].teams[0].participants[0].playingHandicap, null);
  assert.equal(whitespace.body.data.matches[0].teams[0].participants[0].strokesReceived, null);
});

test("leaders delegates canonical team/player ordering to the existing leaderboard helpers", async () => {
  const calls = [];
  const result = await mobileLeadersResult(identity, { now, dependencies: {
    requireLeaderboardsCoreReadSource: source, readLeaderboardsCoreView: async () => rpc({}),
    leaderboardsCoreDataFromSupabaseView: () => ({ revision: "leaders-r3", slotVerification: { pass: true },
      tournament: tournament(), rounds: [], leaderboard: [{ id: "P1" }], scoreLeaderboard: [] }),
    teamStandings: () => { calls.push("teams"); return [
      { rank: 1, side: 2, name: "Rippers", points: 5, record: "2-0-0", remaining: 1 },
      { rank: 2, side: 1, name: "Pickles", points: 4, record: "1-1-0", remaining: 1 },
    ]; },
    playerPerformanceRows: () => { calls.push("performance"); return [{ id: "P2", player: "Two", team: "Rippers", teamSide: 2, points: 3, record: "2-0-0" }]; },
    rankPlayerRows: (rows) => { calls.push("rank"); return rows.map((row) => ({ ...row, displayRank: 1 })); },
  } });
  assert.deepEqual(calls, ["teams", "performance", "rank"]);
  assert.equal(result.body.data.teamStandings[0].teamId, "T2");
  assert.deepEqual(result.body.data.roundStandings, []);
  assert.equal(result.body.data.playerStandings[0].playerId, "P2");
  assert.equal(result.body.data.playerStandings[0].rank, 1);
  assert.match(result.revision, /^[0-9a-f]{64}$/);
  assert.equal(result.body.meta.revision, result.revision);
});

test("round standings preserve canonical numeric order, half points, lifecycle, and empty future authority", () => {
  const final = (id, teamOnePoints, teamTwoPoints, winner) => ({
    id,
    round: 1,
    status: "Final",
    finalizedAt: "2026-09-24T12:00:00.000Z",
    expectedRoundMatchCount: 2,
    pointsAvailable: 3,
    team1Points: teamOnePoints,
    team2Points: teamTwoPoints,
    matchupWinner: winner,
  });
  const rows = mobileRoundStandings([
    { number: 10, label: "Finale", matches: [] },
    { number: 2, label: "Scramble", matches: [{ id: "M-LIVE", status: "Live" }] },
    { number: 1, label: "Best Ball", matches: [
      final("M1", 1.5, 1.5, "Halved"),
      final("M2", 2, 1, "Team 1"),
    ] },
  ], {
    status: "Live",
    currentRound: 2,
    teamOne: { id: "T1", name: "Pickles" },
    teamTwo: { id: "T2", name: "Rippers" },
  });

  assert.deepEqual(rows.map((row) => row.roundNumber), [1, 2, 10]);
  assert.deepEqual(rows.map((row) => row.status), ["final", "inProgress", "upcoming"]);
  assert.deepEqual(rows[0].teamStandings.map((row) => row.points), [3.5, 2.5]);
  assert.deepEqual(rows[0].teamStandings.map((row) => row.rank), [1, 2]);
  assert.equal(rows[0].teamStandings[0].record, "1-0-1");
  for (const future of rows.slice(1)) {
    assert.deepEqual(future.teamStandings.map((row) => row.points), [null, null]);
    assert.deepEqual(future.teamStandings.map((row) => row.rank), [null, null]);
  }
});

test("round standings fail closed on invalid final results and preserve canonical ties", () => {
  const rows = mobileRoundStandings([{
    number: 1,
    label: "Round One",
    matches: [{
      id: "INVALID-FINAL",
      status: "Final",
      finalizedAt: "2026-09-24T12:00:00.000Z",
      pointsAvailable: 3,
      team1Points: 2,
      team2Points: 2,
      matchupWinner: "Team 1",
    }],
  }], {
    status: "Final",
    currentRound: "FINAL",
    teamOne: { id: "T1", name: "A very long canonical team name" },
    teamTwo: { id: "T2", name: "Another very long canonical team name" },
  });
  assert.equal(rows[0].status, "upcoming");
  assert.deepEqual(rows[0].teamStandings.map((row) => row.points), [null, null]);
  assert.deepEqual(rows[0].teamStandings.map((row) => row.rank), [null, null]);

  const tied = mobileRoundStandings([{
    number: 1,
    label: "Round One",
    matches: [{
      id: "TIE",
      status: "Final",
      finalizedAt: "2026-09-24T12:00:00.000Z",
      pointsAvailable: 3,
      team1Points: 1.5,
      team2Points: 1.5,
      matchupWinner: "Halved",
    }],
  }], {
    status: "Final",
    currentRound: "FINAL",
    teamOne: { id: "T1", name: "Pickles" },
    teamTwo: { id: "T2", name: "Rippers" },
  });
  assert.deepEqual(tied[0].teamStandings.map((row) => row.points), [1.5, 1.5]);
  assert.deepEqual(tied[0].teamStandings.map((row) => row.rank), [1, 1]);
  assert.throws(
    () => mobileRoundStandings([{ number: 0, label: "Invalid", matches: [] }], tournament()),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
  assert.throws(
    () => mobileRoundStandings([
      { number: 1, label: "One", matches: [] },
      { number: 1, label: "Duplicate", matches: [] },
    ], tournament()),
    (error) => error.code === "MOBILE_API_UNAVAILABLE",
  );
});

test("leaders ETag changes when the bounded round representation changes under one source revision", async () => {
  const build = async (roundLabel) => mobileLeadersResult(identity, { now, dependencies: {
    requireLeaderboardsCoreReadSource: source,
    readLeaderboardsCoreView: async () => rpc({}),
    leaderboardsCoreDataFromSupabaseView: () => ({
      revision: "same-source-revision",
      slotVerification: { pass: true },
      tournament: tournament(),
      rounds: [{ number: 1, label: roundLabel, matches: [] }],
      leaderboard: [],
      scoreLeaderboard: [],
    }),
  } });
  const first = await build("Round One");
  const second = await build("Opening Round");
  assert.notEqual(first.revision, second.revision);
});

test("schedule exposes normalized published projection fields and stable optional nulls only", async () => {
  const rows = [{
    "Event ID": "round-1", "Event Date": "2026-09-25", "Start Time": "7:20 AM", "End Time": "12:00 PM",
    "Event Type": "Golf", Title: "Round 1", Location: "Ocean Course", Details: "internal long copy", Status: "Published",
  }, {
    "Event ID": "awards", "Event Date": "2026-09-26", "Start Time": "7:30 PM", "Event Type": "Awards", Title: "Awards",
  }];
  const result = await mobileScheduleResult(identity, { now, dependencies: { readGuideProjection: async () => guide(rows) } });
  assert.equal(result.body.data.timeZone, "America/New_York");
  assert.equal(result.body.data.events[0].startAt, "2026-09-25T11:20:00.000Z");
  assert.equal(result.body.data.events[1].endAt, null);
  assert.equal(result.body.data.events[1].location, null);
  const serialized = JSON.stringify(result.body);
  assert.equal(serialized.includes("internal long copy"), false);
  assert.equal(serialized.includes("Status"), false);
});

test("all read products fail closed when their Supabase source or RPC is unavailable", async () => {
  await assert.rejects(() => mobileTodayResult(identity, { dependencies: { requireHomeReadSource: () => ({ resolved: "google" }) } }),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");
  await assert.rejects(() => mobileMatchesResult(identity, { dependencies: { requireTournamentReadSource: source,
    readTournamentLiveView: async () => { throw new Error("secret database error"); }, readGuideProjection: async () => guide() } }),
  (error) => error.code === "MOBILE_API_UNAVAILABLE" && !error.message.includes("database"));
  await assert.rejects(() => mobileLeadersResult(identity, { dependencies: { requireLeaderboardsCoreReadSource: source,
    readLeaderboardsCoreView: async () => rpc({}), leaderboardsCoreDataFromSupabaseView: () => ({ slotVerification: { pass: false } }) } }),
  (error) => error.code === "MOBILE_API_UNAVAILABLE");
});
