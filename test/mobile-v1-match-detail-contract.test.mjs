import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const contractDirectory = new URL("../contracts/mobile/v1/", import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, contractDirectory), "utf8"));

async function contractValidator() {
  const [shared, matchDetail] = await Promise.all([
    readJson("shared.schema.json"),
    readJson("match-detail.schema.json"),
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, allowUnionTypes: true });
  addFormats(ajv);
  shared.$id = new URL("shared.schema.json", contractDirectory).href;
  matchDetail.$id = new URL("match-detail.schema.json", contractDirectory).href;
  ajv.addSchema(shared);
  return ajv.compile(matchDetail);
}

let fixturePromise;
async function fixtures() {
  fixturePromise ||= readJson("match-detail-fixtures.json");
  return fixturePromise;
}

function scoreFor({ scope, side, participants, played, holeNumber, strokeCase, largeStrokes }) {
  const appliedStroke = strokeCase === "zero" ? 0
    : largeStrokes && holeNumber === 1 && side === 2 ? 9
      : holeNumber === 1 && side === 2 ? 1 : 0;
  if (scope === "team") {
    return {
      side,
      scope,
      playerScores: [],
      teamScore: played ? { gross: side === 1 ? 4 : 5, strokes: appliedStroke } : null,
      netScore: played ? (side === 1 ? 4 : 5 - appliedStroke) : null,
    };
  }
  return {
    side,
    scope,
    playerScores: participants.map(({ playerId }, index) => ({
      playerId,
      gross: played ? 4 + index + (side === 2 ? 1 : 0) : null,
      strokes: played ? (index === 0 ? appliedStroke : 0) : null,
    })),
    teamScore: null,
    netScore: played ? 4 : null,
  };
}

