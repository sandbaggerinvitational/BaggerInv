import assert from "node:assert/strict";
import test from "node:test";
import {
  mobileLeadersResult,
  mobileMatchesResult,
  mobileScheduleResult,
  mobileTodayResult,
} from "../lib/mobile-v1-tournament-reads.js";

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

function match(id, status, playerIds = ["P1", "P2", "P3", "P4"]) {
  return {
    id, round: 2, format: "BB", formatName: "Best Ball", status, currentHole: status === "Live" ? 7 : 0,
    course: { id: "C1", name: "Ocean Course", tee: "Blue" }, teeTime: "8:10 AM",
    team1Players: playerIds.slice(0, 2).map((idValue) => ({ id: idValue, name: `Player ${idValue}` })),
    team2Players: playerIds.slice(2).map((idValue) => ({ id: idValue, name: `Player ${idValue}` })),
    finalResult: status === "Final" ? "Pickles win 2–1" : "", team1Points: 2, team2Points: 1,
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
  const result = await mobileMatchesResult(identity, { now, dependencies: {
    requireTournamentReadSource: source,
    readTournamentLiveView: async () => rpc({ marker: true }), readGuideProjection: async () => guide(),
    tournamentLiveDataFromSupabaseView: () => ({ revision: "live-r2", tournament: tournament(),
      rounds: [{ number: 2, label: "Round 2", format: "BB", matches: rows }] }),
    applyGuideCoursesToTournament: (value) => value,
  } });
  assert.deepEqual(result.body.data.matches.map((row) => row.matchId), ["M1", "M2", "M3"]);
  assert.deepEqual(result.body.data.matches.map((row) => row.status), ["scheduled", "inProgress", "completed"]);
  assert.equal(result.body.data.matches[1].progress.currentHole, 7);
  assert.equal(result.body.data.matches[2].result.teamOnePoints, 2);
  const serialized = JSON.stringify(result.body);
  for (const forbidden of ["scoringEnabled", "scoringLocked", "permission", "revision", "canScore", "Director"]) {
    if (forbidden === "revision") continue;
    assert.equal(serialized.includes(forbidden), false);
  }
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
  assert.equal(result.body.data.playerStandings[0].playerId, "P2");
  assert.equal(result.body.data.playerStandings[0].rank, 1);
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
