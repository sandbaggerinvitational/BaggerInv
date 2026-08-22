import { optimizeLineups } from "./lineup-optimizer.js";
import { simulateMatch } from "./match-simulator.js";
import {
  championshipOddsInputFromPredictionBundle,
  predictionInputFingerprint,
} from "./prediction-input-bundle-contract.js";
import {
  allocateStrokes,
  courseHandicap,
  formatCode,
  pick,
  playingHandicaps,
  predict,
  settingsMap,
} from "./prediction-engine.js";
import { buildScorecardCalibrationReport } from "./scorecard-calibration-report.js";
import {
  currentTournamentYear,
  getCourseOptions,
  getFormatCourse,
  getTeamContext,
  holesForTee,
  scorecardForTee,
} from "./tournament-context.js";
import {
  ODDS_ENGINE_VERSION,
  ODDS_PUBLICATION_CONTRACT_VERSION,
  ODDS_SIMULATION_SEED_VERSION,
  simulateTournamentOdds,
} from "./tournament-odds.js";

export const WAR_ROOM_CALCULATION_PARITY_VERSION = "war-room-calculation-parity-v1";
export const WAR_ROOM_CALCULATION_INVOCATION_VERSION = "war-room-calculation-invocation-v1";
export const WAR_ROOM_CALCULATION_ENGINE_VERSIONS = Object.freeze({
  championship: ODDS_ENGINE_VERSION,
  matchup: "prediction-engine.js:sbi-v1",
  simulation: "match-simulator.js:v1",
  optimizer: "lineup-optimizer.js:prediction-engine-v1",
  "team-intelligence": "team-intelligence.js:v1",
  calibration: "scorecard-calibration.js:shadow-v1",
});
export const WAR_ROOM_FLOATING_POINT_POLICY = Object.freeze({
  integerAndCount: "EXACT",
  rankingAndOrder: "EXACT",
  rawFloatingPoint: "EXACT_SAME_RUNTIME_SAME_OPERATION_ORDER",
  display: "EXACT",
  numericTolerance: 0,
});

const clean = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const number = (value, fallback = null) => {
  if (value === null || value === undefined || clean(value) === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const same = (left, right) => clean(left).toUpperCase() === clean(right).toUpperCase();
const hash = (value) => predictionInputFingerprint(value);
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function combinations(rows, size) {
  if (size === 1) return rows.map((row) => [row]);
  const result = [];
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) result.push([rows[left], rows[right]]);
  }
  return result;
}

function keyed(rows, key = "id") {
  return Object.fromEntries(list(rows).map((row) => [clean(row?.[key]), row]).filter(([id]) => id));
}

function logicalOddsOutput(snapshot = {}) {
  const { publishedAt: _publishedAt, ...logical } = snapshot;
  return logical;
}

export function calculationInvocationFingerprint({
  bundleFingerprint,
  engineVersion,
  calculationType,
  phase = "",
  iterations = 0,
  seed = "",
  selectedPlayers = [],
  format = "",
  courseId = "",
  tee = "",
  lineupOrdering = [],
  settingsFingerprint = "",
} = {}) {
  return hash({
    contractVersion: WAR_ROOM_CALCULATION_INVOCATION_VERSION,
    bundleLogicalFingerprint: clean(bundleFingerprint),
    engineVersion: clean(engineVersion),
    calculationType: clean(calculationType),
    phase: clean(phase),
    iterations: Number(iterations) || 0,
    deterministicSeed: clean(seed),
    selectedPlayers: list(selectedPlayers).map(clean),
    format: formatCode(format),
    courseId: clean(courseId),
    tee: clean(tee),
    lineupOrdering: list(lineupOrdering).map(clean),
    settingsEffectiveFingerprint: clean(settingsFingerprint),
  });
}

export function compareCalculationValues(expected, actual, path = "output") {
  const differences = [];
  const compare = (left, right, currentPath) => {
    if (Object.is(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) differences.push({ path: `${currentPath}.length`, expected: left.length, actual: right.length, classification: "VALUE" });
      const leftIds = left.map((row) => clean(row?.id || row?.key || row?.side));
      const rightIds = right.map((row) => clean(row?.id || row?.key || row?.side));
      if (leftIds.every(Boolean) && rightIds.every(Boolean) && leftIds.join("|") !== rightIds.join("|")) {
        differences.push({ path: currentPath, expected: leftIds, actual: rightIds, classification: "ORDER" });
      }
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) compare(left[index], right[index], `${currentPath}[${index}]`);
      return;
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) compare(left[key], right[key], `${currentPath}.${key}`);
      return;
    }
    const classification = left === null || right === null || left === undefined || right === undefined
      ? "NULLABILITY"
      : typeof left !== typeof right
        ? "TYPE"
        : typeof left === "number" && typeof right === "number"
          ? "FLOAT_OR_NUMBER"
          : "VALUE";
    differences.push({ path: currentPath, expected: left, actual: right, classification });
  };
  compare(expected, actual, path);
  return {
    pass: differences.length === 0,
    exact: differences.length === 0,
    numericTolerance: 0,
    counts: Object.fromEntries(["VALUE", "TYPE", "NULLABILITY", "ORDER", "FLOAT_OR_NUMBER"].map((classification) => [
      classification,
      differences.filter((row) => row.classification === classification).length,
    ])),
    differences,
  };
}

