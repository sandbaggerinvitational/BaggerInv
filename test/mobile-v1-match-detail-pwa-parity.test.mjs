import assert from "node:assert/strict";
import test from "node:test";

import {
  finalMatchSummary,
} from "../lib/game-center.js";
import {
  holeStory,
  segmentMatchResult,
} from "../lib/game-center-display.js";
import { gameCenterDataFromSupabaseView } from "../lib/game-center-supabase.js";
import { grossScoresFromCell } from "../lib/live-score-values.js";
import { mobileMatchDetailDataFromPreviewView } from "../lib/mobile-v1-match-detail.js";
import { runningMatchStatusAtHole } from "../lib/scoring-experience.js";

const identity = Object.freeze({
  tournamentId: "fx-2026",
  playerId: "fx-player-1",
  matchId: "match:round/3#opaque-2",
});

function canonicalFinalSinglesView() {
  const winners = [
    ...Array(6).fill("Team 1"),
    ...Array(6).fill("Halved"),
    "Team 1",
    ...Array(5).fill("Halved"),
  ];
  return {
    ok: true,
    tournament: {
      tournament_id: identity.tournamentId,
      tournament_year: 2026,
      name: "Synthetic Invitational",
    },
    round: { round_number: 3, name: "Singles", format: "SI", status: "FINAL" },
    match: {
      match_id: identity.matchId,
      round_number: 3,
      format: "SI",
      status: "FINAL",
      scoring_locked: true,
      scored_holes: 18,
      current_hole: 18,
      holes_remaining: 0,
      team_1_holes_won: 7,
      team_2_holes_won: 0,
      running_result: "Team 1 wins 7 & 5",
      result_winner: "Team 1",
      clinched: true,
      scorecard_complete: true,
      authority_updated_at: "2026-09-03T19:20:00.000Z",
      finalized_at: "2026-09-03T19:20:00.000Z",
      match_revision: 99,
    },
    presentation: {
      course_name: "Synthetic Ocean Course",
      course_logo: "synthetic-ocean-logo",
      course_yardage: "6793",
      tee_time: "10:10 AM",
      starting_hole: "1",
      display_match_number: "2",
      team_1_logo: "synthetic-pickles-logo",
      team_1_primary_color: "#00563f",
      team_1_secondary_color: "#c8a44d",
      team_2_logo: "synthetic-rippers-logo",
      team_2_primary_color: "#123456",
      team_2_secondary_color: "#abcdef",
      tournament_location: "Synthetic Island",
      tournament_logo: "synthetic-tournament-mark",
      tournament_status: "Final",
      tournament_time_zone: "America/New_York",
      source_updated_at: "2026-09-03T19:19:00.000Z",
      updated_at: "2026-09-03T19:19:30.000Z",
    },
    snapshot: {
      format: "SI",
      course_id: "fx-ocean",
      tee: "Gold",
      rating: 74.7,
      slope: 150,
      par: 72,
      team_configuration: {
        team_1_playing_handicap: null,
        team_2_playing_handicap: null,
        team_1_strokes: null,
        team_2_strokes: null,
      },
    },
    teams: [
      { team_id: "fx-team-1", team_side: 1, name: "Synthetic Pickles" },
      { team_id: "fx-team-2", team_side: 2, name: "Synthetic Rippers" },
    ],
    participants: [
      {
        player_id: identity.playerId,
        display_name: "Synthetic Player One",
        team_side: 1,
        player_slot: 1,
        playing_handicap: 17,
        final_strokes: 4,
        is_authenticated_player: true,
      },
      {
        player_id: "fx-player-2",
        display_name: "Synthetic Player Two",
        team_side: 2,
        player_slot: 1,
        playing_handicap: 12.9,
        final_strokes: 0,
        is_authenticated_player: false,
      },
    ],
    permissions: [
      { player_id: identity.playerId, can_score: false, permission_revision: 42 },
    ],
    holes: Array.from({ length: 18 }, (_, index) => ({
      hole_number: index + 1,
      stroke_index: index + 1,
      par: index % 3 === 0 ? 5 : 4,
      yardage: 350 + (index * 5),
    })),
    scores: winners.map((winner, index) => ({
      match_id: identity.matchId,
      hole_number: index + 1,
      team_1_gross_scores: [4],
      team_2_gross_scores: [5],
      team_1_strokes: [index < 4 ? 1 : 0],
      team_2_strokes: [0],
      team_1_net_score: index < 4 ? 3 : 4,
      team_2_net_score: 5,
      hole_winner: winner,
      hole_revision: index + 1,
      updated_at: `2026-09-03T19:${String(index).padStart(2, "0")}:00.000Z`,
    })),
    navigation: {
      previous: { id: "match:round/3#opaque-1", label: "Round 3, Match 1" },
      next: { id: "match:round/3#opaque-3", label: "Round 3, Match 3" },
      position: { round: 3, index: 2, total: 12 },
      round_match_index: 2,
      round_match_count: 12,
      previous_match_id: "match:round/3#opaque-1",
      next_match_id: "match:round/3#opaque-3",
      my_match_id: identity.matchId,
      is_my_match: true,
    },
    query_ms: 12,
  };
}

