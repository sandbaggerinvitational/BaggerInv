import { createHash } from "node:crypto";

import { PREDICTION_SETTING_SPECS } from "./prediction-settings-contract.js";
import { tournamentLiveDataFromSupabaseView } from "./tournament-live-supabase.js";

export const PREDICTION_INPUT_BUNDLE_VERSION = "prediction-input-bundle-v1";
export const PREDICTION_EVIDENCE_POLICY_VERSION = "prediction-evidence-policy-v1";
export const PREDICTION_STATISTICS_VERSION = "secondary-history-calculation-v1";
export const PREDICTION_INPUT_SCOPES = Object.freeze([
  "championship",
  "matchup",
  "lineup",
  "team-intelligence",
  "scorecard-calibration",
  "full-diagnostic",
]);

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const list = (value) => Array.isArray(value) ? value : [];
const number = (value, fallback = null) => {
  if (value === null || value === undefined || clean(value) === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const integer = (value, fallback = null) => {
  const parsed = number(value, fallback);
  return parsed === null ? null : Math.trunc(parsed);
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function predictionInputFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function normalizeLifecycle(value) {
  const status = upper(value);
  if (["FINAL", "FINALIZED", "COMPLETE", "COMPLETED"].includes(status)) return "FINAL";
  if (["LIVE", "REOPENED", "OPEN", "IN PROGRESS", "IN-PROGRESS"].includes(status)) return "LIVE";
  if (["UPCOMING", "SCHEDULED", "NOT STARTED", "NOT-STARTED"].includes(status)) return "UPCOMING";
  return status || "UPCOMING";
}

function formatCode(value) {
  const format = upper(value);
  if (["BB", "BEST BALL", "BESTBALL", "2 VS 2"].includes(format)) return "BB";
  if (["SC", "SCRAMBLE", "2-MAN SCRAMBLE", "2 MAN SCRAMBLE"].includes(format)) return "SC";
  return "SI";
}

function firstValue(source, names, fallback = null) {
  for (const name of names) {
    if (source && Object.hasOwn(source, name) && clean(source[name]) !== "") return source[name];
  }
  return fallback;
}

function teamSideLabel(side) {
  return side ? `Team ${side}` : "";
}

function playerIdFrom(value) {
  if (typeof value === "string" || typeof value === "number") return clean(value);
  return clean(value?.["Player ID"] || value?.player_id || value?.playerId || value?.id);
}

function courseIdFrom(value) {
  if (typeof value === "string" || typeof value === "number") return clean(value);
  return clean(value?.["Course ID"] || value?.course_id || value?.courseId || value?.id);
}

function scorecardAvailability(value, recordedHoles = 0, expectedHoles = 18) {
  const status = upper(value);
  if (["COMPLETE", "FINAL", "AVAILABLE"].includes(status)) return "COMPLETE";
  if (["PARTIAL", "INCOMPLETE", "LIVE"].includes(status)) return "PARTIAL";
  if (["UNAVAILABLE", "MISSING", "NONE", "NOT RECORDED"].includes(status)) return "UNAVAILABLE";
  if (recordedHoles >= expectedHoles && expectedHoles > 0) return "COMPLETE";
  if (recordedHoles > 0) return "PARTIAL";
  return "UNAVAILABLE";
}

function teamRows(currentState = {}) {
  return list(currentState.teams).map((team, sourceIndex) => {
    const side = integer(team.team_side ?? team.side, 0);
    const source = team.source_payload || {};
    return {
      id: clean(team.team_id || team.id),
      side,
      sideLabel: teamSideLabel(side),
      name: clean(team.name || source["Team Names"] || source["Team Name"] || `Team ${side}`),
      captainPlayerId: clean(team.captain_id || source.Captain || source["Captain ID"]),
      logo: clean(team.logo || source["Team Logo"]),
      primaryColor: clean(team.primary_color || source["Primary Color"]),
      secondaryColor: clean(team.secondary_color || source["Secondary Color"]),
      sourceOrder: sourceIndex,
    };
  }).sort((left, right) => left.side - right.side || left.sourceOrder - right.sourceOrder);
}

function currentPlayerRows(currentState = {}, teams = []) {
  const teamIdBySide = Object.fromEntries(teams.map((team) => [team.side, team.id]));
  return list(currentState.players).map((player, sourceIndex) => {
    const source = player.tournament_source_payload || player.source_payload || {};
    const presentation = player.presentation || {};
    const side = integer(player.team_side, 0);
    const handicap = number(firstValue(source, [
      "Tournament Handicap", "Tournament Handicap Index", "Handicap", "Handicap Index",
    ], player.tournament_handicap));
    return {
      id: clean(player.player_id || player.id),
      displayName: clean(player.display_name || source["Display Name"] || player.player_id),
      teamId: clean(player.team_id || teamIdBySide[side]),
      teamSide: side,
      rosterOrder: integer(firstValue(source, ["Roster Order", "Order", "Player Order"]), sourceIndex + 1),
      sourceOrder: sourceIndex,
      active: upper(player.participation_status || "ACTIVE") === "ACTIVE",
      captain: player.captain === true || presentation.captain === true || /^(true|yes|1)$/i.test(clean(source.Captain)) ||
        teams.some((team) => team.captainPlayerId === clean(player.player_id || player.id)),
      tournamentHandicap: handicap,
      slug: clean(presentation.slug || source.Slug),
      photo: clean(presentation.photo || source.Photo || source["Photo Filename"]),
    };
  }).sort((left, right) => left.teamSide - right.teamSide || left.rosterOrder - right.rosterOrder || left.sourceOrder - right.sourceOrder);
}

function matchLookup(live = {}) {
  return new Map(list(live.rounds).flatMap((round) => list(round.matches)).map((match) => [clean(match.id), match]));
}

function currentRoundRows(currentState = {}, currentMatches = []) {
  return list(currentState.rounds).map((round, sourceIndex) => {
    const roundNumber = integer(round.round_number ?? round.number, sourceIndex + 1);
    const firstMatch = currentMatches.find((match) => match.round === roundNumber);
    const source = round.source_payload || {};
    return {
      id: clean(round.round_id || round.id || `${currentState.tournament?.tournament_id}-R${roundNumber}`),
      number: roundNumber,
      name: clean(round.name || `Round ${roundNumber}`),
      format: formatCode(round.format || firstMatch?.format),
      teamSize: integer(round.team_size ?? source["Team Size"], formatCode(round.format) === "SI" ? 1 : 2),
      courseId: clean(firstMatch?.courseId),
      pointsPerMatch: number(source["Points Available"], firstMatch?.pointsAvailable ?? 3),
      sourceOrder: sourceIndex,
    };
  }).sort((left, right) => left.number - right.number || left.sourceOrder - right.sourceOrder);
}

function currentMatchRows(currentState = {}, live = {}, teams = []) {
  const liveById = matchLookup(live);
  return list(currentState.matches).map((entry, sourceIndex) => {
    const match = entry.match || {};
    const snapshot = entry.snapshot || {};
    const id = clean(match.match_id || match.id);
    const projected = liveById.get(id) || {};
    const lifecycle = normalizeLifecycle(match.status || projected.status);
    const participants = list(entry.participants).map((participant, participantIndex) => ({
      playerId: clean(participant.player_id),
      teamId: clean(participant.team_id || teams.find((team) => team.side === integer(participant.team_side, 0))?.id),
      teamSide: integer(participant.team_side, 0),
      slot: integer(participant.player_slot, participantIndex + 1),
      sourceOrder: participantIndex,
      handicapIndex: number(participant.handicap_index),
      courseHandicap: number(participant.course_handicap),
      playingHandicap: number(participant.playing_handicap),
      appliedStrokes: number(participant.final_strokes),
    })).sort((left, right) => left.teamSide - right.teamSide || left.slot - right.slot || left.sourceOrder - right.sourceOrder);
    const currentPoints = {
      teamOne: number(projected.team1Points),
      teamTwo: number(projected.team2Points),
    };
    return {
      id,
      round: integer(match.round_number ?? projected.round, 0),
      displayNumber: integer(entry.presentation?.display_match_number ?? projected.match, sourceIndex + 1),
      format: formatCode(match.format || snapshot.format || projected.format),
      teamSize: integer(snapshot.team_size, formatCode(match.format || snapshot.format) === "SI" ? 1 : 2),
      courseId: clean(snapshot.course_id || projected.course?.id),
      tee: clean(snapshot.tee || projected.course?.tee),
      lifecycle,
      scoringLocked: match.scoring_locked === true || projected.scoringLocked === true,
      scorecardComplete: match.scorecard_complete === true,
      currentHole: integer(projected.currentHole ?? match.current_hole, 0),
      revision: integer(match.match_revision, 0),
      result: {
        winner: lifecycle === "FINAL" ? clean(projected.matchupWinner || match.result_winner) : "",
        frontWinner: lifecycle === "FINAL" ? clean(projected.frontWinner) : "",
        backWinner: lifecycle === "FINAL" ? clean(projected.backWinner) : "",
        overallWinner: lifecycle === "FINAL" ? clean(projected.overallWinner) : "",
      },
      points: {
        current: currentPoints,
        official: lifecycle === "FINAL" ? currentPoints : { teamOne: null, teamTwo: null },
      },
      pointsAvailable: number(projected.pointsAvailable, 3),
      participants,
      sourceOrder: sourceIndex,
      pairingOrder: sourceIndex,
    };
  }).sort((left, right) => left.round - right.round || left.pairingOrder - right.pairingOrder);
}

function pairingRows(matches = []) {
  return matches.map((match, sourceIndex) => ({
    id: match.id,
    round: match.round,
    format: match.format,
    courseId: match.courseId,
    tee: match.tee,
    lifecycle: match.lifecycle,
    order: sourceIndex,
    teamOnePlayerIds: match.participants.filter((row) => row.teamSide === 1).map((row) => row.playerId),
    teamTwoPlayerIds: match.participants.filter((row) => row.teamSide === 2).map((row) => row.playerId),
  }));
}

function historicalCourseRows(completedViews = []) {
  return list(completedViews).flatMap((view) => list(view.tournament?.courses).map((course, sourceIndex) => {
    const round = integer(clean(course.Round).replace(/\D/g, ""), sourceIndex + 1);
    const holes = list(course.holeDefinitions || course.holes).map((hole) => ({
      holeNumber: integer(hole.hole_number ?? hole.holeNumber ?? hole["Hole Number"]),
      par: number(hole.par ?? hole.Par),
      yardage: number(hole.yardage ?? hole.Yardage),
      strokeIndex: integer(hole.stroke_index ?? hole.strokeIndex ?? hole["Stroke Index"]),
    })).sort((left, right) => left.holeNumber - right.holeNumber);
    return {
      stableCourseId: courseIdFrom(course),
      sourceCourseId: clean(course["Source Course ID"] || course.sourceCourseId || courseIdFrom(course)),
      year: Number(view.year),
      round,
      appearanceId: `${Number(view.year)}:R${round}:${courseIdFrom(course)}`,
      name: clean(course.Course || course["Course Name"]),
      tee: clean(course["Tee Played"] || course.Tee),
      rating: number(course.Rating),
      slope: number(course.Slope),
      yardage: number(course.Yardage),
      par: number(course.Par),
      holeConfigurationState: holes.length === 18 ? "COMPLETE" : holes.length ? "PARTIAL" : "UNAVAILABLE",
      holes,
      sourceOrder: sourceIndex,
    };
  })).sort((left, right) => left.year - right.year || left.round - right.round || left.sourceOrder - right.sourceOrder);
}

function currentCourseRows(currentState = {}, currentMatches = []) {
  const rows = new Map();
  for (const match of list(currentState.matches)) {
    const snapshot = match.snapshot || {};
    const courseId = clean(snapshot.course_id);
    const tee = clean(snapshot.tee);
    if (!courseId) continue;
    const key = `${courseId}|${tee}`;
    if (!rows.has(key)) rows.set(key, {
      stableCourseId: courseId,
      sourceCourseId: courseId,
      year: Number(currentState.tournament?.tournament_year),
      round: integer(match.match?.round_number),
      appearanceId: `${currentState.tournament?.tournament_id}:R${integer(match.match?.round_number)}:${courseId}`,
      name: clean(snapshot.course_name || match.presentation?.course_name || currentMatches.find((row) => row.id === match.match?.match_id)?.courseName),
      tee,
      rating: number(snapshot.rating),
      slope: number(snapshot.slope),
      yardage: list(match.holes).reduce((sum, hole) => sum + number(hole.yardage, 0), 0) || null,
      par: number(snapshot.par, list(match.holes).reduce((sum, hole) => sum + number(hole.par, 0), 0) || null),
      holeConfigurationState: list(match.holes).length === 18 ? "COMPLETE" : list(match.holes).length ? "PARTIAL" : "UNAVAILABLE",
      holes: list(match.holes).map((hole) => ({
        holeNumber: integer(hole.hole_number),
        par: number(hole.par),
        yardage: number(hole.yardage),
        strokeIndex: integer(hole.stroke_index),
      })).sort((left, right) => left.holeNumber - right.holeNumber),
      sourceOrder: rows.size,
    });
  }
  return [...rows.values()].sort((left, right) => left.round - right.round || left.sourceOrder - right.sourceOrder);
}

function holeRows(courses = []) {
  return courses.flatMap((course) => list(course.holes).map((hole) => ({
    courseId: course.stableCourseId,
    sourceCourseId: course.sourceCourseId,
    year: course.year,
    round: course.round,
    tee: course.tee,
    holeNumber: hole.holeNumber,
    par: hole.par,
    yardage: hole.yardage,
    strokeIndex: hole.strokeIndex,
    evidence: [hole.par, hole.yardage, hole.strokeIndex].every((value) => value !== null)
      ? "COMPLETE" : "PARTIAL",
  }))).sort((left, right) => left.year - right.year || left.round - right.round ||
    left.courseId.localeCompare(right.courseId) || left.tee.localeCompare(right.tee) || left.holeNumber - right.holeNumber);
}

function normalizeHistoricalScorecard(card = {}, sourceIndex = 0) {
  const holes = list(card.holes).map((hole) => ({
    holeNumber: integer(hole.holeNumber ?? hole.hole_number ?? hole["Hole Number"]),
    gross: number(hole.gross ?? hole.score ?? hole.Score),
    net: number(hole.net ?? hole["Net Score"]),
    strokes: number(hole.strokes ?? hole.Strokes),
    par: number(hole.par ?? hole.Par),
    yardage: number(hole.yardage ?? hole.Yardage),
    strokeIndex: integer(hole.strokeIndex ?? hole.stroke_index ?? hole["Stroke Index"]),
    toPar: number(hole.toPar ?? hole["To Par"]),
  })).filter((hole) => hole.holeNumber >= 1 && hole.holeNumber <= 18)
    .sort((left, right) => left.holeNumber - right.holeNumber);
  const recordedHoles = holes.filter((hole) => hole.gross !== null || hole.net !== null).length;
  const availability = scorecardAvailability(card.availability || card.coverageStatus || card.status, recordedHoles);
  const playerIds = list(card.playerIds || card.participantPlayerIds || card.players).map(playerIdFrom).filter(Boolean);
  const singlePlayer = clean(card.playerId || card["Player ID"]);
  if (singlePlayer && !playerIds.includes(singlePlayer)) playerIds.push(singlePlayer);
  const matchId = clean(card.matchId || card.match_id || card["Match ID"]);
  const year = integer(card.year ?? card.Year);
  const entityId = singlePlayer || clean(card.teamId || card["Team ID"] || card.pairingId || card.id);
  return {
    id: clean(card.scorecardId || card.scorecard_id || card.id || `${year}:${matchId}:${entityId || sourceIndex}`),
    year,
    round: integer(card.round ?? card.Round),
    matchId,
    courseId: clean(card.courseId || card.course_id || card["Course ID"]),
    tee: clean(card.tee || card.Tee || card["Tee Played"]),
    entityType: upper(card.entityType || card.scoreType || card["Score Type"] || (singlePlayer ? "PLAYER" : "TEAM")) === "INDIVIDUAL"
      ? "PLAYER" : upper(card.entityType || card.scoreType || card["Score Type"] || (singlePlayer ? "PLAYER" : "TEAM")),
    playerIds,
    teamId: clean(card.teamId || card["Team ID"]),
    lifecycle: normalizeLifecycle(card.lifecycle || card.matchStatus || card["Match Status"] || "FINAL"),
    availability,
    recordedHoles,
    expectedHoles: 18,
    grossNetSemantics: clean(card.grossNetSemantics || card.scoreSemantics || "CERTIFIED_SOURCE_SEMANTICS"),
    holes: availability === "UNAVAILABLE" ? [] : holes,
    sourceOrder: sourceIndex,
  };
}

function currentScorecardRows(currentState = {}, currentMatches = []) {
  const matchesById = new Map(currentMatches.map((match) => [match.id, match]));
  return list(currentState.matches).flatMap((entry, matchIndex) => {
    const matchId = clean(entry.match?.match_id);
    const normalized = matchesById.get(matchId) || {};
    const participants = list(entry.participants).sort((left, right) =>
      integer(left.team_side) - integer(right.team_side) || integer(left.player_slot) - integer(right.player_slot));
    const scores = list(entry.scores).sort((left, right) => integer(left.hole_number) - integer(right.hole_number));
    const sideCards = [];
    for (const side of [1, 2]) {
      const sidePlayers = participants.filter((row) => integer(row.team_side) === side);
      const teamCard = formatCode(entry.match?.format) === "SC";
      const cardCount = teamCard ? 1 : sidePlayers.length;
      for (let slotIndex = 0; slotIndex < cardCount; slotIndex += 1) {
        const participant = sidePlayers[slotIndex];
        const holes = scores.map((score) => {
          const grossValues = list(score[`team_${side}_gross_scores`]);
          const strokeValues = list(score[`team_${side}_strokes`]);
          const gross = number(grossValues[teamCard ? 0 : slotIndex]);
          const strokes = number(strokeValues[teamCard ? 0 : slotIndex], 0);
          return {
            holeNumber: integer(score.hole_number),
            gross,
            net: teamCard ? number(score[`team_${side}_net_score`]) : gross === null ? null : gross - strokes,
            strokes,
            par: number(list(entry.holes).find((hole) => integer(hole.hole_number) === integer(score.hole_number))?.par),
            yardage: number(list(entry.holes).find((hole) => integer(hole.hole_number) === integer(score.hole_number))?.yardage),
            strokeIndex: integer(list(entry.holes).find((hole) => integer(hole.hole_number) === integer(score.hole_number))?.stroke_index),
            winner: clean(score.hole_winner),
            revision: integer(score.hole_revision, 0),
          };
        }).filter((hole) => hole.gross !== null || hole.net !== null);
        const playerIds = teamCard ? sidePlayers.map((row) => clean(row.player_id)) : [clean(participant?.player_id)].filter(Boolean);
        sideCards.push({
          id: `${currentState.tournament?.tournament_id}:${matchId}:${teamCard ? `TEAM-${side}` : playerIds[0]}`,
          year: integer(currentState.tournament?.tournament_year),
          round: integer(entry.match?.round_number),
          matchId,
          courseId: clean(entry.snapshot?.course_id),
          tee: clean(entry.snapshot?.tee),
          entityType: teamCard ? "TEAM" : "PLAYER",
          playerIds,
          teamId: clean(sidePlayers[0]?.team_id),
          lifecycle: normalized.lifecycle,
          availability: scorecardAvailability("", holes.length),
          recordedHoles: holes.length,
          expectedHoles: 18,
          grossNetSemantics: "FROZEN_CANONICAL_MATCH_NETTING",
          holes,
          sourceOrder: matchIndex * 4 + side * 2 + slotIndex,
        });
      }
    }
    return sideCards;
  });
}

function playerStatistics(calculations = {}) {
  const rows = typeof calculations.getAllPlayerStats === "function" ? calculations.getAllPlayerStats() : [];
  const byPlayer = {};
  for (const row of rows) {
    const id = playerIdFrom(row.player);
    if (!id) continue;
    byPlayer[id] = clone(row.stats || {});
  }
  return {
    contractVersion: PREDICTION_STATISTICS_VERSION,
    byPlayer,
    playerIds: Object.keys(byPlayer).sort(),
  };
}

function ratingRows(statistics = {}) {
  return Object.fromEntries(Object.entries(statistics.byPlayer || {}).map(([playerId, stats]) => [playerId, clone(stats.sandbaggerRatings || {})]));
}

function partnershipRows(calculations = {}) {
  const result = typeof calculations.getPartnershipStats === "function" ? calculations.getPartnershipStats() : {};
  const rows = list(result.byMatches);
  return Object.fromEntries(rows.map((row) => [clean(row.key || [playerIdFrom(row.playerOne), playerIdFrom(row.playerTwo)].sort().join("|")), {
    record: clone(row.record || {}),
    byFormat: clone(row.byFormat || {}),
  }]).filter(([key]) => key && key !== "|"));
}

function headToHeadRows(calculations = {}, playerIds = []) {
  if (typeof calculations.getHeadToHead !== "function") return {};
  const rows = {};
  const ordered = [...new Set(playerIds.filter(Boolean))].sort();
  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      const key = `${ordered[left]}|${ordered[right]}`;
      rows[key] = clone(calculations.getHeadToHead(ordered[left], ordered[right]));
    }
  }
  return rows;
}

function historicalFacts(secondaryHistory = {}) {
  const views = list(secondaryHistory.completedViews);
  const calculations = secondaryHistory.calculations || {};
  const playerRows = typeof calculations.getPlayers === "function" ? calculations.getPlayers() : list(calculations.data?.players);
  const historicalMatches = views.flatMap((view) => list(view.rawMatches).map((match, sourceIndex) => {
    const participants = [1, 2].flatMap((side) => [1, 2].map((slot) => {
      const playerId = clean(match[`Team ${side} Player ${slot}`]);
      return playerId ? {
        playerId,
        teamSide: side,
        slot,
        playingHandicap: number(match[`Team ${side} Player ${slot} Playing HCP`]),
        appliedStrokes: number(match[`Team ${side} Player ${slot} Stroke`]),
      } : null;
    })).filter(Boolean);
    return {
      id: clean(match["Match ID"] || match.match_id),
      year: Number(view.year),
      round: integer(match.Round),
      format: formatCode(match.Format),
      lifecycle: "FINAL",
      courseId: clean(match["Course ID"]),
      tee: clean(match.Tee || match["Tee Played"]),
      winner: clean(match["Matchup Winner"] || match["18-Hole Winner"]),
      teamOnePoints: number(match["Team 1 Points"]),
      teamTwoPoints: number(match["Team 2 Points"]),
      teamPlayingHandicaps: {
        teamOne: number(match["Team 1 Playing HCP"]),
        teamTwo: number(match["Team 2 Playing HCP"]),
      },
      teamAppliedStrokes: {
        teamOne: number(match["Team 1 Stroke"]),
        teamTwo: number(match["Team 2 Stroke"]),
      },
      participants,
      participantIds: participants.map((row) => row.playerId),
      sourceOrder: sourceIndex,
    };
  })).sort((left, right) => left.year - right.year || left.round - right.round || left.sourceOrder - right.sourceOrder);
  return {
    contractVersion: clean(secondaryHistory.diagnostics?.contract || PREDICTION_STATISTICS_VERSION),
    years: views.map((view) => Number(view.year)).sort((left, right) => left - right),
    tournaments: views.map((view) => ({
      id: clean(view.tournament?.id || view.year),
      year: Number(view.year),
      lifecycle: "FINAL",
      finalScore: clean(view.tournament?.["Final Score"]),
      championTeamId: clean(view.tournament?.championTeam?.id),
      revision: clone(view.revision || {}),
      fingerprint: clean(view.diagnostics?.adapterFingerprint || view.revision?.source_fingerprint),
    })).sort((left, right) => left.year - right.year),
    teams: views.flatMap((view) => list(view.teams).map((team, sourceIndex) => ({
      id: clean(team.id),
      year: Number(view.year),
      side: integer(team.sideNumber ?? clean(team.side).replace(/\D/g, "")),
      name: clean(team.name),
      captainPlayerId: clean(team.captainId),
      rosterPlayerIds: list(team.roster).map((row) => playerIdFrom(row.player || row)).filter(Boolean),
      sourceOrder: sourceIndex,
    }))).sort((left, right) => left.year - right.year || left.side - right.side || left.sourceOrder - right.sourceOrder),
    rounds: views.flatMap((view) => list(view.roundPoints).map((round, sourceIndex) => ({
      id: `${Number(view.year)}-R${integer(round.round, sourceIndex + 1)}`,
      year: Number(view.year),
      round: integer(round.round, sourceIndex + 1),
      format: formatCode(round.format),
      course: clean(round.course),
      completedPointsAvailable: number(round.pointsAvailable),
      lifecycle: "FINAL",
      scoringSemantics: "CERTIFIED_HISTORICAL_FACT",
      sourceOrder: sourceIndex,
    }))).sort((left, right) => left.year - right.year || left.round - right.round || left.sourceOrder - right.sourceOrder),
    players: list(playerRows).map((player) => ({
      id: playerIdFrom(player),
      displayName: clean(player["Display Name"] || player.displayName || player.name),
    })).filter((player) => player.id).sort((left, right) => left.id.localeCompare(right.id)),
    matches: historicalMatches,
    recordEligibility: views.flatMap((view) => list(view.recordEligibility).map((row) => ({
      year: Number(view.year),
      matchId: clean(row.matchId),
      playerId: clean(row.playerId),
      eligible: row.includeOfficialRecord !== false,
      reason: clean(row.reasonCode),
    }))),
  };
}

function handicapRows(secondaryHistory = {}, currentPlayers = [], currentMatches = [], completedMatches = []) {
  const historical = list(secondaryHistory.calculations?.data?.handicaps).map((row) => ({
    year: integer(row.Year),
    playerId: clean(row["Player ID"]),
    teamSide: clean(row["Team Side"]),
    tournamentHandicap: number(row["Tournament Handicap"]),
    authority: "CERTIFIED_HISTORICAL_FACT",
  })).sort((left, right) => left.year - right.year || left.playerId.localeCompare(right.playerId));
  const current = currentPlayers.map((player) => ({
    playerId: player.id,
    teamId: player.teamId,
    teamSide: player.teamSide,
    tournamentHandicap: player.tournamentHandicap,
    authority: "CURRENT_TOURNAMENT_INPUT",
  }));
  const frozenHistoricalMatchFacts = completedMatches.flatMap((match) => match.participants.map((participant) => ({
    year: match.year,
    matchId: match.id,
    lifecycle: "FINAL",
    playerId: participant.playerId,
    teamSide: participant.teamSide,
    playingHandicap: participant.playingHandicap,
    appliedStrokes: participant.appliedStrokes,
    authority: "IMMUTABLE_HISTORICAL_MATCH_FACT",
  })));
  const frozenCurrentMatchFacts = currentMatches.flatMap((match) => match.participants.map((participant) => ({
    year: null,
    matchId: match.id,
    lifecycle: match.lifecycle,
    playerId: participant.playerId,
    teamSide: participant.teamSide,
    handicapIndex: participant.handicapIndex,
    courseHandicap: participant.courseHandicap,
    playingHandicap: participant.playingHandicap,
    appliedStrokes: participant.appliedStrokes,
    revision: match.revision,
    authority: "FROZEN_CANONICAL_MATCH_FACT",
  })));
  return {
    historical,
    current,
    frozenMatchFacts: [...frozenHistoricalMatchFacts, ...frozenCurrentMatchFacts],
    courseHandicap: { kind: "DERIVED", contract: "prediction-engine-course-handicap-v1" },
  };
}

function rulesFromRounds(rounds = []) {
  return rounds.map((round) => ({
    roundId: round.id,
    round: round.number,
    format: round.format,
    teamSize: round.teamSize,
    courseId: round.courseId,
    pointsPerMatch: round.pointsPerMatch,
    scoringSemantics: "CERTIFIED_TOURNAMENT_CONFIGURATION",
    nassauSegments: round.pointsPerMatch === 3 ? ["FRONT", "BACK", "OVERALL"] : [],
  }));
}

function tournamentState(currentState = {}, live = {}, matches = [], rounds = []) {
  const official = matches.filter((match) => match.lifecycle === "FINAL");
  const officialPoints = official.reduce((totals, match) => ({
    teamOne: totals.teamOne + number(match.points.official.teamOne, 0),
    teamTwo: totals.teamTwo + number(match.points.official.teamTwo, 0),
  }), { teamOne: 0, teamTwo: 0 });
  const configuredPoints = matches.reduce((sum, match) => sum + number(match.pointsAvailable, 0), 0);
  const awardedPoints = officialPoints.teamOne + officialPoints.teamTwo;
  return {
    id: clean(currentState.tournament?.tournament_id || live.tournament?.id),
    year: integer(currentState.tournament?.tournament_year || live.tournament?.year),
    name: clean(currentState.tournament?.name || live.tournament?.name),
    lifecycle: upper(live.tournament?.status || currentState.tournament?.status),
    currentRound: integer(live.tournament?.currentRound, 1),
    timeZone: clean(live.tournament?.timeZone || currentState.tournament?.time_zone),
    configuredPoints,
    awardedPoints,
    remainingPoints: Math.max(0, configuredPoints - awardedPoints),
    teamScore: officialPoints,
    matchCounts: {
      total: matches.length,
      final: official.length,
      live: matches.filter((match) => match.lifecycle === "LIVE").length,
      upcoming: matches.filter((match) => match.lifecycle === "UPCOMING").length,
      nonFinal: matches.filter((match) => match.lifecycle !== "FINAL").length,
    },
    roundCount: rounds.length,
  };
}

function settingsContract(projection = {}, { allowUnknownSettingsFreshness = true } = {}) {
  const freshness = upper(projection.freshness || "UNKNOWN");
  const valid = upper(projection.projectionStatus || projection.validationStatus) === "VALID";
  if (!valid) {
    const error = new Error("The certified Prediction Settings projection is invalid or unavailable.");
    error.code = "PREDICTION_INPUT_SETTINGS_INVALID";
    throw error;
  }
  if (["INVALID", "UNAVAILABLE", "STALE"].includes(freshness)) {
    const error = new Error(`Prediction Settings freshness ${freshness} is not eligible for canonical bundle preparation.`);
    error.code = "PREDICTION_INPUT_SETTINGS_NOT_CURRENT";
    throw error;
  }
  if (freshness === "UNKNOWN" && !allowUnknownSettingsFreshness) {
    const error = new Error("Prediction Settings freshness must be independently verified for this operation.");
    error.code = "PREDICTION_INPUT_SETTINGS_FRESHNESS_REQUIRED";
    throw error;
  }
  return {
    revision: integer(projection.revision),
    contractVersion: clean(projection.contractVersion),
    effectiveSettings: clone(projection.effectiveSettings || {}),
    sourceFingerprint: clean(projection.sourceFingerprint),
    effectiveFingerprint: clean(projection.effectiveSettingsFingerprint),
    freshness,
    readOnlyEligible: freshness === "CURRENT" || (freshness === "UNKNOWN" && allowUnknownSettingsFreshness),
    consumerCutoverEligible: freshness === "CURRENT",
    unknownFreshnessPolicy: "UNKNOWN is accepted only for read-only shadow preparation; consumer cutover/publication must independently prove CURRENT.",
  };
}

function evidenceContract(scorecards = [], holes = [], players = []) {
  const counts = { COMPLETE: 0, PARTIAL: 0, UNAVAILABLE: 0 };
  for (const scorecard of scorecards) counts[scorecard.availability] = (counts[scorecard.availability] || 0) + 1;
  const currentHandicaps = list(players).reduce((result, player) => {
    const key = player.tournamentHandicap === null || player.tournamentHandicap === undefined
      ? "unavailablePlayerIds"
      : "availablePlayerIds";
    result[key].push(clean(player.id));
    return result;
  }, { availablePlayerIds: [], unavailablePlayerIds: [] });
  currentHandicaps.availablePlayerIds.sort();
  currentHandicaps.unavailablePlayerIds.sort();
  return {
    policyVersion: PREDICTION_EVIDENCE_POLICY_VERSION,
    rules: {
      noScorecard: "NEUTRAL_UNAVAILABLE",
      partialScorecard: "RECORDED_FACTS_ONLY",
      completeScorecard: "NORMAL_ELIGIBILITY",
      missingHoleConfiguration: "DISABLE_COURSE_FIT_AND_STROKE_DISTRIBUTION",
      missingHandicap: "EXPLICITLY_UNAVAILABLE",
      liveOrReopenedMatch: "NOT_COMPLETED_HISTORICAL_FACT",
    },
    scorecardCounts: counts,
    currentHandicaps,
    holeConfigurationRows: holes.length,
    noTrustworthyScorecardYears: [2017, 2018, 2019, 2020, 2021, 2022],
    missingValuesAreNeverZeroFilled: true,
  };
}

function orderingContract({ teams, players, rounds, matches, pairings, scorecards, courses, holes }) {
  const keys = {
    teams: teams.map((row) => row.id),
    roster: players.map((row) => row.id),
    rounds: rounds.map((row) => row.id),
    matches: matches.map((row) => row.id),
    pairings: pairings.map((row) => row.id),
    scorecards: scorecards.map((row) => row.id),
    courses: courses.map((row) => row.appearanceId),
    holes: holes.map((row) => `${row.year}:${row.round}:${row.courseId}:${row.tee}:${row.holeNumber}`),
  };
  return {
    contractVersion: "prediction-input-ordering-v1",
    semantics: {
      teams: "canonical team side",
      roster: "canonical team side then source roster order",
      rounds: "round number",
      matches: "round then canonical source/pairing order",
      pairings: "identical to match order; never alphabetized",
      scorecards: "year, round, match, canonical scorecard source order",
      courses: "year, round, canonical appearance order",
      holes: "year, round, course, tee, hole number",
    },
    keys,
    fingerprints: Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, predictionInputFingerprint(value)])),
  };
}