function buildResponse(input, scenario) {
  const participantCount = scenario.expectedPlayersPerSide;
  const participantsOne = input.teams[0].participants.slice(0, participantCount);
  const participantsTwo = input.teams[1].participants.slice(0, participantCount);
  const teamMode = scenario.format === "SC";
  const teams = [
    { ...input.teams[0], playingHandicap: teamMode ? 3.5 : null, strokesReceived: teamMode ? 1 : null, participants: participantsOne },
    { ...input.teams[1], playingHandicap: teamMode ? 1.0 : null, strokesReceived: teamMode ? 0 : null, participants: participantsTwo },
  ];
  if (teamMode) {
    teams.forEach((team) => {
      team.participants = team.participants.map((player) => ({ ...player, playingHandicap: null, strokesReceived: null }));
    });
  }
  if (scenario.negativePlayingHandicap) {
    teams[0].participants[0] = { ...teams[0].participants[0], playingHandicap: -2.75 };
  }
  if (scenario.longIdentityNames) {
    teams[0].name = "Synthetic Team With A Deliberately Long Participant-Facing Name";
    teams[0].participants[0] = {
      ...teams[0].participants[0],
      displayName: "Synthetic Golfer With A Deliberately Long Display Name",
    };
  }
  const outcomeForHole = (holeNumber) => {
    if (holeNumber > scenario.holesPlayed) return "unplayed";
    if (scenario.resultCase === "earlyClinch") {
      return holeNumber <= 6 || holeNumber === 13 ? "sideOne" : "halved";
    }
    if (scenario.resultCase === "halved") return holeNumber % 2 ? "sideOne" : "sideTwo";
    if (scenario.leadChangeCase === "multiple") {
      return ["sideOne", "sideTwo", "sideTwo", "sideOne"][((holeNumber - 1) % 4)];
    }
    if (scenario.leadChangeCase === "none") return holeNumber === 1 ? "sideOne" : "halved";
    return holeNumber % 3 === 1 ? "sideOne" : holeNumber % 3 === 2 ? "sideTwo" : "halved";
  };
  const holes = Array.from({ length: 18 }, (_, index) => {
    const holeNumber = index + 1;
    const played = holeNumber <= scenario.holesPlayed;
    const state = outcomeForHole(holeNumber);
    const winningSide = state === "sideOne" ? 1 : state === "sideTwo" ? 2 : null;
    return {
      holeNumber,
      par: 3 + (holeNumber % 3),
      yardage: 150 + (holeNumber * 17),
      strokeIndex: holeNumber,
      state,
      official: played,
      winningSide,
      sideOne: scoreFor({ scope: scenario.scoreScope, side: 1, participants: teams[0].participants, played, holeNumber, strokeCase: scenario.strokeCase, largeStrokes: scenario.largeStrokes }),
      sideTwo: scoreFor({ scope: scenario.scoreScope, side: 2, participants: teams[1].participants, played, holeNumber, strokeCase: scenario.strokeCase, largeStrokes: scenario.largeStrokes }),
      resultLabel: played ? (winningSide === 1 ? "Side 1" : winningSide === 2 ? "Side 2" : "Halved") : null,
      runningResult: played ? "Synthetic running result" : null,
      story: played ? `Synthetic canonical story for Hole ${holeNumber}.` : null,
      updatedAt: played ? `2026-09-03T${String(12 + Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 10).padStart(2, "0")}:00.000Z` : null,
    };
  });
  const completed = scenario.status === "completed";
  const halved = scenario.resultCase === "halved";
  const involved = scenario.authenticatedPlayerInvolved;
  const playedHoles = holes.filter(({ state }) => state !== "unplayed");
  const calculateStats = (values) => {
    let running = 0;
    let biggestLead = 0;
    let leadChanges = 0;
    let priorLeader = 0;
    for (const { state } of values) {
      if (state === "sideOne") running += 1;
      if (state === "sideTwo") running -= 1;
      biggestLead = Math.max(biggestLead, Math.abs(running));
      const leader = Math.sign(running);
      if (leader && priorLeader && leader !== priorLeader) leadChanges += 1;
      if (leader) priorLeader = leader;
    }
    return { running, biggestLead, leadChanges };
  };
  const overallStats = calculateStats(playedHoles);
  const segment = (start, end, final = false) => {
    const values = holes.slice(start - 1, end).filter(({ state }) => state !== "unplayed");
    const { running } = calculateStats(values);
    return {
      status: values.length === 0 ? "notStarted" : final ? "final" : running === 0 ? "allSquare" : "leading",
      winnerSide: running === 0 ? null : running > 0 ? 1 : 2,
      result: values.length === 0 ? null : running === 0 ? "All Square" : `${Math.abs(running)} UP`,
      holesRecorded: values.length,
    };
  };
  const notation = halved ? "Halved" : scenario.resultCase === "earlyClinch"
    ? "7 & 5" : `${Math.abs(overallStats.running)} UP`;
  const winnerSide = halved || overallStats.running === 0 ? null : overallStats.running > 0 ? 1 : 2;
  return {
    ok: true,
    apiVersion: "v1",
    data: {
      tournament: input.tournament,
      match: {
        matchId: `fx-${scenario.scenarioId}`,
        displayMatchNumber: scenario.scorecardState === "unavailable" ? null : scenario.format === "SI" ? "12" : "3",
        round: { roundNumber: scenario.format === "BB" ? 1 : scenario.format === "SC" ? 2 : 3, name: scenario.formatName, format: scenario.format, formatName: scenario.formatName },
        status: scenario.status,
        course: scenario.missingCourse ? null : {
          courseId: "fx-course",
          name: "Synthetic Course",
          tee: scenario.missingOptionalCourseMetrics ? null : "Gold",
          yardage: scenario.missingOptionalCourseMetrics ? null : 6512,
          par: scenario.missingOptionalCourseMetrics ? null : 72,
          rating: scenario.missingOptionalCourseMetrics ? null : 71.925,
          slope: scenario.missingOptionalCourseMetrics ? null : 136,
        },
        teeTime: scenario.scorecardState === "unavailable" ? null : { localTime: "08:00:00", label: "8:00 AM", timeZone: "America/New_York" },
        teams,
        authenticatedPlayer: {
          involved,
          teamSide: involved ? 1 : null,
          partnerPlayerIds: involved && participantCount === 2 ? [teams[0].participants[1].playerId] : [],
          opponentPlayerIds: involved ? teams[1].participants.map(({ playerId }) => playerId) : [],
        },
        progress: { currentHole: scenario.holesPlayed, holesPlayed: scenario.holesPlayed, holesRemaining: 18 - scenario.holesPlayed, statusText: scenario.holesPlayed ? "Synthetic running result" : null },
        result: scenario.status === "scheduled" ? null : {
          summary: halved ? "Match Halved" : `${teams[(winnerSide || 1) - 1].name} ${notation}`,
          notation,
          winnerSide,
          winnerTeamId: winnerSide ? teams[winnerSide - 1].teamId : null,
        },
        navigation: { roundMatchIndex: scenario.format === "SI" ? 12 : 3, roundMatchCount: scenario.format === "SI" ? 12 : 6, previousMatchId: "fx-previous", nextMatchId: completed ? null : "fx-next", myMatchId: involved ? `fx-${scenario.scenarioId}` : "fx-my-match", isMyMatch: involved },
        scorecard: { state: scenario.scorecardState, complete: completed || scenario.holesPlayed === 18, confirmedAt: completed ? "2026-09-03T19:00:00.000Z" : null, holes },
        flow: { front: segment(1, 9, completed), back: segment(10, 18, completed), overall: segment(1, 18, completed) },
        clinch: scenario.resultCase === "earlyClinch" ? { holeNumber: 13, winnerSide: 1, winnerTeamId: "fx-team-1", summary: "Synthetic Pickles clinched on Hole 13." } : null,
        stats: {
          holesPlayed: scenario.holesPlayed,
          sideOneHolesWon: playedHoles.filter(({ state }) => state === "sideOne").length,
          halved: playedHoles.filter(({ state }) => state === "halved").length,
          sideTwoHolesWon: playedHoles.filter(({ state }) => state === "sideTwo").length,
          biggestLead: overallStats.biggestLead,
          leadChanges: overallStats.leadChanges,
          holesRemaining: 18 - scenario.holesPlayed,
        },
        freshness: { updatedAt: scenario.holesPlayed ? "2026-09-03T19:00:00.000Z" : null, confirmedAt: completed ? "2026-09-03T19:00:00.000Z" : null },
      },
    },
    meta: { generatedAt: "2026-09-03T19:00:01.000Z", revision: `fx-${scenario.scenarioId}-r1` },
  };
}