function courseContext(data = {}, requestedFormat = "BB") {
  const sheets = data.sheets || {};
  const year = currentTournamentYear(sheets);
  const format = formatCode(requestedFormat);
  const teams = getTeamContext(sheets, year);
  const course = getFormatCourse(sheets, year, format);
  const scorecards = getCourseOptions(sheets, course);
  const assignedTee = clean(pick(course, "Tee", "Tee Name"));
  const tee = scorecards.some((row) => same(pick(row, "Tee", "Tee Name"), assignedTee))
    ? assignedTee
    : clean(pick(scorecards[0], "Tee", "Tee Name")) || assignedTee;
  const scorecard = scorecardForTee(scorecards, tee);
  const values = {
    rating: number(pick(scorecard, "Course Rating", "Rating")),
    slope: number(pick(scorecard, "Slope Rating", "Slope")),
    par: number(pick(scorecard, "Par")),
  };
  const courseId = clean(pick(course, "Course ID"));
  const holes = holesForTee(sheets, course, tee);
  if (!courseId || !tee || !Number.isFinite(values.rating) || !Number.isFinite(values.slope) || !Number.isFinite(values.par)) {
    const error = new Error(`The ${format} course configuration is unavailable for deterministic parity.`);
    error.code = "WAR_ROOM_PARITY_COURSE_CONFIGURATION_UNAVAILABLE";
    throw error;
  }
  return { sheets, year, format, teams, course, courseId, tee, scorecard: values, holes };
}

function strokeContext(format, players, holes) {
  const play = playingHandicaps(format, players.map((player) => player.courseHandicap));
  if (holes.length !== 18) return { handicap: play, strokeMaps: { teamA: Array(18).fill(0), teamB: Array(18).fill(0) } };
  const sideSize = formatCode(format) === "SI" ? 1 : 2;
  if (formatCode(format) === "SC") {
    const teamA = allocateStrokes(play.strokesA, holes);
    const teamB = allocateStrokes(play.strokesB, holes);
    return {
      handicap: {
        ...play,
        frontStrokesA: teamA.slice(0, 9).reduce((sum, value) => sum + value, 0),
        frontStrokesB: teamB.slice(0, 9).reduce((sum, value) => sum + value, 0),
        backStrokesA: teamA.slice(9).reduce((sum, value) => sum + value, 0),
        backStrokesB: teamB.slice(9).reduce((sum, value) => sum + value, 0),
        distributionAdvantageA: teamA.reduce((sum, value, index) => sum + Math.sign(value - teamB[index]), 0),
      },
      strokeMaps: { teamA, teamB },
    };
  }
  const playerMaps = play.playerStrokes.map((strokes) => allocateStrokes(strokes, holes));
  const teamA = holes.map((_, index) => Math.max(...playerMaps.slice(0, sideSize).map((row) => row[index] || 0)));
  const teamB = holes.map((_, index) => Math.max(...playerMaps.slice(sideSize).map((row) => row[index] || 0)));
  return {
    handicap: {
      ...play,
      frontStrokesA: teamA.slice(0, 9).reduce((sum, value) => sum + value, 0),
      frontStrokesB: teamB.slice(0, 9).reduce((sum, value) => sum + value, 0),
      backStrokesA: teamA.slice(9).reduce((sum, value) => sum + value, 0),
      backStrokesB: teamB.slice(9).reduce((sum, value) => sum + value, 0),
      distributionAdvantageA: teamA.reduce((sum, value, index) => sum + Math.sign(value - teamB[index]), 0),
    },
    strokeMaps: { teamA, teamB },
  };
}

function relevantPartnerships(map = {}, teamA = [], teamB = []) {
  const keys = [teamA, teamB].filter((rows) => rows.length === 2).map((rows) => rows.map((row) => row.id).sort().join("|"));
  return Object.fromEntries(keys.map((key) => [key, map[key] || null]));
}

function relevantHeadToHead(map = {}, teamA = [], teamB = []) {
  const keys = teamA.flatMap((left) => teamB.map((right) => [left.id, right.id].sort().join("|")));
  return Object.fromEntries(keys.map((key) => [key, map[key] || null]));
}