function fingerprintContract(bundle) {
  const sections = {
    historicalFacts: predictionInputFingerprint(bundle.historicalFacts),
    currentTournament: predictionInputFingerprint({ tournament: bundle.tournament, teams: bundle.teams, players: bundle.players, rounds: bundle.rounds, matches: bundle.matches }),
    pairings: predictionInputFingerprint(bundle.pairings),
    courses: predictionInputFingerprint(bundle.courses),
    holes: predictionInputFingerprint(bundle.holes),
    scorecards: predictionInputFingerprint(bundle.scorecards),
    handicaps: predictionInputFingerprint(bundle.handicaps),
    statistics: predictionInputFingerprint({ playerStatistics: bundle.playerStatistics, ratings: bundle.ratings, partnerships: bundle.partnerships, headToHead: bundle.headToHead }),
    predictionSettings: clean(bundle.predictionSettings.effectiveFingerprint) || predictionInputFingerprint(bundle.predictionSettings.effectiveSettings),
    ordering: predictionInputFingerprint(bundle.ordering.keys),
  };
  const logical = {
    bundleContractVersion: PREDICTION_INPUT_BUNDLE_VERSION,
    evidencePolicyVersion: PREDICTION_EVIDENCE_POLICY_VERSION,
    statisticsVersion: bundle.playerStatistics.contractVersion,
    sections,
  };
  return {
    sections,
    bundle: predictionInputFingerprint(logical),
    logicalInputs: logical,
    invocationFieldsExcluded: ["phase", "iterations", "engineVersion", "seed", "requestTime", "publicationTime"],
    invocationFingerprintRule: "hash(bundle fingerprint + phase + iterations + engine version + deterministic seed)",
  };
}

