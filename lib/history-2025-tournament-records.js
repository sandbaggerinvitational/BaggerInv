import { legacyHistoryMatchPlayerIds } from "./legacy-history-player-identity.js";
import {
  buildMatchNetScoring,
  officialStrokeValue,
} from "./scorecard-analytics.js";
import {
  calculateNetTotals,
  calculateScrambleNetHoleScore,
  getStrokesOnHole,
} from "./scorecard-net.js";

const TARGET_YEAR = 2025;
const clean = (value) => String(value ?? "").trim();
const normalizedId = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
const sameId = (a, b) => Boolean(normalizedId(a)) && normalizedId(a) === normalizedId(b);
const unique = (values) => [...new Set(values.filter(Boolean))];
const finite = (value) => value !== null && value !== undefined && clean(value) !== "" && Number.isFinite(Number(value));

function formatCode(value) {
  const raw = clean(value).toUpperCase();
  if (["BB", "BEST BALL", "BESTBALL", "2 VS 2"].includes(raw)) return "BB";
  if (["SC", "SCRAMBLE", "2-MAN SCRAMBLE", "2 MAN SCRAMBLE"].includes(raw)) return "SC";
  if (["SI", "SINGLES", "SINGLE"].includes(raw)) return "SI";
  return raw;
}

function formatName(value) {
  return ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[formatCode(value)] || "";
}

function statusAllowsEvidence(scorecard) {
  return clean(scorecard?.status).toUpperCase() !== "MISSING";
}

function hasCompleteRound(scorecard) {
  return statusAllowsEvidence(scorecard) &&
    Number(scorecard?.completedHoleCount) === 18 &&
    finite(scorecard?.total) &&
    Array.isArray(scorecard?.holes) &&
    scorecard.holes.length === 18 &&
    scorecard.holes.every((hole) => finite(hole?.score));
}

function hasCompleteNine(scorecard, start) {
  const holes = Array.isArray(scorecard?.holes) ? scorecard.holes.slice(start, start + 9) : [];
  return statusAllowsEvidence(scorecard) && holes.length === 9 && holes.every((hole) => finite(hole?.score));
}

function sideNumber(value) {
  if ([1, 2].includes(Number(value))) return Number(value);
  const match = clean(value).match(/(?:team\s*)?([12])$/i);
  return match ? Number(match[1]) : null;
}

function teamId(team) {
  return clean(team?.id ?? team?.["Team ID"]);
}

function teamName(team) {
  return clean(team?.name ?? team?.["Team Names"] ?? team?.["Team Name"]);
}

function teamSide(team) {
  return sideNumber(team?.side ?? team?.["Team Side"]);
}

function playerIdentity(entry) {
  const player = entry?.player && typeof entry.player === "object" ? entry.player : entry;
  return {
    id: clean(player?.["Player ID"] ?? player?.id ?? entry?.playerId),
    name: clean(player?.["Display Name"] ?? player?.name ?? entry?.name),
  };
}

function playerNameMap(teams) {
  const entries = teams.flatMap((team) => Array.isArray(team?.roster) ? team.roster : []);
  return new Map(entries.map(playerIdentity).filter((player) => player.id).map((player) => [normalizedId(player.id), player.name || player.id]));
}

function matchId(match) {
  return clean(match?.["Match ID"] ?? match?.matchId ?? match?.id);
}

function scoringIdentity(scorecard) {
  const classification = classify2025TournamentRecordScorecard(scorecard);
  const participant = classification === "TEAM" ? scorecard?.teamId : scorecard?.playerId;
  return `${clean(scorecard?.matchId)}|${classification || "UNCLASSIFIED"}|${normalizedId(participant)}`;
}

