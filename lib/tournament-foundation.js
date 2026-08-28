import { applyGuideCoursesToTournament } from "./guide-participant-adapter.js";
import { guideReadEnvironment } from "./guide-read-source.js";
import { readGuideProjection } from "./guide-supabase.js";
import { requireTournamentFoundationReadSource } from "./tournament-read-source.js";
import { readTournamentLiveView, tournamentLiveDataFromSupabaseView } from "./tournament-live-supabase.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function formatCode(value) {
  const normalized = clean(value).toUpperCase();
  if (["BB", "BEST BALL", "2V2 BEST BALL"].includes(normalized)) return "BB";
  if (["SC", "SCRAMBLE"].includes(normalized)) return "SC";
  if (["SI", "SINGLES", "SINGLE"].includes(normalized)) return "SI";
  return normalized;
}

function optionalFields(source = {}, fields = []) {
  return Object.fromEntries(fields.flatMap((field) => clean(source[field]) ? [[field, clean(source[field])]] : []));
}

function playerMetadataMap(rows = []) {
  return Object.fromEntries(rows.map((player) => [clean(player.id || player.player_id), {
    slug: clean(player.slug || player.Slug),
    photo: clean(player.photo || player.Photo || player["Photo Filename"]),
    captain: player.captain === true,
  }]));
}

function rosterFromRounds(rounds = [], metadata = {}, teams = []) {
  const teamBySide = Object.fromEntries(teams.map((team) => [number(team.side), team]));
  const seen = new Set();
  const counters = { 1: 0, 2: 0 };
  const roster = [];
  for (const round of rounds) {
    for (const match of round.matches || []) {
      for (const side of [1, 2]) {
        for (const player of match[`team${side}Players`] || []) {
          const id = clean(player.id);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          counters[side] += 1;
          const presentation = metadata[id] || {};
          const team = teamBySide[side] || {};
          roster.push({
            id,
            name: clean(player.name || id),
            teamId: clean(team.id),
            side,
            order: counters[side],
            participationStatus: "ACTIVE",
            captain: id === clean(team.captainId) || presentation.captain === true,
            slug: clean(player.slug || presentation.slug),
            photo: clean(player.photo || presentation.photo),
          });
        }
      }
    }
  }
  return roster;
}

function rosterFromPlayers(players = [], metadata = {}, teams = []) {
  const teamBySide = Object.fromEntries(teams.map((team) => [number(team.side), team]));
  const counters = { 1: 0, 2: 0 };
  return players.flatMap((player) => {
    const id = clean(player.player_id || player.id);
    const side = number(player.team_side || player.side);
    if (!id || !teamBySide[side]) return [];
    const status = clean(player.participation_status || "ACTIVE").toUpperCase();
    if (status !== "ACTIVE") return [];
    counters[side] += 1;
    const source = player.source_payload || {};
    const tournamentSource = player.tournament_source_payload || {};
    const presentation = { ...(metadata[id] || {}), ...(player.presentation || {}) };
    const team = teamBySide[side];
    const rosterOrder = tournamentSource["Roster Order"] ?? tournamentSource.roster_order;
    return [{
      id,
      name: clean(player.display_name || player.name || id),
      teamId: clean(player.team_id || team.id),
      side,
      order: clean(rosterOrder) ? number(rosterOrder, counters[side]) : counters[side],
      participationStatus: status,
      captain: id === clean(team.captainId) || presentation.captain === true,
      slug: clean(presentation.slug || player.slug || source.Slug),
      photo: clean(presentation.photo || player.photo || source.Photo || source["Photo Filename"]),
    }];
  }).sort((left, right) => left.side - right.side
    || left.order - right.order
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id));
}

function teamSize(round = {}) {
  return Math.max(0, ...(round.matches || []).flatMap((match) => [
    (match.team1Players || []).length,
    (match.team2Players || []).length,
  ]));
}

function roundId(tournamentId, roundNumber) {
  return `${clean(tournamentId)}:R${number(roundNumber)}`;
}

function roundsFrom(data = {}, canonicalRounds = []) {
  const rawByNumber = Object.fromEntries(canonicalRounds.map((round) => [number(round.round_number || round.number), round]));
  return (data.rounds || []).map((round) => {
    const raw = rawByNumber[number(round.number)] || {};
    const course = round.course || {};
    return {
      id: roundId(data.tournament?.id, round.number),
      number: number(round.number),
      label: clean(round.label || raw.name || `Round ${round.number}`),
      format: clean(round.format),
      formatCode: formatCode(raw.format || round.format),
      teamSize: teamSize(round),
      course: {
        id: clean(course.id),
        name: clean(course.name),
        logo: clean(course.logo),
        tee: clean(course.tee),
        ...optionalFields(course, ["location", "profileImage", "description"]),
      },
    };
  });
}