/**
 * Finalize one normalized PredictionInputBundle regardless of source adapter.
 * Source adapters are responsible only for producing the canonical sections;
 * ordering, evidence, and logical fingerprint semantics stay shared here.
 */
export function assemblePredictionInputBundle({
  scope = "full-diagnostic",
  preparedAt = new Date().toISOString(),
  environment = "PREVIEW",
  source = "UNKNOWN",
  googleForegroundReads = 0,
  tournament = {},
  teams = [],
  players = [],
  rounds = [],
  rules = [],
  matches = [],
  pairings = [],
  courses = [],
  holes = [],
  historicalFacts = {},
  scorecards = [],
  playerStatistics = {},
  ratings = {},
  partnerships = {},
  headToHead = {},
  handicaps = {},
  predictionSettings = {},
  provenance = {},
} = {}) {
  if (!PREDICTION_INPUT_SCOPES.includes(scope)) throw new Error(`Unsupported Prediction input scope ${scope}.`);
  const ordering = orderingContract({ teams, players, rounds, matches, pairings, scorecards, courses, holes });
  const bundle = {
    metadata: {
      contractVersion: PREDICTION_INPUT_BUNDLE_VERSION,
      scope,
      environment,
      preparedAt,
      evidencePolicyVersion: PREDICTION_EVIDENCE_POLICY_VERSION,
      statisticsVersion: playerStatistics.contractVersion || PREDICTION_STATISTICS_VERSION,
      source,
      googleForegroundReads,
      hiddenFallback: false,
    },
    tournament,
    teams,
    players,
    rounds,
    rules,
    matches,
    pairings,
    courses,
    holes,
    historicalFacts,
    scorecards,
    playerStatistics,
    ratings,
    partnerships,
    headToHead,
    handicaps,
    predictionSettings,
    evidence: evidenceContract(scorecards, holes, players),
    ordering,
    provenance,
  };
  bundle.fingerprints = fingerprintContract(bundle);
  return deepFreeze(bundle);
}