function deduplicateScorecards(scorecards) {
  const seen = new Set();
  return scorecards.filter((scorecard) => {
    const identity = scoringIdentity(scorecard);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/**
 * Tournament records must use the match format as their scoring authority.
 * Unknown formats and incompatible score types are deliberately not guessed.
 */
export function classify2025TournamentRecordScorecard(scorecard) {
  const format = formatCode(scorecard?.format);
  const scoreType = clean(scorecard?.scoreType).toUpperCase();
  if (["BB", "SI"].includes(format) && scoreType === "INDIVIDUAL") return "INDIVIDUAL";
  if (format === "SC" && scoreType === "TEAM") return "TEAM";
  return null;
}

function resolveTeamCardSides(scorecards, teams) {
  const canonicalTeams = teams
    .map((team) => ({ source: team, side: teamSide(team), id: teamId(team), name: teamName(team) }))
    .filter((team) => team.side);
  const cardsByMatch = new Map();
  for (const scorecard of scorecards.filter((card) => classify2025TournamentRecordScorecard(card) === "TEAM")) {
    if (!cardsByMatch.has(scorecard.matchId)) cardsByMatch.set(scorecard.matchId, []);
    cardsByMatch.get(scorecard.matchId).push(scorecard);
  }
  const resolved = new Map();
  for (const cards of cardsByMatch.values()) {
    const usedSides = new Set();
    const unresolved = [];
    for (const card of cards) {
      const directSide = sideNumber(card.side) || canonicalTeams.find((team) =>
        sameId(team.id, card.teamId) || sameId(team.name, card.teamName)
      )?.side || null;
      if (directSide && !usedSides.has(directSide)) {
        resolved.set(card, directSide);
        usedSides.add(directSide);
      } else {
        unresolved.push(card);
      }
    }
    const availableSides = canonicalTeams.map((team) => team.side).filter((side) => !usedSides.has(side));
    // The legacy archive's established fallback is safe only when one
    // unmatched source identity maps to one remaining canonical match side.
    if (unresolved.length === 1 && availableSides.length === 1) {
      resolved.set(unresolved[0], availableSides[0]);
    }
  }
  return { canonicalTeams, resolved };
}

function buildContextResolver({ scorecards, matches, teams }) {
  const matchById = new Map(matches.map((match) => [matchId(match), match]).filter(([id]) => id));
  const namesByPlayerId = playerNameMap(teams);
  const { canonicalTeams, resolved: teamCardSides } = resolveTeamCardSides(scorecards, teams);
  const teamForSide = (side) => canonicalTeams.find((team) => team.side === side) || null;
  const resolveNames = (ids, fallback = []) => ids.map((id, index) =>
    namesByPlayerId.get(normalizedId(id)) || clean(fallback[index]) || clean(id)
  ).filter(Boolean);

  return (scorecard) => {
    const classification = classify2025TournamentRecordScorecard(scorecard);
    const match = matchById.get(clean(scorecard?.matchId));
    const side = classification === "TEAM" ? teamCardSides.get(scorecard) : sideNumber(scorecard?.side);
    const canonicalTeam = teamForSide(side);
    const participantIds = classification === "TEAM" && match && side
      ? legacyHistoryMatchPlayerIds(match, side)
      : (Array.isArray(scorecard?.participantPlayerIds) ? scorecard.participantPlayerIds : []);
    const participantNames = resolveNames(participantIds, scorecard?.participantNames || []);
    const holder = classification === "TEAM"
      ? participantNames.join(" & ")
      : clean(scorecard?.playerName ?? scorecard?.playerId);
    return {
      classification,
      holder,
      playerId: clean(scorecard?.playerId),
      participantIds,
      participantNames,
      team: canonicalTeam?.name || clean(scorecard?.teamName),
      teamId: canonicalTeam?.id || clean(scorecard?.teamId),
      side,
      format: formatCode(scorecard?.format),
      formatName: formatName(scorecard?.format),
      course: clean(scorecard?.courseName),
      round: Number(scorecard?.round) || null,
      matchNumber: Number(scorecard?.matchNumber) || null,
      matchId: clean(scorecard?.matchId),
    };
  };
}

function literalBirdies(scorecard) {
  return (scorecard?.holes || []).filter((hole) => Number(hole?.toPar) === -1).length;
}

function uniqueHolderContexts(contexts) {
  const seen = new Set();
  return contexts.filter((context) => {
    const identity = [context.matchId, context.side, context.holder, context.team]
      .map(clean)
      .join("|");
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/**
 * Resolves participant-facing holders for already-established 2025 Round 2
 * Scramble statistics. The accepted values remain authoritative; this helper
 * only traces every scorecard that produced each value back to its canonical
 * match pairing and team context.
 */
export function build2025ScrambleRoundStatisticHolders({
  scorecards = [],
  matches = [],
  teams = [],
  acceptedValues = {},
} = {}) {
  return buildHistoricalScrambleRoundStatisticHolders({
    year: TARGET_YEAR,
    round: 2,
    scorecards,
    matches,
    teams,
    acceptedValues,
  });
}

export function buildHistoricalScrambleRoundStatisticHolders({
  year,
  round = 2,
  scorecards = [],
  matches = [],
  teams = [],
  acceptedValues = {},
} = {}) {
  const targetYear = Number(year);
  const targetRound = Number(round);
  const teamEvidence = deduplicateScorecards(scorecards).filter((scorecard) =>
    Number(scorecard?.year) === targetYear &&
    Number(scorecard?.round) === targetRound &&
    classify2025TournamentRecordScorecard(scorecard) === "TEAM"
  );
  const resolveContext = buildContextResolver({
    scorecards: teamEvidence,
    matches,
    teams,
  });
  const specifications = {
    mostBirdies: (scorecard) => literalBirdies(scorecard),
    lowestFrontNine: (scorecard) => Number(scorecard?.frontNine),
    lowestBackNine: (scorecard) => Number(scorecard?.backNine),
    lowestTeamRound: (scorecard) => Number(scorecard?.total),
  };

  return Object.fromEntries(Object.entries(specifications).map(([key, valueFor]) => {
    const acceptedValue = Number(acceptedValues[key]);
    const contexts = Number.isFinite(acceptedValue)
      ? uniqueHolderContexts(teamEvidence
        .filter((scorecard) => valueFor(scorecard) === acceptedValue)
        .map(resolveContext)
        .filter((context) => context.holder && context.team))
      : [];
    return [key, contexts.map((context) => ({
      id: `${context.matchId}-${context.side}`,
      name: context.holder,
      subtitle: context.team,
      matchId: context.matchId,
      side: context.side,
    }))];
  }));
}

/**
 * Keeps the accepted Round 2 scorecard evidence intact while resolving the
 * canonical year-scoped identities and optional progression projection used
 * by the completed-history presentation.
 */
export function canonicalize2025ScrambleScorecardPresentation({
  scorecards = [],
  matches = [],
  teams = [],
} = {}) {
  return canonicalizeHistoricalScrambleScorecardPresentation({
    year: TARGET_YEAR,
    round: 2,
    scorecards,
    matches,
    teams,
  });
}

export function canonicalizeHistoricalScrambleScorecardPresentation({
  year,
  round = 2,
  scorecards = [],
  matches = [],
  teams = [],
} = {}) {
  const targetYear = Number(year);
  const targetRound = Number(round);
  const namesBySide = new Map(teams
    .map((team) => [teamSide(team), teamName(team)])
    .filter(([side, name]) => side && name));
  const nameForSide = (side, fallback) => namesBySide.get(Number(side)) || fallback;
  const { resolved: resolvedSides } = resolveTeamCardSides(scorecards, teams);
  const resolveContext = buildContextResolver({ scorecards, matches, teams });
  const matchesById = new Map(matches.map((match) => [matchId(match), match]));
  const canonicalTeamsBySide = new Map(teams
    .map((team) => [teamSide(team), team])
    .filter(([side]) => side));
  const scoringTeamRows = teams.map((team) => ({
    Year: targetYear,
    "Team ID": teamId(team),
    "Team Name": teamName(team),
    "Team Side": teamSide(team),
  }));
  const entries = scorecards.map((scorecard) => {
    if (
      Number(scorecard?.year) !== targetYear ||
      Number(scorecard?.round) !== targetRound ||
      classify2025TournamentRecordScorecard(scorecard) !== "TEAM"
    ) return { presented: scorecard, progressionCard: null };
    const resolvedSide = resolvedSides.get(scorecard) || sideNumber(scorecard.side);
    const context = resolveContext(scorecard);
    const canonicalMatch = matchesById.get(clean(scorecard.matchId));
    const summaryStrokes = canonicalMatch && resolvedSide
      ? officialStrokeValue(canonicalMatch, resolvedSide)
      : null;
    const summaryHoles = summaryStrokes !== null && Array.isArray(scorecard.holes)
      ? scorecard.holes.map((hole) => {
        const strokesAllocated = getStrokesOnHole(summaryStrokes, hole.strokeIndex);
        return {
          ...hole,
          strokesAllocated,
          netScore: calculateScrambleNetHoleScore(hole.score, strokesAllocated),
        };
      })
      : [];
    const summaryNetTotals = summaryHoles.length ? calculateNetTotals(summaryHoles) : null;
    const matchNetScoring = scorecard.matchNetScoring
      ? {
        ...scorecard.matchNetScoring,
        rows: (scorecard.matchNetScoring.rows || []).map((row) => ({
          ...row,
          name: nameForSide(row.side, row.name),
        })),
        holeWinners: (scorecard.matchNetScoring.holeWinners || []).map((hole) => ({
          ...hole,
          winnerName: hole.winnerSide === "A"
            ? nameForSide(1, hole.winnerName)
            : hole.winnerSide === "B"
              ? nameForSide(2, hole.winnerName)
              : hole.winnerName,
        })),
      }
      : scorecard.matchNetScoring;
    const participantPlayerIds = context.participantIds.length
      ? context.participantIds
      : scorecard.participantPlayerIds;
    const participantNames = context.participantNames.length
      ? context.participantNames
      : scorecard.participantNames;
    const canonicalTeam = canonicalTeamsBySide.get(resolvedSide);
    const presented = {
      ...scorecard,
      side: resolvedSide || scorecard.side,
      teamName: nameForSide(resolvedSide, scorecard.teamName),
      participantPlayerIds,
      participantNames,
      historySummary: {
        strokesReceived: summaryStrokes,
        netTotal: summaryNetTotals?.total ?? null,
      },
      matchNetScoring,
    };
    const progressionCard = resolvedSide && summaryHoles.length === 18 && summaryHoles.every((hole) => finite(hole.netScore))
      ? {
        ...presented,
        side: resolvedSide,
        sideTeamId: teamId(canonicalTeam) || scorecard.sideTeamId || scorecard.teamId,
        teamId: teamId(canonicalTeam) || scorecard.teamId,
        holes: summaryHoles,
        strokesReceived: summaryStrokes,
        netAvailable: true,
        netTotals: summaryNetTotals,
      }
      : null;
    return { presented, progressionCard };
  });

  const progressionByMatchId = new Map();
  for (const entry of entries) {
    if (!entry.progressionCard) continue;
    const id = clean(entry.progressionCard.matchId);
    if (!progressionByMatchId.has(id)) progressionByMatchId.set(id, []);
    progressionByMatchId.get(id).push(entry.progressionCard);
  }
  const scoringByMatchId = new Map();
  for (const [id, cards] of progressionByMatchId) {
    const match = matchesById.get(id);
    if (!match || cards.length !== 2) continue;
    const scoring = buildMatchNetScoring(cards, match, scoringTeamRows);
    if (
      !scoring.available ||
      scoring.holeWinners.length !== 18 ||
      scoring.holeWinners.some((hole) => hole.winnerType === "UNAVAILABLE")
    ) continue;
    scoringByMatchId.set(id, scoring);
  }

  return entries.map(({ presented }) => {
    const historyProgressionMatchNetScoring = scoringByMatchId.get(clean(presented.matchId));
    return historyProgressionMatchNetScoring
      ? { ...presented, historyProgressionMatchNetScoring }
      : presented;
  });
}

function selectTiedScorecards(scorecards, valueFor, direction = "lowest") {
  const candidates = scorecards
    .map((scorecard) => ({ scorecard, value: Number(valueFor(scorecard)) }))
    .filter(({ value }) => Number.isFinite(value));
  const value = candidates.length
    ? Math[direction === "highest" ? "max" : "min"](...candidates.map((candidate) => candidate.value))
    : null;
  return {
    value,
    sampleSize: candidates.length,
    winners: candidates.filter((candidate) => candidate.value === value).map((candidate) => candidate.scorecard),
  };
}

function joinedHolders(contexts) {
  return unique(contexts.map((context) => context.holder)).join(" · ");
}

function commonContext(contexts) {
  if (!contexts.length) return "";
  return unique(contexts.map((context) =>
    [context.classification === "TEAM" ? context.team : "", context.formatName, context.course]
      .filter(Boolean)
      .join(" · ")
  )).join(" · ");
}

function accessibleRecord(label, value, holder, context, provenance) {
  return [label, value, holder, context, provenance].filter(Boolean).join(", ");
}

function scoreRecord({ key, label, selection, resolveContext, provenance }) {
  const winnerContexts = selection.winners.map(resolveContext);
  const holder = joinedHolders(winnerContexts);
  const context = commonContext(winnerContexts);
  const value = selection.value === null ? "—" : String(selection.value);
  return {
    key,
    label,
    value,
    detail: holder,
    context,
    sample: provenance,
    accessibleLabel: accessibleRecord(label, value, holder, context, provenance),
    sampleSize: selection.sampleSize,
    winners: winnerContexts,
    tied: winnerContexts.length > 1,
  };
}

function playerBirdieLeaders(scorecards, resolveContext) {
  const players = new Map();
  for (const scorecard of scorecards.filter(statusAllowsEvidence)) {
    const context = resolveContext(scorecard);
    if (!context.playerId) continue;
    const holes = (scorecard.holes || []).filter((hole) => finite(hole?.score) && finite(hole?.par));
    if (!holes.length) continue;
    const birdies = holes.filter((hole) => Number(hole.score) - Number(hole.par) === -1).length;
    const existing = players.get(normalizedId(context.playerId)) || {
      context,
      birdies: 0,
      rounds: 0,
      holes: 0,
    };
    existing.birdies += birdies;
    existing.rounds += 1;
    existing.holes += holes.length;
    players.set(normalizedId(context.playerId), existing);
  }
  const candidates = [...players.values()];
  const value = candidates.length ? Math.max(...candidates.map((candidate) => candidate.birdies)) : null;
  return {
    value,
    candidates,
    winners: candidates.filter((candidate) => candidate.birdies === value),
  };
}

function holeDifficulty(scorecards) {
  const groups = new Map();
  for (const scorecard of scorecards.filter(statusAllowsEvidence)) {
    for (const hole of scorecard.holes || []) {
      if (!finite(hole?.score) || !finite(hole?.par)) continue;
      const key = `${normalizedId(scorecard.courseId)}|${clean(scorecard.tee).toUpperCase()}|${Number(hole.holeNumber)}`;
      if (!groups.has(key)) groups.set(key, {
        course: clean(scorecard.courseName),
        courseId: clean(scorecard.courseId),
        tee: clean(scorecard.tee),
        holeNumber: Number(hole.holeNumber),
        par: Number(hole.par),
        scoreTotal: 0,
        toParTotal: 0,
        sampleSize: 0,
      });
      const group = groups.get(key);
      group.scoreTotal += Number(hole.score);
      group.toParTotal += Number(hole.score) - Number(hole.par);
      group.sampleSize += 1;
    }
  }
  const rows = [...groups.values()].map((group) => ({
    ...group,
    averageScore: group.scoreTotal / group.sampleSize,
    averageToPar: group.toParTotal / group.sampleSize,
  }));
  const compareFractions = (left, right) => left.toParTotal * right.sampleSize - right.toParTotal * left.sampleSize;
  const hardest = rows.reduce((winner, row) => !winner || compareFractions(row, winner) > 0 ? row : winner, null);
  const easiest = rows.reduce((winner, row) => !winner || compareFractions(row, winner) < 0 ? row : winner, null);
  const tiedWith = (winner) => rows.filter((row) => winner && compareFractions(row, winner) === 0);
  return { rows, hardest: tiedWith(hardest), easiest: tiedWith(easiest) };
}

function signedToPar(value) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "Even to par";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} to par`;
}

function holeRecord(key, label, winners) {
  const primary = winners[0] || null;
  const value = primary ? `#${primary.holeNumber}` : "—";
  const detail = primary?.course || "";
  const tied = winners.slice(1).map((winner) => `${winner.course} #${winner.holeNumber}`);
  const context = primary
    ? [signedToPar(primary.averageToPar), tied.length ? `Tied with ${tied.join(" · ")}` : ""].filter(Boolean).join(" · ")
    : "";
  const sample = winners.length === 1
    ? `${primary.sampleSize} individual scores`
    : "Individual scoring only";
  return {
    key,
    label,
    value,
    detail,
    context,
    sample,
    accessibleLabel: accessibleRecord(label, `${detail} ${value}`.trim(), context, sample),
    sampleSize: primary?.sampleSize || 0,
    winners,
    tied: winners.length > 1,
  };
}

/**
 * 2025-only participant record model. It derives read-only analytics from the
 * already-loaded historical evidence and intentionally does not alter the
 * shared scoring-highlights contract used by older years or 2026.
 */
export function build2025TournamentRecords({ scorecards = [], matches = [], teams = [] } = {}) {
  const yearScorecards = deduplicateScorecards(
    scorecards.filter((scorecard) => Number(scorecard?.year) === TARGET_YEAR)
  );
  const classified = yearScorecards.map((scorecard) => ({
    scorecard,
    classification: classify2025TournamentRecordScorecard(scorecard),
  }));
  const individualEvidence = classified
    .filter((entry) => entry.classification === "INDIVIDUAL")
    .map((entry) => entry.scorecard);
  const teamEvidence = classified
    .filter((entry) => entry.classification === "TEAM")
    .map((entry) => entry.scorecard);
  const completeIndividuals = individualEvidence.filter(hasCompleteRound);
  const completeTeams = teamEvidence.filter(hasCompleteRound);
  const eligibleEvidence = [...individualEvidence, ...teamEvidence];
  const resolveContext = buildContextResolver({ scorecards: yearScorecards, matches, teams });

  const bestIndividual = selectTiedScorecards(completeIndividuals, (scorecard) => scorecard.total);
  const bestTeam = selectTiedScorecards(completeTeams, (scorecard) => scorecard.total);
  const lowestFront = selectTiedScorecards(
    eligibleEvidence.filter((scorecard) => hasCompleteNine(scorecard, 0) && finite(scorecard.frontNine)),
    (scorecard) => scorecard.frontNine
  );
  const lowestBack = selectTiedScorecards(
    eligibleEvidence.filter((scorecard) => hasCompleteNine(scorecard, 9) && finite(scorecard.backNine)),
    (scorecard) => scorecard.backNine
  );
  const birdies = playerBirdieLeaders(individualEvidence, resolveContext);
  const individualStrokes = completeIndividuals.reduce((total, scorecard) => total + Number(scorecard.total), 0);
  const averageValue = completeIndividuals.length ? individualStrokes / completeIndividuals.length : null;
  const difficulty = holeDifficulty(individualEvidence);

  const bestIndividualRecord = scoreRecord({
    key: "best-individual-round",
    label: "Best Individual Round",
    selection: bestIndividual,
    resolveContext,
    provenance: `${bestIndividual.sampleSize} individual rounds`,
  });
  const bestTeamRecord = scoreRecord({
    key: "best-team-round",
    label: "Best Team Round",
    selection: bestTeam,
    resolveContext,
    provenance: `${bestTeam.sampleSize} Scramble team rounds`,
  });
  const birdieHolder = unique(birdies.winners.map((winner) => winner.context.holder)).join(" · ");
  const birdieWinnerRounds = unique(birdies.winners.map((winner) => winner.rounds));
  const birdieWinnerHoles = unique(birdies.winners.map((winner) => winner.holes));
  const birdieSample = birdies.winners.length && birdieWinnerRounds.length === 1 && birdieWinnerHoles.length === 1
    ? `${birdieWinnerRounds[0]} individual rounds · ${birdieWinnerHoles[0]} holes`
    : "Individual scoring only";
  const birdieRecord = {
    key: "birdie-leader",
    label: "Birdie Leader",
    value: birdies.value === null ? "—" : String(birdies.value),
    detail: birdieHolder,
    context: "",
    sample: birdieSample,
    accessibleLabel: accessibleRecord("Birdie Leader", birdies.value, birdieHolder, birdieSample),
    sampleSize: individualEvidence.filter(statusAllowsEvidence).reduce((total, scorecard) =>
      total + (scorecard.holes || []).filter((hole) => finite(hole?.score) && finite(hole?.par)).length, 0),
    winners: birdies.winners,
    tied: birdies.winners.length > 1,
  };
  const averageRecord = {
    key: "average-score",
    label: "Average Score",
    value: averageValue === null ? "—" : averageValue.toFixed(1),
    detail: "",
    context: "",
    sample: `${completeIndividuals.length} individual rounds`,
    accessibleLabel: accessibleRecord("Average Score", averageValue === null ? "—" : averageValue.toFixed(1), `${completeIndividuals.length} individual rounds`),
    sampleSize: completeIndividuals.length,
    numerator: individualStrokes,
    rawValue: averageValue,
    winners: [],
    tied: false,
  };
  const lowestFrontRecord = scoreRecord({
    key: "lowest-front",
    label: "Lowest Front",
    selection: lowestFront,
    resolveContext,
    provenance: `Individual & Scramble rounds · ${lowestFront.sampleSize} front nines`,
  });
  const lowestBackRecord = scoreRecord({
    key: "lowest-back",
    label: "Lowest Back",
    selection: lowestBack,
    resolveContext,
    provenance: `Individual & Scramble rounds · ${lowestBack.sampleSize} back nines`,
  });
  const hardestRecord = holeRecord("hardest-hole", "Hardest Hole", difficulty.hardest);
  const easiestRecord = holeRecord("easiest-hole", "Easiest Hole", difficulty.easiest);

  return {
    records: [
      bestIndividualRecord,
      bestTeamRecord,
      birdieRecord,
      averageRecord,
      lowestFrontRecord,
      lowestBackRecord,
      hardestRecord,
      easiestRecord,
    ],
    populations: {
      bestBallCompleteIndividuals: completeIndividuals.filter((scorecard) => formatCode(scorecard.format) === "BB").length,
      singlesCompleteIndividuals: completeIndividuals.filter((scorecard) => formatCode(scorecard.format) === "SI").length,
      completeIndividuals: completeIndividuals.length,
      completeScrambleTeams: completeTeams.length,
      completeLogicalScorecards: completeIndividuals.length + completeTeams.length,
      individualHoleObservations: individualEvidence.filter(statusAllowsEvidence).reduce((total, scorecard) =>
        total + (scorecard.holes || []).filter((hole) => finite(hole?.score) && finite(hole?.par)).length, 0),
      scrambleHoleObservations: teamEvidence.filter(statusAllowsEvidence).reduce((total, scorecard) =>
        total + (scorecard.holes || []).filter((hole) => finite(hole?.score) && finite(hole?.par)).length, 0),
      unknownFormats: classified.filter((entry) => !entry.classification).length,
    },
    proofs: {
      bestIndividual: bestIndividualRecord,
      bestTeam: bestTeamRecord,
      birdieLeader: birdieRecord,
      averageScore: averageRecord,
      lowestFront: lowestFrontRecord,
      lowestBack: lowestBackRecord,
      hardestHole: hardestRecord,
      easiestHole: easiestRecord,
      difficultyMetric: "mean(gross score - par) for each course hole across recorded individual scoring",
    },
  };
}