async function responses() {
  const input = await fixtures();
  return input.scenarios.map((scenario) => [scenario, buildResponse(input, scenario)]);
}

function validationMessage(validate) {
  return (validate.errors || []).map(({ instancePath, message }) => `${instancePath || "/"} ${message}`).join("; ");
}

test("strict Match Detail contract accepts bounded synthetic BB, SC, SI, and unavailable fixtures", async () => {
  const validate = await contractValidator();
  for (const [scenario, response] of await responses()) {
    assert.equal(validate(response), true, `${scenario.scenarioId}: ${validationMessage(validate)}`);
    assert.equal(response.data.match.scorecard.holes.length, 18);
    assert.equal(response.data.match.teams.length, 2);
    assert.ok(response.data.match.teams.every((team) => team.participants.length <= 2));
  }
});

test("per-hole score shape is unambiguous for BB, Scramble, and Singles", async () => {
  const values = Object.fromEntries((await responses()).map(([scenario, response]) => [scenario.format, response]));
  for (const format of ["BB", "SI"]) {
    const hole = values[format].data.match.scorecard.holes[0];
    assert.equal(hole.sideOne.scope, "players");
    assert.equal(hole.sideOne.teamScore, null);
    assert.ok(hole.sideOne.playerScores.length >= 1 && hole.sideOne.playerScores.length <= 2);
  }
  const scramble = values.SC.data.match.scorecard.holes[0];
  assert.equal(scramble.sideOne.scope, "team");
  assert.deepEqual(scramble.sideOne.playerScores, []);
  assert.deepEqual(scramble.sideOne.teamScore, { gross: 4, strokes: 0 });
});