export function buildPredictionInputBundle({
  currentState = {},
  secondaryHistory = {},
  predictionSettings = {},
  scope = "full-diagnostic",
  preparedAt = new Date().toISOString(),
  allowUnknownSettingsFreshness = true,
} = {}) {
  if (!PREDICTION_INPUT_SCOPES.includes(scope)) throw new Error(`Unsupported Prediction input scope ${scope}.`);
  if (secondaryHistory?.source !== "supabase" || !secondaryHistory?.calculations) {
    const error = new Error("The certified request-local Supabase historical calculation model is required.");
    error.code = "PREDICTION_INPUT_HISTORY_REQUIRED";
    throw error;
  }
  if (!currentState?.tournament || !list(currentState.matches).length) {
    const error = new Error("The canonical current Supabase tournament state is required.");
    error.code = "PREDICTION_INPUT_CURRENT_TOURNAMENT_REQUIRED";
    throw error;
  }

  const live = tournamentLiveDataFromSupabaseView(currentState);
  const teams = teamRows(currentState);
  const players = currentPlayerRows(currentState, teams);
  const matches = currentMatchRows(currentState, live, teams);
  const rounds = currentRoundRows(currentState, matches);
  const pairings = pairingRows(matches);
  const courses = [...historicalCourseRows(secondaryHistory.completedViews), ...currentCourseRows(currentState, matches)];
  const holes = holeRows(courses);
  const historicalCards = list(secondaryHistory.scorecardAnalytics?.scorecards)
    .filter((card) => integer(card.year ?? card.Year) !== integer(currentState.tournament?.tournament_year))
    .map(normalizeHistoricalScorecard)
    .sort((left, right) => left.year - right.year || left.round - right.round || left.matchId.localeCompare(right.matchId) || left.sourceOrder - right.sourceOrder);
  const scorecards = [...historicalCards, ...currentScorecardRows(currentState, matches)];
  const statistics = playerStatistics(secondaryHistory.calculations);
  const allPlayerIds = [...new Set([
    ...statistics.playerIds,
    ...players.map((player) => player.id),
  ])].sort();
  const settings = settingsContract(predictionSettings, { allowUnknownSettingsFreshness });
  const historical = historicalFacts(secondaryHistory);
  const handicaps = handicapRows(secondaryHistory, players, matches, historical.matches);
  return assemblePredictionInputBundle({
    scope,
    preparedAt,
    environment: "PREVIEW",
    source: "CERTIFIED_SUPABASE_PROJECTIONS_ONLY",
    googleForegroundReads: 0,
    tournament: tournamentState(currentState, live, matches, rounds),
    teams,
    players,
    rounds,
    rules: rulesFromRounds(rounds),
    matches,
    pairings,
    courses,
    holes,
    historicalFacts: historical,
    scorecards,
    playerStatistics: statistics,
    ratings: ratingRows(statistics),
    partnerships: partnershipRows(secondaryHistory.calculations),
    headToHead: headToHeadRows(secondaryHistory.calculations, allPlayerIds),
    handicaps,
    predictionSettings: settings,
    provenance: {
      completedHistory: historical.tournaments.map((row) => ({ year: row.year, revision: row.revision, fingerprint: row.fingerprint })),
      currentTournamentRevision: clone(currentState.source_revision || currentState.live_revision || {}),
      currentTournamentFingerprint: predictionInputFingerprint(currentState.source_revision || currentState.live_revision || {}),
      predictionSettings: {
        revision: settings.revision,
        sourceFingerprint: settings.sourceFingerprint,
        effectiveFingerprint: settings.effectiveFingerprint,
      },
      courseConfigurationFingerprint: predictionInputFingerprint(courses),
      handicapFingerprint: predictionInputFingerprint(handicaps),
      evidencePolicyVersion: PREDICTION_EVIDENCE_POLICY_VERSION,
      statisticsVersion: statistics.contractVersion,
    },
  });
}

