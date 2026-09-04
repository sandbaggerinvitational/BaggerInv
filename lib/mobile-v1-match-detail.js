import { gameCenterHoles, gameCenterStats, finalMatchSummary, liveMatchResult } from "./game-center.js";
import { holeStory, segmentMatchResult } from "./game-center-display.js";
import { MOBILE_API_VERSION, MobileApiError } from "./mobile-api-v1.js";
import { mobileNativeDevelopmentAuthorityEnvironment } from "./mobile-native-development-authority.js";
import { runningMatchStatusAtHole } from "./scoring-experience.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";

const clean = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const MOBILE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DECIMAL_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const FORMAT_NAMES = Object.freeze({ BB: "Best Ball", SC: "Scramble", SI: "Singles" });

export const MOBILE_MATCH_DETAIL_LIMITS = Object.freeze({
  holes: 18,
  participantsPerSide: 2,
  responseBytes: 262_144,
});

function unavailable(code = "MOBILE_API_UNAVAILABLE") {
  return new MobileApiError(code);
}

function requireValue(condition, code) {
  if (!condition) throw unavailable(code);
}

function boundedText(value, maximum, { nullable = false } = {}) {
  if ((value === null || value === undefined || clean(value) === "") && nullable) return null;
  const result = clean(value);
  requireValue(result.length > 0 && result.length <= maximum);
  return result;
}

function canonicalId(value, { nullable = false } = {}) {
  const result = clean(value);
  if (!result && nullable) return null;
  requireValue(MOBILE_ID.test(result));
  return result;
}

function canonicalNumber(value, { nullable = false } = {}) {
  if (value === null || value === undefined || clean(value) === "") {
    requireValue(nullable);
    return null;
  }
  requireValue(typeof value === "number" || typeof value === "string");
  if (typeof value === "string") requireValue(DECIMAL_NUMBER.test(clean(value)));
  const result = Number(value);
  requireValue(Number.isFinite(result));
  return result;
}

function canonicalInteger(value, minimum, maximum = Number.MAX_SAFE_INTEGER, { nullable = false } = {}) {
  const result = canonicalNumber(value, { nullable });
  if (result === null) return null;
  requireValue(Number.isSafeInteger(result) && result >= minimum && result <= maximum);
  return result;
}

function canonicalNumberInRange(value, minimum, maximum, { nullable = false } = {}) {
  const result = canonicalNumber(value, { nullable });
  if (result === null) return null;
  requireValue(result >= minimum && result <= maximum);
  return result;
}

function canonicalBoolean(value) {
  requireValue(typeof value === "boolean");
  return value;
}

function canonicalTimestamp(value, { nullable = true } = {}) {
  if (value === null || value === undefined || clean(value) === "") {
    requireValue(nullable);
    return null;
  }
  const parsed = new Date(value);
  requireValue(Number.isFinite(parsed.getTime()));
  return parsed.toISOString();
}

function canonicalTimeZone(value) {
  const result = boundedText(value || "America/Chicago", 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: result });
  } catch {
    throw unavailable();
  }
  return result;
}