function uniqueCourses(rounds = []) {
  const seen = new Set();
  return rounds.flatMap((round) => {
    const id = clean(round.course?.id);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ ...round.course, round: round.number }];
  });
}

function teamsFromGoogle(data = {}) {
  const tournament = data.tournament || {};
  return [
    { side: 1, ...(tournament.teamOne || {}) },
    { side: 2, ...(tournament.teamTwo || {}) },
  ].map((team) => ({
    id: clean(team.id),
    side: number(team.side),
    name: clean(team.name || `Team ${team.side}`),
    logo: clean(team.logo),
    captainId: clean(team.captainId),
    primaryColor: clean(team.primaryColor),
    secondaryColor: clean(team.secondaryColor),
  }));
}

function finalizeTeams(teams, roster) {
  return teams.map((team) => {
    const members = roster.filter((player) => player.side === team.side);
    return {
      ...team,
      captain: members.find((player) => player.id === team.captainId) || null,
      roster: members,
    };
  });
}

export function tournamentFoundationFromGoogle(data = {}) {
  const tournament = data.tournament || {};
  const teams = teamsFromGoogle(data);
  const roster = rosterFromRounds(data.rounds || [], playerMetadataMap(data.players || []), teams);
  const rounds = roundsFrom(data);
  return {
    source: "google",
    tournament: {
      id: clean(tournament.id),
      year: number(tournament.year),
      name: clean(tournament.name),
      edition: clean(tournament.edition),
      dates: clean(tournament.dates),
      location: clean(tournament.location),
      timeZone: clean(tournament.timeZone || "America/Chicago"),
      startDate: clean(tournament.startDate),
      startTime: clean(tournament.startTime),
      configuredStatus: clean(tournament.configuredStatus || tournament.status),
      statusMode: clean(tournament.statusMode),
      currentRound: number(tournament.currentRound),
      logo: clean(tournament.logo),
    },
    teams: finalizeTeams(teams, roster),
    roster,
    rounds,
    courses: uniqueCourses(rounds),
    presentation: { available: true, fingerprint: "", importedAt: "" },
  };
}

export function tournamentFoundationFromHistorical(tournament = {}) {
  const tournamentId = clean(tournament.id || tournament["Tournament ID"] || tournament.year || tournament.Year);
  const baseTeams = [tournament.team1, tournament.team2].filter(Boolean).map((team, index) => ({
    id: clean(team.id), side: index + 1, name: clean(team.name || `Team ${index + 1}`),
    logo: clean(team.logo), captainId: clean(team.captainId),
    primaryColor: clean(team.primaryColor), secondaryColor: clean(team.secondaryColor),
  }));
  const roster = baseTeams.flatMap((team) => {
    const source = (team.side === 1 ? tournament.team1 : tournament.team2)?.roster || [];
    return source.map((entry, index) => ({
      id: clean(entry.player?.["Player ID"] || entry.player?.id),
      name: clean(entry.player?.["Display Name"] || entry.player?.name),
      teamId: team.id, side: team.side, order: index + 1, participationStatus: "ACTIVE",
      captain: clean(entry.player?.["Player ID"] || entry.player?.id) === team.captainId,
      slug: clean(entry.player?.slug), photo: clean(entry.player?.["Photo Filename"] || entry.player?.photo),
    })).filter((player) => player.id);
  });
  const rounds = (tournament.courses || []).map((course, index) => ({
    id: roundId(tournamentId, index + 1), number: index + 1, label: `Round ${index + 1}`,
    format: "", formatCode: "", teamSize: number(tournament["Team Size"]),
    course: { id: clean(course["Course ID"]), name: clean(course.Course || course["Course Name"]),
      logo: clean(course["Course Logo"]), tee: clean(course["Tee Played"] || course.Tee) },
  }));
  return {
    source: "google",
    tournament: {
      id: tournamentId, year: number(tournament.year || tournament.Year),
      name: clean(tournament["Tournament Name"] || tournament.Name || "Sandbagger Invitational"),
      edition: clean(tournament.editionTitle || tournament.Annual), dates: clean(tournament.Dates),
      location: clean(tournament.Destination || tournament.Location),
      timeZone: clean(tournament["Time Zone"] || "America/Chicago"), startDate: clean(tournament["Start Date"]),
      startTime: clean(tournament["Start Time"]), configuredStatus: clean(tournament["Tournament Status"] || "Upcoming"),
      statusMode: clean(tournament["Status Mode"]), currentRound: number(tournament["Current Round"]),
      logo: clean(tournament.logoFileName || tournament["Tournament Logo Filename"]),
    },
    teams: finalizeTeams(baseTeams, roster), roster, rounds, courses: uniqueCourses(rounds),
    presentation: { available: true, fingerprint: "", importedAt: "" },
  };
}