export function championshipOddsInputFromPredictionBundle(bundle = {}) {
  const year = number(bundle.tournament?.year);
  const matches = list(bundle.matches).map((match) => {
    const officialPoints = normalizeLifecycle(match.lifecycle) === "FINAL"
      ? match.points?.official || match.points?.current || {}
      : {};
    const row = {
      Year: year,
      Round: match.round,
      Format: match.format,
      "Match ID": match.id,
      "Match Status": match.lifecycle,
      // The unchanged tournament-odds engine treats populated prior-round
      // points as official. A reopened match can retain a complete scorecard,
      // but its prior result is deliberately unofficial until re-finalized.
      // Keep every pairing in the engine input while withholding non-final
      // points so the match is simulated instead of silently re-awarded.
      "Team 1 Points": officialPoints.teamOne ?? null,
      "Team 2 Points": officialPoints.teamTwo ?? null,
    };
    for (const participant of list(match.participants)) {
      row[`Team ${participant.teamSide} Player ${participant.slot}`] = participant.playerId;
    }
    return row;
  });
  const sheets = {
    tournaments: [{ Year: year, "Tournament ID": clean(bundle.tournament?.id) }],
    liveTournaments: [{ Year: year, "Team 1 Name": bundle.teams?.[0]?.name || "", "Team 2 Name": bundle.teams?.[1]?.name || "" }],
    players: list(bundle.players).map((player) => ({ "Player ID": player.id, "Display Name": player.displayName })),
    handicaps: list(bundle.players).map((player) => ({ Year: year, "Player ID": player.id, "Team Side": teamSideLabel(player.teamSide), "Tournament Handicap": player.tournamentHandicap })),
    teamNames: list(bundle.teams).map((team) => ({ Year: year, "Team Side": teamSideLabel(team.side), "Team Names": team.name })),
    tournamentRules: list(bundle.rules).map((rule) => ({ Year: year, Round: rule.round, Format: rule.format, "Points Available": rule.pointsPerMatch })),
    matches,
    projectionMatchSource: "Canonical PredictionInputBundle / Supabase scoring authority",
  };
  return {
    sheets,
    historical: clone(bundle.playerStatistics?.byPlayer || {}),
    metadata: {
      sourceRevision: clone(bundle.provenance?.currentTournamentRevision || {}),
      sourceFingerprint: clean(bundle.provenance?.currentTournamentFingerprint),
      settingsFingerprint: clean(bundle.predictionSettings?.effectiveFingerprint),
      ratingsFingerprint: clean(bundle.fingerprints?.sections?.statistics),
      pairingFingerprint: clean(bundle.fingerprints?.sections?.pairings),
      configurationRevision: number(bundle.predictionSettings?.revision, 0),
      bundleFingerprint: clean(bundle.fingerprints?.bundle),
    },
  };
}

