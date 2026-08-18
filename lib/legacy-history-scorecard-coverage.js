import { legacyHistoryMatchPlayerIds } from "./legacy-history-player-identity.js";

const clean = (value) => String(value ?? "").trim();
const normalizedId = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const unique = (values) => [...new Set(values.filter(Boolean))];

function formatCode(value) {
  const raw = clean(value).toUpperCase();
  if (["BB", "BEST BALL", "BESTBALL", "2 VS 2"].includes(raw)) return "BB";
  if (["SC", "SCRAMBLE", "2-MAN SCRAMBLE", "2 MAN SCRAMBLE"].includes(raw)) return "SC";
  if (["SI", "SINGLES", "SINGLE"].includes(raw)) return "SI";
  return raw;
}

function matchId(match) {
  return clean(match?.["Match ID"] ?? match?.matchId ?? match?.id);
}

function matchYear(match) {
  return Number(match?.Year ?? match?.year);
}

function matchRound(match) {
  return Number(match?.Round ?? match?.round);
}

function matchFormat(match) {
  return formatCode(match?.Format ?? match?.format);
}

function scorecardIdentity(scorecard) {
  const scoreType = clean(scorecard?.scoreType).toUpperCase() === "TEAM" ? "TEAM" : "INDIVIDUAL";
  const participantId = scoreType === "TEAM" ? scorecard?.teamId : scorecard?.playerId;
  return `${clean(scorecard?.matchId)}|${scoreType}|${normalizedId(participantId)}`;
}

function completeScorecard(scorecard) {
  if (!["COMPLETE", "VERIFIED"].includes(clean(scorecard?.status).toUpperCase())) return false;
  if (Number(scorecard?.completedHoleCount) !== 18) return false;
  const recordedHoles = Array.isArray(scorecard?.holes)
    ? scorecard.holes.filter((hole) =>
        hole?.score !== null && hole?.score !== undefined && clean(hole.score) !== "" && Number.isFinite(Number(hole.score))
      ).length
    : 0;
  return recordedHoles === 18;
}

function partialScorecard(scorecard) {
  if (completeScorecard(scorecard)) return false;
  if (clean(scorecard?.status).toUpperCase() === "MISSING") return false;
  return Number(scorecard?.completedHoleCount) > 0 ||
    scorecard?.holes?.some((hole) =>
      hole?.score !== null && hole?.score !== undefined && clean(hole.score) !== "" && Number.isFinite(Number(hole.score))
    );
}

function expectedMatchIdentities(match, matchScorecards, canonicalTeamIds) {
  const id = matchId(match);
  const format = matchFormat(match);
  if (format === "SC") {
    const teamIds = unique(matchScorecards
      .filter((scorecard) => clean(scorecard?.scoreType).toUpperCase() === "TEAM")
      .map((scorecard) => normalizedId(scorecard?.teamId)));
    const expectedTeamIds = teamIds.length === 2 ? teamIds : canonicalTeamIds;
    return expectedTeamIds.length === 2
      ? expectedTeamIds.map((teamId) => `${id}|TEAM|${teamId}`)
      : [];
  }
  if (format === "BB" || format === "SI") {
    const requiredPlayerCount = format === "BB" ? 4 : 2;
    const sourcePlayerIds = unique(matchScorecards
      .filter((scorecard) => clean(scorecard?.scoreType).toUpperCase() === "INDIVIDUAL")
      .map((scorecard) => normalizedId(scorecard?.playerId)));
    const expectedPlayerIds = sourcePlayerIds.length === requiredPlayerCount
      ? sourcePlayerIds
      : [1, 2].flatMap((side) => legacyHistoryMatchPlayerIds(match, side));
    return expectedPlayerIds
      .map((playerId) => `${id}|INDIVIDUAL|${normalizedId(playerId)}`);
  }
  return [];
}

/**
 * Builds legacy archive coverage with explicit units. A logical scorecard is
 * one format-specific scoring identity. Participant UI consumes only complete
 * match scorecards, where every required logical identity has 18 recorded holes.
 */
