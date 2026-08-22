import {
  assemblePredictionInputBundle,
  PREDICTION_INPUT_BUNDLE_VERSION,
  PREDICTION_STATISTICS_VERSION,
  predictionInputFingerprint,
} from "./prediction-input-bundle-contract.js";
import { buildPredictionSettingsProjection } from "./prediction-settings-contract.js";
import { formatCode, pick } from "./prediction-engine.js";
import { buildPlayerComparisonProfiles } from "./player-comparison.js";
import { buildPartnershipIntelligence, buildTeamAggregate } from "./team-intelligence.js";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const list = (value) => Array.isArray(value) ? value : [];
const numeric = (value, fallback = null) => {
  if (value === null || value === undefined || clean(value) === "") return fallback;
  const parsed = Number(clean(value).replace(/[−–—]/g, "-").replace(/[%,$]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const integer = (value, fallback = null) => {
  const parsed = numeric(value, fallback);
  return parsed === null ? null : Math.trunc(parsed);
};
const same = (left, right) => upper(left) === upper(right);

function lifecycle(value) {
  const status = upper(value);
  if (["FINAL", "FINALIZED", "COMPLETE", "COMPLETED"].includes(status)) return "FINAL";
  if (["LIVE", "REOPENED", "OPEN", "IN PROGRESS", "IN-PROGRESS"].includes(status)) return "LIVE";
  if (["UPCOMING", "SCHEDULED", "NOT STARTED", "NOT-STARTED"].includes(status)) return "UPCOMING";
  return status || "UPCOMING";
}

function playerId(value) {
  return clean(value?.["Player ID"] || value?.playerId || value?.id || value);
}

function teamSideNumber(value) {
  const parsed = integer(clean(value).replace(/\D/g, ""), null);
  return parsed === 1 || parsed === 2 ? parsed : null;
}

function currentYear(sheets = {}) {
  const years = [...list(sheets.liveTournaments), ...list(sheets.handicaps)]
    .map((row) => integer(pick(row, "Year")))
    .filter(Number.isInteger);
  return years.length ? Math.max(...years) : null;
}

function currentTeamRows(sheets = {}, year = null) {
  const live = list(sheets.liveTournaments).find((row) => integer(pick(row, "Year")) === year) || {};
  return [1, 2].map((side, sourceOrder) => {
    const row = list(sheets.teamNames).find((candidate) =>
      integer(pick(candidate, "Year")) === year && teamSideNumber(pick(candidate, "Team Side")) === side
    ) || {};
    return {
      id: clean(pick(row, "Team ID")) || `${year}-T${side}`,
      side,
      sideLabel: `Team ${side}`,
      name: clean(pick(live, `Team ${side} Name`, `Team ${side}`) || pick(row, "Team Names", "Team Name", "Name")) || `Team ${side}`,
      captainPlayerId: clean(pick(row, "Captain", "Captain ID")),
      logo: clean(pick(row, "Team Logo", "Logo")),
      primaryColor: clean(pick(row, "Primary Color")),
      secondaryColor: clean(pick(row, "Secondary Color")),
      sourceOrder,
    };
  });
}

function currentPlayerRows(sheets = {}, year = null, teams = []) {
  const identity = Object.fromEntries(list(sheets.players).map((row) => [clean(pick(row, "Player ID", "ID")), row]));
  const teamIdBySide = Object.fromEntries(teams.map((team) => [team.side, team.id]));
  return list(sheets.handicaps).filter((row) => integer(pick(row, "Year")) === year).map((row, sourceOrder) => {
    const id = clean(pick(row, "Player ID"));
    const source = identity[id] || {};
    const side = teamSideNumber(pick(row, "Team Side"));
    return {
      id,
      displayName: clean(pick(source, "Display Name", "Player Name", "Name")) || id,
      teamId: clean(pick(row, "Team ID")) || teamIdBySide[side] || "",
      teamSide: side,
      rosterOrder: integer(pick(row, "Roster Order", "Order", "Player Order"), sourceOrder + 1),
      sourceOrder,
      active: !["INACTIVE", "FALSE", "NO", "0"].includes(upper(pick(row, "Active", "Participation Status"))),
      captain: /^(true|yes|1)$/i.test(clean(pick(row, "Captain"))) || teams.some((team) => team.captainPlayerId === id),
      tournamentHandicap: numeric(pick(row, "Tournament Handicap", "Tournament Handicap Index", "Handicap", "Handicap Index")),
      slug: clean(pick(source, "Slug")),
      photo: clean(pick(source, "Photo Filename", "Photo")),
    };
  }).filter((row) => row.id).sort((left, right) =>
    left.teamSide - right.teamSide || left.rosterOrder - right.rosterOrder || left.sourceOrder - right.sourceOrder
  );
}

function currentCourseForFormat(sheets = {}, year = null, format = "") {
  return list(sheets.courses).find((row) =>
    integer(pick(row, "Year")) === year && formatCode(pick(row, "Format")) === formatCode(format)
  ) || {};
}

function roundRows(sheets = {}, year = null) {
  return list(sheets.tournamentRules).filter((row) => integer(pick(row, "Year")) === year).map((row, sourceOrder) => {
    const number = integer(pick(row, "Round", "Round Number"), sourceOrder + 1);
    const format = formatCode(pick(row, "Format", "Format ID", "Name"));
    const course = currentCourseForFormat(sheets, year, format);
    const segmentPoints = ["Front 9 Points", "Back 9 Points", "Overall Points"]
      .reduce((sum, key) => sum + numeric(pick(row, key), 0), 0);
    return {
      id: clean(pick(row, "Round ID")) || `${year}-R${number}`,
      number,
      name: clean(pick(row, "Round Name", "Name")) || `Round ${number}`,
      format,
      teamSize: integer(pick(row, "Team Size"), format === "SI" ? 1 : 2),
      courseId: clean(pick(course, "Course ID")),
      pointsPerMatch: numeric(pick(row, "Points Available"), segmentPoints || 3),
      sourceOrder,
    };
  }).sort((left, right) => left.number - right.number || left.sourceOrder - right.sourceOrder);
}

function matchParticipant(row, teams, side, slot, sourceOrder) {
  const id = clean(pick(row, `Team ${side} Player ${slot}`));
  if (!id) return null;
  return {
    playerId: id,
    teamId: teams.find((team) => team.side === side)?.id || "",
    teamSide: side,
    slot,
    sourceOrder,
    handicapIndex: numeric(pick(row, `Team ${side} Player ${slot} Handicap Index`)),
    courseHandicap: numeric(pick(row, `Team ${side} Player ${slot} Course HCP`)),
    playingHandicap: numeric(pick(row, `Team ${side} Player ${slot} Playing HCP`)),
    appliedStrokes: numeric(pick(row, `Team ${side} Player ${slot} Stroke`, `Team ${side} Player ${slot} Strokes`)),
  };
}

function currentMatchRows(sheets = {}, year = null, teams = [], rounds = []) {
  const mutable = list(sheets.liveMatches).filter((row) => integer(pick(row, "Year")) === year);
  const sourceRows = mutable.length ? mutable : list(sheets.matches).filter((row) => integer(pick(row, "Year")) === year);
  return sourceRows.map((row, sourceOrder) => {
    const round = integer(pick(row, "Round"), 0);
    const roundConfig = rounds.find((candidate) => candidate.number === round) || {};
    const format = formatCode(pick(row, "Format") || roundConfig.format);
    const configuredCourse = currentCourseForFormat(sheets, year, format);
    const state = lifecycle(pick(row, "Match Status", "Status"));
    const participants = [1, 2].flatMap((side) => [1, 2]
      .map((slot, index) => matchParticipant(row, teams, side, slot, (side - 1) * 2 + index))
      .filter(Boolean));
    const teamOne = numeric(pick(row, "Team 1 Points"));
    const teamTwo = numeric(pick(row, "Team 2 Points"));
    return {
      id: clean(pick(row, "Match ID")) || `${year}-R${round}-${sourceOrder + 1}`,
      round,
      displayNumber: integer(pick(row, "Match", "Match Number"), sourceOrder + 1),
      format,
      teamSize: format === "SI" ? 1 : 2,
      courseId: clean(pick(row, "Course ID")) || clean(roundConfig.courseId) || clean(pick(configuredCourse, "Course ID")),
      tee: clean(pick(row, "Tee", "Tee Played")) || clean(pick(configuredCourse, "Tee", "Tee Played", "Tee Name")),
      lifecycle: state,
      scoringLocked: /^(true|yes|1|locked)$/i.test(clean(pick(row, "Scoring Locked", "Locked"))),
      scorecardComplete: /^(true|yes|1)$/i.test(clean(pick(row, "Scorecard Complete"))),
      currentHole: integer(pick(row, "Current Hole"), 0),
      revision: integer(pick(row, "Revision", "Match Revision"), 0),
      result: {
        winner: state === "FINAL" ? clean(pick(row, "Matchup Winner", "18-Hole Winner")) : "",
        frontWinner: state === "FINAL" ? clean(pick(row, "Front 9 Winner")) : "",
        backWinner: state === "FINAL" ? clean(pick(row, "Back 9 Winner")) : "",
        overallWinner: state === "FINAL" ? clean(pick(row, "18-Hole Winner", "Overall Winner")) : "",
      },
      points: {
        current: { teamOne, teamTwo },
        official: state === "FINAL" ? { teamOne, teamTwo } : { teamOne: null, teamTwo: null },
      },
      pointsAvailable: numeric(pick(row, "Points Available"), roundConfig.pointsPerMatch ?? 3),
      participants,
      sourceOrder,
      pairingOrder: sourceOrder,
    };
  }).sort((left, right) => left.round - right.round || left.pairingOrder - right.pairingOrder);
}

function pairingRows(matches = []) {
  return matches.map((match, order) => ({
    id: match.id,
    round: match.round,
    format: match.format,
    courseId: match.courseId,
    tee: match.tee,
    lifecycle: match.lifecycle,
    order,
    teamOnePlayerIds: match.participants.filter((row) => row.teamSide === 1).map((row) => row.playerId),
    teamTwoPlayerIds: match.participants.filter((row) => row.teamSide === 2).map((row) => row.playerId),
  }));
}

function courseRows(sheets = {}) {
  return list(sheets.courses).map((row, sourceOrder) => {
    const year = integer(pick(row, "Year"));
    const round = integer(clean(pick(row, "Round")).replace(/\D/g, ""), sourceOrder + 1);
    const stableCourseId = clean(pick(row, "Canonical Course ID", "Course ID"));
    const sourceCourseId = clean(pick(row, "Source Course ID", "Course ID"));
    const tee = clean(pick(row, "Tee", "Tee Played", "Tee Name"));
    const matchingHoles = list(sheets.holes).filter((hole) =>
      same(pick(hole, "Course ID"), sourceCourseId) && (!tee || same(pick(hole, "Tee", "Tee Name"), tee))
    ).map((hole) => ({
      holeNumber: integer(pick(hole, "Hole Number")),
      par: numeric(pick(hole, "Par")),
      yardage: numeric(pick(hole, "Yardage")),
      strokeIndex: integer(pick(hole, "Stroke Index", "Handicap", "HCP")),
    })).filter((hole) => hole.holeNumber >= 1 && hole.holeNumber <= 18)
      .sort((left, right) => left.holeNumber - right.holeNumber);
    return {
      stableCourseId,
      sourceCourseId,
      year,
      round,
      appearanceId: `${year}:R${round}:${stableCourseId}`,
      name: clean(pick(row, "Course", "Course Name", "Full Course Name")),
      tee,
      rating: numeric(pick(row, "Rating", "Course Rating")),
      slope: numeric(pick(row, "Slope", "Slope Rating")),
      yardage: numeric(pick(row, "Yardage")),
      par: numeric(pick(row, "Par")),
      holeConfigurationState: matchingHoles.length === 18 ? "COMPLETE" : matchingHoles.length ? "PARTIAL" : "UNAVAILABLE",
      holes: matchingHoles,
      sourceOrder,
    };
  }).filter((row) => row.stableCourseId && Number.isInteger(row.year))
    .sort((left, right) => left.year - right.year || left.round - right.round || left.sourceOrder - right.sourceOrder);
}

function holeRows(courses = []) {
  return courses.flatMap((course) => course.holes.map((hole) => ({
    courseId: course.stableCourseId,
    sourceCourseId: course.sourceCourseId,
    year: course.year,
    round: course.round,
    tee: course.tee,
    holeNumber: hole.holeNumber,
    par: hole.par,
    yardage: hole.yardage,
    strokeIndex: hole.strokeIndex,
    evidence: [hole.par, hole.yardage, hole.strokeIndex].every((value) => value !== null) ? "COMPLETE" : "PARTIAL",
  }))).sort((left, right) => left.year - right.year || left.round - right.round ||
    left.courseId.localeCompare(right.courseId) || left.tee.localeCompare(right.tee) || left.holeNumber - right.holeNumber);
}

function scorecardRows(analytics = {}) {
  return list(analytics.scorecards || analytics.usableScorecards).map((card, sourceOrder) => {
    const holes = list(card.holes).map((hole) => ({
      holeNumber: integer(hole.holeNumber ?? hole.hole_number),
      gross: numeric(hole.gross ?? hole.score),
      net: numeric(hole.net),
      strokes: numeric(hole.strokes),
      par: numeric(hole.par),
      yardage: numeric(hole.yardage),
      strokeIndex: integer(hole.strokeIndex ?? hole.stroke_index),
      toPar: numeric(hole.toPar),
    })).filter((hole) => hole.holeNumber >= 1 && hole.holeNumber <= 18)
      .sort((left, right) => left.holeNumber - right.holeNumber);
    const recordedHoles = holes.filter((hole) => hole.gross !== null || hole.net !== null).length;
    const status = upper(card.availability || card.status);
    const availability = ["COMPLETE", "VERIFIED"].includes(status) && recordedHoles === 18
      ? "COMPLETE" : recordedHoles ? "PARTIAL" : "UNAVAILABLE";
    const ids = [...new Set([card.playerId, ...list(card.participantPlayerIds)].map(clean).filter(Boolean))];
    return {
      id: clean(card.scorecardId || card.id) || `${card.year}:${card.matchId}:${card.playerId || card.teamId || sourceOrder}`,
      year: integer(card.year),
      round: integer(card.round),
      matchId: clean(card.matchId),
      courseId: clean(card.courseId),
      tee: clean(card.tee),
      entityType: upper(card.entityType || card.scoreType) === "INDIVIDUAL" ? "PLAYER" : upper(card.entityType || card.scoreType || (card.playerId ? "PLAYER" : "TEAM")),
      playerIds: ids,
      teamId: clean(card.teamId),
      lifecycle: lifecycle(card.lifecycle || card.matchStatus || "FINAL"),
      availability,
      recordedHoles,
      expectedHoles: 18,
      grossNetSemantics: clean(card.grossNetSemantics || card.scoreSemantics || "LEGACY_GOOGLE_SCORECARD_SEMANTICS"),
      holes: availability === "UNAVAILABLE" ? [] : holes,
      sourceOrder,
    };
  }).sort((left, right) => left.year - right.year || left.round - right.round || left.matchId.localeCompare(right.matchId) || left.sourceOrder - right.sourceOrder);
}

function statisticsRows(calculations = {}) {
  const byPlayer = {};
  for (const row of calculations.getAllPlayerStats()) {
    const id = playerId(row.player);
    if (id) byPlayer[id] = structuredClone(row.stats || {});
  }
  return { contractVersion: PREDICTION_STATISTICS_VERSION, byPlayer, playerIds: Object.keys(byPlayer).sort() };
}

function partnerships(calculations = {}) {
  return Object.fromEntries(calculations.getPartnershipStats().byMatches.map((row) => [row.key, {
    record: structuredClone(row.record || {}),
    byFormat: structuredClone(row.byFormat || {}),
  }]));
}

function headToHead(calculations = {}, ids = []) {
  const result = {};
  for (let left = 0; left < ids.length; left += 1) for (let right = left + 1; right < ids.length; right += 1) {
    result[`${ids[left]}|${ids[right]}`] = structuredClone(calculations.getHeadToHead(ids[left], ids[right]));
  }
  return result;
}

function historicalFacts(calculations = {}, sheets = {}, currentTournamentYear = null) {
  const tournaments = calculations.getTournaments().filter((row) => Number(row.year) < currentTournamentYear).sort((a, b) => a.year - b.year);
  const historicalMatches = tournaments.flatMap((tournament) => calculations.getTournamentMatches(tournament.year).map((match, sourceOrder) => {
    const participants = [1, 2].flatMap((side) => [1, 2].map((slot) => {
      const id = clean(pick(match, `Team ${side} Player ${slot}`));
      return id ? {
        playerId: id,
        teamSide: side,
        slot,
        playingHandicap: numeric(pick(match, `Team ${side} Player ${slot} Playing HCP`)),
        appliedStrokes: numeric(pick(match, `Team ${side} Player ${slot} Stroke`)),
      } : null;
    }).filter(Boolean));
    return {
      id: clean(pick(match, "Match ID")), year: tournament.year, round: integer(pick(match, "Round")),
      format: formatCode(pick(match, "Format")), lifecycle: "FINAL", courseId: clean(pick(match, "Course ID")),
      tee: clean(pick(match, "Tee", "Tee Played")), winner: clean(pick(match, "Matchup Winner", "18-Hole Winner")),
      teamOnePoints: numeric(pick(match, "Team 1 Points")), teamTwoPoints: numeric(pick(match, "Team 2 Points")),
      teamPlayingHandicaps: { teamOne: numeric(pick(match, "Team 1 Playing HCP")), teamTwo: numeric(pick(match, "Team 2 Playing HCP")) },
      teamAppliedStrokes: { teamOne: numeric(pick(match, "Team 1 Stroke")), teamTwo: numeric(pick(match, "Team 2 Stroke")) },
      participants, participantIds: participants.map((row) => row.playerId), sourceOrder,
    };
  })).sort((a, b) => a.year - b.year || a.round - b.round || a.sourceOrder - b.sourceOrder);
  return {
    contractVersion: PREDICTION_STATISTICS_VERSION,
    years: tournaments.map((row) => row.year),
    tournaments: tournaments.map((row) => ({
      id: clean(row.id || row.year), year: row.year, lifecycle: "FINAL", finalScore: clean(row["Final Score"]),
      championTeamId: clean(row.championTeamId), revision: {}, fingerprint: "",
    })),
    teams: tournaments.flatMap((tournament) => list(tournament.teams).map((team, sourceOrder) => ({
      id: clean(team.id), year: tournament.year, side: teamSideNumber(team.side), name: clean(team.name),
      captainPlayerId: clean(team.captainId), rosterPlayerIds: list(team.roster).map((row) => playerId(row.player || row)).filter(Boolean), sourceOrder,
    }))),
    rounds: tournaments.flatMap((tournament) => list(tournament.courses).map((course, sourceOrder) => ({
      id: `${tournament.year}-R${integer(clean(course.Round).replace(/\D/g, ""), sourceOrder + 1)}`,
      year: tournament.year, round: integer(clean(course.Round).replace(/\D/g, ""), sourceOrder + 1),
      format: formatCode(course.Format), course: clean(course.Course), completedPointsAvailable: numeric(course["Points Available"]),
      lifecycle: "FINAL", scoringSemantics: "LEGACY_GOOGLE_RECORDED_FACT", sourceOrder,
    }))),
    players: calculations.getPlayers().map((player) => ({ id: playerId(player), displayName: clean(player["Display Name"]) })).filter((row) => row.id).sort((a, b) => a.id.localeCompare(b.id)),
    matches: historicalMatches,
    recordEligibility: list(sheets.ghostMatches).map((row) => ({
      year: integer(pick(row, "Year")), matchId: clean(pick(row, "Match ID")), playerId: clean(pick(row, "Player ID")),
      eligible: false, reason: clean(pick(row, "Reason", "Reason Code")),
    })),
  };
}

function handicapRows(sheets = {}, year = null, players = [], matches = [], history = {}) {
  const historical = list(sheets.handicaps).filter((row) => integer(pick(row, "Year")) < year).map((row) => ({
    year: integer(pick(row, "Year")), playerId: clean(pick(row, "Player ID")), teamSide: clean(pick(row, "Team Side")),
    tournamentHandicap: numeric(pick(row, "Tournament Handicap")), authority: "LEGACY_GOOGLE_RECORDED_FACT",
  })).sort((a, b) => a.year - b.year || a.playerId.localeCompare(b.playerId));
  const current = players.map((player) => ({
    playerId: player.id, teamId: player.teamId, teamSide: player.teamSide,
    tournamentHandicap: player.tournamentHandicap, authority: "CURRENT_TOURNAMENT_INPUT",
  }));
  const frozen = [...list(history.matches).flatMap((match) => match.participants.map((participant) => ({
    year: match.year, matchId: match.id, lifecycle: "FINAL", playerId: participant.playerId, teamSide: participant.teamSide,
    playingHandicap: participant.playingHandicap, appliedStrokes: participant.appliedStrokes, authority: "LEGACY_GOOGLE_HISTORICAL_MATCH_FACT",
  }))), ...matches.flatMap((match) => match.participants.map((participant) => ({
    year, matchId: match.id, lifecycle: match.lifecycle, playerId: participant.playerId, teamSide: participant.teamSide,
    handicapIndex: participant.handicapIndex, courseHandicap: participant.courseHandicap,
    playingHandicap: participant.playingHandicap, appliedStrokes: participant.appliedStrokes,
    revision: match.revision, authority: "LEGACY_GOOGLE_MATCH_FACT",
  })))];
  return { historical, current, frozenMatchFacts: frozen, courseHandicap: { kind: "DERIVED", contract: "prediction-engine-course-handicap-v1" } };
}

function tournamentState(sheets = {}, year = null, matches = [], rounds = []) {
  const live = list(sheets.liveTournaments).find((row) => integer(pick(row, "Year")) === year) || {};
  const finalMatches = matches.filter((match) => match.lifecycle === "FINAL");
  const configuredLifecycleValue = pick(live, "Tournament Status", "Status");
  const configuredLifecycle = clean(configuredLifecycleValue) ? lifecycle(configuredLifecycleValue) : "LIVE";
  const observedRounds = matches
    .filter((match) => match.lifecycle !== "UPCOMING")
    .map((match) => integer(match.round, 0))
    .filter((round) => round > 0);
  const observedRound = Math.max(1, ...observedRounds);
  const configuredRound = integer(pick(live, "Current Round"), 1);
  const effectiveLifecycle = matches.length && matches.every((match) => match.lifecycle === "FINAL")
    ? "FINAL"
    : matches.some((match) => ["FINAL", "LIVE"].includes(match.lifecycle))
      ? "LIVE"
      : configuredLifecycle;
  const teamOne = finalMatches.reduce((sum, match) => sum + numeric(match.points.official.teamOne, 0), 0);
  const teamTwo = finalMatches.reduce((sum, match) => sum + numeric(match.points.official.teamTwo, 0), 0);
  const configuredPoints = matches.reduce((sum, match) => sum + numeric(match.pointsAvailable, 0), 0);
  return {
    id: clean(pick(live, "Tournament ID")) || String(year), year,
    name: clean(pick(live, "Tournament Name", "Name")), lifecycle: effectiveLifecycle,
    currentRound: Math.max(configuredRound, observedRound),
    timeZone: clean(pick(live, "Timezone", "Time Zone")), configuredPoints, awardedPoints: teamOne + teamTwo,
    remainingPoints: Math.max(0, configuredPoints - teamOne - teamTwo), teamScore: { teamOne, teamTwo },
    matchCounts: { total: matches.length, final: finalMatches.length, live: matches.filter((row) => row.lifecycle === "LIVE").length,
      upcoming: matches.filter((row) => row.lifecycle === "UPCOMING").length, nonFinal: matches.filter((row) => row.lifecycle !== "FINAL").length },
    roundCount: rounds.length,
  };
}

export function buildGooglePredictionInputBundle({ sheets = {}, calculations, scorecardAnalytics = {}, workbookId = "", preparedAt } = {}) {
  if (!calculations) throw Object.assign(new Error("Google historical calculation service is required."), { code: "WAR_ROOM_GOOGLE_HISTORY_REQUIRED" });
  const year = currentYear(sheets);
  const teams = currentTeamRows(sheets, year);
  const players = currentPlayerRows(sheets, year, teams);
  const rounds = roundRows(sheets, year);
  const matches = currentMatchRows(sheets, year, teams, rounds);
  const pairings = pairingRows(matches);
  const courses = courseRows(sheets);
  const holes = holeRows(courses);
  const scorecards = scorecardRows(scorecardAnalytics);
  const statistics = statisticsRows(calculations);
  const ids = [...new Set([...statistics.playerIds, ...players.map((row) => row.id)])].sort();
  const history = historicalFacts(calculations, sheets, year);
  const settingsProjection = buildPredictionSettingsProjection({
    tournamentId: String(year), tournamentYear: year, sourceWorkbookId: workbookId,
    rows: list(sheets.settings), requestedBy: "War Room Google adapter",
  });
  const predictionSettings = {
    revision: null,
    contractVersion: settingsProjection.settings_contract_version,
    effectiveSettings: settingsProjection.effective_settings,
    sourceFingerprint: settingsProjection.source_fingerprint,
    effectiveFingerprint: settingsProjection.effective_settings_fingerprint,
    freshness: "CURRENT",
    readOnlyEligible: true,
    consumerCutoverEligible: true,
    unknownFreshnessPolicy: "Google is the active Director source in Step 7D.",
  };
  const currentTournament = tournamentState(sheets, year, matches, rounds);
  const rules = rounds.map((round) => ({ roundId: round.id, round: round.number, format: round.format, teamSize: round.teamSize,
    courseId: round.courseId, pointsPerMatch: round.pointsPerMatch, scoringSemantics: "LEGACY_GOOGLE_TOURNAMENT_CONFIGURATION",
    nassauSegments: round.pointsPerMatch === 3 ? ["FRONT", "BACK", "OVERALL"] : [] }));
  const handicaps = handicapRows(sheets, year, players, matches, history);
  return assemblePredictionInputBundle({
    preparedAt, environment: "PREVIEW", source: "LEGACY_GOOGLE_PREDICTION_PIPELINE", googleForegroundReads: 1,
    tournament: currentTournament, teams, players, rounds, rules, matches, pairings, courses, holes,
    historicalFacts: history, scorecards, playerStatistics: statistics,
    ratings: Object.fromEntries(Object.entries(statistics.byPlayer).map(([id, stats]) => [id, structuredClone(stats.sandbaggerRatings || {})])),
    partnerships: partnerships(calculations), headToHead: headToHead(calculations, ids), handicaps, predictionSettings,
    provenance: {
      completedHistory: history.tournaments.map((row) => ({ year: row.year, revision: {}, fingerprint: "" })),
      currentTournamentRevision: {}, currentTournamentFingerprint: predictionInputFingerprint(matches),
      predictionSettings: { revision: null, sourceFingerprint: predictionSettings.sourceFingerprint, effectiveFingerprint: predictionSettings.effectiveFingerprint },
      courseConfigurationFingerprint: predictionInputFingerprint(courses), handicapFingerprint: predictionInputFingerprint(handicaps),
      evidencePolicyVersion: "prediction-evidence-policy-v1", statisticsVersion: PREDICTION_STATISTICS_VERSION,
      sourceWorkbookId: clean(workbookId),
    },
  });
}

export function legacyPredictionSheetsFromBundle(bundle = {}) {
  const year = bundle.tournament.year;
  const settings = Object.entries(bundle.predictionSettings.effectiveSettings || {}).map(([Setting, Value]) => ({ Setting, Value }));
  const historicalTeams = list(bundle.historicalFacts.teams);
  const teamNames = [...historicalTeams.map((team) => ({
    Year: team.year, "Team ID": team.id, "Team Side": `Team ${team.side}`, "Team Names": team.name, Captain: team.captainPlayerId,
  })), ...bundle.teams.map((team) => ({ Year: year, "Team ID": team.id, "Team Side": `Team ${team.side}`, "Team Names": team.name,
    Captain: team.captainPlayerId, "Team Logo": team.logo, "Primary Color": team.primaryColor, "Secondary Color": team.secondaryColor }))];
  const players = [...new Map([...list(bundle.historicalFacts.players), ...bundle.players.map((row) => ({ id: row.id, displayName: row.displayName, slug: row.slug, photo: row.photo }))]
    .map((row) => [row.id, { "Player ID": row.id, "Display Name": row.displayName, Slug: row.slug || "", "Photo Filename": row.photo || "" }])).values()];
  const historicalHandicaps = list(bundle.handicaps.historical).map((row) => {
    const side = teamSideNumber(row.teamSide);
    const team = historicalTeams.find((candidate) => candidate.year === row.year && candidate.side === side);
    const rosterOrder = team?.rosterPlayerIds?.indexOf(row.playerId);
    return { Year: row.year, "Player ID": row.playerId, "Team ID": team?.id || "", "Team Side": side ? `Team ${side}` : clean(row.teamSide),
      "Tournament Handicap": row.tournamentHandicap, "Roster Order": Number.isInteger(rosterOrder) && rosterOrder >= 0 ? rosterOrder + 1 : "" };
  });
  const handicaps = [...historicalHandicaps, ...bundle.players.map((row) => ({ Year: year, "Player ID": row.id, "Team ID": row.teamId,
    "Team Side": `Team ${row.teamSide}`, "Tournament Handicap": row.tournamentHandicap, "Roster Order": row.rosterOrder }))];
  const courses = bundle.courses.map((row) => ({ Year: row.year, Round: `Round ${row.round}`, Format: bundle.rounds.find((round) => round.number === row.round)?.format || "",
    "Course ID": row.stableCourseId, "Source Course ID": row.sourceCourseId, Course: row.name, Tee: row.tee, Rating: row.rating, Slope: row.slope,
    Yardage: row.yardage, Par: row.par }));
  const holes = bundle.holes.map((row) => ({ Year: row.year, Round: row.round, "Course ID": row.sourceCourseId || row.courseId, Tee: row.tee,
    "Hole Number": row.holeNumber, Par: row.par, Yardage: row.yardage, "Stroke Index": row.strokeIndex }));
  const tournamentRules = bundle.rules.map((row) => ({ Year: year, Round: row.round, "Round ID": row.roundId, Format: row.format,
    "Team Size": row.teamSize, "Points Available": row.pointsPerMatch }));
  const liveMatches = bundle.matches.map((match) => {
    const row = { Year: year, Round: match.round, Match: match.displayNumber, "Match ID": match.id, Format: match.format,
      "Course ID": match.courseId, Tee: match.tee, "Match Status": match.lifecycle, "Current Hole": match.currentHole,
      "Team 1 Points": match.points.current.teamOne, "Team 2 Points": match.points.current.teamTwo,
      "Matchup Winner": match.result.winner, "Front 9 Winner": match.result.frontWinner, "Back 9 Winner": match.result.backWinner,
      "18-Hole Winner": match.result.overallWinner, Revision: match.revision };
    for (const participant of match.participants) {
      row[`Team ${participant.teamSide} Player ${participant.slot}`] = participant.playerId;
      row[`Team ${participant.teamSide} Player ${participant.slot} Playing HCP`] = participant.playingHandicap;
      row[`Team ${participant.teamSide} Player ${participant.slot} Stroke`] = participant.appliedStrokes;
    }
    return row;
  });
  return {
    tournaments: [{ Year: year, "Tournament ID": bundle.tournament.id }], players,
    matches: [...list(bundle.historicalFacts.matches).map((row) => ({ Year: row.year, Round: row.round, Format: row.format, "Match ID": row.id,
      "Course ID": row.courseId, Tee: row.tee, "Match Status": "FINAL", "Matchup Winner": row.winner,
      "Team 1 Points": row.teamOnePoints, "Team 2 Points": row.teamTwoPoints,
      ...Object.fromEntries(row.participants.flatMap((participant) => [[`Team ${participant.teamSide} Player ${participant.slot}`, participant.playerId],
        [`Team ${participant.teamSide} Player ${participant.slot} Playing HCP`, participant.playingHandicap],
        [`Team ${participant.teamSide} Player ${participant.slot} Stroke`, participant.appliedStrokes]])) })), ...liveMatches.filter((row) => row["Match Status"] === "FINAL")],
    liveMatches, teamNames,
    liveTournaments: [{ Year: year, "Tournament ID": bundle.tournament.id, "Tournament Name": bundle.tournament.name,
      "Tournament Status": bundle.tournament.lifecycle, "Current Round": bundle.tournament.currentRound,
      "Team 1 Name": bundle.teams.find((row) => row.side === 1)?.name || "Team 1", "Team 2 Name": bundle.teams.find((row) => row.side === 2)?.name || "Team 2" }],
    liveRoundHandicaps: [], tournamentRules, courses, handicaps,
    scorecards: bundle.courses.filter((row) => row.year === year).map((row) => ({ "Course ID": row.stableCourseId, Course: row.name, Tee: row.tee,
      "Course Rating": row.rating, "Slope Rating": row.slope, Par: row.par, Yardage: row.yardage })),
    holes, roundScorecards: [], ghostMatches: list(bundle.historicalFacts.recordEligibility).filter((row) => !row.eligible)
      .map((row) => ({ Year: row.year, "Match ID": row.matchId, "Player ID": row.playerId, Reason: row.reason })),
    settings, draftSettings: [], draftPicks: [],
  };
}

function legacyScorecard(card = {}) {
  const holes = list(card.holes).map((hole) => ({ holeNumber: hole.holeNumber, score: hole.gross, gross: hole.gross, net: hole.net,
    par: hole.par, yardage: hole.yardage, strokeIndex: hole.strokeIndex, toPar: hole.toPar ?? (hole.gross !== null && hole.par !== null ? hole.gross - hole.par : null) }));
  const total = holes.some((hole) => hole.score !== null) ? holes.reduce((sum, hole) => sum + numeric(hole.score, 0), 0) : null;
  return { id: card.id, matchId: card.matchId, year: card.year, round: card.round, format: "", courseId: card.courseId, tee: card.tee,
    playerId: card.entityType === "PLAYER" ? card.playerIds[0] || "" : "", playerName: "", teamId: card.teamId, teamName: "",
    participantPlayerIds: card.playerIds, scoreType: card.entityType === "PLAYER" ? "INDIVIDUAL" : "TEAM",
    status: card.availability === "UNAVAILABLE" ? "MISSING" : card.availability, completedHoleCount: card.recordedHoles,
    holes, frontNine: null, backNine: null, total, totalToPar: holes.every((hole) => hole.toPar !== null) ? holes.reduce((sum, hole) => sum + hole.toPar, 0) : null };
}

function compactWarRoomScorecard(scorecard = {}) {
  return {
    matchId: scorecard.matchId, year: scorecard.year, format: scorecard.format, courseId: scorecard.courseId, tee: scorecard.tee,
    playerId: scorecard.playerId, playerName: scorecard.playerName, teamId: scorecard.teamId, teamName: scorecard.teamName,
    participantPlayerIds: scorecard.participantPlayerIds, scoreType: scorecard.scoreType,
    holes: list(scorecard.holes).map(({ holeNumber, score, par, yardage, strokeIndex, toPar }) => ({ holeNumber, score, par, yardage, strokeIndex, toPar })),
    frontNine: scorecard.frontNine, backNine: scorecard.backNine, total: scorecard.total, totalToPar: scorecard.totalToPar,
  };
}

export function buildWarRoomConsumerData({ bundle = {}, calculations, scorecardAnalytics = {}, scope = "war-room" } = {}) {
  const sheets = legacyPredictionSheetsFromBundle(bundle);
  const historical = structuredClone(bundle.playerStatistics.byPlayer || {});
  const partnershipPredictionMap = structuredClone(bundle.partnerships || {});
  const headToHeadMap = structuredClone(bundle.headToHead || {});
  const cards = list(scorecardAnalytics.scorecards || scorecardAnalytics.usableScorecards).length
    ? list(scorecardAnalytics.scorecards || scorecardAnalytics.usableScorecards)
    : list(bundle.scorecards).map(legacyScorecard);
  const currentIds = new Set(bundle.players.map((row) => row.id));
  const base = {
    sheets, historical, partnerships: partnershipPredictionMap, partnershipPredictionMap,
    headToHead: headToHeadMap,
    scorecardAnalytics: {
      scorecards: cards.filter((card) => card.playerId ? currentIds.has(card.playerId) : list(card.participantPlayerIds).some((id) => currentIds.has(id))).map(compactWarRoomScorecard),
      report: scorecardAnalytics.report || null,
    },
  };
  if (scope !== "team-intelligence") return base;
  if (!calculations) throw Object.assign(new Error("Team Intelligence calculations are unavailable."), { code: "WAR_ROOM_TEAM_INTELLIGENCE_CALCULATIONS_REQUIRED" });
  const officialRecords = calculations.getRecords();
  const comparison = buildPlayerComparisonProfiles({
    allPlayerStats: officialRecords.all,
    scorecards: cards,
    ghostMatchExclusions: scorecardAnalytics.ghostMatchExclusions || new Set(),
  });
  const tournaments = calculations.getTournaments();
  const tournamentMatches = tournaments.flatMap((tournament) => calculations.getTournamentMatches(tournament.year));
  const officialPartnerships = calculations.getPartnershipStats().byMatches;
  const intelligence = buildPartnershipIntelligence({
    partnershipRows: officialPartnerships,
    progressionMatches: comparison.progressionMatches,
    scorecards: comparison.scorecards,
    tournaments,
    tournamentMatches,
    players: comparison.profiles,
  });
  const profilesById = Object.fromEntries(comparison.profiles.map((player) => [player.id, player]));
  const seasons = tournaments.map((tournament) => ({
    year: tournament.year,
    teams: tournament.teams.map((team) => buildTeamAggregate(team, profilesById)),
  })).filter((season) => season.teams.length);
  return { ...base, players: comparison.profiles, partnerships: intelligence, seasons };
}

export function predictionBundleParityProjection(bundle = {}) {
  const { preparedAt, source, googleForegroundReads, ...metadata } = bundle.metadata || {};
  return {
    metadata,
    tournament: bundle.tournament,
    teams: bundle.teams,
    players: bundle.players,
    rounds: bundle.rounds,
    rules: bundle.rules,
    matches: bundle.matches,
    pairings: bundle.pairings,
    historicalFacts: bundle.historicalFacts,
    playerStatistics: bundle.playerStatistics,
    ratings: bundle.ratings,
    partnerships: bundle.partnerships,
    headToHead: bundle.headToHead,
    handicaps: bundle.handicaps,
    courses: bundle.courses,
    holes: bundle.holes,
    scorecards: bundle.scorecards,
    predictionSettings: bundle.predictionSettings,
    evidence: bundle.evidence,
    ordering: bundle.ordering,
  };
}

/**
 * Explain deployed Google/Supabase input differences without weakening the
 * normalized bundle itself. Every allowed rule corresponds to a certified
 * canonical correction, explicit evidence enrichment, or source-only field
 * that calculation consumers do not use. Unknown paths stay fail-closed.
 */
export function classifyWarRoomInputDifference(row = {}) {
  const path = clean(row.path);
  const rules = [
    [/^bundle\.predictionSettings\.(revision|unknownFreshnessPolicy)$/, "SOURCE_REVISION_METADATA"],
    [/^bundle\.metadata\.(statisticsVersion|environment)$/, "ADAPTER_METADATA"],
    [/^bundle\.historicalFacts\.tournaments\[.*\]\.(revision|fingerprint)$/, "SOURCE_PROVENANCE_METADATA"],
    [/^bundle\.historicalFacts\.contractVersion$/, "SOURCE_CONTRACT_METADATA"],
    [/authority$/i, "AUTHORITY_LABEL"],
    [/scoringSemantics$/i, "SOURCE_SEMANTICS_LABEL"],
    [/grossNetSemantics$/i, "SOURCE_EVIDENCE_SEMANTICS_LABEL"],
    [/^bundle\.teams\[.*\]\.(logo|primaryColor|secondaryColor)$/, "PRESENTATION_ONLY_TEAM_METADATA"],
    [/^bundle\.players\[.*\]\.(slug|photo|rosterOrder|sourceOrder)$/, "PRESENTATION_OR_SOURCE_ORDER_METADATA"],
    [/^bundle\.courses\[.*\]\.sourceOrder$/, "SOURCE_ORDER_METADATA"],
    [/^bundle\.historicalFacts\.(teams|rounds|matches)\[.*\]\.sourceOrder$/, "SOURCE_ORDER_METADATA"],
    [/^bundle\.matches\[.*\]\.participants\[.*\]\.sourceOrder$/, "SOURCE_ORDER_METADATA"],
    [/^bundle\.tournament\.(name|timeZone)$/, "PRESENTATION_ONLY_TOURNAMENT_METADATA"],
    [/^bundle\.tournament\.(lifecycle|currentRound)$/, "CERTIFIED_CURRENT_TOURNAMENT_STATE"],
    [/^bundle\.matches\[.*\]\.(currentHole|scorecardComplete)$/, "CANONICAL_CURRENT_SCORECARD_STATE"],
    [/^bundle\.matches\[.*\]\.revision$/, "CANONICAL_MATCH_REVISION_METADATA"],
    [/^bundle\.matches\[.*\]\.points\.current\.(teamOne|teamTwo)$/, "CANONICAL_EXPLICIT_ZERO_POINT_STATE"],
    [/^bundle\.matches\[.*\]\.participants\[.*\]\.(handicapIndex|courseHandicap|playingHandicap|appliedStrokes)$/, "CANONICAL_FROZEN_MATCH_HANDICAP_FACT"],
    [/^bundle\.handicaps\./, "CERTIFIED_HANDICAP_FACT_ENRICHMENT"],
    [/^bundle\.historicalFacts\.recordEligibility/, "EXPLICIT_CANONICAL_RECORD_ELIGIBILITY"],
    [/^bundle\.historicalFacts\.matches\[.*\]\.(participants|participantIds|teamPlayingHandicaps|teamAppliedStrokes)/, "CERTIFIED_HISTORICAL_HANDICAP_AND_PARTICIPANT_FACT"],
    [/^bundle\.historicalFacts\./, "CERTIFIED_HISTORICAL_CORRECTION"],
    [/^bundle\.playerStatistics\..*\.player\.(Bio|First Year|Handicap Committee|Nickname|Rookie|Slug)$/, "PRESENTATION_ONLY_PLAYER_METADATA"],
    [/^bundle\.(playerStatistics|ratings|partnerships|headToHead)\./, "CERTIFIED_HISTORY_AND_CURRENT_YEAR_STATISTICS"],
    [/^bundle\.scorecards(?:\.|\[)/, "CERTIFIED_SCORECARD_EVIDENCE_AND_CURRENT_YEAR_COVERAGE"],
    [/^bundle\.evidence\.scorecardCounts\./, "CERTIFIED_SCORECARD_EVIDENCE_AND_CURRENT_YEAR_COVERAGE"],
    [/^bundle\.courses\[.*\]\.(appearanceId|stableCourseId)$/, "CERTIFIED_2023_COURSE_ALIAS"],
    [/^bundle\.holes\[.*\]\.courseId$/, "CERTIFIED_2023_COURSE_ALIAS"],
    [/^bundle\.ordering\.keys\.(courses|holes)\[.*\]$/, "CERTIFIED_2023_COURSE_ALIAS"],
    [/^bundle\.ordering\.fingerprints\.(courses|holes)$/, "CERTIFIED_2023_COURSE_ALIAS"],
    [/^bundle\.ordering\.(keys\.scorecards|fingerprints\.scorecards)/, "CERTIFIED_SCORECARD_EVIDENCE_AND_CURRENT_YEAR_COVERAGE"],
  ];
  const matched = rules.find(([pattern]) => pattern.test(path));
  return matched
    ? { ...row, disposition: "INTENTIONAL_CANONICAL_DIFFERENCE", reason: matched[1] }
    : { ...row, disposition: "UNEXPLAINED", reason: "" };
}

export const WAR_ROOM_INPUT_CONTRACT_VERSION = `${PREDICTION_INPUT_BUNDLE_VERSION}/war-room-v1`;