const CONSUMER_REQUIREMENTS = Object.freeze({
  championship: ["tournament", "teams", "players", "rounds", "matches", "pairings", "ratings", "handicaps.current", "fingerprints.bundle"],
  matchup: ["teams", "players", "playerStatistics.byPlayer", "ratings", "partnerships", "headToHead", "handicaps.current", "courses", "holes", "predictionSettings.effectiveSettings"],
  "match-simulation": ["tournament", "rounds", "rules", "matches", "pairings", "predictionSettings.effectiveSettings"],
  "lineup-optimizer": ["teams", "players", "playerStatistics.byPlayer", "partnerships", "headToHead", "handicaps.current", "courses", "predictionSettings.effectiveSettings"],
  "team-intelligence": ["teams", "players", "playerStatistics.byPlayer", "ratings", "partnerships", "headToHead", "scorecards", "evidence"],
  "scorecard-calibration": ["historicalFacts.matches", "playerStatistics.byPlayer", "partnerships", "headToHead", "courses", "holes", "scorecards", "handicaps.historical", "predictionSettings.effectiveSettings"],
});

function pathValue(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

export function predictionInputCompatibilityReport(bundle = {}) {
  const consumers = Object.fromEntries(Object.entries(CONSUMER_REQUIREMENTS).map(([consumer, required]) => {
    const missing = required.filter((path) => {
      const value = pathValue(bundle, path);
      return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
    });
    return [consumer, { pass: missing.length === 0, required, missing }];
  }));
  const missing = Object.entries(consumers).flatMap(([consumer, result]) => result.missing.map((field) => ({ consumer, field })));
  return { pass: missing.length === 0, consumers, missing };
}

function identityKey(value) {
  if (!value || typeof value !== "object") return "";
  return clean(value.id || value.playerId || value.matchId || value.courseId || value.appearanceId || value.roundId);
}

function differenceClass(path, left, right) {
  if (left === null || right === null || left === undefined || right === undefined) return "NULLABILITY";
  if (typeof left !== typeof right || Array.isArray(left) !== Array.isArray(right)) return "TYPE";
  if (/revision|fingerprint|provenance/i.test(path)) return "REVISION";
  if (/settings|configuration/i.test(path)) return "CONFIGURATION";
  if (/evidence|scorecard|coverage|availability/i.test(path)) return "EVIDENCE";
  if (/(^|\.)(id|playerId|matchId|courseId|teamId)$/i.test(path)) return "IDENTITY";
  return "VALUE";
}

export function comparePredictionInputBundles(expected = {}, actual = {}) {
  const differences = [];
  const compare = (left, right, path = "bundle") => {
    if (Object.is(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      const leftKeys = left.map(identityKey);
      const rightKeys = right.map(identityKey);
      if (leftKeys.every(Boolean) && rightKeys.every(Boolean) && leftKeys.join("|") !== rightKeys.join("|") &&
          [...leftKeys].sort().join("|") === [...rightKeys].sort().join("|")) {
        differences.push({ classification: "ORDER", path, expected: leftKeys, actual: rightKeys });
        const rightMap = new Map(right.map((value) => [identityKey(value), value]));
        left.forEach((value) => compare(value, rightMap.get(identityKey(value)), `${path}[${identityKey(value)}]`));
        return;
      }
      if (left.length !== right.length) differences.push({ classification: "VALUE", path: `${path}.length`, expected: left.length, actual: right.length });
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) compare(left[index], right[index], `${path}[${index}]`);
      return;
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) compare(left[key], right[key], `${path}.${key}`);
      return;
    }
    differences.push({ classification: differenceClass(path, left, right), path, expected: left, actual: right });
  };
  compare(expected, actual);
  const counts = Object.fromEntries(["VALUE", "TYPE", "NULLABILITY", "ORDER", "EVIDENCE", "IDENTITY", "REVISION", "CONFIGURATION"]
    .map((classification) => [classification, differences.filter((row) => row.classification === classification).length]));
  return { pass: differences.length === 0, differences, counts };
}