test("schema rejects cross-scope scoring ambiguity", async () => {
  const validate = await contractValidator();
  const [, bestBall] = (await responses()).find(([scenario]) => scenario.format === "BB");
  const invalidPlayers = structuredClone(bestBall);
  invalidPlayers.data.match.scorecard.holes[0].sideOne.teamScore = { gross: 4, strokes: 0 };
  assert.equal(validate(invalidPlayers), false);

  const [, scramble] = (await responses()).find(([scenario]) => scenario.format === "SC");
  const invalidTeam = structuredClone(scramble);
  invalidTeam.data.match.scorecard.holes[0].sideOne.playerScores = [{ playerId: "fx-player-1", gross: 4, strokes: 0 }];
  assert.equal(validate(invalidTeam), false);
});

test("schema enforces one Match, two teams, at most two players per side, and exactly 18 holes", async () => {
  const validate = await contractValidator();
  const [, response] = (await responses())[0];
  const tooManyHoles = structuredClone(response);
  tooManyHoles.data.match.scorecard.holes.push(structuredClone(tooManyHoles.data.match.scorecard.holes[17]));
  assert.equal(validate(tooManyHoles), false);

  const incompleteHoleAuthority = structuredClone(response);
  incompleteHoleAuthority.data.match.scorecard.holes.pop();
  assert.equal(validate(incompleteHoleAuthority), false);

  const tooManyPlayers = structuredClone(response);
  tooManyPlayers.data.match.teams[0].participants.push(structuredClone(tooManyPlayers.data.match.teams[0].participants[0]));
  assert.equal(validate(tooManyPlayers), false);
});

test("schema requires canonical official, result, story, completeness, navigation, and freshness facts", async () => {
  const validate = await contractValidator();
  const [, response] = (await responses())[0];
  for (const path of ["official", "resultLabel", "story"]) {
    const invalid = structuredClone(response);
    delete invalid.data.match.scorecard.holes[0][path];
    assert.equal(validate(invalid), false, `missing ${path} must fail`);
  }
  for (const path of ["complete"]) {
    const invalid = structuredClone(response);
    delete invalid.data.match.scorecard[path];
    assert.equal(validate(invalid), false, `missing scorecard.${path} must fail`);
  }
  for (const path of ["roundMatchIndex", "roundMatchCount", "myMatchId", "isMyMatch"]) {
    const invalid = structuredClone(response);
    delete invalid.data.match.navigation[path];
    assert.equal(validate(invalid), false, `missing navigation.${path} must fail`);
  }
});

test("schema preserves exact numeric Playing Handicap and course rating values", async () => {
  const validate = await contractValidator();
  const [, response] = (await responses()).find(([scenario]) => scenario.scenarioId === "singles-final-owned-official");
  assert.equal(response.data.match.teams[0].participants[0].playingHandicap, 7.5);
  assert.equal(response.data.match.course.rating, 71.925);
  assert.equal(validate(response), true, validationMessage(validate));
});

test("strict participant contract rejects scoring authority, permission, revision, and diagnostic leakage", async () => {
  const validate = await contractValidator();
  const [, response] = (await responses())[0];
  const forbiddenFields = [
    "permissions", "canScore", "matchRevision", "permissionRevision", "actor", "diagnostics",
    "courseHandicap", "authUuid", "participantEmail", "accessToken", "refreshToken", "certification",
  ];
  for (const field of forbiddenFields) {
    const invalid = structuredClone(response);
    invalid.data.match[field] = field === "permissions" ? [] : true;
    assert.equal(validate(invalid), false, `${field} must remain outside participant Match Detail`);
  }
});