function expectedFlowSegment(pwa, start, end, { official = false } = {}) {
  const source = segmentMatchResult(
    pwa.holes,
    start,
    end,
    pwa.display.teamNames,
    official ? pwa.result : "",
  );
  const winnerSide = source.team === pwa.display.teamNames[1]
    ? 1
    : source.team === pwa.display.teamNames[2] ? 2 : null;
  return {
    winnerSide,
    result: source.recorded ? source.result : null,
    holesRecorded: source.recorded,
  };
}

test("mobile Match Detail preserves the participant PWA Game Center projection from one canonical view", () => {
  const source = canonicalFinalSinglesView();
  const pwa = gameCenterDataFromSupabaseView(source, identity.playerId);
  const mobile = mobileMatchDetailDataFromPreviewView(source, identity);
  const match = mobile.match;

  assert.deepEqual(mobile.tournament, {
    tournamentId: pwa.tournament.id,
    name: pwa.tournament.name,
    year: pwa.tournament.year,
    status: pwa.tournament.status,
    timeZone: pwa.tournament.timeZone,
    location: pwa.tournament.location,
  });
  assert.equal(match.matchId, pwa.match.id);
  assert.equal(match.displayMatchNumber, pwa.match.match);
  assert.deepEqual(match.round, {
    roundNumber: pwa.match.round,
    name: source.round.name,
    format: pwa.match.format,
    formatName: pwa.match.formatName,
  });
  assert.equal(match.status, "completed");
  assert.deepEqual(match.course, {
    courseId: pwa.match.course.id,
    name: pwa.display.course.name,
    tee: pwa.display.course.tee,
    yardage: Number(pwa.display.course.yardage),
    par: Number(pwa.display.course.par),
    rating: Number(pwa.display.course.rating),
    slope: Number(pwa.display.course.slope),
  });
  assert.equal(match.teeTime.label, pwa.match.teeTime);
  assert.equal(match.teeTime.timeZone, pwa.tournament.timeZone);

  const pwaTeams = [
    [pwa.tournament.teamOne, pwa.match.team1Players],
    [pwa.tournament.teamTwo, pwa.match.team2Players],
  ];
  for (const [index, [pwaTeam, pwaPlayers]] of pwaTeams.entries()) {
    const team = match.teams[index];
    assert.equal(team.teamId, pwaTeam.id);
    assert.equal(team.name, pwaTeam.name);
    assert.deepEqual(team.participants.map((player) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      playingHandicap: player.playingHandicap,
      strokesReceived: player.strokesReceived,
    })), pwaPlayers.map((player) => ({
      playerId: player.id,
      displayName: player.name,
      playingHandicap: player.playingHcp,
      strokesReceived: player.stroke,
    })));
  }
  assert.deepEqual(match.authenticatedPlayer, {
    involved: true,
    teamSide: pwa.participantSide,
    partnerPlayerIds: [],
    opponentPlayerIds: pwa.match.team2Players.map((player) => player.id),
  });

  assert.equal(match.progress.currentHole, pwa.match.currentHole);
  assert.equal(match.progress.holesPlayed, pwa.match.scoredHoles);
  assert.equal(match.progress.holesRemaining, pwa.match.holesRemaining);
  assert.equal(match.progress.statusText, source.match.running_result.replace("Team 1", pwa.display.teamNames[1]));
  assert.equal(match.result.summary, pwa.result);
  assert.equal(match.result.notation, "7 & 5");
  assert.equal(match.result.winnerSide, 1);
  assert.equal(match.result.winnerTeamId, pwa.tournament.teamOne.id);

  assert.deepEqual(match.navigation, {
    roundMatchIndex: pwa.navigation.position.index,
    roundMatchCount: pwa.navigation.position.total,
    previousMatchId: pwa.navigation.previous.id,
    nextMatchId: pwa.navigation.next.id,
    myMatchId: identity.matchId,
    isMyMatch: true,
  });

  const finalSummary = finalMatchSummary(
    pwa.match,
    pwa.holeScores,
    pwa.display.teamNames,
  );
  assert.deepEqual(match.clinch, {
    holeNumber: 13,
    winnerSide: 1,
    winnerTeamId: pwa.tournament.teamOne.id,
    summary: finalSummary,
  });

  const runningRows = pwa.holes.map((hole) => ({
    "Hole Number": hole.number,
    "Hole Winner": hole.winner,
  }));
  for (const [index, pwaHole] of pwa.holes.entries()) {
    const hole = match.scorecard.holes[index];
    const expectedWinnerSide = pwaHole.winner === "Team 1" ? 1
      : pwaHole.winner === "Team 2" ? 2 : null;
    const expectedStory = pwaHole.number >= 13
      ? pwaHole.number === 13 ? finalSummary : "The match was already decided on Hole 13."
      : holeStory(pwa.holes, pwaHole.number, pwa.display.teamNames);
    assert.equal(hole.holeNumber, pwaHole.number);
    assert.equal(hole.par, pwaHole.par);
    assert.equal(hole.yardage, pwaHole.yardage);
    assert.equal(hole.strokeIndex, pwaHole.strokeIndex);
    assert.equal(hole.winningSide, expectedWinnerSide);
    assert.equal(hole.resultLabel, expectedWinnerSide
      ? pwa.display.teamNames[expectedWinnerSide]
      : "Halved");
    assert.equal(hole.runningResult,
      runningMatchStatusAtHole(runningRows, pwaHole.number, pwa.display.teamNames));
    assert.equal(hole.story, expectedStory);
    assert.deepEqual(hole.sideOne.playerScores.map(({ gross, strokes }) => ({ gross, strokes })),
      grossScoresFromCell(pwaHole.team1Gross).map((gross, scoreIndex) => ({
        gross,
        strokes: pwaHole.team1Strokes[scoreIndex],
      })));
    assert.deepEqual(hole.sideTwo.playerScores.map(({ gross, strokes }) => ({ gross, strokes })),
      grossScoresFromCell(pwaHole.team2Gross).map((gross, scoreIndex) => ({
        gross,
        strokes: pwaHole.team2Strokes[scoreIndex],
      })));
    assert.equal(hole.sideOne.netScore, pwaHole.team1Net);
    assert.equal(hole.sideTwo.netScore, pwaHole.team2Net);
  }

  for (const [key, start, end] of [
    ["front", 1, 9],
    ["back", 10, 18],
    ["overall", 1, 18],
  ]) {
    const expected = expectedFlowSegment(pwa, start, end, { official: key === "overall" });
    assert.equal(match.flow[key].winnerSide, expected.winnerSide);
    assert.equal(match.flow[key].result, expected.result);
    assert.equal(match.flow[key].holesRecorded, expected.holesRecorded);
  }
  assert.deepEqual(match.stats, {
    holesPlayed: pwa.stats.played,
    sideOneHolesWon: pwa.stats.team1,
    halved: pwa.stats.halved,
    sideTwoHolesWon: pwa.stats.team2,
    biggestLead: pwa.stats.biggestLead,
    leadChanges: pwa.stats.leadChanges,
    holesRemaining: pwa.stats.remaining,
  });
  assert.equal(match.scorecard.state, "confirmed");
  assert.equal(match.scorecard.complete, true);
  assert.equal(match.scorecard.confirmedAt, pwa.match.finalizedAt);
  assert.equal(match.freshness.updatedAt, pwa.match.updatedAt);
  assert.equal(match.freshness.confirmedAt, pwa.match.finalizedAt);

  const encoded = JSON.stringify(mobile);
  for (const forbidden of [
    "permissions", "can_score", "permission_revision", "match_revision",
    "scoring_locked", "query_ms", "starting_hole", "updated_by",
  ]) assert.doesNotMatch(encoded, new RegExp(forbidden, "i"));
});

test("mobile Match Detail fails closed when canonical PWA score aggregates disagree", () => {
  const cases = [
    (source) => { source.match.scored_holes = 17; },
    (source) => { source.match.team_1_holes_won = 6; },
    (source) => { source.snapshot.format = "BB"; },
  ];
  for (const mutate of cases) {
    const source = canonicalFinalSinglesView();
    mutate(source);
    assert.throws(
      () => mobileMatchDetailDataFromPreviewView(source, identity),
      /mobile API is unavailable/i,
    );
  }
});
