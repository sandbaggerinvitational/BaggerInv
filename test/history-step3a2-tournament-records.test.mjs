import assert from "node:assert/strict";
import test from "node:test";
import {
  build2025TournamentRecords,
  classify2025TournamentRecordScorecard,
} from "../lib/history-2025-tournament-records.js";

const pars = Array(18).fill(4);
const players = {
  A: "Alpha Golfer",
  B: "Bravo Golfer",
  C: "Charlie Golfer",
  D: "Delta Golfer",
};
const teams = [
  {
    id: "T1",
    name: "Team One",
    side: "Team 1",
    roster: ["A", "B"].map((id) => ({ player: { "Player ID": id, "Display Name": players[id] } })),
  },
  {
    id: "T2-CANONICAL",
    name: "Team Two",
    side: "Team 2",
    roster: ["C", "D"].map((id) => ({ player: { "Player ID": id, "Display Name": players[id] } })),
  },
];

function match(id, round, format, matchNumber) {
  return {
    "Match ID": id,
    Year: 2025,
    Round: round,
    Match: matchNumber,
    Format: format,
    "Team 1 Player 1": "A",
    "Team 1 Player 2": format === "SI" ? "" : "B",
    "Team 2 Player 1": "C",
    "Team 2 Player 2": format === "SI" ? "" : "D",
  };
}

const matches = [
  match("2025-R1-1", 1, "BB", 1),
  match("2025-R2-1", 2, "SC", 1),
  match("2025-R3-1", 3, "SI", 1),
];

function card({
  matchId,
  round,
  format,
  scoreType,
  scores,
  playerId,
  teamId,
  side,
  status = "COMPLETE",
  year = 2025,
}) {
  const holes = scores.map((score, index) => ({
    holeNumber: index + 1,
    score,
    par: pars[index],
    toPar: score === null ? null : score - pars[index],
  }));
  const completedHoleCount = holes.filter((hole) => hole.score !== null).length;
  const firstNine = holes.slice(0, 9);
  const backNine = holes.slice(9);
  return {
    year,
    matchId,
    round,
    matchNumber: 1,
    format,
    courseId: `C${round}`,
    courseName: ["Old Course", "Scramble Course", "Singles Course"][round - 1],
    tee: "Test",
    scoreType,
    playerId,
    playerName: players[playerId],
    participantPlayerIds: playerId ? [playerId] : [],
    participantNames: playerId ? [players[playerId]] : [],
    teamId,
    teamName: teamId,
    side,
    status,
    holes,
    completedHoleCount,
    frontNine: firstNine.every((hole) => hole.score !== null) ? firstNine.reduce((sum, hole) => sum + hole.score, 0) : null,
    backNine: backNine.every((hole) => hole.score !== null) ? backNine.reduce((sum, hole) => sum + hole.score, 0) : null,
    total: completedHoleCount === 18 ? holes.reduce((sum, hole) => sum + hole.score, 0) : null,
  };
}

const allPar = Array(18).fill(4);
const oneBirdie = [3, ...Array(17).fill(4)];
const oneBogey = [5, ...Array(17).fill(4)];
const twoBirdiesAndEagle = [3, 2, 3, ...Array(15).fill(4)];
const threeBirdiesEagleAndBogey = [3, 3, 3, 2, 5, ...Array(13).fill(4)];
const scramble60 = [...Array(9).fill(3), ...Array(3).fill(3), ...Array(6).fill(4)];