export function tournamentFoundationFromSupabaseView(view = {}, guideProjection = null) {
  let live = tournamentLiveDataFromSupabaseView(view);
  if (guideProjection) live = applyGuideCoursesToTournament(live, guideProjection);
  const presentationEnvelope = view.tournament_presentation || view.home_presentation || {};
  const presentation = presentationEnvelope.presentation || {};
  const tournamentPresentation = presentation.tournament || {};
  const rawTeams = Object.fromEntries((view.teams || []).map((team) => [number(team.team_side), team]));
  const liveTeams = [live.tournament?.teamOne || {}, live.tournament?.teamTwo || {}];
  const teams = [1, 2].map((side) => {
    const raw = rawTeams[side] || {};
    const projected = liveTeams[side - 1] || {};
    const source = raw.source_payload || {};
    return {
      id: clean(raw.team_id || projected.id), side,
      name: clean(raw.name || projected.name || `Team ${side}`), logo: clean(projected.logo),
      captainId: clean(source.Captain || source["Captain Player ID"]),
      primaryColor: clean(source["Primary Color"]), secondaryColor: clean(source["Secondary Color"]),
    };
  });
  const leaderboardsPlayers = presentation.leaderboardsPlayers || {};
  const hasCanonicalRoster = Array.isArray(view.players) && view.players.length > 0;
  const roster = hasCanonicalRoster
    ? rosterFromPlayers(view.players, leaderboardsPlayers, teams)
    : rosterFromRounds(live.rounds || [], leaderboardsPlayers, teams);
  const rounds = roundsFrom(live, view.rounds || []);
  return {
    source: "supabase",
    tournament: {
      id: clean(view.tournament?.tournament_id || live.tournament?.id),
      year: number(view.tournament?.tournament_year || live.tournament?.year),
      name: clean(view.tournament?.name || live.tournament?.name),
      edition: clean(tournamentPresentation.edition || live.tournament?.edition),
      dates: clean(tournamentPresentation.dates || live.tournament?.dates),
      location: clean(tournamentPresentation.location || live.tournament?.location),
      timeZone: clean(tournamentPresentation.timeZone || live.tournament?.timeZone || "America/Chicago"),
      startDate: clean(tournamentPresentation.startDate || live.tournament?.startDate),
      startTime: clean(tournamentPresentation.startTime || live.tournament?.startTime),
      configuredStatus: clean(tournamentPresentation.configuredStatus || tournamentPresentation.status || live.tournament?.configuredStatus),
      statusMode: clean(tournamentPresentation.statusMode || live.tournament?.statusMode),
      currentRound: number(tournamentPresentation.currentRound || live.tournament?.currentRound),
      logo: clean(tournamentPresentation.logo || live.tournament?.logo),
    },
    teams: finalizeTeams(teams, roster), roster, rounds, courses: uniqueCourses(rounds),
    presentation: {
      available: Boolean(presentationEnvelope),
      fingerprint: clean(presentationEnvelope.source_fingerprint),
      importedAt: clean(presentationEnvelope.imported_at),
    },
  };
}

export function tournamentFoundationParityProjection(foundation = {}) {
  const tournament = foundation.tournament || {};
  return {
    tournament: {
      id: clean(tournament.id), year: number(tournament.year), name: clean(tournament.name),
      edition: clean(tournament.edition), dates: clean(tournament.dates), location: clean(tournament.location),
      timeZone: clean(tournament.timeZone), startDate: clean(tournament.startDate), startTime: clean(tournament.startTime),
      configuredStatus: clean(tournament.configuredStatus).toUpperCase(), statusMode: clean(tournament.statusMode).toUpperCase(),
      currentRound: number(tournament.currentRound), logo: clean(tournament.logo),
    },
    teams: (foundation.teams || []).map((team) => ({
      id: clean(team.id), side: number(team.side), name: clean(team.name), logo: clean(team.logo),
      captainId: clean(team.captainId), captainName: clean(team.captain?.name),
      primaryColor: clean(team.primaryColor), secondaryColor: clean(team.secondaryColor),
    })),
    roster: (foundation.roster || []).map((player) => ({
      id: clean(player.id), name: clean(player.name), teamId: clean(player.teamId), side: number(player.side),
      order: number(player.order), captain: player.captain === true, participationStatus: clean(player.participationStatus),
    })),
    rounds: (foundation.rounds || []).map((round) => ({
      id: clean(round.id), number: number(round.number), label: clean(round.label), format: clean(round.format),
      formatCode: clean(round.formatCode), teamSize: number(round.teamSize),
      course: { id: clean(round.course?.id), name: clean(round.course?.name), logo: clean(round.course?.logo), tee: clean(round.course?.tee) },
    })),
  };
}

