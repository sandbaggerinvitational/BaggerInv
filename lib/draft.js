import { loadDraftSheets } from "./google-sheets-data.js";
import {
  getPlayerMap,
  getTournament,
  getTournamentHandicap,
  getTournaments,
} from "./stats.js";
import { deriveDraftState } from "./draft-state.js";

export { deriveDraftState } from "./draft-state.js";

const clean = (value) => String(value ?? "").trim();

function first(record, ...fields) {
  for (const field of fields) {
    const value = record?.[field];
    if (clean(value)) return value;
  }
  return null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function playerName(player) {
  return clean(player?.["Display Name"]) ||
    [player?.First, player?.Last].map(clean).filter(Boolean).join(" ") ||
    clean(player?.["Player ID"]);
}

function playerImage(player) {
  const filename = clean(player?.["Photo Filename"]);
  if (!filename) return null;
  const stem = filename.replace(/\.(png|jpe?g|webp|avif)$/i, "");
  return `/images/players/${stem}.webp`;
}

function normalizeTeam(team, captainId, playerMap) {
  if (!team) return null;
  const resolvedCaptainId = clean(captainId || team.captainId);
  const captain = playerMap[resolvedCaptainId] || team.captain || null;
  return {
    id: clean(team.id),
    side: clean(team.side),
    name: clean(team.name) || clean(team.side),
    logo: clean(team.logo),
    primaryColor: clean(team.primaryColor) || "#0b4a3a",
    secondaryColor: clean(team.secondaryColor) || "#d4b15f",
    averageHandicap: team.averageHandicap,
    captainId: resolvedCaptainId,
    captain: captain
      ? {
          id: clean(captain["Player ID"]),
          name: playerName(captain),
          image: playerImage(captain),
        }
      : null,
  };
}

function teamForDraftPick({
  teamId,
  playerId,
  teams,
  tournament,
}) {
  const direct = teams.find((team) => clean(team?.id) === clean(teamId));
  if (direct) return direct;

  // Historical draft rows occasionally contain a mistyped Team ID. The
  // historical handicap roster is a safe display fallback while Data Health
  // continues to report the invalid relationship for correction.
  const rosterTeam = tournament?.teams?.find((team) =>
    team.roster?.some(
      (entry) => clean(entry.player?.["Player ID"]) === clean(playerId)
    )
  );

  return teams.find((team) => team.side === rosterTeam?.side) || null;
}

function buildDraft(settings, allPicks) {
  const year = positiveInteger(settings.Year);
  const tournament = getTournament(year);
  if (!year || !tournament) return null;

  const playerMap = getPlayerMap();
  const configuredTeamOneId = clean(first(settings, "Team One ID", "Team 1 ID"));
  const configuredTeamTwoId = clean(first(settings, "Team Two ID", "Team 2 ID"));
  const teamOneSource =
    tournament.teams.find((team) => clean(team.id) === configuredTeamOneId) ||
    tournament.team1;
  const teamTwoSource =
    tournament.teams.find((team) => clean(team.id) === configuredTeamTwoId) ||
    tournament.team2;
  const teams = [
    normalizeTeam(
      teamOneSource,
      first(
        settings,
        "Team One Captain Player ID",
        "Team 1 Captain Player ID"
      ),
      playerMap
    ),
    normalizeTeam(
      teamTwoSource,
      first(
        settings,
        "Team Two Captain Player ID",
        "Team 2 Captain Player ID"
      ),
      playerMap
    ),
  ].filter(Boolean);

  const sourcePicks = allPicks
    .filter((pick) => Number(pick.Year) === year)
    .sort((a, b) => Number(a["Pick Number"]) - Number(b["Pick Number"]));
  const totalDraftPicks =
    positiveInteger(first(settings, "Total Draft Picks", "Total Picks")) ||
    sourcePicks.reduce(
      (maximum, pick) => Math.max(maximum, positiveInteger(pick["Pick Number"])),
      0
    );
  const sourceByNumber = new Map(
    sourcePicks.map((pick) => [positiveInteger(pick["Pick Number"]), pick])
  );
  const picks = Array.from({ length: totalDraftPicks }, (_, index) => {
    const pickNumber = index + 1;
    const source = sourceByNumber.get(pickNumber) || {};
    const playerId = clean(source["Player ID"]);
    const teamId = clean(source["Team ID"]);
    const player = playerMap[playerId] || null;
    const team = teamForDraftPick({
      teamId,
      playerId,
      teams,
      tournament,
    });

    return {
      pickNumber,
      teamId,
      team,
      playerId,
      player: player
        ? {
            id: playerId,
            name: playerName(player),
            image: playerImage(player),
            handicap: getTournamentHandicap(playerId, year),
          }
        : null,
      selectedAt: clean(source["Selected At"]),
      notes: clean(source.Notes),
    };
  });

  const draftedCount = picks.filter((pick) => pick.player).length;
  const state = deriveDraftState({
    draftDate: settings["Draft Date"],
    draftedCount,
    totalDraftPicks,
  });
  const rosters = teams.map((team) => ({
    team,
    picks: picks.filter((pick) => pick.team?.id === team.id && pick.player),
  }));

  return {
    year,
    name:
      clean(settings["Draft Name Override"]) || `${year} Sandbagger Draft`,
    date: clean(settings["Draft Date"]),
    time: clean(settings["Draft Time"]),
    timeZone: clean(settings["Time Zone"]),
    location: clean(settings["Draft Location"]),
    statusMode: clean(settings["Draft Status Mode"]),
    format: clean(settings["Draft Format"]),
    totalDraftPicks,
    firstPickTeamId: clean(settings["First Pick Team ID"]),
    notes: clean(settings.Notes),
    state,
    draftedCount,
    nextPick: picks.find((pick) => !pick.player) || null,
    teams,
    picks,
    rosters,
  };
}

export async function getDrafts() {
  const sheets = await loadDraftSheets();
  return (sheets.settings || [])
    .map((settings) => buildDraft(settings, sheets.picks || []))
    .filter(Boolean)
    .sort((a, b) => b.year - a.year);
}

export async function getDraftByYear(year) {
  return (await getDrafts()).find((draft) => draft.year === Number(year)) || null;
}

export async function getCurrentDraft() {
  const currentYear = getTournaments()[0]?.year;
  return currentYear ? getDraftByYear(currentYear) : null;
}

export async function getDraftYears() {
  return (await getDrafts()).map((draft) => draft.year);
}
