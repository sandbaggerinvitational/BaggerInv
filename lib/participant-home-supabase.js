import { calculateMatchPoints } from "./live-hole-scoring.js";
import { getEffectiveTournamentState, getRoundProgress, getTournamentState, roundStatus } from "./live-tournament.js";
import { gameCenterDataFromSupabaseView } from "./game-center-supabase.js";
import { myMatchDataFromSupabaseView, myMatchParityProjection } from "./my-match-supabase.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import { timelineEventStatus } from "./tournament-timeline.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export async function readParticipantHomeView({ tournamentId, playerId }, options = {}) {
  return scoringShadowRpc("read_participant_home_view", {
    target_tournament_id: clean(tournamentId),
    target_player_id: clean(playerId),
  }, { ...options, timeoutMs: options.timeoutMs || 8_000 });
}

export async function replaceParticipantHomePresentation(input, options = {}) {
  return scoringShadowRpc("replace_preview_participant_home_presentation", { input }, {
    ...options, timeoutMs: options.timeoutMs || 15_000,
  });
}

function participantNetSkins(netSkins = {}, playerId) {
  const rounds = (netSkins.rounds || []).flatMap((round) => {
    const entries = (round.leaderboard || []).filter((row) => row.playerIds?.includes(playerId));
    if (!entries.length) return [];
    return entries.map((row) => ({
      round: number(round.round),
      format: clean(round.format),
      playerIds: Array.isArray(row.playerIds) ? row.playerIds.map(clean).filter(Boolean) : [playerId],
      skinsWon: number(row.skinsWon),
      totalWinnings: number(row.totalWinnings),
    }));
  });
  return { rounds };
}

export function buildParticipantHomePresentationImport({ liveData = {}, sourceWorkbookId, requestedBy = "Home presentation refresh" } = {}) {
  const tournament = liveData.tournament || {};
  const players = liveData.players || [];
  const netSkinsByPlayer = Object.fromEntries(players.map((player) => [player.id, participantNetSkins(liveData.netSkins, player.id)]));
  const presentation = {
    tournament: {
      location: clean(tournament.location), logo: clean(tournament.logo), status: clean(tournament.status),
      configuredStatus: clean(tournament.configuredStatus), statusMode: clean(tournament.statusMode),
      currentRound: tournament.currentRound, startDate: clean(tournament.startDate),
      startTime: clean(tournament.startTime), timeZone: clean(tournament.timeZone || "America/Chicago"),
      edition: clean(tournament.edition), dates: clean(tournament.dates), liveMessage: clean(tournament.liveMessage),
      lastUpdated: clean(tournament.lastUpdated), tieAdvantageSide: tournament.tieAdvantageSide ?? null,
    },
    timeline: {
      available: liveData.timeline?.available === true,
      events: (liveData.timeline?.events || []).filter((event) => event.displayOnHome),
      effectiveNow: clean(liveData.timeline?.effectiveNow),
      previewDateActive: liveData.timeline?.previewDateActive === true,
    },
    netSkinsByPlayer,
  };
  return {
    environment: "PREVIEW",
    tournament_id: clean(tournament.id || tournament.year),
    source_workbook_id: clean(sourceWorkbookId),
    requested_by: clean(requestedBy),
    presentation,
  };
}

function homeMatch(entry, tournament, teams) {
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
  return {
    ...match,
    archiveFinal: clean(match.status).toUpperCase() === "FINAL",
    accessActive: match.scoringEnabled,
    pointsAvailable: 3,
    finalResult: data.result?.officialResult || "",
    holeResults: (entry.scores || []).map((score) => ({
      holeNumber: number(score.hole_number),
      winner: clean(score.hole_winner),
      updatedAt: clean(score.updated_at),
    })),
  };
}