export function compareTournamentFoundationParity(expected, actual) {
  const left = tournamentFoundationParityProjection(expected);
  const right = tournamentFoundationParityProjection(actual);
  const pass = JSON.stringify(left) === JSON.stringify(right);
  return { pass, ...(pass ? {} : { expected: left, actual: right }) };
}

export function applyTournamentFoundationToLiveData(liveData = {}, foundation = {}) {
  if (!liveData?.tournament) return liveData;
  const teamBySide = Object.fromEntries((foundation.teams || []).map((team) => [number(team.side), team]));
  const identityTeam = (current = {}, side) => {
    const supplied = teamBySide[side] || {};
    return {
      ...current,
      ...optionalFields(supplied, ["id", "name", "logo", "captainId", "primaryColor", "secondaryColor"]),
      roster: supplied.roster || [],
      score: current.score,
    };
  };
  const configured = foundation.tournament || {};
  const tournament = liveData.tournament || {};
  const roundsByNumber = Object.fromEntries((foundation.rounds || []).map((round) => [number(round.number), round]));
  return {
    ...liveData,
    tournamentFoundation: foundation,
    tournament: {
      ...tournament,
      ...optionalFields(configured, ["id", "name", "edition", "dates", "location", "timeZone", "startDate", "startTime", "logo", "configuredStatus", "statusMode"]),
      year: number(configured.year, tournament.year),
      teamOne: identityTeam(tournament.teamOne, 1),
      teamTwo: identityTeam(tournament.teamTwo, 2),
      // Scores, effective status, current round and derived state remain owned
      // by the existing Step 3B/live-scoring source in this phase.
      status: tournament.status,
      currentRound: tournament.currentRound,
      state: tournament.state,
    },
    rounds: (liveData.rounds || []).map((round) => {
      const supplied = roundsByNumber[number(round.number)] || {};
      return {
        ...round,
        ...optionalFields(supplied, ["label", "format"]),
        teamSize: supplied.teamSize || round.teamSize,
        course: { ...(round.course || {}), ...(supplied.course || {}) },
      };
    }),
  };
}

export async function readTournamentFoundation(options = {}) {
  const env = options.env || process.env;
  const source = requireTournamentFoundationReadSource(env);
  if (source.resolved === "google") {
    let googleData = options.googleData || null;
    if (!googleData && options.googleLoadAttempted && options.googleFallbackTournament) {
      return { data: tournamentFoundationFromHistorical(options.googleFallbackTournament),
        diagnostics: { source: "google", googleRequests: 0, fallback: "historical-google-model" } };
    }
    if (!googleData) {
      const reader = options.dependencies?.readGoogleTournamentData ||
        (async () => (await import("../app/live/sheetData.js")).getTournamentData());
      googleData = await reader();
    }
    return { data: tournamentFoundationFromGoogle(googleData),
      diagnostics: { source: "google", googleRequests: 1, fallback: "" } };
  }

  const liveReader = options.dependencies?.readTournamentLiveView || readTournamentLiveView;
  const guideReader = options.dependencies?.readGuideProjection || readGuideProjection;
  const guideSource = guideReadEnvironment(env).course;
  const [liveRead, guideRead] = await Promise.all([
    liveReader("2026", { env }),
    guideSource.resolved === "supabase" ? guideReader({ env, surface: "course" }) : Promise.resolve(null),
  ]);
  if (!liveRead?.payload?.ok || !liveRead.payload.data) {
    const error = new Error("Current tournament foundation is temporarily unavailable.");
    error.code = liveRead?.payload?.code || "TOURNAMENT_FOUNDATION_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
  if (guideSource.resolved === "supabase" && (!guideRead?.payload?.ok || !guideRead.payload.data)) {
    const error = new Error("Current tournament course presentation is temporarily unavailable.");
    error.code = guideRead?.payload?.code || "GUIDE_PROJECTION_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
  return {
    data: tournamentFoundationFromSupabaseView(liveRead.payload.data, guideRead),
    diagnostics: {
      source: "supabase", googleRequests: 0,
      tournamentQueryMs: number(liveRead.durationMs),
      guideQueryMs: number(guideRead?.durationMs),
      coursePresentationSource: guideRead?.payload?.ok ? "supabase-guide" : "tournament-projection",
    },
  };
}