test("schema aligns canonical IDs, format cardinality, and handicap scopes with the server projection", async () => {
  const validate = await contractValidator();
  const built = await responses();
  const [, bestBall] = built.find(([scenario]) => scenario.format === "BB" && scenario.status === "inProgress");
  const [, scramble] = built.find(([scenario]) => scenario.format === "SC" && scenario.status === "inProgress");
  const [, singles] = built.find(([scenario]) => scenario.format === "SI" && scenario.status === "inProgress");

  const invalidTeamName = structuredClone(bestBall);
  invalidTeamName.data.match.teams[0].name = null;
  assert.equal(validate(invalidTeamName), false);

  const invalidNavigationId = structuredClone(bestBall);
  invalidNavigationId.data.match.navigation.previousMatchId = "not a canonical ID";
  assert.equal(validate(invalidNavigationId), false);

  const invalidBestBallCount = structuredClone(bestBall);
  invalidBestBallCount.data.match.teams[0].participants.pop();
  assert.equal(validate(invalidBestBallCount), false);

  const invalidBestBallScoreCount = structuredClone(bestBall);
  invalidBestBallScoreCount.data.match.scorecard.holes[0].sideOne.playerScores.pop();
  assert.equal(validate(invalidBestBallScoreCount), false);

  const invalidSinglesCount = structuredClone(singles);
  invalidSinglesCount.data.match.teams[0].participants.push(structuredClone(invalidSinglesCount.data.match.teams[0].participants[0]));
  assert.equal(validate(invalidSinglesCount), false);

  const invalidScrambleParticipantStrokes = structuredClone(scramble);
  invalidScrambleParticipantStrokes.data.match.teams[0].participants[0].strokesReceived = 1;
  assert.equal(validate(invalidScrambleParticipantStrokes), false);

  const invalidBestBallTeamHandicap = structuredClone(bestBall);
  invalidBestBallTeamHandicap.data.match.teams[0].playingHandicap = 3.25;
  assert.equal(validate(invalidBestBallTeamHandicap), false);
});

test("schema rejects contradictory lifecycle, winner, and unplayed-score state", async () => {
  const validate = await contractValidator();
  const built = await responses();
  const [, scheduled] = built.find(([scenario]) => scenario.status === "scheduled");
  const [, live] = built.find(([scenario]) => scenario.status === "inProgress");
  const [, final] = built.find(([scenario]) => scenario.status === "completed" && scenario.resultCase !== "halved");

  const scheduledComplete = structuredClone(scheduled);
  scheduledComplete.data.match.scorecard.complete = true;
  assert.equal(validate(scheduledComplete), false);

  const liveConfirmed = structuredClone(live);
  liveConfirmed.data.match.freshness.confirmedAt = "2026-09-03T20:00:00.000Z";
  assert.equal(validate(liveConfirmed), false);

  const finalUnconfirmed = structuredClone(final);
  finalUnconfirmed.data.match.scorecard.confirmedAt = null;
  assert.equal(validate(finalUnconfirmed), false);

  const winnerWithoutTeam = structuredClone(final);
  winnerWithoutTeam.data.match.result.winnerTeamId = null;
  assert.equal(validate(winnerWithoutTeam), false);

  const unplayedScore = structuredClone(live);
  const unplayedHole = unplayedScore.data.match.scorecard.holes.find(({ state }) => state === "unplayed");
  unplayedHole.sideOne.playerScores[0].gross = 4;
  assert.equal(validate(unplayedScore), false);

  const impossibleNotStarted = structuredClone(live);
  impossibleNotStarted.data.match.flow.front = {
    status: "notStarted", winnerSide: null, result: "All Square", holesRecorded: 1,
  };
  assert.equal(validate(impossibleNotStarted), false);

  const emptyAllSquare = structuredClone(live);
  emptyAllSquare.data.match.flow.front = {
    status: "allSquare", winnerSide: null, result: null, holesRecorded: 0,
  };
  assert.equal(validate(emptyAllSquare), false);

  const winnerlessLead = structuredClone(live);
  winnerlessLead.data.match.flow.front = {
    status: "leading", winnerSide: null, result: "1 UP", holesRecorded: 4,
  };
  assert.equal(validate(winnerlessLead), false);

  const emptyFinal = structuredClone(final);
  emptyFinal.data.match.flow.overall = {
    status: "final", winnerSide: 1, result: null, holesRecorded: 0,
  };
  assert.equal(validate(emptyFinal), false);

  const scheduledPlayedHole = structuredClone(scheduled);
  scheduledPlayedHole.data.match.scorecard.holes[0] = structuredClone(live.data.match.scorecard.holes[0]);
  assert.equal(validate(scheduledPlayedHole), false);

  const scheduledStats = structuredClone(scheduled);
  scheduledStats.data.match.stats.sideOneHolesWon = 1;
  assert.equal(validate(scheduledStats), false);

  const scheduledFlow = structuredClone(scheduled);
  scheduledFlow.data.match.flow.overall = structuredClone(live.data.match.flow.overall);
  assert.equal(validate(scheduledFlow), false);
});