function netSkinsView(summary = {}, playerId = "") {
  return {
    rounds: (summary.rounds || []).map((round) => ({
      round: number(round.round), format: clean(round.format),
      leaderboard: [{ playerIds: Array.isArray(round.playerIds) && round.playerIds.length ? round.playerIds : [playerId],
        skinsWon: number(round.skinsWon), totalWinnings: number(round.totalWinnings) }],
    })),
  };
}

export function participantHomeDataFromSupabaseView(view = {}) {
  const tournamentRow = view.tournament || {};
  const teams = view.teams || [];
  const teamBySide = Object.fromEntries(teams.map((team) => [number(team.team_side), team]));
  const presentation = view.home_presentation?.presentation || {};
  const tournamentPresentation = presentation.tournament || {};
  const matchRows = (view.matches || []).map((entry) => homeMatch(entry, tournamentRow, teams));
  const expectedByRound = matchRows.reduce((counts, match) => {
    const roundNumber = number(match.round);
    counts[roundNumber] = (counts[roundNumber] || 0) + 1;
    return counts;
  }, {});
  const matches = matchRows.map((match) => ({
    ...match,
    expectedRoundMatchCount: expectedByRound[number(match.round)] || 0,
  }));
  const configuredStatus = clean(tournamentPresentation.configuredStatus || tournamentPresentation.status || "Upcoming");
  const configuredRound = tournamentPresentation.currentRound || 1;
  const effective = getEffectiveTournamentState({ matches, configuredStatus, configuredRound,
    statusMode: tournamentPresentation.statusMode || "Automatic" });
  const currentRound = effective.currentRound;
  const status = effective.status;
  const rounds = (view.rounds || []).map((round) => {
    const roundMatches = matches.filter((match) => number(match.round) === number(round.round_number))
      .sort((left, right) => number(left.match) - number(right.match));
    const item = { number: number(round.round_number), label: clean(round.name || `Round ${round.round_number}`),
      format: clean(round.format), course: roundMatches[0]?.course || {}, matches: roundMatches };
    return { ...item, status: roundStatus(item, status, currentRound), progress: getRoundProgress(item) };
  });
  const finalized = matches.filter((match) => clean(match.status).toUpperCase() === "FINAL");
  const scores = finalized.reduce((total, match) => {
    const points = calculateMatchPoints(match.format, match.holeResults);
    return { teamOne: total.teamOne + number(points.team1Points), teamTwo: total.teamTwo + number(points.team2Points) };
  }, { teamOne: 0, teamTwo: 0 });
  const tournament = {
    id: clean(tournamentRow.tournament_id), year: number(tournamentRow.tournament_year), name: clean(tournamentRow.name),
    edition: clean(tournamentPresentation.edition), status, configuredStatus,
    statusMode: clean(tournamentPresentation.statusMode || "Automatic"), effective, currentRound,
    location: clean(tournamentPresentation.location), dates: clean(tournamentPresentation.dates),
    startDate: clean(tournamentPresentation.startDate), startTime: clean(tournamentPresentation.startTime),
    timeZone: clean(tournamentPresentation.timeZone || "America/Chicago"), liveMessage: clean(tournamentPresentation.liveMessage),
    lastUpdated: clean(tournamentPresentation.lastUpdated), logo: clean(tournamentPresentation.logo),
    tieAdvantageSide: tournamentPresentation.tieAdvantageSide ?? null,
    teamOne: { id: clean(teamBySide[1]?.team_id), name: clean(teamBySide[1]?.name || "Team 1"),
      logo: clean((view.matches || [])[0]?.presentation?.team_1_logo), score: scores.teamOne },
    teamTwo: { id: clean(teamBySide[2]?.team_id), name: clean(teamBySide[2]?.name || "Team 2"),
      logo: clean((view.matches || [])[0]?.presentation?.team_2_logo), score: scores.teamTwo },
  };
  tournament.state = getTournamentState({ tournament, rounds });
  const timelineBase = presentation.timeline || {};
  const timelineEvents = (timelineBase.events || []).map((event) => ({
    ...event,
    // Preserve the explicitly imported Preview clock for Director-managed events.
    // Golf events still derive from canonical Supabase round state.
    status: event.roundStatusDerived
      ? timelineEventStatus(event, { tournamentStatus: status, timeZone: tournament.timeZone, rounds })
      : event.status,
  }));
  const participantRpc = view.participant_view || {};
  if (!participantRpc.ok) throw Object.assign(new Error("Participant Home context is unavailable."), { code: participantRpc.code });
  const participant = myMatchDataFromSupabaseView(participantRpc.data);
  const summary = presentation.netSkinsByPlayer?.[participant.player.id] || { rounds: [] };
  const liveData = {
    tournament,
    rounds,
    timeline: { ...timelineBase, available: timelineBase.available === true, events: timelineEvents },
    schedule: timelineEvents,
    netSkins: netSkinsView(summary, participant.player.id),
    leaderboard: [], scoreLeaderboard: [], players: [],
  };
  const revision = scoringShadowPayloadHash({
    contextRevision: participantRpc.data.context_revision,
    presentationFingerprint: view.home_presentation?.source_fingerprint || "",
    liveRevision: view.live_revision || {},
  });
  return {
    player: participant.player,
    participant,
    liveData,
    revision,
    presentation: {
      available: Boolean(view.home_presentation),
      fingerprint: clean(view.home_presentation?.source_fingerprint),
      importedAt: clean(view.home_presentation?.imported_at),
      scheduleAvailable: timelineBase.available === true,
      netSkinsAvailable: Array.isArray(summary.rounds),
    },
    queryMs: number(view.query_ms),
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function participantHomeParityProjection(data = {}) {
  const liveData = data.liveData || {};
  const playerId = clean(data.player?.id || data.participant?.player?.id);
  const player = (row = {}) => ({ id: row.id, name: row.name });
  const team = (row = {}) => ({ id: row.id, name: row.name, logo: row.logo, score: row.score });
  return stable({
    participant: myMatchParityProjection(data.participant || {}),
    tournament: {
      id: liveData.tournament?.id, year: liveData.tournament?.year, name: liveData.tournament?.name,
      status: liveData.tournament?.status, currentRound: liveData.tournament?.currentRound,
      location: liveData.tournament?.location, logo: liveData.tournament?.logo,
      teamOne: team(liveData.tournament?.teamOne), teamTwo: team(liveData.tournament?.teamTwo),
    },
    rounds: (liveData.rounds || []).map((round) => ({
      number: round.number, status: round.status,
      matches: (round.matches || []).map((match) => ({
        id: match.id, round: match.round, match: match.match, status: match.status,
        currentHole: clean(match.status).toUpperCase() === "FINAL" ? 18 : match.currentHole,
        team1Players: (match.team1Players || []).map(player), team2Players: (match.team2Players || []).map(player),
        team1Points: clean(match.status).toUpperCase() === "FINAL" ? match.team1Points : null,
        team2Points: clean(match.status).toUpperCase() === "FINAL" ? match.team2Points : null,
      })),
    })),
    schedule: (liveData.timeline?.events || []).map((event) => ({
      id: event.id, date: event.date, startTime: event.startTime, endTime: event.endTime,
      title: event.title, status: event.status, displayOnHome: event.displayOnHome,
    })),
    netSkins: (liveData.netSkins?.rounds || []).map((round) => ({
      round: round.round,
      entries: (round.leaderboard || []).filter((row) => row.playerIds?.includes(playerId))
        .map((row) => ({ playerIds: row.playerIds, skinsWon: row.skinsWon, totalWinnings: row.totalWinnings })),
    })),
  });
}

export function compareParticipantHomeParity(expected, actual) {
  const left = JSON.stringify(participantHomeParityProjection(expected));
  const right = JSON.stringify(participantHomeParityProjection(actual));
  return { pass: left === right, expected: left === right ? undefined : JSON.parse(left), actual: left === right ? undefined : JSON.parse(right) };
}