function fixtureScorecards() {
  return [
    card({ matchId: "2025-R1-1", round: 1, format: "BB", scoreType: "INDIVIDUAL", playerId: "A", side: 1, scores: oneBirdie }),
    card({ matchId: "2025-R1-1", round: 1, format: "BB", scoreType: "INDIVIDUAL", playerId: "B", side: 1, scores: allPar }),
    card({ matchId: "2025-R1-1", round: 1, format: "BB", scoreType: "INDIVIDUAL", playerId: "C", side: 2, scores: oneBogey }),
    card({ matchId: "2025-R2-1", round: 2, format: "SC", scoreType: "TEAM", teamId: "T1", side: 1, scores: scramble60 }),
    card({ matchId: "2025-R2-1", round: 2, format: "SC", scoreType: "TEAM", teamId: "SOURCE-TWO", scores: scramble60 }),
    card({ matchId: "2025-R3-1", round: 3, format: "SI", scoreType: "INDIVIDUAL", playerId: "A", side: 1, scores: twoBirdiesAndEagle }),
    card({ matchId: "2025-R3-1", round: 3, format: "SI", scoreType: "INDIVIDUAL", playerId: "B", side: 1, scores: oneBirdie }),
    card({ matchId: "2025-R3-1", round: 3, format: "SI", scoreType: "INDIVIDUAL", playerId: "C", side: 2, scores: allPar }),
    card({ matchId: "2025-R3-1", round: 3, format: "SI", scoreType: "INDIVIDUAL", playerId: "D", side: 2, scores: Array(18).fill(1), status: "MISSING" }),
    card({ matchId: "2025-R4-1", round: 1, format: "UNKNOWN", scoreType: "INDIVIDUAL", playerId: "D", scores: Array(18).fill(2) }),
    card({ matchId: "2024-R1-1", round: 1, format: "BB", scoreType: "INDIVIDUAL", playerId: "D", scores: Array(18).fill(1), year: 2024 }),
  ];
}

const byKey = (model, key) => model.records.find((record) => record.key === key);

test("the population classifier is format-authoritative and never guesses unknown formats", () => {
  assert.equal(classify2025TournamentRecordScorecard({ format: "BB", scoreType: "INDIVIDUAL" }), "INDIVIDUAL");
  assert.equal(classify2025TournamentRecordScorecard({ format: "Singles", scoreType: "INDIVIDUAL" }), "INDIVIDUAL");
  assert.equal(classify2025TournamentRecordScorecard({ format: "SC", scoreType: "TEAM" }), "TEAM");
  assert.equal(classify2025TournamentRecordScorecard({ format: "SC", scoreType: "INDIVIDUAL" }), null);
  assert.equal(classify2025TournamentRecordScorecard({ format: "MYSTERY", scoreType: "TEAM" }), null);
});

test("individual, Scramble, missing, unknown-format, and other-year evidence remain distinct", () => {
  const scorecards = fixtureScorecards();
  scorecards.push({ ...scorecards[0], holes: scorecards[0].holes.map((hole) => ({ ...hole })) });
  const model = build2025TournamentRecords({ scorecards, matches, teams });
  assert.deepEqual(model.populations, {
    bestBallCompleteIndividuals: 3,
    singlesCompleteIndividuals: 3,
    completeIndividuals: 6,
    completeScrambleTeams: 2,
    completeLogicalScorecards: 8,
    individualHoleObservations: 108,
    scrambleHoleObservations: 36,
    unknownFormats: 1,
  });

  assert.equal(byKey(model, "best-individual-round").value, "68");
  assert.equal(byKey(model, "best-team-round").value, "60");
  assert.equal(byKey(model, "average-score").value, "71.2");
  assert.equal(byKey(model, "average-score").numerator, 427);
  assert.equal(byKey(model, "average-score").sample, "6 individual rounds");
});

test("Scramble record holders resolve to canonical pairings and team context through the safe remaining-side fallback", () => {
  const model = build2025TournamentRecords({ scorecards: fixtureScorecards(), matches, teams });
  const bestTeam = byKey(model, "best-team-round");
  assert.equal(bestTeam.tied, true);
  assert.match(bestTeam.detail, /Alpha Golfer & Bravo Golfer/);
  assert.match(bestTeam.detail, /Charlie Golfer & Delta Golfer/);
  assert.match(bestTeam.context, /Team One · Scramble · Scramble Course/);
  assert.match(bestTeam.context, /Team Two · Scramble · Scramble Course/);
  assert.doesNotMatch(bestTeam.accessibleLabel, /SOURCE-TWO|T2-CANONICAL/);
});

test("Birdie Leader counts literal birdies across individual holes and excludes Scramble and eagles", () => {
  const model = build2025TournamentRecords({ scorecards: fixtureScorecards(), matches, teams });
  const birdie = byKey(model, "birdie-leader");
  assert.equal(birdie.value, "3");
  assert.equal(birdie.detail, "Alpha Golfer");
  assert.equal(birdie.sample, "2 individual rounds · 36 holes");
  assert.equal(birdie.sampleSize, 108);
});