function scenarioDomainFingerprints({ data, context, players, teamA, teamB, handicap }) {
  const historical = data.historical || {};
  const ids = players.map((row) => row.id);
  const playerStatistics = Object.fromEntries(ids.map((id) => {
    const { sandbaggerRatings: _ratings, ...statistics } = historical[id] || {};
    return [id, statistics];
  }));
  const ratings = Object.fromEntries(ids.map((id) => [id, historical[id]?.sandbaggerRatings || {}]));
  return {
    PLAYER_STATS: hash(playerStatistics),
    SBR: hash(ratings),
    PARTNERSHIP: hash(relevantPartnerships(data.partnershipPredictionMap || data.partnerships || {}, teamA, teamB)),
    H2H: hash(relevantHeadToHead(data.headToHead || {}, teamA, teamB)),
    HANDICAP: hash({ players: players.map((row) => ({ id: row.id, tournamentHandicap: row.tournamentHandicap, courseHandicap: row.courseHandicap })), handicap }),
    COURSE: hash({ id: context.courseId, tee: context.tee, scorecard: context.scorecard, holes: context.holes }),
    SETTINGS: hash(settingsMap(context.sheets.settings || [])),
    CURRENT_STATE: hash({ year: context.year, teamNames: [context.teams.team1.name, context.teams.team2.name] }),
    ORDERING: hash(ids),
  };
}

