import { calculateMatchPoints } from "./live-hole-scoring.js";
import { getEffectiveTournamentState, getRoundProgress, getTeamMomentum, getTournamentState, remainingByRound, roundStatus } from "./live-tournament.js";
import { gameCenterDataFromSupabaseView } from "./game-center-supabase.js";
import { finalizedMatchResult, formatLiveMatchResult } from "./match-result.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import { currentPresentationTimeline } from "./tournament-timeline.js";
import { publishedTournamentSecondaryModules } from "./calcutta-presentation-availability.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export async function readTournamentLiveView(tournamentId = "", options = {}) {
  return scoringShadowRpc("read_tournament_live_view", {
    target_tournament_id: clean(tournamentId),
    production_cutover_surface: clean(options.productionCutoverSurface),
  }, {
    ...options, timeoutMs: options.timeoutMs || 8_000,
  });
}

export async function readTournamentSecondaryView({ tournamentId = "", module = "" } = {}, options = {}) {
  return scoringShadowRpc("read_tournament_secondary_view", {
    target_tournament_id: clean(tournamentId), target_module: clean(module),
  }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
}

function liveMatch(entry, tournament, teams) {
  const data = gameCenterDataFromSupabaseView({
    tournament,
    teams,
    round: entry.round,
    match: entry.match,
    snapshot: entry.snapshot,
    presentation: entry.presentation,
    participants: entry.participants,
    permissions: [],
    scores: entry.scores,
    holes: [],
    navigation: {},
  });
  const match = data.match;
  const holeResults = (entry.scores || []).map((score) => ({
    holeNumber: number(score.hole_number), winner: clean(score.hole_winner), updatedAt: clean(score.updated_at),
  }));
  const teamNames = Object.fromEntries(teams.map((team) => [number(team.team_side), clean(team.name)]));
  const scoreRows = holeResults.map((row) => ({ "Hole Number": row.holeNumber, "Hole Winner": row.winner }));
  const final = clean(match.status).toUpperCase() === "FINAL";
  const currentHole = Math.max(number(match.currentHole), ...holeResults.map((row) => row.holeNumber), 0);
  const hasScoredHole = holeResults.length > 0;
  return {
    ...match,
    currentHole,
    // Preserve the Director-facing distinction between an unstarted match and a
    // played 0-point result. Scoring totals already treat both as zero, while the
    // Tournament presentation intentionally renders unstarted points as blank.
    team1Points: hasScoredHole ? match.team1Points : null,
    team2Points: hasScoredHole ? match.team2Points : null,
    archiveFinal: final,
    accessActive: match.scoringEnabled,
    pointsAvailable: 3,
    finalResult: final ? finalizedMatchResult({ status: "Final", overallWinner: match.overallWinner,
      team1Points: match.team1Points, team2Points: match.team2Points }, scoreRows, teamNames) : "",
    liveStatusText: final ? match.liveStatusText : formatLiveMatchResult(holeResults, teamNames),
    holeResults,
  };
}

function applyMatchDisplayProjection(match, projected = {}) {
  const players = (canonical, display) => canonical.map((player) => {
    const exact = (display || []).find((row) => clean(row.id) === clean(player.id)) || {};
    return { ...player,
      playingHcp: Object.hasOwn(exact, "playingHcp") ? exact.playingHcp : player.playingHcp,
      stroke: Object.hasOwn(exact, "stroke") ? exact.stroke : player.stroke,
    };
  });
  return {
    ...match,
    team1Players: players(match.team1Players || [], projected.team1Players),
    team2Players: players(match.team2Players || [], projected.team2Players),
    team1PlayingHcp: projected.team1PlayingHcp ?? match.team1PlayingHcp,
    team2PlayingHcp: projected.team2PlayingHcp ?? match.team2PlayingHcp,
    team1Stroke: Object.hasOwn(projected, "team1Stroke") ? projected.team1Stroke : match.team1Stroke,
    team2Stroke: Object.hasOwn(projected, "team2Stroke") ? projected.team2Stroke : match.team2Stroke,
  };
}

export function tournamentLiveDataFromSupabaseView(view = {}) {
  const tournamentRow = view.tournament || {};
  const teams = view.teams || [];
  const teamBySide = Object.fromEntries(teams.map((team) => [number(team.team_side), team]));
  const presentationRow = view.tournament_presentation || view.home_presentation || {};
  const presentation = presentationRow.presentation || {};
  const tournamentPresentation = presentation.tournament || {};
  const matchDisplay = presentation.tournamentMatchDisplay || {};
  const entries = view.matches || [];
  const expectedByRound = entries.reduce((counts, entry) => {
    const roundNumber = number(entry.match?.round_number);
    counts[roundNumber] = (counts[roundNumber] || 0) + 1;
    return counts;
  }, {});
  const matches = entries.map((entry) => {
    const canonical = liveMatch(entry, tournamentRow, teams);
    return { ...applyMatchDisplayProjection(canonical, matchDisplay[canonical.id] || {}),
      expectedRoundMatchCount: expectedByRound[number(entry.match?.round_number)] || 0 };
  });
  const configuredStatus = clean(tournamentPresentation.configuredStatus || tournamentPresentation.status || "Upcoming");
  const configuredRound = tournamentPresentation.currentRound || 1;
  const effective = getEffectiveTournamentState({
    matches,
    configuredStatus,
    configuredRound,
    statusMode: tournamentPresentation.statusMode || "Automatic",
  });
  const currentRound = effective.currentRound;
  const status = effective.status;
  const rounds = (view.rounds || []).map((round) => {
    const roundMatches = matches.filter((match) => number(match.round) === number(round.round_number))
      .sort((left, right) => number(left.match) - number(right.match) || clean(left.id).localeCompare(clean(right.id)));
    const item = {
      number: number(round.round_number),
      label: clean(round.name || `Round ${round.round_number}`),
      format: roundMatches[0]?.formatName || clean(round.format),
      course: roundMatches[0]?.course || {},
      matches: roundMatches,
    };
    return { ...item, status: roundStatus(item, status, currentRound), progress: getRoundProgress(item) };
  });
  const finalized = matches.filter((match) => clean(match.status).toUpperCase() === "FINAL");
  const scores = finalized.reduce((total, match) => {
    const points = calculateMatchPoints(match.format, match.holeResults);
    return {
      teamOne: total.teamOne + number(points.team1Points),
      teamTwo: total.teamTwo + number(points.team2Points),
    };
  }, { teamOne: 0, teamTwo: 0 });
  const firstPresentation = entries.find((entry) => entry.presentation)?.presentation || {};
  const tournament = {
    id: clean(tournamentRow.tournament_id),
    year: number(tournamentRow.tournament_year),
    name: clean(tournamentRow.name),
    edition: clean(tournamentPresentation.edition),
    status,
    configuredStatus,
    statusMode: clean(tournamentPresentation.statusMode || "Automatic"),
    effective,
    currentRound,
    location: clean(tournamentPresentation.location || firstPresentation.tournament_location),
    dates: clean(tournamentPresentation.dates),
    startDate: clean(tournamentPresentation.startDate),
    startTime: clean(tournamentPresentation.startTime),
    timeZone: clean(tournamentPresentation.timeZone || firstPresentation.tournament_time_zone || "America/Chicago"),
    liveMessage: clean(tournamentPresentation.liveMessage),
    lastUpdated: clean(tournamentPresentation.lastUpdated),
    logo: clean(tournamentPresentation.logo || firstPresentation.tournament_logo),
    tieAdvantageSide: tournamentPresentation.tieAdvantageSide ?? null,
    teamOne: {
      id: clean(teamBySide[1]?.team_id),
      name: clean(teamBySide[1]?.name || "Team 1"),
      logo: clean(firstPresentation.team_1_logo),
      score: scores.teamOne,
    },
    teamTwo: {
      id: clean(teamBySide[2]?.team_id),
      name: clean(teamBySide[2]?.name || "Team 2"),
      logo: clean(firstPresentation.team_2_logo),
      score: scores.teamTwo,
    },
  };
  tournament.state = getTournamentState({ tournament, rounds });
  const timeline = currentPresentationTimeline(presentation.timeline, {
    tournamentStatus: status,
    timeZone: tournament.timeZone,
    rounds,
  });
  const revision = scoringShadowPayloadHash({
    liveRevision: view.live_revision || {},
    presentationFingerprint: presentationRow.source_fingerprint || "",
  });
  return {
    tournament,
    rounds,
    timeline,
    schedule: timeline.events,
    remainingByRound: remainingByRound(rounds),
    momentum: getTeamMomentum(rounds),
    revision,
    queryMs: number(view.query_ms),
    presentation: {
      available: Boolean(presentationRow),
      fingerprint: clean(presentationRow.source_fingerprint),
      importedAt: clean(presentationRow.imported_at),
      secondaryModules: publishedTournamentSecondaryModules(presentation.tournamentSecondary),
    },
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

const displayNumber = (value) => value == null || value === "" ? null : Number(value);
const displayPlayer = (player = {}) => ({
  id: clean(player.id), name: clean(player.name),
  playingHcp: displayNumber(player.playingHcp), stroke: displayNumber(player.stroke),
});

export function tournamentLiveParityProjection(data = {}) {
  const tournament = data.tournament || {};
  const teamNames = { 1: clean(tournament.teamOne?.name), 2: clean(tournament.teamTwo?.name) };
  return stable({
    tournament: {
      id: clean(tournament.id), year: number(tournament.year), name: clean(tournament.name),
      status: clean(tournament.status), currentRound: tournament.currentRound,
      location: clean(tournament.location), logo: clean(tournament.logo),
      teamOne: { id: clean(tournament.teamOne?.id), name: clean(tournament.teamOne?.name), logo: clean(tournament.teamOne?.logo), score: number(tournament.teamOne?.score) },
      teamTwo: { id: clean(tournament.teamTwo?.id), name: clean(tournament.teamTwo?.name), logo: clean(tournament.teamTwo?.logo), score: number(tournament.teamTwo?.score) },
    },
    rounds: (data.rounds || []).map((round) => ({
      number: number(round.number), label: clean(round.label), format: clean(round.format), status: clean(round.status),
      course: { id: clean(round.course?.id), name: clean(round.course?.name), logo: clean(round.course?.logo), tee: clean(round.course?.tee) },
      progress: {
        totalMatches: number(round.progress?.totalMatches), completedMatches: number(round.progress?.completedMatches),
        liveMatches: number(round.progress?.liveMatches), scheduledMatches: number(round.progress?.scheduledMatches),
        totalPoints: number(round.progress?.totalPoints), decidedPoints: number(round.progress?.decidedPoints),
      },
      matches: (round.matches || []).map((match) => ({
        id: clean(match.id), round: number(match.round), match: clean(match.match), format: clean(match.format),
        status: clean(match.status), currentHole: Math.max(number(match.currentHole),
          ...(match.holeResults || []).map((row) => number(row.holeNumber)), 0),
        displayResult: clean(match.status).toUpperCase() === "FINAL"
          ? clean(match.finalResult)
          : formatLiveMatchResult(match.holeResults || [], teamNames),
        team1Points: displayNumber(match.team1Points), team2Points: displayNumber(match.team2Points),
        teeTime: clean(match.teeTime), course: { id: clean(match.course?.id), name: clean(match.course?.name), logo: clean(match.course?.logo), tee: clean(match.course?.tee) },
        team1Players: (match.team1Players || []).map(displayPlayer), team2Players: (match.team2Players || []).map(displayPlayer),
        team1PlayingHcp: displayNumber(match.team1PlayingHcp), team2PlayingHcp: displayNumber(match.team2PlayingHcp),
        team1Stroke: displayNumber(match.team1Stroke), team2Stroke: displayNumber(match.team2Stroke),
      })),
    })),
    remainingByRound: data.remainingByRound || [],
    momentum: data.momentum || null,
  });
}

export function compareTournamentLiveParity(expected, actual) {
  const left = JSON.stringify(tournamentLiveParityProjection(expected));
  const right = JSON.stringify(tournamentLiveParityProjection(actual));
  return { pass: left === right, expected: left === right ? undefined : JSON.parse(left), actual: left === right ? undefined : JSON.parse(right) };
}