test("lowest nines include individual and Scramble cards while keeping the scoring identities truthful", () => {
  const model = build2025TournamentRecords({ scorecards: fixtureScorecards(), matches, teams });
  const front = byKey(model, "lowest-front");
  const back = byKey(model, "lowest-back");
  assert.equal(front.value, "27");
  assert.equal(front.sampleSize, 8);
  assert.match(front.detail, /Alpha Golfer & Bravo Golfer/);
  assert.match(front.detail, /Charlie Golfer & Delta Golfer/);
  assert.equal(back.value, "33");
  assert.equal(back.sampleSize, 8);
  assert.match(back.context, /Scramble/);
});

test("a nine-hole record requires that nine only and never promotes the card into a complete-round population", () => {
  const cards = fixtureScorecards();
  const partialFront = card({
    matchId: "2025-R3-1",
    round: 3,
    format: "SI",
    scoreType: "INDIVIDUAL",
    playerId: "D",
    side: 2,
    scores: [...Array(9).fill(2), ...Array(9).fill(null)],
    status: "PARTIAL",
  });
  cards.splice(cards.findIndex((entry) => entry.playerId === "D" && entry.status === "MISSING"), 1, partialFront);
  const model = build2025TournamentRecords({ scorecards: cards, matches, teams });
  assert.equal(byKey(model, "lowest-front").value, "18");
  assert.equal(byKey(model, "lowest-front").detail, "Delta Golfer");
  assert.equal(byKey(model, "average-score").sampleSize, 6);
  assert.equal(byKey(model, "lowest-back").sampleSize, 8);
});

test("hole difficulty excludes Scramble and compares exact gross-to-par fractions", () => {
  const cards = fixtureScorecards();
  const model = build2025TournamentRecords({ scorecards: cards, matches, teams });
  const hardest = byKey(model, "hardest-hole");
  const easiest = byKey(model, "easiest-hole");
  assert.equal(model.proofs.difficultyMetric, "mean(gross score - par) for each course hole across recorded individual scoring");
  assert.equal(hardest.winners.every((winner) => winner.course !== "Scramble Course"), true);
  assert.equal(easiest.winners.every((winner) => winner.course !== "Scramble Course"), true);
  assert.equal(hardest.winners.every((winner) => winner.sampleSize === 3), true);
  assert.equal(easiest.winners.every((winner) => winner.sampleSize === 3), true);
});

test("raw-value ties are preserved without a hole-count or source-order tiebreak", () => {
  const cards = fixtureScorecards();
  const tiedIndividual = card({ matchId: "2025-R3-1", round: 3, format: "SI", scoreType: "INDIVIDUAL", playerId: "D", side: 2, scores: threeBirdiesEagleAndBogey });
  cards.splice(cards.findIndex((entry) => entry.playerId === "D" && entry.status === "MISSING"), 1, tiedIndividual);
  const model = build2025TournamentRecords({ scorecards: cards, matches, teams });
  assert.equal(byKey(model, "best-individual-round").tied, true);
  assert.match(byKey(model, "best-individual-round").detail, /Alpha Golfer/);
  assert.match(byKey(model, "best-individual-round").detail, /Delta Golfer/);
  assert.equal(byKey(model, "birdie-leader").tied, true);
  assert.match(byKey(model, "birdie-leader").detail, /Alpha Golfer/);
  assert.match(byKey(model, "birdie-leader").detail, /Delta Golfer/);
});

test("the model preserves exactly four default categories and eight total participant records", () => {
  const model = build2025TournamentRecords({ scorecards: fixtureScorecards(), matches, teams });
  assert.equal(model.records.length, 8);
  assert.deepEqual(model.records.slice(0, 4).map((record) => record.label), [
    "Best Individual Round",
    "Best Team Round",
    "Birdie Leader",
    "Average Score",
  ]);
  assert.equal(model.records.every((record) => record.accessibleLabel), true);
});