function buildMatchupScenarios(data = {}) {
  const rows = [];
  for (const requestedFormat of ["BB", "SC", "SI"]) {
    const context = courseContext(data, requestedFormat);
    const size = context.format === "SI" ? 1 : 2;
    const roster = (team) => team.players.map((player) => {
      const tournamentHandicap = number(player.tournamentHandicap);
      const calculated = tournamentHandicap === null ? null : courseHandicap(tournamentHandicap, context.scorecard.rating, context.scorecard.slope, context.scorecard.par);
      return { ...player, tournamentHandicap, courseHandicap: calculated };
    }).filter((player) => Number.isFinite(player.courseHandicap));
    const teamOneLineups = combinations(roster(context.teams.team1), size);
    const teamTwoLineups = combinations(roster(context.teams.team2), size);
    for (const teamA of teamOneLineups) for (const teamB of teamTwoLineups) {
      const players = context.format === "SI" ? [teamA[0], teamB[0]] : [...teamA, ...teamB];
      const strokes = strokeContext(context.format, players, context.holes);
      const prediction = predict({
        format: context.format,
        players,
        historical: data.historical || {},
        partnership: data.partnershipPredictionMap || data.partnerships || {},
        headToHead: data.headToHead || {},
        handicap: strokes.handicap,
        settings: settingsMap(context.sheets.settings || []),
        teamNames: [context.teams.team1.name, context.teams.team2.name],
      });
      const playerIds = players.map((row) => row.id);
      rows.push({
        id: `${context.format}|${playerIds.join("|")}`,
        format: context.format,
        year: context.year,
        courseId: context.courseId,
        tee: context.tee,
        playerIds,
        prediction,
        strokeMaps: strokes.strokeMaps,
        handicap: strokes.handicap,
        domainFingerprints: scenarioDomainFingerprints({ data, context, players, teamA, teamB, handicap: strokes.handicap }),
      });
    }
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

function changedDomains(expected = {}, actual = {}) {
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].filter((domain) => expected[domain] !== actual[domain]).sort();
}

function compactDifferences(result, limit = 12) {
  return result.differences.slice(0, limit).map((row) => ({ path: row.path, classification: row.classification, expected: row.expected, actual: row.actual }));
}

function comparisonSummary({ expected, actual, inputDomains = [], limit = 12 }) {
  const compared = compareCalculationValues(expected, actual);
  const attributed = compared.differences.length && inputDomains.length > 0;
  return {
    exact: compared.pass,
    outputDifferenceCount: compared.differences.length,
    causalDomains: inputDomains,
    disposition: compared.pass ? "EXACT" : attributed ? "INTENTIONAL_CANONICAL_DIFFERENCE" : "UNEXPLAINED",
    unexplainedDifferences: compared.pass || attributed ? 0 : compared.differences.length,
    differences: compactDifferences(compared, limit),
  };
}

function repeatResult(operation, repeat = 2) {
  const startedAt = performance.now();
  const results = [];
  const timings = [];
  for (let attempt = 0; attempt < repeat; attempt += 1) {
    const attemptStartedAt = performance.now();
    results.push(operation());
    timings.push(Math.max(0, performance.now() - attemptStartedAt));
  }
  const fingerprints = results.map(hash);
  return {
    result: results[0],
    fingerprints,
    repeatable: new Set(fingerprints).size === 1,
    timingsMs: timings,
    totalExecutionMs: Math.max(0, performance.now() - startedAt),
  };
}

function currentPhase(bundle = {}) {
  if (clean(bundle.tournament?.lifecycle).toUpperCase() === "FINAL") return "Final Results";
  const round = Number(bundle.tournament?.currentRound || 0);
  if (round >= 3) return "Round 3 Pairings Announced";
  if (round === 2) return "After Round 1";
  return "Pre-Tournament";
}

function championshipDomainFingerprints(data = {}, phase = "") {
  const sheets = data.sheets || {};
  const year = currentTournamentYear(sheets);
  const teams = getTeamContext(sheets, year);
  const roster = [...teams.team1.players.map((row) => ({ id: row.id, side: 1 })), ...teams.team2.players.map((row) => ({ id: row.id, side: 2 }))];
  const ratings = Object.fromEntries(roster.map((row) => [row.id, data.historical?.[row.id]?.sandbaggerRatings || {}]));
  const matches = list(sheets.matches).filter((row) => number(pick(row, "Year")) === year).map((row) => ({
    id: clean(pick(row, "Match ID")), round: number(pick(row, "Round")), format: formatCode(pick(row, "Format")),
    teamOne: [pick(row, "Team 1 Player 1"), pick(row, "Team 1 Player 2")].map(clean).filter(Boolean),
    teamTwo: [pick(row, "Team 2 Player 1"), pick(row, "Team 2 Player 2")].map(clean).filter(Boolean),
    teamOnePoints: number(pick(row, "Team 1 Points")), teamTwoPoints: number(pick(row, "Team 2 Points")),
  }));
  const rules = list(sheets.tournamentRules).filter((row) => number(pick(row, "Year")) === year).map((row) => ({
    round: number(String(pick(row, "Round")).replace(/\D/g, "")), format: formatCode(pick(row, "Format")), points: number(pick(row, "Points Available"), 3),
  }));
  return {
    SBR: hash(ratings),
    CURRENT_STATE: hash({ year, phase, matches, rules }),
    IDENTITY: hash(roster),
    ORDERING: hash({ roster: roster.map((row) => row.id), matches: matches.map((row) => row.id) }),
  };
}

export function runChampionshipParitySource(prepared, { phase = "", iterations = 10_000, repeat = 2 } = {}) {
  const selectedPhase = clean(phase) || currentPhase(prepared.bundle);
  const deterministicSeed = `${prepared.bundle.tournament.year}|${selectedPhase}|${ODDS_SIMULATION_SEED_VERSION}`;
  const engineInputs = championshipOddsInputFromPredictionBundle(prepared.bundle);
  const run = repeatResult(() => logicalOddsOutput(simulateTournamentOdds({
    sheets: engineInputs.sheets,
    historical: engineInputs.historical,
    phase: selectedPhase,
    iterations,
    contractVersion: ODDS_PUBLICATION_CONTRACT_VERSION,
  })), repeat);
  return {
    source: prepared.source,
    phase: selectedPhase,
    iterations,
    seed: deterministicSeed,
    invocationFingerprint: calculationInvocationFingerprint({
      bundleFingerprint: prepared.bundle.fingerprints.bundle,
      engineVersion: ODDS_ENGINE_VERSION,
      calculationType: "championship",
      phase: selectedPhase,
      iterations,
      seed: deterministicSeed,
      lineupOrdering: prepared.bundle.ordering?.keys?.pairings || [],
      settingsFingerprint: prepared.bundle.predictionSettings.effectiveFingerprint,
    }),
    domainFingerprints: championshipDomainFingerprints(engineInputs, selectedPhase),
    output: run.result,
    outputFingerprint: run.fingerprints[0],
    repeatability: { pass: run.repeatable, fingerprints: run.fingerprints },
    performance: { executionMs: run.timingsMs, totalExecutionMs: run.totalExecutionMs },
  };
}

export function compareChampionshipParity(expected, actual) {
  const domains = changedDomains(expected.domainFingerprints, actual.domainFingerprints);
  const comparison = comparisonSummary({ expected: expected.output, actual: actual.output, inputDomains: domains });
  const expectedTeams = keyed(expected.output.teams, "side");
  const actualTeams = keyed(actual.output.teams, "side");
  const expectedPlayers = keyed(expected.output.players);
  const actualPlayers = keyed(actual.output.players);
  const teamDifferences = [...new Set([...Object.keys(expectedTeams), ...Object.keys(actualTeams)])].filter((id) => hash(expectedTeams[id]) !== hash(actualTeams[id]));
  const playerDifferences = [...new Set([...Object.keys(expectedPlayers), ...Object.keys(actualPlayers)])].filter((id) => hash(expectedPlayers[id]) !== hash(actualPlayers[id]));
  const expectedRanking = list(expected.output.players).map((row) => row.id);
  const actualRanking = list(actual.output.players).map((row) => row.id);
  return {
    pass: comparison.unexplainedDifferences === 0 && expected.repeatability.pass && actual.repeatability.pass,
    ...comparison,
    teamDifferences: teamDifferences.map((id) => ({ id, google: expectedTeams[id], supabase: actualTeams[id], causalDomains: domains })),
    playerDifferenceCount: playerDifferences.length,
    playerDifferences: playerDifferences.slice(0, 30).map((id) => ({ id, google: expectedPlayers[id], supabase: actualPlayers[id], causalDomains: domains })),
    rankings: { exact: expectedRanking.join("|") === actualRanking.join("|"), google: expectedRanking, supabase: actualRanking },
  };
}

export function runMatchupParitySource(prepared, { repeat = 2 } = {}) {
  const startedAt = performance.now();
  const runs = [];
  const timings = [];
  for (let attempt = 0; attempt < repeat; attempt += 1) {
    const attemptStartedAt = performance.now();
    runs.push(buildMatchupScenarios(prepared.consumerData));
    timings.push(Math.max(0, performance.now() - attemptStartedAt));
  }
  const fingerprints = runs.map((rows) => hash(rows.map((row) => [row.id, row.prediction])));
  const rows = runs[0];
  return {
    source: prepared.source,
    rows,
    counts: Object.fromEntries(["BB", "SC", "SI"].map((format) => [format, rows.filter((row) => row.format === format).length])),
    outputFingerprint: fingerprints[0],
    repeatability: { pass: new Set(fingerprints).size === 1, fingerprints },
    performance: { executionMs: timings, totalExecutionMs: Math.max(0, performance.now() - startedAt) },
  };
}

export function compareMatchupParity(expected, actual, { sampleLimit = 20 } = {}) {
  const expectedRows = keyed(expected.rows);
  const actualRows = keyed(actual.rows);
  const ids = [...new Set([...Object.keys(expectedRows), ...Object.keys(actualRows)])].sort();
  let exact = 0;
  let intentional = 0;
  let unexplained = 0;
  let outputDifferences = 0;
  const attributionCounts = {};
  const impactedPlayerCounts = {};
  const samples = [];
  for (const id of ids) {
    const left = expectedRows[id];
    const right = actualRows[id];
    if (!left || !right) {
      unexplained += 1;
      if (samples.length < sampleLimit) samples.push({ id, disposition: "UNEXPLAINED", reason: "SCENARIO_IDENTITY_MISMATCH" });
      continue;
    }
    const comparison = compareCalculationValues(left.prediction, right.prediction, `matchups.${id}`);
    if (comparison.pass) {
      exact += 1;
      continue;
    }
    const domains = changedDomains(left.domainFingerprints, right.domainFingerprints);
    outputDifferences += comparison.differences.length;
    if (!domains.length) unexplained += 1;
    else {
      intentional += 1;
      for (const domain of domains) attributionCounts[domain] = (attributionCounts[domain] || 0) + 1;
      for (const playerId of left.playerIds) impactedPlayerCounts[playerId] = (impactedPlayerCounts[playerId] || 0) + 1;
    }
    if (samples.length < sampleLimit) samples.push({
      id,
      playerIds: left.playerIds,
      disposition: domains.length ? "INTENTIONAL_CANONICAL_DIFFERENCE" : "UNEXPLAINED",
      causalDomains: domains,
      outputDifferenceCount: comparison.differences.length,
      differences: compactDifferences(comparison, 8),
    });
  }
  return {
    pass: unexplained === 0 && expected.repeatability.pass && actual.repeatability.pass,
    comparisonsExecuted: ids.length,
    exactMatches: exact,
    intentionalCanonicalDifferences: intentional,
    unexplainedDifferences: unexplained,
    outputDifferenceCount: outputDifferences,
    attributionCounts,
    impactedPlayerCounts,
    counts: { google: expected.counts, supabase: actual.counts },
    samples,
  };
}

function representativeScenarios(rows = []) {
  const selected = [];
  for (const format of ["BB", "SC", "SI"]) {
    const candidates = rows.filter((row) => row.format === format);
    if (!candidates.length) continue;
    const byEdge = [...candidates].sort((left, right) => Math.abs(left.prediction.teamA - left.prediction.teamB) - Math.abs(right.prediction.teamA - right.prediction.teamB) || left.id.localeCompare(right.id));
    const strongestA = [...candidates].sort((left, right) => right.prediction.teamA - left.prediction.teamA || left.id.localeCompare(right.id))[0];
    const strongestB = [...candidates].sort((left, right) => right.prediction.teamB - left.prediction.teamB || left.id.localeCompare(right.id))[0];
    for (const row of [byEdge[0], strongestA, strongestB]) if (row && !selected.some((candidate) => candidate.id === row.id)) selected.push(row);
  }
  return selected;
}

export function runSimulationParitySource(prepared, { iterations = 10_000, repeat = 2, scenarioIds = [] } = {}) {
  const allRows = buildMatchupScenarios(prepared.consumerData);
  const selected = scenarioIds.length
    ? scenarioIds.map((id) => allRows.find((row) => row.id === id)).filter(Boolean)
    : representativeScenarios(allRows);
  const startedAt = performance.now();
  const rows = selected.map((scenario) => {
    const seed = `step7e|${scenario.id}|simulation-v1`;
    const run = repeatResult(() => simulateMatch({
      format: scenario.format,
      prediction: scenario.prediction,
      strokeMaps: scenario.strokeMaps,
      iterations,
      seed,
    }), repeat);
    return {
      id: scenario.id,
      format: scenario.format,
      playerIds: scenario.playerIds,
      seed,
      iterations,
      domainFingerprints: scenario.domainFingerprints,
      predictionFingerprint: hash(scenario.prediction),
      output: run.result,
      outputFingerprint: run.fingerprints[0],
      repeatability: { pass: run.repeatable, fingerprints: run.fingerprints },
      executionMs: run.timingsMs,
    };
  });
  return { source: prepared.source, rows, totalExecutionMs: Math.max(0, performance.now() - startedAt) };
}

export function compareSimulationParity(expected, actual) {
  const expectedRows = keyed(expected.rows);
  const actualRows = keyed(actual.rows);
  const ids = [...new Set([...Object.keys(expectedRows), ...Object.keys(actualRows)])].sort();
  const comparisons = ids.map((id) => {
    const left = expectedRows[id];
    const right = actualRows[id];
    if (!left || !right) return { id, exact: false, disposition: "UNEXPLAINED", unexplainedDifferences: 1, causalDomains: [] };
    const domains = changedDomains(left.domainFingerprints, right.domainFingerprints);
    return { id, ...comparisonSummary({ expected: left.output, actual: right.output, inputDomains: domains, limit: 8 }) };
  });
  return {
    pass: comparisons.every((row) => row.unexplainedDifferences === 0) && expected.rows.every((row) => row.repeatability.pass) && actual.rows.every((row) => row.repeatability.pass),
    comparisonsExecuted: comparisons.length,
    exactMatches: comparisons.filter((row) => row.exact).length,
    intentionalCanonicalDifferences: comparisons.filter((row) => row.disposition === "INTENTIONAL_CANONICAL_DIFFERENCE").length,
    unexplainedDifferences: comparisons.reduce((sum, row) => sum + row.unexplainedDifferences, 0),
    comparisons,
  };
}

function lineupProjection(result = {}) {
  const rank = (rows) => [...list(rows)].sort((left, right) =>
    right.averageExpectedPoints - left.averageExpectedPoints || right.averageWinProbability - left.averageWinProbability || left.id.localeCompare(right.id)
  ).map((row) => ({
    id: row.id,
    playerIds: list(row.players).map((player) => player.id),
    averageWinProbability: row.averageWinProbability,
    averageLossProbability: row.averageLossProbability,
    averageHalveProbability: row.averageHalveProbability,
    averageExpectedPoints: row.averageExpectedPoints,
    worstCaseWinProbability: row.worstCaseWinProbability,
    worstCaseExpectedPoints: row.worstCaseExpectedPoints,
    bestCaseWinProbability: row.bestCaseWinProbability,
    favorableMatchups: row.favorableMatchups,
    dangerousMatchups: row.dangerousMatchups,
    volatility: row.volatility,
    matchupFingerprint: hash(row.matchups),
  }));
  return {
    matchupCount: result.matchupCount,
    pairingCount: result.pairingCount,
    teamOne: rank(result.team1Pairings),
    teamTwo: rank(result.team2Pairings),
  };
}

function formatDomainFingerprints(data, context) {
  const ids = [...context.teams.team1.players, ...context.teams.team2.players].map((row) => row.id);
  const historical = data.historical || {};
  return {
    PLAYER_STATS: hash(Object.fromEntries(ids.map((id) => {
      const { sandbaggerRatings: _ratings, ...statistics } = historical[id] || {};
      return [id, statistics];
    }))),
    SBR: hash(Object.fromEntries(ids.map((id) => [id, historical[id]?.sandbaggerRatings || {}]))),
    PARTNERSHIP: hash(data.partnershipPredictionMap || data.partnerships || {}),
    H2H: hash(data.headToHead || {}),
    HANDICAP: hash([...context.teams.team1.players, ...context.teams.team2.players].map((row) => ({ id: row.id, handicap: row.tournamentHandicap }))),
    COURSE: hash({ courseId: context.courseId, tee: context.tee, scorecard: context.scorecard }),
    SETTINGS: hash(settingsMap(context.sheets.settings || [])),
    ORDERING: hash(ids),
  };
}

export function runLineupParitySource(prepared, { repeat = 2 } = {}) {
  const formats = {};
  const startedAt = performance.now();
  for (const format of ["BB", "SC", "SI"]) {
    const context = courseContext(prepared.consumerData, format);
    const run = repeatResult(() => lineupProjection(optimizeLineups({
      format,
      team1: context.teams.team1,
      team2: context.teams.team2,
      scorecard: context.scorecard,
      historical: prepared.consumerData.historical || {},
      partnerships: prepared.consumerData.partnershipPredictionMap || prepared.consumerData.partnerships || {},
      headToHead: prepared.consumerData.headToHead || {},
      settings: settingsMap(context.sheets.settings || []),
    })), repeat);
    formats[format] = {
      output: run.result,
      outputFingerprint: run.fingerprints[0],
      repeatability: { pass: run.repeatable, fingerprints: run.fingerprints },
      performance: { executionMs: run.timingsMs, totalExecutionMs: run.totalExecutionMs },
      domainFingerprints: formatDomainFingerprints(prepared.consumerData, context),
    };
  }
  return { source: prepared.source, formats, totalExecutionMs: Math.max(0, performance.now() - startedAt) };
}

export function compareLineupParity(expected, actual) {
  const formats = {};
  let unexplained = 0;
  for (const format of ["BB", "SC", "SI"]) {
    const left = expected.formats[format];
    const right = actual.formats[format];
    const domains = changedDomains(left?.domainFingerprints, right?.domainFingerprints);
    const summary = comparisonSummary({ expected: left?.output, actual: right?.output, inputDomains: domains, limit: 10 });
    const firstRankingDivergence = ["teamOne", "teamTwo"].map((side) => {
      const a = list(left?.output?.[side]).map((row) => row.id);
      const b = list(right?.output?.[side]).map((row) => row.id);
      const index = Array.from({ length: Math.max(a.length, b.length) }, (_, candidate) => candidate).find((candidate) => a[candidate] !== b[candidate]);
      return index === undefined ? null : { side, index, google: a[index] || null, supabase: b[index] || null };
    }).filter(Boolean)[0] || null;
    formats[format] = {
      ...summary,
      matchupCount: { google: left?.output?.matchupCount || 0, supabase: right?.output?.matchupCount || 0 },
      pairingCount: { google: left?.output?.pairingCount || 0, supabase: right?.output?.pairingCount || 0 },
      completeRankingFingerprint: { google: left?.outputFingerprint, supabase: right?.outputFingerprint },
      top10: { google: list(left?.output?.teamOne).slice(0, 10).map((row) => row.id), supabase: list(right?.output?.teamOne).slice(0, 10).map((row) => row.id) },
      top50: { google: list(left?.output?.teamOne).slice(0, 50).map((row) => row.id), supabase: list(right?.output?.teamOne).slice(0, 50).map((row) => row.id) },
      firstRankingDivergence,
      repeatability: { google: left?.repeatability?.pass, supabase: right?.repeatability?.pass },
    };
    unexplained += summary.unexplainedDifferences;
  }
  return {
    pass: unexplained === 0 && Object.values(formats).every((row) => row.repeatability.google && row.repeatability.supabase),
    unexplainedDifferences: unexplained,
    formats,
  };
}

function teamIntelligenceProjection(data = {}) {
  const partnerships = [...list(data.partnerships)].sort((left, right) => clean(left.key).localeCompare(clean(right.key)));
  const eligible = partnerships.filter((row) => Number(row.record?.matches || 0) >= 2);
  const boards = {
    bestBall: (row) => row.formats?.find((item) => item.format === "BB")?.winPercentage,
    scramble: (row) => row.formats?.find((item) => item.format === "SC")?.winPercentage,
    wins: (row) => row.record?.wins,
    holeDifferential: (row) => row.holeDifferential,
    closing: (row) => row.closingDifferential,
    matches: (row) => row.record?.matches,
  };
  const rankings = Object.fromEntries(Object.entries(boards).map(([name, value]) => [name, eligible.map((row) => ({ id: row.key, value: value(row) }))
    .filter((row) => row.value !== null && row.value !== undefined)
    .sort((left, right) => right.value - left.value || left.id.localeCompare(right.id))]));
  const factualPartnerships = partnerships.map(({ summary: _summary, ...row }) => row);
  const editorial = partnerships.map((row) => ({ key: row.key, summary: row.summary || "" }));
  return {
    facts: {
      players: [...list(data.players)].sort((left, right) => clean(left.id).localeCompare(clean(right.id))),
      partnerships: factualPartnerships,
      seasons: [...list(data.seasons)].sort((left, right) => Number(left.year) - Number(right.year)),
      rankings,
    },
    editorial,
  };
}

function intelligenceDomainFingerprints(data = {}) {
  return {
    PLAYER_STATS: hash(data.players || data.historical || {}),
    SBR: hash(list(data.players).map((row) => ({ id: row.id, rating: row.rating }))),
    PARTNERSHIP: hash(data.partnerships || {}),
    SCORECARD: hash(data.scorecardAnalytics?.scorecards || []),
    HISTORICAL_CORRECTION: hash(data.seasons || []),
  };
}

export function runTeamIntelligenceParitySource(prepared, { repeat = 2 } = {}) {
  const run = repeatResult(() => teamIntelligenceProjection(prepared.consumerData), repeat);
  return {
    source: prepared.source,
    output: run.result,
    outputFingerprint: run.fingerprints[0],
    repeatability: { pass: run.repeatable, fingerprints: run.fingerprints },
    domainFingerprints: intelligenceDomainFingerprints(prepared.consumerData),
    performance: { executionMs: run.timingsMs, totalExecutionMs: run.totalExecutionMs },
  };
}

export function compareTeamIntelligenceParity(expected, actual) {
  const domains = changedDomains(expected.domainFingerprints, actual.domainFingerprints);
  const facts = comparisonSummary({ expected: expected.output.facts, actual: actual.output.facts, inputDomains: domains, limit: 12 });
  const editorial = comparisonSummary({ expected: expected.output.editorial, actual: actual.output.editorial, inputDomains: domains, limit: 8 });
  return {
    pass: facts.unexplainedDifferences === 0 && editorial.unexplainedDifferences === 0 && expected.repeatability.pass && actual.repeatability.pass,
    factual: facts,
    editorial,
    unexplainedDifferences: facts.unexplainedDifferences + editorial.unexplainedDifferences,
    repeatability: { google: expected.repeatability.pass, supabase: actual.repeatability.pass },
  };
}

function calibrationOutput(data = {}) {
  const report = buildScorecardCalibrationReport({
    sheets: data.sheets,
    scorecards: data.scorecardAnalytics?.scorecards || [],
    historical: data.historical || {},
    partnerships: data.partnershipPredictionMap || data.partnerships || {},
    headToHead: data.headToHead || {},
  });
  const { generatedAt: _generatedAt, rows = [], ...logical } = report;
  return {
    ...logical,
    rowOrder: rows.map((row) => row.matchId),
    rows: Object.fromEntries(rows.map((row) => [row.matchId, row])),
  };
}

function calibrationDomainFingerprints(data = {}) {
  return {
    PLAYER_STATS: hash(data.historical || {}),
    PARTNERSHIP: hash(data.partnershipPredictionMap || data.partnerships || {}),
    H2H: hash(data.headToHead || {}),
    HANDICAP: hash(data.sheets?.handicaps || []),
    COURSE: hash({ courses: data.sheets?.courses || [], holes: data.sheets?.holes || [] }),
    SCORECARD: hash(data.scorecardAnalytics?.scorecards || []),
    EVIDENCE: hash(list(data.scorecardAnalytics?.scorecards).map((row) => ({ id: row.id, status: row.status, holes: list(row.holes).length }))),
    SETTINGS: hash(settingsMap(data.sheets?.settings || [])),
  };
}

export function runCalibrationParitySource(prepared, { repeat = 2 } = {}) {
  const run = repeatResult(() => calibrationOutput(prepared.consumerData), repeat);
  const output = run.result;
  return {
    source: prepared.source,
    output,
    outputFingerprint: run.fingerprints[0],
    repeatability: { pass: run.repeatable, fingerprints: run.fingerprints },
    domainFingerprints: calibrationDomainFingerprints(prepared.consumerData),
    performance: { executionMs: run.timingsMs, totalExecutionMs: run.totalExecutionMs },
    certification: {
      configuredEnabled: output.settings?.enabled,
      shadowMode: output.shadowMode,
      publicPredictionChanged: Object.values(output.rows || {}).some((row) => row.calibration?.publicPredictionChanged),
      coverage: output.coverage,
      confidenceCounts: Object.fromEntries(["Strong", "Moderate", "Insufficient"].map((confidence) => [confidence, Object.values(output.rows || {}).filter((row) => row.calibration?.confidence === confidence).length])),
    },
  };
}

export function compareCalibrationParity(expected, actual) {
  const domains = changedDomains(expected.domainFingerprints, actual.domainFingerprints);
  const comparison = comparisonSummary({ expected: expected.output, actual: actual.output, inputDomains: domains, limit: 12 });
  return {
    pass: comparison.unexplainedDifferences === 0 && expected.repeatability.pass && actual.repeatability.pass &&
      expected.certification.configuredEnabled === false && actual.certification.configuredEnabled === false &&
      !expected.certification.publicPredictionChanged && !actual.certification.publicPredictionChanged,
    ...comparison,
    certification: { google: expected.certification, supabase: actual.certification },
    repeatability: { google: expected.repeatability.pass, supabase: actual.repeatability.pass },
  };
}

export function compactParitySourceRun(run = {}) {
  const { rows: _rows, output: _output, formats: _formats, domainFingerprints: _domainFingerprints, ...compact } = run;
  if (run.formats) {
    compact.formats = Object.fromEntries(Object.entries(run.formats).map(([format, row]) => [format, {
      outputFingerprint: row.outputFingerprint,
      repeatability: row.repeatability,
      performance: row.performance,
      matchupCount: row.output?.matchupCount,
      pairingCount: row.output?.pairingCount,
    }]));
  }
  if (run.rows) compact.scenarioIds = run.rows.map((row) => row.id);
  return compact;
}
