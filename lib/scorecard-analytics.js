import { pick } from "./prediction-engine.js";
import {
  calculateBestBallNetHoleScore,
  calculateHoleWinner,
  calculateIndividualNetHoleScore,
  calculateNetTotals,
  calculateScrambleNetHoleScore,
  compactInitials,
  getStrokesOnHole,
} from "./scorecard-net.js";
import { legacyHistoryMatchPlayerIds } from "./legacy-history-player-identity.js";

const SCORECARD_STATUSES = new Set(["VERIFIED", "COMPLETE", "PARTIAL", "MISSING"]);
const SCORE_TYPES = new Set(["INDIVIDUAL", "TEAM"]);
const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = null) => {
  if (value === null || value === undefined || clean(value) === "") return fallback;
  const parsed = Number.parseFloat(clean(value).replace(/[−–—]/g, "-").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const integer = (value, fallback = null) => {
  const parsed = number(value, fallback);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};
const normalizedId = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const sameId = (a, b) => Boolean(normalizedId(a)) && normalizedId(a) === normalizedId(b);
const mean = (values) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const unique = (values) => [...new Set(values.filter(Boolean))];

function format(value) {
  const raw = clean(value).toUpperCase();
  if (!raw) return "";
  if (["BB", "BEST BALL", "BESTBALL", "2 VS 2"].includes(raw)) return "BB";
  if (["SC", "SCRAMBLE", "2-MAN SCRAMBLE", "2 MAN SCRAMBLE"].includes(raw)) return "SC";
  if (["SI", "SINGLES", "SINGLE"].includes(raw)) return "SI";
  return raw;
}

function normalizeScoreType(value, matchFormat) {
  const raw = clean(value).toUpperCase().replace(/[^A-Z]/g, "");
  if (["INDIVIDUAL", "PLAYER", "GOLFER"].includes(raw)) return "INDIVIDUAL";
  if (["TEAM", "PAIR", "SIDE"].includes(raw)) return "TEAM";
  return format(matchFormat) === "SC" ? "TEAM" : "INDIVIDUAL";
}

function normalizeStatus(value, completedHoleCount) {
  const raw = clean(value).toUpperCase();
  if (SCORECARD_STATUSES.has(raw)) return raw;
  if (completedHoleCount === 18) return "COMPLETE";
  if (completedHoleCount > 0) return "PARTIAL";
  return "MISSING";
}

function matchIdentity(row) {
  return {
    matchId: clean(pick(row, "Match ID")),
    year: integer(pick(row, "Year")),
    round: integer(pick(row, "Round")),
    matchNumber: integer(pick(row, "Match")),
    format: format(pick(row, "Format")),
    courseId: clean(pick(row, "Course ID")),
  };
}

function matchPlayers(match, side = null) {
  if (side === 1 || side === 2) {
    return legacyHistoryMatchPlayerIds(match, side);
  }
  return unique([
    ...legacyHistoryMatchPlayerIds(match, 1),
    ...legacyHistoryMatchPlayerIds(match, 2),
  ]);
}

function teamIdForSide(match, side, teamNames = []) {
  const direct = clean(pick(
    match,
    `Team ${side} Team ID`,
    `Team ${side} ID`
  ));
  if (direct) return direct;
  const identity = matchIdentity(match);
  const team = teamNames.find((row) =>
    integer(pick(row, "Year")) === identity.year &&
    clean(pick(row, "Team Side")).toUpperCase() === `TEAM ${side}`
  );
  return clean(pick(team, "Team ID"));
}

function matchTeams(match, teamNames) {
  return [1, 2].map((side) => ({
    side,
    teamId: teamIdForSide(match, side, teamNames),
    playerIds: matchPlayers(match, side),
  }));
}

function officialStrokeValue(match, side, playerSlot = null) {
  const prefix = playerSlot
    ? `Team ${side} Player ${playerSlot}`
    : `Team ${side}`;
  const fields = [
    `${prefix} Stroke`,
    `${prefix} Strokes`,
    `${prefix} Strokes Received`,
  ];
  const field = fields.find((candidate) =>
    Object.prototype.hasOwnProperty.call(match || {}, candidate)
  );
  if (!field) return null;
  const raw = match[field];
  // In the Matches sheet, a present-but-blank stroke cell means the
  // participant receives zero strokes. A missing column remains unresolved.
  return clean(raw) === "" ? 0 : integer(raw);
}

function matchSideForPlayer(match, playerId) {
  for (const side of [1, 2]) {
    for (const playerSlot of [1, 2]) {
      if (sameId(pick(match, `Team ${side} Player ${playerSlot}`), playerId)) {
        return { side, playerSlot };
      }
    }
  }
  return null;
}

function courseHoleValidation(courseHoles, courseId, tee) {
  const matching = courseHoles.filter((row) =>
    sameId(pick(row, "Course ID"), courseId) &&
    clean(pick(row, "Tee")).toUpperCase() === clean(tee).toUpperCase()
  );
  const holeNumbers = matching.map((row) => integer(pick(row, "Hole Number")));
  const strokeIndexes = matching.map((row) => integer(pick(row, "Stroke Index")));
  const duplicateStrokeIndexes = strokeIndexes.filter((value, index) =>
    value !== null && strokeIndexes.indexOf(value) !== index
  );
  return {
    valid: matching.length === 18 &&
      new Set(holeNumbers).size === 18 &&
      strokeIndexes.every((value) => value !== null && value >= 1 && value <= 18) &&
      new Set(strokeIndexes).size === 18,
    missingStrokeIndex: matching.some((row) => integer(pick(row, "Stroke Index")) === null),
    invalidStrokeIndex: strokeIndexes.some((value) => value !== null && (value < 1 || value > 18)),
    duplicateStrokeIndexes: unique(duplicateStrokeIndexes.map(String)),
    matchingCount: matching.length,
  };
}

function courseForMatch(match, courses) {
  const identity = matchIdentity(match);
  const byId = courses.filter((course) => sameId(pick(course, "Course ID"), identity.courseId));
  return byId.find((course) => integer(pick(course, "Year")) === identity.year) ||
    byId[0] ||
    courses.find((course) =>
      integer(pick(course, "Year")) === identity.year &&
      integer(clean(pick(course, "Round")).replace(/\D/g, "")) === identity.round
    ) ||
    null;
}

function teeForMatch(match, courses) {
  return clean(
    pick(match, "Tee", "Tee Played", "Tee Name") ||
    pick(courseForMatch(match, courses), "Tee", "Tee Played", "Tee Name")
  );
}

function courseHoleMap(courseHoles) {
  const map = new Map();
  for (const row of courseHoles) {
    const courseId = normalizedId(pick(row, "Course ID"));
    const tee = clean(pick(row, "Tee")).toUpperCase();
    const holeNumber = integer(pick(row, "Hole Number"));
    if (!courseId || !holeNumber || holeNumber < 1 || holeNumber > 18) continue;
    map.set(`${courseId}|${tee}|${holeNumber}`, row);
  }
  return map;
}

function courseHoleFor(map, courseId, tee, holeNumber) {
  const courseKey = normalizedId(courseId);
  const teeKey = clean(tee).toUpperCase();
  return map.get(`${courseKey}|${teeKey}|${holeNumber}`) ||
    (!teeKey
      ? [...map.entries()].find(([key]) =>
          key.startsWith(`${courseKey}|`) && key.endsWith(`|${holeNumber}`)
        )?.[1]
      : null) ||
    null;
}

function warning(code, context, field, correction, details = "") {
  return {
    code,
    type: code,
    matchId: context.matchId || "",
    year: context.year,
    round: context.round,
    matchNumber: context.matchNumber,
    playerId: context.playerId || "",
    teamId: context.teamId || "",
    participant: context.playerId || context.teamId || "Match",
    field,
    details,
    suggestedCorrection: correction,
  };
}

function coverage(value, sampleSize, unit, available = sampleSize, expected = available) {
  return {
    value,
    sampleSize,
    unit,
    available,
    expected,
    coveragePercent: expected > 0 ? (available / expected) * 100 : null,
    label: `Based on ${sampleSize} recorded ${unit}${sampleSize === 1 ? "" : "s"}`,
  };
}

function scoringBucket(toPar) {
  if (toPar === null) return null;
  if (toPar <= -2) return "eaglesOrBetter";
  if (toPar === -1) return "birdies";
  if (toPar === 0) return "pars";
  if (toPar === 1) return "bogeys";
  return "doubleOrWorse";
}

function longestStreak(holes, predicate) {
  let current = 0;
  let longest = 0;
  for (const hole of holes) {
    if (hole.score !== null && predicate(hole)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * Calculate all metrics belonging to one normalized scorecard.
 * Partial cards contribute only their recorded holes and complete nines.
 */
export function calculateScorecardMetrics(scorecard) {
  const completed = scorecard.holes.filter((hole) => hole.score !== null);
  const counts = {
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubleOrWorse: 0,
    eaglesOrBetter: 0,
  };
  for (const hole of completed) {
    const bucket = scoringBucket(hole.toPar);
    if (bucket) counts[bucket] += 1;
  }
  const byPar = (par) => completed.filter((hole) => hole.par === par).map((hole) => hole.score);
  const closing = scorecard.holes
    .filter((hole) => hole.holeNumber >= 15 && hole.holeNumber <= 18 && hole.score !== null);

  return {
    birdies: coverage(counts.birdies, completed.length, "hole score"),
    pars: coverage(counts.pars, completed.length, "hole score"),
    bogeys: coverage(counts.bogeys, completed.length, "hole score"),
    doubleOrWorse: coverage(counts.doubleOrWorse, completed.length, "hole score"),
    eaglesOrBetter: coverage(counts.eaglesOrBetter, completed.length, "hole score"),
    completedHoles: coverage(scorecard.completedHoleCount, scorecard.completedHoleCount, "hole score", scorecard.completedHoleCount, 18),
    frontNine: coverage(scorecard.frontNine, scorecard.frontNine === null ? 0 : 1, "front nine"),
    backNine: coverage(scorecard.backNine, scorecard.backNine === null ? 0 : 1, "back nine"),
    total: coverage(scorecard.total, scorecard.total === null ? 0 : 1, "round"),
    totalToPar: coverage(scorecard.totalToPar, scorecard.totalToPar === null ? 0 : 1, "round"),
    par3Average: coverage(mean(byPar(3)), byPar(3).length, "par-3 hole"),
    par4Average: coverage(mean(byPar(4)), byPar(4).length, "par-4 hole"),
    par5Average: coverage(mean(byPar(5)), byPar(5).length, "par-5 hole"),
    holes15To18: coverage(
      closing.length === 4 ? sum(closing.map((hole) => hole.score)) : null,
      closing.length,
      "closing hole",
      closing.length,
      4
    ),
    longestBirdieStreak: coverage(
      longestStreak(scorecard.holes, (hole) => hole.toPar !== null && hole.toPar <= -1),
      scorecard.completedHoleCount,
      "hole score"
    ),
    longestParStreak: coverage(
      longestStreak(scorecard.holes, (hole) => hole.toPar === 0),
      scorecard.completedHoleCount,
      "hole score"
    ),
  };
}

export function averageByYardageRange(scorecards, ranges = [
  { label: "Under 150", minimum: 0, maximum: 149 },
  { label: "150–199", minimum: 150, maximum: 199 },
  { label: "200–399", minimum: 200, maximum: 399 },
  { label: "400–499", minimum: 400, maximum: 499 },
  { label: "500+", minimum: 500, maximum: Infinity },
]) {
  const holes = scorecards.flatMap((scorecard) => scorecard.holes).filter((hole) => hole.score !== null);
  return ranges.map((range) => {
    const scores = holes
      .filter((hole) => hole.yardage !== null && hole.yardage >= range.minimum && hole.yardage <= range.maximum)
      .map((hole) => hole.score);
    return { ...range, ...coverage(mean(scores), scores.length, "hole score") };
  });
}

export function summarizeScorecards(scorecards, expectedCount = scorecards.length) {
  const fullRounds = scorecards.filter((scorecard) => scorecard.completedHoleCount === 18 && scorecard.total !== null);
  const fronts = scorecards.filter((scorecard) => scorecard.frontNine !== null);
  const backs = scorecards.filter((scorecard) => scorecard.backNine !== null);
  const holes = scorecards.flatMap((scorecard) => scorecard.holes).filter((hole) => hole.score !== null);
  const bucketCounts = { birdies: 0, pars: 0, bogeys: 0, doubleOrWorse: 0, eaglesOrBetter: 0 };
  for (const hole of holes) {
    const bucket = scoringBucket(hole.toPar);
    if (bucket) bucketCounts[bucket] += 1;
  }
  const classifiedHoles = holes.filter((hole) => hole.toPar !== null);
  const percentage = (key) => coverage(
    classifiedHoles.length ? (bucketCounts[key] / classifiedHoles.length) * 100 : null,
    classifiedHoles.length,
    "hole score"
  );
  const parScores = (par) => holes.filter((hole) => hole.par === par).map((hole) => hole.score);
  const closingStretches = scorecards.map((scorecard) => {
    const closing = scorecard.holes.filter((hole) =>
      hole.holeNumber >= 16 && hole.holeNumber <= 18 && hole.score !== null
    );
    return closing.length === 3 ? sum(closing.map((hole) => hole.score)) : null;
  }).filter((value) => value !== null);
  const countMetric = (key) => coverage(bucketCounts[key], classifiedHoles.length, "hole score");

  return {
    scorecardCoverage: coverage(scorecards.length, scorecards.length, "scorecard", scorecards.length, expectedCount),
    recordedScoringAverage: coverage(mean(fullRounds.map((scorecard) => scorecard.total)), fullRounds.length, "round", fullRounds.length, expectedCount),
    averageToPar: coverage(
      mean(fullRounds.map((scorecard) => scorecard.totalToPar).filter((value) => value !== null)),
      fullRounds.filter((scorecard) => scorecard.totalToPar !== null).length,
      "round",
      fullRounds.filter((scorecard) => scorecard.totalToPar !== null).length,
      expectedCount
    ),
    lowestRecordedRound: coverage(
      fullRounds.length ? Math.min(...fullRounds.map((scorecard) => scorecard.total)) : null,
      fullRounds.length,
      "round",
      fullRounds.length,
      expectedCount
    ),
    bestFrontNine: coverage(
      fronts.length ? Math.min(...fronts.map((scorecard) => scorecard.frontNine)) : null,
      fronts.length,
      "front nine"
    ),
    averageFrontNine: coverage(mean(fronts.map((scorecard) => scorecard.frontNine)), fronts.length, "front nine"),
    bestBackNine: coverage(
      backs.length ? Math.min(...backs.map((scorecard) => scorecard.backNine)) : null,
      backs.length,
      "back nine"
    ),
    averageBackNine: coverage(mean(backs.map((scorecard) => scorecard.backNine)), backs.length, "back nine"),
    holeScoringAverage: coverage(mean(holes.map((hole) => hole.score)), holes.length, "hole score"),
    birdies: countMetric("birdies"),
    pars: countMetric("pars"),
    bogeys: countMetric("bogeys"),
    doubleOrWorse: countMetric("doubleOrWorse"),
    eaglesOrBetter: countMetric("eaglesOrBetter"),
    birdiePercentage: percentage("birdies"),
    parPercentage: percentage("pars"),
    bogeyPercentage: percentage("bogeys"),
    doubleOrWorsePercentage: percentage("doubleOrWorse"),
    eagleOrBetterPercentage: percentage("eaglesOrBetter"),
    par3Average: coverage(mean(parScores(3)), parScores(3).length, "par-3 hole"),
    par4Average: coverage(mean(parScores(4)), parScores(4).length, "par-4 hole"),
    par5Average: coverage(mean(parScores(5)), parScores(5).length, "par-5 hole"),
    closingAverage: coverage(mean(closingStretches), closingStretches.length, "closing stretch"),
    averageByYardageRange: averageByYardageRange(scorecards),
  };
}

export function summarizeCourseHoles(scorecards) {
  const groups = new Map();
  for (const scorecard of scorecards) {
    for (const hole of scorecard.holes) {
      if (hole.score === null) continue;
      const key = `${normalizedId(scorecard.courseId)}|${clean(scorecard.tee).toUpperCase()}|${hole.holeNumber}`;
      if (!groups.has(key)) groups.set(key, {
        courseId: scorecard.courseId,
        tee: scorecard.tee,
        holeNumber: hole.holeNumber,
        par: hole.par,
        yardage: hole.yardage,
        strokeIndex: hole.strokeIndex,
        scores: [],
        toPar: [],
      });
      groups.get(key).scores.push(hole.score);
      if (hole.toPar !== null) groups.get(key).toPar.push(hole.toPar);
    }
  }
  const summaries = [...groups.values()].map((group) => ({
    courseId: group.courseId,
    tee: group.tee,
    holeNumber: group.holeNumber,
    par: group.par,
    yardage: group.yardage,
    strokeIndex: group.strokeIndex,
    scoringAverage: coverage(mean(group.scores), group.scores.length, "hole score"),
    averageToPar: coverage(mean(group.toPar), group.toPar.length, "hole score"),
    birdiePercentage: coverage(
      group.toPar.length ? (group.toPar.filter((value) => value === -1).length / group.toPar.length) * 100 : null,
      group.toPar.length,
      "hole score"
    ),
    parPercentage: coverage(
      group.toPar.length ? (group.toPar.filter((value) => value === 0).length / group.toPar.length) * 100 : null,
      group.toPar.length,
      "hole score"
    ),
    bogeyPercentage: coverage(
      group.toPar.length ? (group.toPar.filter((value) => value === 1).length / group.toPar.length) * 100 : null,
      group.toPar.length,
      "hole score"
    ),
    doubleOrWorsePercentage: coverage(
      group.toPar.length ? (group.toPar.filter((value) => value >= 2).length / group.toPar.length) * 100 : null,
      group.toPar.length,
      "hole score"
    ),
    bestScore: coverage(group.scores.length ? Math.min(...group.scores) : null, group.scores.length, "hole score"),
    worstScore: coverage(group.scores.length ? Math.max(...group.scores) : null, group.scores.length, "hole score"),
  }));
  const byCourse = summaries.reduce((map, item) => {
    const key = `${normalizedId(item.courseId)}|${clean(item.tee).toUpperCase()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());
  for (const items of byCourse.values()) {
    items
      .sort((a, b) => (b.averageToPar.value ?? -Infinity) - (a.averageToPar.value ?? -Infinity))
      .forEach((item, index) => { item.difficultyRank = index + 1; });
  }
  return summaries.sort((a, b) =>
    normalizedId(a.courseId).localeCompare(normalizedId(b.courseId)) ||
    clean(a.tee).localeCompare(clean(b.tee)) ||
    a.holeNumber - b.holeNumber
  );
}

function result(value, scorecard, sampleSize, unit = "round") {
  return {
    value,
    scorecard: scorecard || null,
    sampleSize,
    unit,
    label: `Based on ${sampleSize} recorded ${unit}${sampleSize === 1 ? "" : "s"}`,
  };
}

function selectScorecard(scorecards, valueFor, direction = "lowest") {
  const candidates = scorecards
    .map((scorecard) => ({ scorecard, value: valueFor(scorecard) }))
    .filter(({ value }) => Number.isFinite(value));
  const ordered = candidates.sort((a, b) =>
    direction === "highest" ? b.value - a.value : a.value - b.value
  );
  return result(ordered[0]?.value ?? null, ordered[0]?.scorecard, candidates.length);
}

/**
 * Reusable editorial highlights for a round, tournament, course, or the full archive.
 */
export function buildScoringHighlights(scorecards, expectedCount = scorecards.length) {
  const usable = scorecards.filter((scorecard) => scorecard.status !== "MISSING");
  const full = usable.filter((scorecard) => scorecard.completedHoleCount === 18 && scorecard.total !== null);
  const individuals = full.filter((scorecard) => scorecard.scoreType === "INDIVIDUAL");
  const teams = full.filter((scorecard) => scorecard.scoreType === "TEAM");
  const holeSummaries = summarizeCourseHoles(usable);
  const rankedHoles = holeSummaries.filter((hole) => hole.averageToPar.value !== null);
  const hardest = [...rankedHoles].sort((a, b) => b.averageToPar.value - a.averageToPar.value)[0] || null;
  const easiest = [...rankedHoles].sort((a, b) => a.averageToPar.value - b.averageToPar.value)[0] || null;
  const birdiesByPlayer = new Map();
  for (const scorecard of usable.filter((card) => card.scoreType === "INDIVIDUAL" && card.playerId)) {
    const birdies = scorecard.holes.filter((hole) => hole.toPar === -1).length;
    const current = birdiesByPlayer.get(scorecard.playerId) || { birdies: 0, holes: 0 };
    current.birdies += birdies;
    current.holes += scorecard.completedHoleCount;
    birdiesByPlayer.set(scorecard.playerId, current);
  }
  const birdieLeader = [...birdiesByPlayer.entries()]
    .map(([playerId, values]) => ({ playerId, ...values }))
    .sort((a, b) => b.birdies - a.birdies || b.holes - a.holes)[0] || null;

  return {
    lowestRound: selectScorecard(individuals, (scorecard) => scorecard.total),
    lowestTeamRound: selectScorecard(teams, (scorecard) => scorecard.total),
    lowestFrontNine: selectScorecard(usable, (scorecard) => scorecard.frontNine),
    lowestBackNine: selectScorecard(usable, (scorecard) => scorecard.backNine),
    mostBirdies: selectScorecard(
      usable,
      (scorecard) => scorecard.holes.filter((hole) => hole.toPar === -1).length,
      "highest"
    ),
    averageScore: coverage(mean(full.map((scorecard) => scorecard.total)), full.length, "round"),
    hardestHole: hardest,
    easiestHole: easiest,
    birdieLeader: birdieLeader
      ? result(
          birdieLeader.birdies,
          usable.find((scorecard) => sameId(scorecard.playerId, birdieLeader.playerId)),
          birdieLeader.holes,
          "hole score"
        )
      : result(null, null, 0, "hole score"),
    scorecardCoverage: coverage(usable.length, usable.length, "scorecard", usable.length, expectedCount),
  };
}

export function filterScorecards(scorecards, {
  matchId,
  year,
  round,
  playerId,
  teamId,
  courseId,
  format: wantedFormat,
} = {}) {
  return scorecards.filter((scorecard) =>
    (!matchId || scorecard.matchId === clean(matchId)) &&
    ((year === undefined || year === null || year === "") || scorecard.year === Number(year)) &&
    ((round === undefined || round === null || round === "") || scorecard.round === Number(round)) &&
    (!playerId || sameId(scorecard.playerId, playerId) || scorecard.participantPlayerIds.some((id) => sameId(id, playerId))) &&
    (!teamId || sameId(scorecard.teamId, teamId)) &&
    (!courseId || sameId(scorecard.courseId, courseId)) &&
    (!wantedFormat || scorecard.format === format(wantedFormat))
  );
}

/**
 * All scoring-record selectors live here so Records never reimplements scoring logic.
 */
export function buildScoringRecords(scorecards) {
  const usable = scorecards.filter((scorecard) => scorecard.status !== "MISSING");
  const full = usable.filter((scorecard) => scorecard.completedHoleCount === 18 && scorecard.total !== null);
  const individual = full.filter((scorecard) => scorecard.scoreType === "INDIVIDUAL");
  const scramble = full.filter((scorecard) => scorecard.scoreType === "TEAM" && scorecard.format === "SC");
  const singles = full.filter((scorecard) => scorecard.scoreType === "INDIVIDUAL" && scorecard.format === "SI");
  const highlights = buildScoringHighlights(usable);
  const byParAverage = (par) => selectScorecard(individual, (scorecard) => {
    const scores = scorecard.holes.filter((hole) => hole.par === par).map((hole) => hole.score);
    return mean(scores);
  });
  const closingValue = (scorecard) => {
    const closing = scorecard.holes.filter((hole) => hole.holeNumber >= 16 && hole.score !== null);
    return closing.length === 3 ? sum(closing.map((hole) => hole.score)) : null;
  };
  return {
    lowestRecordedRound: selectScorecard(individual, (scorecard) => scorecard.total),
    lowestToPar: selectScorecard(individual, (scorecard) => scorecard.totalToPar),
    lowestFrontNine: selectScorecard(usable, (scorecard) => scorecard.frontNine),
    lowestBackNine: selectScorecard(usable, (scorecard) => scorecard.backNine),
    mostBirdies: selectScorecard(usable, (scorecard) =>
      scorecard.holes.filter((hole) => hole.toPar === -1).length, "highest"),
    mostEagles: selectScorecard(usable, (scorecard) =>
      scorecard.holes.filter((hole) => hole.toPar !== null && hole.toPar <= -2).length, "highest"),
    mostConsecutiveBirdies: selectScorecard(usable, (scorecard) =>
      calculateScorecardMetrics(scorecard).longestBirdieStreak.value, "highest"),
    bestClosingStretch: selectScorecard(usable, closingValue),
    bestPar3Average: byParAverage(3),
    bestPar4Average: byParAverage(4),
    bestPar5Average: byParAverage(5),
    hardestHistoricalHole: highlights.hardestHole,
    easiestHistoricalHole: highlights.easiestHole,
    lowestScrambleRound: selectScorecard(scramble, (scorecard) => scorecard.total),
    lowestSinglesRound: selectScorecard(singles, (scorecard) => scorecard.total),
  };
}

function expectedScorecards(matches, teamNames, actualByMatch) {
  const expected = [];
  for (const match of matches) {
    const identity = matchIdentity(match);
    if (!identity.matchId) continue;
    const actualTypes = unique((actualByMatch.get(identity.matchId) || []).map((row) =>
      normalizeScoreType(pick(row, "Score Type"), identity.format)
    ));
    const scoreType = identity.format === "SC"
      ? "TEAM"
      : identity.format === "BB" || identity.format === "SI"
        ? "INDIVIDUAL"
        : actualTypes[0] || "INDIVIDUAL";
    if (scoreType === "TEAM") {
      // Round Scorecards is the canonical scoring-identity source. Prefer its
      // two match-scoped Team IDs when both are present; the legacy Team Names
      // fallback contains a known spelling drift for one 2025 team ID.
      const actualTeamIds = unique((actualByMatch.get(identity.matchId) || [])
        .filter((row) => normalizeScoreType(pick(row, "Score Type"), identity.format) === "TEAM")
        .map((row) => clean(pick(row, "Team ID"))));
      const teams = actualTeamIds.length === 2
        ? actualTeamIds.map((teamId, index) => ({
            teamId,
            playerIds: matchPlayers(match, index + 1),
          }))
        : matchTeams(match, teamNames);
      for (const team of teams) {
        expected.push({
          ...identity,
          scoreType,
          teamId: team.teamId,
          playerId: "",
          participantPlayerIds: team.playerIds,
        });
      }
    } else {
      for (const playerId of matchPlayers(match)) {
        expected.push({
          ...identity,
          scoreType,
          playerId,
          teamId: "",
          participantPlayerIds: playerId ? [playerId] : [],
        });
      }
    }
  }
  return expected;
}

function missingKey(record) {
  return `${record.matchId}|${record.scoreType}|${record.playerId || record.teamId}`;
}

function teamDisplay(teamNames, teamId, year) {
  const record = teamNames.find((team) =>
    sameId(pick(team, "Team ID"), teamId) &&
    (integer(pick(team, "Year")) === year || integer(pick(team, "Year")) === null)
  );
  const name = clean(pick(record, "Team Name", "Team Names", "Name")) || teamId || "Team";
  const abbreviation = clean(pick(record, "Team Abbreviation", "Abbreviation", "Short Name")) ||
    compactInitials(name, teamId);
  return { name, abbreviation };
}

function buildMatchNetScoring(scorecards, match, teamNames) {
  const matchInfo = matchIdentity(match || {});
  const formatCode = matchInfo.format || scorecards[0]?.format || "";
  const rows = [];
  for (const side of [1, 2]) {
    const sideCards = scorecards.filter((card) => card.side === side);
    if (!sideCards.length) continue;
    const sideTeamId = sideCards[0].sideTeamId || teamIdForSide(match || {}, side, teamNames);
    const team = teamDisplay(teamNames, sideTeamId, sideCards[0].year);
    if (formatCode === "BB") {
      const holes = Array.from({ length: 18 }, (_, index) => {
        const holeNumber = index + 1;
        const playerHoles = sideCards.map((card) => card.holes.find((hole) => hole.holeNumber === holeNumber));
        const par = playerHoles.find((hole) => hole?.par !== null)?.par ?? null;
        const netScore = sideCards.length >= 2
          ? calculateBestBallNetHoleScore(playerHoles.map((hole) => hole?.netScore))
          : null;
        return {
          holeNumber,
          par,
          netScore,
          netToPar: netScore !== null && par !== null ? netScore - par : null,
        };
      });
      rows.push({
        side,
        type: "BEST_BALL_NET",
        teamId: sideTeamId,
        name: team.name,
        abbreviation: team.abbreviation,
        label: "Net Best Ball",
        holes,
        netTotals: calculateNetTotals(holes),
        available: sideCards.length >= 2 && sideCards.every((card) => card.netAvailable),
      });
    } else {
      const card = sideCards[0];
      rows.push({
        side,
        type: formatCode === "SC" ? "SCRAMBLE_NET" : "SINGLES_NET",
        teamId: sideTeamId,
        playerId: formatCode === "SI" ? card.playerId : undefined,
        name: formatCode === "SI" ? card.playerName : team.name,
        abbreviation: formatCode === "SI"
          ? compactInitials(card.playerName, card.playerId)
          : team.abbreviation,
        label: formatCode === "SC" ? "Net Scramble" : "Net",
        holes: card.holes.map((hole) => ({
          holeNumber: hole.holeNumber,
          par: hole.par,
          netScore: hole.netScore,
          netToPar: hole.netToPar,
        })),
        netTotals: card.netTotals,
        available: card.netAvailable,
      });
    }
  }
  const sideA = rows.find((row) => row.side === 1);
  const sideB = rows.find((row) => row.side === 2);
  const holeWinners = Array.from({ length: 18 }, (_, index) => {
    const holeNumber = index + 1;
    const a = sideA?.holes.find((hole) => hole.holeNumber === holeNumber)?.netScore ?? null;
    const b = sideB?.holes.find((hole) => hole.holeNumber === holeNumber)?.netScore ?? null;
    return calculateHoleWinner(a, b, {
      holeNumber,
      sideATeamId: sideA?.teamId,
      sideBTeamId: sideB?.teamId,
      sideAPlayerId: formatCode === "SI" ? sideA?.playerId : undefined,
      sideBPlayerId: formatCode === "SI" ? sideB?.playerId : undefined,
    });
  }).map((winner) => ({
    ...winner,
    abbreviation: winner.winnerSide === "A"
      ? sideA?.abbreviation
      : winner.winnerSide === "B"
        ? sideB?.abbreviation
        : "—",
    winnerName: winner.winnerSide === "A"
      ? sideA?.name
      : winner.winnerSide === "B"
        ? sideB?.name
        : undefined,
  }));
  return {
    format: formatCode,
    available: rows.length === 2 && rows.every((row) => row.available),
    rows,
    holeWinners,
    summary: {
      sideAWins: holeWinners.filter((hole) => hole.winnerSide === "A").length,
      sideBWins: holeWinners.filter((hole) => hole.winnerSide === "B").length,
      halved: holeWinners.filter((hole) => hole.winnerType === "HALVED").length,
    },
  };
}

export function buildScorecardAnalytics({
  roundScorecards = [],
  matches = [],
  courseHoles = [],
  courses = [],
  teamNames = [],
  players = [],
} = {}) {
  const warnings = [];
  const playerNames = new Map(players.map((player) => [
    clean(pick(player, "Player ID", "ID")),
    clean(pick(player, "Display Name", "Player Name", "Name")) ||
      `${clean(pick(player, "First", "First Name"))} ${clean(pick(player, "Last", "Last Name"))}`.trim(),
  ]));
  const playerSlugs = new Map(players.map((player) => [
    clean(pick(player, "Player ID", "ID")),
    clean(pick(player, "Slug", "Player Slug")),
  ]));
  const holesByCourse = courseHoleMap(courseHoles);
  for (const row of courseHoles) {
    const holeNumber = integer(pick(row, "Hole Number"));
    if (holeNumber === null || holeNumber < 1 || holeNumber > 18) {
      warnings.push(warning(
        "Invalid Hole Number",
        {
          matchId: "",
          year: integer(pick(row, "Year")),
          round: null,
          matchNumber: null,
          playerId: "",
          teamId: "",
        },
        "Hole Number",
        "Enter a whole Hole Number from 1 through 18 in Course Holes.",
        `Received ${clean(pick(row, "Hole Number")) || "blank"}.`
      ));
    }
  }
  const matchById = new Map();
  for (const match of matches) {
    const matchId = clean(pick(match, "Match ID"));
    if (matchId) matchById.set(matchId, match);
  }
  const actualByMatch = new Map();
  for (const row of roundScorecards) {
    const matchId = clean(pick(row, "Match ID"));
    if (!actualByMatch.has(matchId)) actualByMatch.set(matchId, []);
    actualByMatch.get(matchId).push(row);
  }

  const normalized = roundScorecards.map((row) => {
    const rowIdentity = matchIdentity(row);
    const match = matchById.get(rowIdentity.matchId);
    const matchInfo = matchIdentity(match || {});
    const scoreType = normalizeScoreType(pick(row, "Score Type"), rowIdentity.format || matchInfo.format);
    const playerId = clean(pick(row, "Player ID"));
    const teamId = clean(pick(row, "Team ID"));
    const matchTeam = match
      ? matchTeams(match, teamNames).find((team) => sameId(team.teamId, teamId))
      : null;
    const participantPlayerIds = scoreType === "INDIVIDUAL"
      ? (playerId ? [playerId] : [])
      : (matchTeam?.playerIds || []);
    const resolvedCourse = courseForMatch(match || row, courses);
    const tee = match ? teeForMatch(match, courses) : clean(pick(resolvedCourse, "Tee", "Tee Played", "Tee Name"));
    const courseId = rowIdentity.courseId || matchInfo.courseId;
    const playerSide = scoreType === "INDIVIDUAL" && match && playerId
      ? matchSideForPlayer(match, playerId)
      : null;
    const teamSide = scoreType === "TEAM" && match
      ? matchTeams(match, teamNames).find((team) => sameId(team.teamId, teamId))?.side || null
      : null;
    const side = playerSide?.side || teamSide;
    const sideTeam = side && match ? matchTeams(match, teamNames).find((team) => team.side === side) : null;
    const strokesReceived = match && side
      ? officialStrokeValue(match, side, playerSide?.playerSlot || null)
      : null;
    const holeValidation = courseHoleValidation(courseHoles, courseId, tee);
    const netAvailable = holeValidation.valid && strokesReceived !== null && strokesReceived >= 0;
    const holes = Array.from({ length: 18 }, (_, index) => {
      const holeNumber = index + 1;
      const rawScore = pick(row, `Hole ${holeNumber}`);
      const score = rawScore === "" || rawScore === null || rawScore === undefined
        ? null
        : number(rawScore);
      const metadata = courseHoleFor(holesByCourse, courseId, tee, holeNumber);
      const par = number(pick(metadata, "Par"));
      const strokeIndex = integer(pick(metadata, "Stroke Index"));
      const strokesAllocated = netAvailable ? getStrokesOnHole(strokesReceived, strokeIndex) : null;
      const netScore = netAvailable
        ? (scoreType === "TEAM"
            ? calculateScrambleNetHoleScore(score, strokesAllocated)
            : calculateIndividualNetHoleScore(score, strokesAllocated))
        : null;
      return {
        holeNumber,
        score,
        par,
        yardage: number(pick(metadata, "Yardage")),
        strokeIndex,
        strokesAllocated,
        netScore,
        toPar: score !== null && par !== null ? score - par : null,
        netToPar: netScore !== null && par !== null ? netScore - par : null,
      };
    });
    const completedHoleCount = holes.filter((hole) => hole.score !== null).length;
    const frontComplete = holes.slice(0, 9).every((hole) => hole.score !== null);
    const backComplete = holes.slice(9).every((hole) => hole.score !== null);
    const frontNine = frontComplete ? sum(holes.slice(0, 9).map((hole) => hole.score)) : null;
    const backNine = backComplete ? sum(holes.slice(9).map((hole) => hole.score)) : null;
    const total = completedHoleCount === 18 ? sum(holes.map((hole) => hole.score)) : null;
    const allPars = holes.every((hole) => hole.par !== null);
    const totalToPar = total !== null && allPars ? total - sum(holes.map((hole) => hole.par)) : null;
    const status = normalizeStatus(pick(row, "Scorecard Status"), completedHoleCount);
    const context = {
      ...rowIdentity,
      playerId,
      teamId,
    };

    holes.forEach((hole) => {
      if (hole.score !== null && (hole.score < 1 || hole.score > 20)) {
        warnings.push(warning(
          "Invalid Hole Score",
          context,
          `Hole ${hole.holeNumber}`,
          "Enter a golf score from 1 through 20, or leave the cell blank.",
          `Received ${hole.score}.`
        ));
      }
    });
    const holesWithoutMapping = holes.filter((hole) =>
      hole.score !== null && !courseHoleFor(holesByCourse, courseId, tee, hole.holeNumber)
    );
    if (holesWithoutMapping.length) {
      warnings.push(warning(
        "Missing Course Hole Mapping",
        context,
        `Hole ${holesWithoutMapping.map((hole) => hole.holeNumber).join(", ")}`,
        "Add the matching Course ID, Tee, and Hole Number rows to Course Holes.",
        `${holesWithoutMapping.length} recorded holes cannot resolve metadata for ${courseId || "a blank Course ID"}${tee ? ` / ${tee}` : ""}.`
      ));
    }
    const holesWithoutPar = holes.filter((hole) => {
      const courseHole = courseHoleFor(holesByCourse, courseId, tee, hole.holeNumber);
      return hole.score !== null && courseHole && hole.par === null;
    });
    if (holesWithoutPar.length) {
      warnings.push(warning(
        "Missing Course Hole Mapping",
        context,
        `Hole ${holesWithoutPar.map((hole) => hole.holeNumber).join(", ")} Par`,
        "Add Par to the matching Course Holes rows.",
        `${holesWithoutPar.length} mapped holes are missing Par.`
      ));
    }

    if (!tee) warnings.push(warning(
      "Missing Tee Mapping",
      context,
      "Tee",
      "Set Tee on the matching Matches or Courses row."
    ));
    if (tee && holeValidation.matchingCount !== 18) warnings.push(warning(
      "Missing Tee Mapping",
      context,
      "Course ID + Tee",
      "Add all 18 matching Course Holes rows for this Course ID and Tee.",
      `${holeValidation.matchingCount} of 18 hole rows were found for ${courseId || "(blank)"} / ${tee}.`
    ));
    if (holeValidation.missingStrokeIndex) warnings.push(warning(
      "Missing Stroke Index",
      context,
      "Stroke Index",
      "Enter a Stroke Index from 1 through 18 for every matching Course Holes row."
    ));
    if (holeValidation.invalidStrokeIndex) warnings.push(warning(
      "Invalid Stroke Index",
      context,
      "Stroke Index",
      "Use each whole Stroke Index from 1 through 18 exactly once."
    ));
    if (holeValidation.duplicateStrokeIndexes.length) warnings.push(warning(
      "Duplicate Stroke Index",
      context,
      "Stroke Index",
      "Use each Stroke Index from 1 through 18 exactly once.",
      `Duplicated: ${holeValidation.duplicateStrokeIndexes.join(", ")}.`
    ));
    if (strokesReceived === null) warnings.push(warning(
      scoreType === "TEAM"
        ? "Scramble Team Stroke Mapping Missing"
        : format(rowIdentity.format || matchInfo.format) === "BB"
          ? "Best Ball Player Stroke Mapping Missing"
          : "Strokes Received Cannot Be Resolved",
      context,
      scoreType === "TEAM" ? `Team ${side || "?"} Stroke` : "Player Stroke",
      "Enter the official strokes received in the matching Matches row."
    ));
    if (!courseId || !courses.some((course) => sameId(pick(course, "Course ID"), courseId))) {
      warnings.push(warning(
        "Missing Course Hole Mapping",
        context,
        "Course ID",
        "Use a Course ID that exists in Courses and Course Holes.",
        courseId ? `Course ID ${courseId} was not found.` : "Course ID is blank."
      ));
    }
    if (status === "PARTIAL") warnings.push(warning(
      "Partial Scorecard",
      context,
      "Scorecard Status",
      "Complete the remaining holes or keep the row marked PARTIAL.",
      `${completedHoleCount} of 18 holes are recorded.`
    ));
    if (["COMPLETE", "VERIFIED"].includes(status) && completedHoleCount !== 18) {
      warnings.push(warning(
        "Complete Scorecard Missing Holes",
        context,
        "Scorecard Status",
        `Fill all 18 hole scores or change Scorecard Status to ${completedHoleCount ? "PARTIAL" : "MISSING"}.`,
        `${completedHoleCount} of 18 holes are recorded.`
      ));
    }
    const rawStatus = clean(pick(row, "Scorecard Status")).toUpperCase();
    if (rawStatus && !SCORECARD_STATUSES.has(rawStatus)) {
      warnings.push(warning(
        "Invalid Scorecard Status",
        context,
        "Scorecard Status",
        "Use VERIFIED, COMPLETE, PARTIAL, or MISSING.",
        `Received ${rawStatus}.`
      ));
    }
    if (scoreType === "TEAM" && !teamId) warnings.push(warning(
      "Scramble Team Cannot Be Resolved",
      context,
      "Team ID",
      "Enter the participating Team ID on the team scorecard row."
    ));
    if (scoreType === "INDIVIDUAL" && !playerId) warnings.push(warning(
      "Scorecard Participant Not in Match",
      context,
      "Player ID",
      "Enter the Player ID for this individual scorecard."
    ));
    if (match && scoreType === "INDIVIDUAL" && playerId && !matchPlayers(match).some((id) => sameId(id, playerId))) {
      warnings.push(warning(
        "Scorecard Participant Not in Match",
        context,
        "Player ID",
        "Use a Player ID assigned to the matching Matches row."
      ));
    }
    if (match && scoreType === "TEAM" && teamId && !matchTeams(match, teamNames).some((team) => sameId(team.teamId, teamId))) {
      warnings.push(warning(
        "Scorecard Participant Not in Match",
        context,
        "Team ID",
        "Use a Team ID assigned to the matching Matches row."
      ));
    }
    if (scoreType === "TEAM" && participantPlayerIds.length !== 2) {
      warnings.push(warning(
        "Team Scorecard Participant Count",
        context,
        "Participating Player IDs",
        "Assign the expected two golfers to this team in the matching Matches row.",
        `${participantPlayerIds.length} participating golfer${participantPlayerIds.length === 1 ? "" : "s"} resolved.`
      ));
    }
    const unresolvedTeamParticipants = scoreType === "TEAM"
      ? participantPlayerIds.filter((id) => !playerNames.has(id))
      : [];
    if (unresolvedTeamParticipants.length) {
      warnings.push(warning(
        "Team Scorecard Participant Cannot Be Resolved",
        context,
        "Participating Player IDs",
        "Use Player IDs that exist in the Players sheet.",
        `Unresolved: ${unresolvedTeamParticipants.join(", ")}.`
      ));
    }
    if (match && rowIdentity.format && rowIdentity.format !== matchInfo.format) {
      warnings.push(warning(
        "Scorecard Format Mismatch",
        context,
        "Format",
        `Change Format to ${matchInfo.format}.`,
        `Round Scorecards has ${rowIdentity.format}; Matches has ${matchInfo.format}.`
      ));
    }
    for (const field of ["year", "round", "matchNumber"]) {
      if (match && rowIdentity[field] !== null && matchInfo[field] !== null && rowIdentity[field] !== matchInfo[field]) {
        const label = field === "matchNumber" ? "Match" : `${field[0].toUpperCase()}${field.slice(1)}`;
        warnings.push(warning(
          "Scorecard Match Metadata Mismatch",
          context,
          label,
          `Change ${label} to ${matchInfo[field]} to match the Matches row.`
        ));
      }
    }

    const scorecard = {
      matchId: rowIdentity.matchId,
      year: rowIdentity.year ?? matchInfo.year,
      round: rowIdentity.round ?? matchInfo.round,
      matchNumber: rowIdentity.matchNumber ?? matchInfo.matchNumber,
      format: rowIdentity.format || matchInfo.format,
      courseId,
      courseName: clean(pick(resolvedCourse, "Course", "Course Name", "Name")) || undefined,
      tee: tee || undefined,
      playerId: playerId || undefined,
      playerName: playerId ? (playerNames.get(playerId) || playerId) : undefined,
      playerSlug: playerId ? (playerSlugs.get(playerId) || undefined) : undefined,
      teamId: teamId || undefined,
      side,
      sideTeamId: sideTeam?.teamId || undefined,
      teamName: teamId
        ? clean(pick(teamNames.find((team) =>
            integer(pick(team, "Year")) === (rowIdentity.year ?? matchInfo.year) &&
            sameId(pick(team, "Team ID"), teamId)
          ), "Team Name", "Team Names", "Name")) || teamId
        : undefined,
      participantPlayerIds,
      participantNames: participantPlayerIds.map((id) => playerNames.get(id) || id),
      participantSlugs: participantPlayerIds.map((id) => playerSlugs.get(id) || ""),
      scoreType,
      holes,
      strokesReceived,
      netAvailable,
      netTotals: netAvailable ? calculateNetTotals(holes) : null,
      frontNine,
      backNine,
      total,
      totalToPar,
      completedHoleCount,
      status,
      source: clean(pick(row, "Source")) || undefined,
      notes: clean(pick(row, "Notes")) || undefined,
      sheetRow: row.__sheetRow || null,
    };
    return { ...scorecard, metrics: calculateScorecardMetrics(scorecard) };
  });

  const duplicateCounts = new Map();
  const scorecardsByMatch = new Map();
  for (const scorecard of normalized) {
    if (!scorecardsByMatch.has(scorecard.matchId)) scorecardsByMatch.set(scorecard.matchId, []);
    scorecardsByMatch.get(scorecard.matchId).push(scorecard);
  }
  for (const [matchId, matchScorecards] of scorecardsByMatch) {
    const matchNetScoring = buildMatchNetScoring(
      matchScorecards.filter((scorecard) => scorecard.status !== "MISSING"),
      matchById.get(matchId),
      teamNames
    );
    for (const scorecard of matchScorecards) scorecard.matchNetScoring = matchNetScoring;
  }
  for (const scorecard of normalized) {
    const key = missingKey(scorecard);
    duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of duplicateCounts) {
    if (count < 2) continue;
    const scorecard = normalized.find((item) => missingKey(item) === key);
    warnings.push(warning(
      "Duplicate Scorecard",
      scorecard,
      scorecard.scoreType === "TEAM" ? "Match ID + Team ID" : "Match ID + Player ID",
      "Keep one scorecard row for this participant and match.",
      `${count} rows use the same scorecard identity.`
    ));
  }

  const expected = expectedScorecards(matches, teamNames, actualByMatch);
  const actualKeys = new Set(normalized
    .filter((scorecard) => scorecard.status !== "MISSING")
    .map(missingKey));
  const explicitMissing = normalized.filter((scorecard) => scorecard.status === "MISSING");
  const missingScorecards = [
    ...expected
      .filter((record) => !actualKeys.has(missingKey(record)))
      .map((record) => ({
        ...record,
        reason: explicitMissing.some((item) => missingKey(item) === missingKey(record))
          ? "Scorecard is explicitly marked MISSING."
          : "No Round Scorecards row exists for this expected participant.",
      })),
  ];
  for (const missing of missingScorecards) {
    warnings.push(warning(
      "Missing Expected Scorecard",
      missing,
      missing.scoreType === "TEAM" ? "Team ID" : "Player ID",
      "Add the expected Round Scorecards row, or add an explicit row marked MISSING."
    ));
  }

  const usableScorecards = normalized.filter((scorecard) => scorecard.status !== "MISSING");
  const individualScorecards = usableScorecards.filter((scorecard) => scorecard.scoreType === "INDIVIDUAL");
  const teamScorecards = usableScorecards.filter((scorecard) => scorecard.scoreType === "TEAM");
  const unresolvedCourseIds = unique(normalized
    .filter((scorecard) => !courses.some((course) => sameId(pick(course, "Course ID"), scorecard.courseId)))
    .map((scorecard) => scorecard.courseId || "(blank)"));
  const unresolvedPlayerIds = unique(normalized
    .filter((scorecard) => scorecard.playerId && !matches.some((match) =>
      clean(pick(match, "Match ID")) === scorecard.matchId &&
      matchPlayers(match).some((id) => sameId(id, scorecard.playerId))
    ))
    .map((scorecard) => scorecard.playerId));
  const unresolvedTeamIds = unique(normalized
    .filter((scorecard) => scorecard.teamId && !expected.some((record) =>
      record.matchId === scorecard.matchId && sameId(record.teamId, scorecard.teamId)
    ))
    .map((scorecard) => scorecard.teamId));

  const report = {
    scorecardRowsLoaded: roundScorecards.length,
    completeScorecards: normalized.filter((scorecard) => scorecard.status === "COMPLETE").length,
    verifiedScorecards: normalized.filter((scorecard) => scorecard.status === "VERIFIED").length,
    partialScorecards: normalized.filter((scorecard) => scorecard.status === "PARTIAL").length,
    missingExpectedScorecards: missingScorecards.length,
    individualScorecards: individualScorecards.length,
    teamScorecards: teamScorecards.length,
    matchesCovered: unique(usableScorecards.map((scorecard) => scorecard.matchId)).length,
    matchesExpected: unique(expected.map((scorecard) => scorecard.matchId)).length,
    coursesCovered: unique(usableScorecards.map((scorecard) => normalizedId(scorecard.courseId))).length,
    unresolvedCourseIds,
    unresolvedPlayerIds,
    unresolvedTeamIds,
    validationWarnings: warnings.length,
  };

  const playerSummary = (playerId) => {
    const cards = individualScorecards.filter((scorecard) => sameId(scorecard.playerId, playerId));
    const expectedCount = expected.filter((record) => sameId(record.playerId, playerId)).length;
    return summarizeScorecards(cards, expectedCount);
  };
  const teamSummary = (teamId) => {
    const cards = teamScorecards.filter((scorecard) => sameId(scorecard.teamId, teamId));
    const expectedCount = expected.filter((record) => sameId(record.teamId, teamId)).length;
    return summarizeScorecards(cards, expectedCount);
  };
  const courseSummary = (courseId, tee = "") => {
    const cards = usableScorecards.filter((scorecard) =>
      sameId(scorecard.courseId, courseId) &&
      (!tee || clean(scorecard.tee).toUpperCase() === clean(tee).toUpperCase())
    );
    return summarizeScorecards(cards, cards.length);
  };

  return {
    scorecards: normalized,
    usableScorecards,
    individualScorecards,
    teamScorecards,
    missingScorecards,
    warnings,
    report,
    courseHoleSummaries: summarizeCourseHoles(usableScorecards),
    playerSummary,
    teamSummary,
    courseSummary,
  };
}

export const SCORECARD_ANALYTICS_STATUSES = Object.freeze([...SCORECARD_STATUSES]);
export const SCORECARD_ANALYTICS_SCORE_TYPES = Object.freeze([...SCORE_TYPES]);