test("fixtures are synthetic and contain all required participant Match Detail domain states", async () => {
  const input = await fixtures();
  assert.equal(input.synthetic, true);
  assert.deepEqual(new Set(input.scenarios.map(({ format }) => format)), new Set(["BB", "SC", "SI"]));
  for (const format of ["BB", "SC", "SI"]) {
    assert.deepEqual(
      new Set(input.scenarios.filter((scenario) => scenario.format === format).map(({ status }) => status)),
      new Set(["scheduled", "inProgress", "completed"]),
      `${format} must cover Upcoming, Live, and Final`,
    );
  }
  assert.deepEqual(new Set(input.scenarios.map(({ scorecardState }) => scorecardState)), new Set(["inProgress", "confirmed", "unavailable"]));
  assert.ok(input.scenarios.some(({ authenticatedPlayerInvolved }) => authenticatedPlayerInvolved));
  assert.ok(input.scenarios.some(({ authenticatedPlayerInvolved }) => !authenticatedPlayerInvolved));
  assert.ok(input.scenarios.some(({ resultCase }) => resultCase === "halved"));
  assert.ok(input.scenarios.some(({ resultCase }) => resultCase === "earlyClinch"));
  assert.ok(input.scenarios.some(({ leadChangeCase }) => leadChangeCase === "none"));
  assert.ok(input.scenarios.some(({ leadChangeCase }) => leadChangeCase === "multiple"));
  assert.ok(input.scenarios.some(({ strokeCase }) => strokeCase === "zero"));
  assert.ok(input.scenarios.some(({ strokeCase }) => strokeCase === "positive"));
  assert.ok(input.scenarios.some(({ negativePlayingHandicap }) => negativePlayingHandicap));
  assert.ok(input.scenarios.some(({ missingCourse }) => missingCourse));
  assert.ok(input.scenarios.some(({ missingOptionalCourseMetrics }) => missingOptionalCourseMetrics));
  assert.ok(input.scenarios.some(({ longIdentityNames }) => longIdentityNames));
  assert.ok(input.scenarios.some(({ largeStrokes }) => largeStrokes));

  const built = await responses();
  const [, negativeHandicap] = built.find(([scenario]) => scenario.negativePlayingHandicap);
  assert.equal(negativeHandicap.data.match.teams[0].participants[0].playingHandicap, -2.75);
  const [, halved] = built.find(([scenario]) => scenario.resultCase === "halved");
  assert.equal(halved.data.match.result.winnerSide, null);
  assert.equal(halved.data.match.clinch, null);
  const [, earlyClinch] = built.find(([scenario]) => scenario.resultCase === "earlyClinch");
  assert.equal(earlyClinch.data.match.clinch.holeNumber, 13);
  const clinchHoles = earlyClinch.data.match.scorecard.holes;
  const leadAfter = (holeNumber) => clinchHoles.slice(0, holeNumber).reduce((lead, hole) => (
    lead + (hole.state === "sideOne" ? 1 : hole.state === "sideTwo" ? -1 : 0)
  ), 0);
  assert.ok(Math.abs(leadAfter(12)) <= 6, "the Match must still be alive after Hole 12");
  assert.ok(Math.abs(leadAfter(13)) > 5, "Hole 13 must be the first mathematically clinching hole");
  const [, missingCourse] = built.find(([scenario]) => scenario.missingCourse);
  assert.equal(missingCourse.data.match.course, null);
  const [, missingOptionalCourseMetrics] = built.find(([scenario]) => scenario.missingOptionalCourseMetrics);
  assert.equal(missingOptionalCourseMetrics.data.match.course.name, "Synthetic Course");
  assert.equal(missingOptionalCourseMetrics.data.match.course.rating, null);
  const [, longIdentity] = built.find(([scenario]) => scenario.longIdentityNames);
  assert.match(longIdentity.data.match.teams[0].participants[0].displayName, /Deliberately Long/);
  const [, largeStrokes] = built.find(([scenario]) => scenario.largeStrokes);
  assert.equal(largeStrokes.data.match.scorecard.holes[0].sideTwo.playerScores[0].strokes, 9);
});