function localTime(value) {
  const source = clean(value);
  if (!source) return null;
  const match = source.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  requireValue(match);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const period = clean(match[4]).toUpperCase();
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  requireValue(hour <= 23 && minute <= 59 && second <= 59);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function canonicalStatus(value) {
  const status = clean(value).toUpperCase();
  if (["FINAL", "FINALIZED", "COMPLETE", "COMPLETED"].includes(status)) return "completed";
  if (["LIVE", "ACTIVE", "IN PROGRESS", "IN-PROGRESS", "IN_PROGRESS"].includes(status)) return "inProgress";
  if (["UPCOMING", "SCHEDULED", "PRE", "LOCKED"].includes(status)) return "scheduled";
  throw unavailable();
}

function formatCode(value) {
  const result = clean(value).toUpperCase();
  requireValue(Object.hasOwn(FORMAT_NAMES, result));
  return result;
}

function requirePreviewAuthority(env) {
  requireValue(mobileNativeDevelopmentAuthorityEnvironment(env).available === true);
}

function successfulRpc(read) {
  const payload = read?.payload;
  if (payload?.ok === true) return payload;
  if (payload?.code === "MATCH_DETAIL_NOT_FOUND") throw unavailable("MATCH_NOT_FOUND");
  throw unavailable();
}

function legacyScore(row) {
  return {
    "Hole Number": row.holeNumber,
    "Team 1 Gross Scores": row.teamOneGross,
    "Team 2 Gross Scores": row.teamTwoGross,
    "Team 1 Strokes": row.teamOneStrokes,
    "Team 2 Strokes": row.teamTwoStrokes,
    "Team 1 Net Score": row.teamOneNet,
    "Team 2 Net Score": row.teamTwoNet,
    "Hole Winner": row.winner,
    "Updated At": row.updatedAt || "",
  };
}

function teamReference(value, teams) {
  const source = clean(value).toLowerCase();
  if (!source || /^(?:halved|half|tie|tied)$/.test(source)) return null;
  for (const team of teams) {
    if ([`team ${team.side}`, `team${team.side}`, String(team.side), team.teamId, team.name]
      .some((candidate) => clean(candidate).toLowerCase() === source)) return team.side;
  }
  return null;
}

function replaceTeamReferences(value, teams) {
  return clean(value)
    .replace(/\bTeam 1\b/gi, teams[0].name)
    .replace(/\bTeam 2\b/gi, teams[1].name);
}

function notationFromSummary(summary, teams) {
  const source = clean(summary);
  if (!source) return null;
  const team = teams.find((candidate) => source.toLowerCase().startsWith(candidate.name.toLowerCase()));
  return team ? clean(source.slice(team.name.length)) || null : source;
}

function scoreValues(value, expected, minimum) {
  requireValue(Array.isArray(value) && value.length === expected);
  return value.map((item) => canonicalInteger(item, minimum, 20));
}

function courseHoles(rawHoles) {
  requireValue(Array.isArray(rawHoles) && rawHoles.length === MOBILE_MATCH_DETAIL_LIMITS.holes);
  const rows = rawHoles.map((row) => ({
    holeNumber: canonicalInteger(row?.hole_number, 1, 18),
    par: canonicalInteger(row?.par, 1, 10, { nullable: true }),
    yardage: canonicalInteger(row?.yardage, 1, 1_000, { nullable: true }),
    strokeIndex: canonicalInteger(row?.stroke_index, 1, 18, { nullable: true }),
  })).sort((left, right) => left.holeNumber - right.holeNumber);
  requireValue(new Set(rows.map((row) => row.holeNumber)).size === 18 &&
    rows.every((row, index) => row.holeNumber === index + 1));
  return rows;
}

function canonicalScores(rawScores, format) {
  requireValue(Array.isArray(rawScores) && rawScores.length <= MOBILE_MATCH_DETAIL_LIMITS.holes);
  const expected = format === "BB" ? 2 : 1;
  const rows = rawScores.map((row) => {
    const winner = boundedText(row?.hole_winner, 16);
    requireValue(["Team 1", "Team 2", "Halved"].includes(winner));
    return {
      holeNumber: canonicalInteger(row?.hole_number, 1, 18),
      teamOneGross: scoreValues(row?.team_1_gross_scores, expected, 1),
      teamTwoGross: scoreValues(row?.team_2_gross_scores, expected, 1),
      teamOneStrokes: scoreValues(row?.team_1_strokes, expected, 0)
        .map((value) => canonicalInteger(value, 0, 9)),
      teamTwoStrokes: scoreValues(row?.team_2_strokes, expected, 0)
        .map((value) => canonicalInteger(value, 0, 9)),
      teamOneNet: canonicalInteger(row?.team_1_net_score, -20, 20),
      teamTwoNet: canonicalInteger(row?.team_2_net_score, -20, 20),
      winner,
      updatedAt: canonicalTimestamp(row?.updated_at),
    };
  }).sort((left, right) => left.holeNumber - right.holeNumber);
  requireValue(new Set(rows.map((row) => row.holeNumber)).size === rows.length);
  return rows;
}

function sideScore(side, format, participants, score) {
  const gross = side === 1 ? score?.teamOneGross : score?.teamTwoGross;
  const strokes = side === 1 ? score?.teamOneStrokes : score?.teamTwoStrokes;
  const netScore = side === 1 ? score?.teamOneNet : score?.teamTwoNet;
  if (format === "SC") {
    return {
      side,
      scope: "team",
      playerScores: [],
      teamScore: score ? { gross: gross[0], strokes: strokes[0] } : null,
      netScore: score ? netScore : null,
    };
  }
  return {
    side,
    scope: "players",
    playerScores: participants.map((player, index) => ({
      playerId: player.playerId,
      gross: score ? gross[index] : null,
      strokes: score ? strokes[index] : null,
    })),
    teamScore: null,
    netScore: score ? netScore : null,
  };
}

function segmentDto(holes, start, end, teams, { final = false, officialResult = "" } = {}) {
  const source = segmentMatchResult(holes, start, end,
    { 1: teams[0].name, 2: teams[1].name }, officialResult);
  const winnerSide = source.team === teams[0].name ? 1 : source.team === teams[1].name ? 2 : null;
  const complete = final || source.recorded === end - start + 1;
  return {
    status: source.recorded === 0 ? "notStarted"
      : complete ? "final"
        : winnerSide === null ? "allSquare" : "leading",
    winnerSide,
    result: source.recorded === 0 ? null : boundedText(source.result, 160),
    holesRecorded: canonicalInteger(source.recorded, 0, 18),
  };
}

function generatedAt(now) {
  return canonicalTimestamp(now instanceof Date ? now : new Date(now || Date.now()), { nullable: false });
}

export async function readMobilePreviewMatchDetailV1(
  { tournamentId, playerId, matchId },
  { env = process.env, dependencies = {} } = {},
) {
  requirePreviewAuthority(env);
  const canonicalTournamentId = canonicalId(tournamentId);
  const canonicalPlayerId = canonicalId(playerId);
  const canonicalMatchId = canonicalId(matchId);
  const rpc = dependencies.scoringShadowRpc || scoringShadowRpc;
  try {
    return await rpc("read_preview_mobile_match_detail_v1", {
      input: {
        environment: "PREVIEW",
        tournament_id: canonicalTournamentId,
        player_id: canonicalPlayerId,
        match_id: canonicalMatchId,
      },
    }, { env, timeoutMs: 8_000 });
  } catch {
    throw unavailable();
  }
}

export function mobileMatchDetailDataFromPreviewView(raw = {}, identity = {}) {
  requireValue(raw?.ok === true);
  const tournamentRow = raw.tournament || {};
  const roundRow = raw.round || {};
  const matchRow = raw.match || {};
  const presentation = raw.presentation || {};
  const snapshot = raw.snapshot || {};
  const navigationRow = raw.navigation || {};

  const tournamentId = canonicalId(tournamentRow.tournament_id);
  const matchId = canonicalId(matchRow.match_id);
  const playerId = canonicalId(identity.playerId);
  requireValue(tournamentId === canonicalId(identity.tournamentId) && matchId === canonicalId(identity.matchId));

  const roundNumber = canonicalInteger(matchRow.round_number, 1, 32);
  requireValue(roundNumber === canonicalInteger(roundRow.round_number, 1, 32));
  const format = formatCode(matchRow.format);
  requireValue(format === formatCode(roundRow.format) && format === formatCode(snapshot.format));
  const status = canonicalStatus(matchRow.status);

  const rawTeams = list(raw.teams);
  requireValue(rawTeams.length === 2);
  const teamsBySide = rawTeams.map((row) => ({
    side: canonicalInteger(row?.team_side, 1, 2),
    teamId: canonicalId(row?.team_id),
    name: boundedText(row?.name, 160),
  })).sort((left, right) => left.side - right.side);
  requireValue(teamsBySide[0].side === 1 && teamsBySide[1].side === 2 &&
    teamsBySide[0].teamId !== teamsBySide[1].teamId && teamsBySide[0].name !== teamsBySide[1].name);

  const rawParticipants = list(raw.participants);
  const expectedParticipants = format === "SI" ? 1 : 2;
  requireValue(rawParticipants.length === expectedParticipants * 2 && rawParticipants.length <= 4);
  const participantIds = new Set();
  const participantsForSide = (side) => {
    const values = rawParticipants.filter((row) => Number(row?.team_side) === side)
      .sort((left, right) => Number(left?.player_slot) - Number(right?.player_slot));
    requireValue(values.length === expectedParticipants);
    return values.map((row, index) => {
      requireValue(canonicalInteger(row?.player_slot, 1, 2) === index + 1);
      const id = canonicalId(row?.player_id);
      requireValue(!participantIds.has(id));
      participantIds.add(id);
      const authenticated = id === playerId;
      requireValue(canonicalBoolean(row?.is_authenticated_player) === authenticated);
      return {
        playerId: id,
        displayName: boundedText(row?.display_name, 160),
        teamSide: side,
        isAuthenticatedPlayer: authenticated,
        playingHandicap: canonicalNumber(row?.playing_handicap, { nullable: true }),
        strokesReceived: format === "SC" ? null
          : canonicalInteger(row?.final_strokes, 0, Number.MAX_SAFE_INTEGER, { nullable: true }),
      };
    });
  };
  const sideOnePlayers = participantsForSide(1);
  const sideTwoPlayers = participantsForSide(2);
  const teamConfiguration = snapshot.team_configuration || {};
  const teamDto = (team, participants) => ({
    ...team,
    playingHandicap: format === "SC"
      ? canonicalNumber(teamConfiguration[`team_${team.side}_playing_handicap`], { nullable: true }) : null,
    strokesReceived: format === "SC"
      ? canonicalInteger(teamConfiguration[`team_${team.side}_strokes`], 0, Number.MAX_SAFE_INTEGER, { nullable: true }) : null,
    participants,
  });
  const teams = [teamDto(teamsBySide[0], sideOnePlayers), teamDto(teamsBySide[1], sideTwoPlayers)];

  const authenticatedSide = teams.find((team) => team.participants.some((player) => player.isAuthenticatedPlayer))?.side || null;
  const ownPlayers = authenticatedSide ? teams[authenticatedSide - 1].participants : [];
  const opposingPlayers = authenticatedSide ? teams[authenticatedSide === 1 ? 1 : 0].participants : [];

  const holes = courseHoles(raw.holes);
  const scores = canonicalScores(raw.scores, format);
  requireValue(scores.every((score) => holes.some((hole) => hole.holeNumber === score.holeNumber)));
  const legacyScores = scores.map(legacyScore);
  const legacyCourseHoles = holes.map((hole) => ({
    "Hole Number": hole.holeNumber,
    Par: hole.par,
    Yardage: hole.yardage,
    "Stroke Index": hole.strokeIndex,
  }));
  const legacyHoles = gameCenterHoles(legacyScores, legacyCourseHoles);
  const statsSource = gameCenterStats(legacyHoles);
  const rawScoredHoles = canonicalInteger(matchRow.scored_holes, 0, 18);
  const rawCurrentHole = canonicalInteger(matchRow.current_hole, 0, 18);
  const rawHolesRemaining = canonicalInteger(matchRow.holes_remaining, 0, 18);
  const rawSideOneWins = canonicalInteger(matchRow.team_1_holes_won, 0, 18);
  const rawSideTwoWins = canonicalInteger(matchRow.team_2_holes_won, 0, 18);
  requireValue(rawScoredHoles === statsSource.played && rawCurrentHole === statsSource.played &&
    rawHolesRemaining === statsSource.remaining && rawSideOneWins === statsSource.team1 &&
    rawSideTwoWins === statsSource.team2);

  const legacyMatch = {
    status: matchRow.status,
    "Match Status": matchRow.status,
    liveStatusText: clean(matchRow.running_result),
    matchupWinner: clean(matchRow.result_winner),
    overallWinner: clean(matchRow.result_winner),
    finalizedAt: clean(matchRow.finalized_at),
    "Finalized At": clean(matchRow.finalized_at),
    format,
    Format: format,
  };
  const teamNames = { 1: teams[0].name, 2: teams[1].name };
  const displayResult = status === "scheduled" ? ""
    : replaceTeamReferences(liveMatchResult(legacyMatch, legacyScores, teamNames), teams);
  const scoreLeaderSide = statsSource.team1 === statsSource.team2 ? null
    : statsSource.team1 > statsSource.team2 ? 1 : 2;
  const canonicalWinnerSide = teamReference(matchRow.result_winner, teams);
  const resultSide = status === "completed" ? canonicalWinnerSide : scoreLeaderSide;
  if (status === "completed" && clean(matchRow.result_winner) && !/halved/i.test(clean(matchRow.result_winner))) {
    requireValue(resultSide !== null && resultSide === scoreLeaderSide);
  }
  if (status === "completed" && /halved/i.test(clean(matchRow.result_winner))) {
    requireValue(scoreLeaderSide === null);
  }
  const result = status === "scheduled" ? null : {
    summary: boundedText(displayResult || replaceTeamReferences(matchRow.running_result, teams) || "All Square", 200),
    notation: notationFromSummary(displayResult, teams),
    winnerSide: resultSide,
    winnerTeamId: resultSide ? teams[resultSide - 1].teamId : null,
  };

  const clinched = canonicalBoolean(matchRow.clinched);
  // Canonical scoring marks Singles complete both when a side clinches early
  // and when the Match is decided on Hole 18. Project the optional mobile
  // clinch only for the former. A complete scorecard can also remain LIVE
  // while awaiting confirmation, so derive the early-clinch summary from the
  // same trusted PWA helper without requiring the lifecycle to be FINAL.
  const clinchSummary = clinched ? finalMatchSummary({
    ...legacyMatch,
    status: "FINAL",
    "Match Status": "FINAL",
  }, legacyScores, teamNames) : "";
  requireValue(!clinched || clean(clinchSummary));
  const clinchHole = canonicalInteger(clean(clinchSummary).match(/\bHole\s+(\d+)\b/i)?.[1], 1, 18, { nullable: true });
  requireValue(clinchHole === null || resultSide !== null);
  const clinch = clinchHole !== null ? {
    holeNumber: clinchHole,
    winnerSide: resultSide,
    winnerTeamId: teams[resultSide - 1].teamId,
    summary: boundedText(clinchSummary, 240),
  } : null;

  const scoreByHole = new Map(scores.map((score) => [score.holeNumber, score]));
  const scorecardComplete = canonicalBoolean(matchRow.scorecard_complete);
  const finalizedAt = canonicalTimestamp(matchRow.finalized_at);
  if (status === "scheduled") {
    requireValue(scores.length === 0 && rawScoredHoles === 0 && rawCurrentHole === 0 &&
      rawHolesRemaining === 18 && !scorecardComplete && finalizedAt === null && !clinched);
  } else if (status === "inProgress") {
    requireValue(finalizedAt === null);
  } else {
    requireValue(scorecardComplete && finalizedAt && clean(matchRow.result_winner));
    if (/halved/i.test(clean(matchRow.result_winner))) requireValue(resultSide === null);
  }
  const scorecardState = status === "completed" ? "confirmed"
    : status === "inProgress" ? "inProgress" : "unavailable";
  const scorecardHoles = holes.map((hole) => {
    const score = scoreByHole.get(hole.holeNumber) || null;
    const legacyHole = legacyHoles[hole.holeNumber - 1];
    const winningSide = score?.winner === "Team 1" ? 1 : score?.winner === "Team 2" ? 2 : null;
    const context = clinch && hole.holeNumber >= clinch.holeNumber
      ? hole.holeNumber === clinch.holeNumber ? clinch.summary
        : `The match was already decided on Hole ${clinch.holeNumber}.`
      : holeStory(legacyHoles, hole.holeNumber, teamNames);
    const runningResult = score
      ? runningMatchStatusAtHole(legacyScores, hole.holeNumber, teamNames) : null;
    return {
      ...hole,
      official: score !== null,
      state: !score ? "unplayed" : score.winner === "Halved" ? "halved"
        : winningSide === 1 ? "sideOne" : "sideTwo",
      winningSide,
      resultLabel: score ? (score.winner === "Halved" ? "Halved" : teams[winningSide - 1].name) : null,
      sideOne: sideScore(1, format, sideOnePlayers, score),
      sideTwo: sideScore(2, format, sideTwoPlayers, score),
      runningResult: runningResult ? boundedText(runningResult, 200) : null,
      story: boundedText(context, 300, { nullable: true }),
      updatedAt: score?.updatedAt || null,
    };
  });

  const overallFlow = segmentDto(legacyHoles, 1, 18, teams, {
    final: status === "completed",
    officialResult: status === "completed" ? displayResult : "",
  });
  const flow = {
    front: segmentDto(legacyHoles, 1, 9, teams),
    back: segmentDto(legacyHoles, 10, 18, teams),
    overall: overallFlow,
  };

  const roundMatchIndex = canonicalInteger(navigationRow.round_match_index, 1, 64);
  const roundMatchCount = canonicalInteger(navigationRow.round_match_count, 1, 64);
  requireValue(roundMatchIndex <= roundMatchCount);
  const myMatchId = canonicalId(navigationRow.my_match_id, { nullable: true });
  const isMyMatch = canonicalBoolean(navigationRow.is_my_match);
  requireValue(isMyMatch === (myMatchId === matchId));
  const navigation = {
    roundMatchIndex,
    roundMatchCount,
    previousMatchId: canonicalId(navigationRow.previous_match_id, { nullable: true }),
    nextMatchId: canonicalId(navigationRow.next_match_id, { nullable: true }),
    myMatchId,
    isMyMatch,
  };
  requireValue(navigation.previousMatchId !== matchId && navigation.nextMatchId !== matchId);

  const teeTimeLabel = boundedText(presentation.tee_time, 80, { nullable: true });
  const courseId = canonicalId(snapshot.course_id, { nullable: true });
  const courseName = boundedText(presentation.course_name, 160, { nullable: true });
  requireValue(!courseId || courseName !== null);
  const course = courseName ? {
    courseId,
    name: courseName,
    tee: boundedText(snapshot.tee, 80, { nullable: true }),
    yardage: canonicalInteger(presentation.course_yardage, 1, 20_000, { nullable: true }),
    par: canonicalNumberInRange(snapshot.par, 1, 100, { nullable: true }),
    rating: canonicalNumberInRange(snapshot.rating, 1, 100, { nullable: true }),
    slope: canonicalInteger(snapshot.slope, 1, 300, { nullable: true }),
  } : null;

  const updatedAt = [
    matchRow.authority_updated_at,
    matchRow.finalized_at,
    presentation.source_updated_at,
    presentation.updated_at,
    ...scores.map((score) => score.updatedAt),
  ].map((value) => canonicalTimestamp(value)).filter(Boolean).sort().at(-1) || null;
  const stats = {
    holesPlayed: statsSource.played,
    sideOneHolesWon: statsSource.team1,
    halved: statsSource.halved,
    sideTwoHolesWon: statsSource.team2,
    biggestLead: statsSource.biggestLead,
    leadChanges: statsSource.leadChanges,
    holesRemaining: statsSource.remaining,
  };
  return {
    tournament: {
      tournamentId,
      name: boundedText(tournamentRow.name, 200),
      year: canonicalInteger(tournamentRow.tournament_year, 2000, 2200, { nullable: true }),
      status: boundedText(presentation.tournament_status, 80, { nullable: true }),
      timeZone: canonicalTimeZone(presentation.tournament_time_zone),
      location: boundedText(presentation.tournament_location, 200, { nullable: true }),
    },
    match: {
      matchId,
      displayMatchNumber: boundedText(presentation.display_match_number, 80, { nullable: true }),
      round: {
        roundNumber,
        name: boundedText(roundRow.name, 160, { nullable: true }),
        format,
        formatName: FORMAT_NAMES[format],
      },
      status,
      course,
      teeTime: teeTimeLabel ? {
        localTime: localTime(teeTimeLabel),
        label: teeTimeLabel,
        timeZone: canonicalTimeZone(presentation.tournament_time_zone),
      } : null,
      teams,
      authenticatedPlayer: {
        involved: authenticatedSide !== null,
        teamSide: authenticatedSide,
        partnerPlayerIds: ownPlayers.filter((player) => !player.isAuthenticatedPlayer).map((player) => player.playerId),
        opponentPlayerIds: opposingPlayers.map((player) => player.playerId),
      },
      progress: {
        currentHole: rawCurrentHole,
        holesPlayed: rawScoredHoles,
        holesRemaining: rawHolesRemaining,
        statusText: boundedText(replaceTeamReferences(matchRow.running_result, teams), 200, { nullable: true }),
      },
      result,
      navigation,
      scorecard: {
        state: scorecardState,
        complete: scorecardComplete,
        confirmedAt: status === "completed" ? finalizedAt : null,
        holes: scorecardHoles,
      },
      flow,
      clinch,
      stats,
      freshness: { updatedAt, confirmedAt: status === "completed" ? finalizedAt : null },
    },
  };
}

export async function mobileMatchDetailResult(
  identity,
  matchId,
  { env = process.env, now, dependencies = {} } = {},
) {
  const canonicalMatchId = canonicalId(matchId);
  const read = await (dependencies.readMobilePreviewMatchDetailV1 || readMobilePreviewMatchDetailV1)(
    { tournamentId: identity?.tournamentId, playerId: identity?.playerId, matchId: canonicalMatchId },
    { env, dependencies },
  );
  const raw = successfulRpc(read);
  const data = mobileMatchDetailDataFromPreviewView(raw, {
    tournamentId: identity?.tournamentId,
    playerId: identity?.playerId,
    matchId: canonicalMatchId,
  });
  const revision = scoringShadowPayloadHash({ product: "mobile-match-detail-v1", data });
  const body = {
    ok: true,
    apiVersion: MOBILE_API_VERSION,
    data,
    meta: { generatedAt: generatedAt(now), revision },
  };
  requireValue(Buffer.byteLength(JSON.stringify(body), "utf8") <= MOBILE_MATCH_DETAIL_LIMITS.responseBytes);
  return { status: 200, revision, body };
}