function issue(issues, code, path, detail = {}, severity = "ERROR") {
  issues.push({ severity, code, path, ...detail });
}

export function validatePredictionInputBundle(bundle = {}, { allowUnknownSettingsFreshness = true } = {}) {
  const issues = [];
  if (bundle.metadata?.contractVersion !== PREDICTION_INPUT_BUNDLE_VERSION) issue(issues, "BUNDLE_CONTRACT_VERSION", "metadata.contractVersion");
  if (!bundle.tournament?.id || !bundle.tournament?.year) issue(issues, "TOURNAMENT_IDENTITY", "tournament");
  if (list(bundle.teams).length !== 2 || new Set(list(bundle.teams).map((row) => row.id)).size !== list(bundle.teams).length) issue(issues, "TEAM_IDENTITY", "teams");
  const currentPlayerIds = new Set(list(bundle.players).map((row) => row.id));
  if (currentPlayerIds.size !== list(bundle.players).length || [...currentPlayerIds].some((id) => !id)) issue(issues, "PLAYER_IDENTITY", "players");
  const teamIds = new Set(list(bundle.teams).map((row) => row.id));
  for (const player of list(bundle.players)) {
    if (!teamIds.has(player.teamId)) issue(issues, "ORPHAN_CURRENT_PLAYER_TEAM", `players.${player.id}`, { teamId: player.teamId });
    if (player.active && player.tournamentHandicap === null) {
      const explicitlyUnavailable = list(bundle.evidence?.currentHandicaps?.unavailablePlayerIds).includes(player.id);
      issue(
        issues,
        explicitlyUnavailable ? "CURRENT_HANDICAP_UNAVAILABLE" : "CURRENT_HANDICAP_EVIDENCE_MISSING",
        `players.${player.id}.tournamentHandicap`,
        {},
        explicitlyUnavailable ? "WARNING" : "ERROR"
      );
    }
  }
  const allPlayerIds = new Set([...currentPlayerIds, ...list(bundle.historicalFacts?.players).map((row) => row.id)]);
  const matchIds = new Set();
  const pairingKeys = new Set();
  for (const match of list(bundle.matches)) {
    if (!match.id || matchIds.has(match.id)) issue(issues, "DUPLICATE_MATCH", `matches.${match.id || "unknown"}`);
    matchIds.add(match.id);
    for (const participant of list(match.participants)) {
      if (!currentPlayerIds.has(participant.playerId)) issue(issues, "ORPHAN_MATCH_PARTICIPANT", `matches.${match.id}`, { playerId: participant.playerId });
    }
    const key = `${match.round}:${list(match.participants).map((row) => row.playerId).sort().join("|")}`;
    if (pairingKeys.has(key)) issue(issues, "DUPLICATE_PAIRING", `matches.${match.id}`, { key });
    pairingKeys.add(key);
    if (match.lifecycle !== "FINAL" && (match.points?.official?.teamOne !== null || match.points?.official?.teamTwo !== null)) {
      issue(issues, "NON_FINAL_OFFICIAL_POINTS", `matches.${match.id}.points.official`);
    }
  }
  const courseIds = new Set(list(bundle.courses).map((row) => row.stableCourseId).filter(Boolean));
  const historicalMatchIds = new Set(list(bundle.historicalFacts?.matches).map((row) => row.id));
  const scorecardIds = new Set();
  for (const card of list(bundle.scorecards)) {
    if (!card.id || scorecardIds.has(card.id)) issue(issues, "DUPLICATE_SCORECARD", `scorecards.${card.id || "unknown"}`);
    scorecardIds.add(card.id);
    if (!matchIds.has(card.matchId) && !historicalMatchIds.has(card.matchId)) issue(issues, "ORPHAN_SCORECARD_MATCH", `scorecards.${card.id}`, { matchId: card.matchId });
    if (card.courseId && !courseIds.has(card.courseId)) issue(issues, "ORPHAN_SCORECARD_COURSE", `scorecards.${card.id}`, { courseId: card.courseId });
    for (const playerId of card.playerIds) if (!allPlayerIds.has(playerId)) issue(issues, "ORPHAN_SCORECARD_PLAYER", `scorecards.${card.id}`, { playerId });
    if (!['COMPLETE', 'PARTIAL', 'UNAVAILABLE'].includes(card.availability)) issue(issues, "SCORECARD_EVIDENCE_STATE", `scorecards.${card.id}.availability`);
    if (card.availability === "UNAVAILABLE" && card.holes.length) issue(issues, "UNAVAILABLE_SCORECARD_HAS_HOLES", `scorecards.${card.id}.holes`);
  }
  const holeKeys = new Set();
  for (const hole of list(bundle.holes)) {
    const key = `${hole.year}:${hole.round}:${hole.courseId}:${hole.tee}:${hole.holeNumber}`;
    if (!hole.courseId || !Number.isInteger(hole.holeNumber) || hole.holeNumber < 1 || hole.holeNumber > 18) issue(issues, "INVALID_HOLE_CONFIGURATION", `holes.${key}`);
    if (holeKeys.has(key)) issue(issues, "DUPLICATE_HOLE_CONFIGURATION", `holes.${key}`);
    holeKeys.add(key);
  }
  const expectedSettings = PREDICTION_SETTING_SPECS.map((row) => row.canonicalKey).sort();
  const actualSettings = Object.keys(bundle.predictionSettings?.effectiveSettings || {}).sort();
  if (expectedSettings.join("|") !== actualSettings.join("|")) issue(issues, "PREDICTION_SETTINGS_30_KEY_CONTRACT", "predictionSettings.effectiveSettings", { expected: expectedSettings.length, actual: actualSettings.length });
  const freshness = upper(bundle.predictionSettings?.freshness);
  if (freshness === "UNKNOWN" && allowUnknownSettingsFreshness) issue(issues, "SETTINGS_FRESHNESS_UNKNOWN_READ_ONLY", "predictionSettings.freshness", {}, "WARNING");
  else if (freshness !== "CURRENT") issue(issues, "SETTINGS_FRESHNESS_NOT_ELIGIBLE", "predictionSettings.freshness");
  const compatibility = predictionInputCompatibilityReport(bundle);
  for (const missing of compatibility.missing) issue(issues, "CONSUMER_REQUIRED_FIELD", `compatibility.${missing.consumer}.${missing.field}`);
  const errors = issues.filter((row) => row.severity === "ERROR");
  return {
    pass: errors.length === 0,
    errors,
    warnings: issues.filter((row) => row.severity === "WARNING"),
    issues,
    compatibility,
    counts: {
      teams: list(bundle.teams).length,
      currentPlayers: list(bundle.players).length,
      historicalPlayers: list(bundle.historicalFacts?.players).length,
      rounds: list(bundle.rounds).length,
      matches: list(bundle.matches).length,
      pairings: list(bundle.pairings).length,
      courses: list(bundle.courses).length,
      holes: list(bundle.holes).length,
      scorecards: list(bundle.scorecards).length,
    },
  };
}

export function scopePredictionInputBundle(bundle = {}, scope = "full-diagnostic") {
  if (!PREDICTION_INPUT_SCOPES.includes(scope)) throw new Error(`Unsupported Prediction input scope ${scope}.`);
  if (scope === "full-diagnostic") return bundle;
  const common = {
    metadata: { ...bundle.metadata, scope },
    tournament: bundle.tournament,
    teams: bundle.teams,
    players: bundle.players,
    rounds: bundle.rounds,
    rules: bundle.rules,
    matches: bundle.matches,
    pairings: bundle.pairings,
    playerStatistics: bundle.playerStatistics,
    ratings: bundle.ratings,
    handicaps: bundle.handicaps,
    predictionSettings: bundle.predictionSettings,
    ordering: bundle.ordering,
    provenance: bundle.provenance,
    fingerprints: bundle.fingerprints,
  };
  if (scope === "championship") return common;
  const analytical = { ...common, partnerships: bundle.partnerships, headToHead: bundle.headToHead, courses: bundle.courses, holes: bundle.holes, evidence: bundle.evidence };
  if (["matchup", "lineup"].includes(scope)) return analytical;
  return { ...analytical, historicalFacts: bundle.historicalFacts, scorecards: bundle.scorecards };
}