export function buildLegacyHistoryScorecardCoverage({ year, matches = [], scorecards = [], teamIds = [] } = {}) {
  const targetYear = Number(year);
  const canonicalTeamIds = unique(teamIds.map(normalizedId));
  const yearMatches = matches.filter((match) => matchYear(match) === targetYear && matchId(match));
  const yearScorecards = scorecards.filter((scorecard) => Number(scorecard?.year) === targetYear);
  const scorecardsByMatch = new Map();
  for (const scorecard of yearScorecards) {
    const id = clean(scorecard?.matchId);
    if (!scorecardsByMatch.has(id)) scorecardsByMatch.set(id, []);
    scorecardsByMatch.get(id).push(scorecard);
  }

  const matchCoverage = yearMatches.map((match) => {
    const id = matchId(match);
    const cards = scorecardsByMatch.get(id) || [];
    const expectedIdentities = unique(expectedMatchIdentities(match, cards, canonicalTeamIds));
    const cardsByIdentity = new Map();
    for (const card of cards) {
      const identity = scorecardIdentity(card);
      if (!cardsByIdentity.has(identity)) cardsByIdentity.set(identity, []);
      cardsByIdentity.get(identity).push(card);
    }
    let completeLogicalScorecards = 0;
    let partialLogicalScorecards = 0;
    let missingLogicalScorecards = 0;
    for (const identity of expectedIdentities) {
      const identityCards = cardsByIdentity.get(identity) || [];
      if (identityCards.some(completeScorecard)) completeLogicalScorecards += 1;
      else if (identityCards.some(partialScorecard)) partialLogicalScorecards += 1;
      else missingLogicalScorecards += 1;
    }
    const unknownFormat = !["BB", "SC", "SI"].includes(matchFormat(match));
    const incompleteExpectation = expectedIdentities.length === 0;
    const state = !unknownFormat && !incompleteExpectation && completeLogicalScorecards === expectedIdentities.length
      ? "COMPLETE"
      : completeLogicalScorecards > 0 || partialLogicalScorecards > 0
        ? "PARTIAL"
        : "NONE";
    const expectedSet = new Set(expectedIdentities);
    return {
      matchId: id,
      round: matchRound(match),
      format: matchFormat(match),
      expectedLogicalScorecards: expectedIdentities.length,
      completeLogicalScorecards,
      partialLogicalScorecards,
      recordedLogicalScorecards: completeLogicalScorecards + partialLogicalScorecards,
      missingLogicalScorecards,
      duplicateLogicalRows: [...cardsByIdentity.values()].reduce((sum, rows) => sum + Math.max(0, rows.length - 1), 0),
      unexpectedLogicalRows: [...cardsByIdentity.keys()].filter((identity) => !expectedSet.has(identity)).length,
      state,
      complete: state === "COMPLETE",
    };
  });

  const sum = (field) => matchCoverage.reduce((total, match) => total + match[field], 0);
  const roundNumbers = unique(matchCoverage.map((match) => match.round)).sort((a, b) => a - b);
  const rounds = roundNumbers.map((round) => {
    const roundMatches = matchCoverage.filter((match) => match.round === round);
    const roundSum = (field) => roundMatches.reduce((total, match) => total + match[field], 0);
    return {
      round,
      format: unique(roundMatches.map((match) => match.format)).join("/"),
      canonicalMatches: roundMatches.length,
      expectedLogicalScorecards: roundSum("expectedLogicalScorecards"),
      completeLogicalScorecards: roundSum("completeLogicalScorecards"),
      partialLogicalScorecards: roundSum("partialLogicalScorecards"),
      recordedLogicalScorecards: roundSum("recordedLogicalScorecards"),
      missingLogicalScorecards: roundSum("missingLogicalScorecards"),
      completeMatchScorecards: roundMatches.filter((match) => match.state === "COMPLETE").length,
      partialMatchScorecards: roundMatches.filter((match) => match.state === "PARTIAL").length,
      noScorecardMatches: roundMatches.filter((match) => match.state === "NONE").length,
    };
  });

  return {
    year: targetYear,
    canonicalMatches: matchCoverage.length,
    expectedLogicalScorecards: sum("expectedLogicalScorecards"),
    completeLogicalScorecards: sum("completeLogicalScorecards"),
    partialLogicalScorecards: sum("partialLogicalScorecards"),
    recordedLogicalScorecards: sum("recordedLogicalScorecards"),
    missingLogicalScorecards: sum("missingLogicalScorecards"),
    completeMatchScorecards: matchCoverage.filter((match) => match.state === "COMPLETE").length,
    partialMatchScorecards: matchCoverage.filter((match) => match.state === "PARTIAL").length,
    noScorecardMatches: matchCoverage.filter((match) => match.state === "NONE").length,
    duplicateLogicalRows: sum("duplicateLogicalRows"),
    unexpectedLogicalRows: sum("unexpectedLogicalRows"),
    completeMatchIds: matchCoverage.filter((match) => match.complete).map((match) => match.matchId),
    partialMatchIds: matchCoverage.filter((match) => match.state === "PARTIAL").map((match) => match.matchId),
    availableMatchIds: matchCoverage.filter((match) => match.state !== "NONE").map((match) => match.matchId),
    matches: matchCoverage,
    rounds,
  };
}

export function legacyHistoryScorecardAvailability(coverage, { scope = "tournament" } = {}) {
  const available = Number(coverage?.completeMatchScorecards) || 0;
  const total = Number(coverage?.canonicalMatches) || 0;
  if (!available) {
    return scope === "round"
      ? "Detailed historical scorecards are not available for this round."
      : "Detailed historical scorecards are not available for this tournament.";
  }
  const noun = total === 1 ? "match" : "matches";
  return available === total
    ? `Available for all ${total} ${noun}`
    : `Available for ${available} matches`;
}
