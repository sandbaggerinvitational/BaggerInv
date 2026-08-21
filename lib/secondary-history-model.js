import { createHash } from "node:crypto";

import { buildGhostMatchExclusionSet } from "./ghost-match.js";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const list = (value) => Array.isArray(value) ? value : [];
const numeric = (value) => value === null || value === undefined || clean(value) === ""
  ? null
  : Number.isFinite(Number(value)) ? Number(value) : null;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function profileRows(playerProjection = {}) {
  return list(playerProjection.players).map((row) => ({
    ...(row.public_profile || {}),
    "Player ID": clean(row.player_id || row.public_profile?.["Player ID"]),
    "Display Name": clean(row.public_profile?.["Display Name"] || row.canonical_display_name || row.player_id),
  }));
}

function teamLegacyRow(year, team = {}) {
  return {
    Year: Number(year),
    "Tournament ID": String(year),
    "Team ID": clean(team.id),
    "Team Side": clean(team.side || `Team ${team.sideNumber}`),
    "Team Names": clean(team.name),
    "Team Logo": clean(team.logo),
    "Primary Color": clean(team.primaryColor),
    "Secondary Color": clean(team.secondaryColor),
    Captain: clean(team.captainId || team.captain?.["Player ID"]),
  };
}

function handicapRows(year, team = {}) {
  return list(team.roster).map((entry) => ({
    Year: Number(year),
    "Tournament ID": String(year),
    "Player ID": clean(entry.player?.["Player ID"] || entry.playerId),
    "Team ID": clean(team.id),
    "Team Side": clean(team.side || `Team ${team.sideNumber}`),
    "Tournament Handicap": numeric(entry.handicap ?? entry.player?.["Tournament Handicap"]),
  })).filter((row) => row["Player ID"]);
}

function completedTournamentLegacyRow(view = {}) {
  const tournament = view.tournament || {};
  const champion = tournament.championTeam || null;
  const runnerUp = tournament.runnerUpTeam || null;
  return {
    ...tournament,
    Year: Number(view.year),
    "Tournament ID": clean(tournament.id || view.year),
    "Winning Team": clean(champion?.id || champion?.name),
    "Runner-Up Team": clean(runnerUp?.id || runnerUp?.name),
    "Winning Captain": clean(champion?.captainId),
    "Final Score": clean(tournament["Final Score"]),
  };
}

function currentTournamentLegacyRow(view = {}) {
  const tournament = view.tournament || {};
  return {
    ...tournament,
    Year: 2026,
    "Tournament ID": clean(tournament.id || "2026"),
    // The active/provisional tournament has no certified champion or final
    // score. Current canonical points remain available on live surfaces, not
    // as a completed historical result.
    "Winning Team": "",
    "Runner-Up Team": "",
    "Winning Captain": "",
    "Final Score": "",
  };
}

function completedAwards(view = {}) {
  return list(view.tournament?.awards).map((award) => ({
    ...award,
    Year: Number(view.year),
    Award: clean(award.Award),
    Winner: clean(award.Winner),
  })).filter((award) => award.Award && award.Winner);
}

function currentRawMatch(match = {}) {
  const sidePlayer = (side, index) => list(side === 1 ? match.team1Players : match.team2Players)[index];
  const row = {
    Year: 2026,
    Round: Number(match.round),
    Match: Number(match.match || match.matchNumber),
    "Match ID": clean(match.id || match.match_id),
    Format: upper(match.format),
    "Match Status": "FINAL",
    "Course ID": clean(match.course?.id),
    "Front 9 Winner": clean(match.frontWinner),
    "Back 9 Winner": clean(match.backWinner),
    "18-Hole Winner": clean(match.overallWinner),
    "Matchup Winner": clean(match.matchupWinner),
    "Team 1 Points": numeric(match.team1Points),
    "Team 2 Points": numeric(match.team2Points),
    "Team 1 Playing HCP": numeric(match.team1PlayingHcp),
    "Team 2 Playing HCP": numeric(match.team2PlayingHcp),
    "Team 1 Stroke": numeric(match.team1Stroke),
    "Team 2 Stroke": numeric(match.team2Stroke),
  };
  for (const side of [1, 2]) {
    for (const slot of [1, 2]) {
      const player = sidePlayer(side, slot - 1) || {};
      row[`Team ${side} Player ${slot}`] = clean(player.id);
      row[`Team ${side} Player ${slot} Playing HCP`] = numeric(player.playingHcp);
      row[`Team ${side} Player ${slot} Stroke`] = numeric(player.stroke);
    }
  }
  return row;
}

function ghostRows(completedViews = []) {
  return completedViews.flatMap((view) => list(view.recordEligibility)
    .filter((row) => row.includeOfficialRecord === false)
    .map((row) => ({
      Year: Number(view.year),
      "Match ID": clean(row.matchId),
      "Player ID": clean(row.playerId),
      Reason: clean(row.reasonCode),
    })));
}

function currentCourses(view = {}) {
  return list(view.tournament?.courses).map((course) => ({ ...course, Year: 2026 }));
}

/** Convert certified Supabase views into the existing deterministic fact DTO. */
export function buildSecondaryHistoryHistoricalData({
  completedViews = [],
  currentView = {},
  playerProjection = {},
} = {}) {
  const completed = [...completedViews].sort((left, right) => Number(left.year) - Number(right.year));
  const years = completed.map((view) => Number(view.year));
  if (years.join(",") !== "2017,2018,2019,2020,2021,2022,2023,2024,2025") {
    throw new Error("Secondary History requires the complete certified 2017-2025 sequence.");
  }
  if (Number(currentView?.year) !== 2026 || currentView?.source !== "supabase") {
    throw new Error("Secondary History requires the certified 2026 Supabase view.");
  }

  const players = profileRows(playerProjection);
  const canonicalPlayerIds = new Set([
    ...completed.flatMap((view) => list(view.playerDirectory).map((row) => clean(row["Player ID"]))),
    ...list(currentView.players).map((row) => clean(row["Player ID"])),
  ].filter(Boolean));
  const projectionIds = new Set(players.map((row) => clean(row["Player ID"])).filter(Boolean));
  const missing = [...canonicalPlayerIds].filter((id) => !projectionIds.has(id));
  const orphan = [...projectionIds].filter((id) => !canonicalPlayerIds.has(id));
  if (missing.length || orphan.length || projectionIds.size !== players.length) {
    const error = new Error("Player presentation projection does not match canonical historical identity.");
    error.code = "SECONDARY_HISTORY_PLAYER_IDENTITY_DIVERGENCE";
    error.details = { missing, orphan };
    throw error;
  }

  const completedTeams = completed.flatMap((view) => list(view.teams).map((team) => teamLegacyRow(view.year, team)));
  const currentTeams = list(currentView.teams).map((team) => teamLegacyRow(2026, team));
  const completedHandicaps = completed.flatMap((view) => list(view.teams).flatMap((team) => handicapRows(view.year, team)));
  const currentHandicaps = list(currentView.teams).flatMap((team) => handicapRows(2026, team));
  const currentFinalMatches = list(currentView.matches)
    .filter((match) => upper(match.lifecycle || match.status) === "FINAL")
    .map(currentRawMatch);
  const data = {
    players,
    tournaments: [
      ...completed.map(completedTournamentLegacyRow),
      currentTournamentLegacyRow(currentView),
    ],
    teamNames: [...completedTeams, ...currentTeams],
    matches: [
      ...completed.flatMap((view) => list(view.rawMatches).map((row) => ({ ...row }))),
      ...currentFinalMatches,
    ],
    rounds: [
      ...completed.flatMap((view) => list(view.tournament?.courses).map((course) => ({
        Year: Number(view.year),
        Round: Number(clean(course.Round).replace(/\D/g, "")),
        Format: clean(course.Format),
      }))),
      ...list(currentView.rounds).map((round) => ({
        Year: 2026,
        Round: Number(round.round || round.number),
        Format: clean(round.format),
      })),
    ],
    rules: [],
    awards: [...completed.flatMap(completedAwards)],
    courses: [
      ...completed.flatMap((view) => list(view.tournament?.courses).map((course) => ({ ...course, Year: Number(view.year) }))),
      ...currentCourses(currentView),
    ],
    handicaps: [...completedHandicaps, ...currentHandicaps],
    ghostMatches: ghostRows(completed),
  };
  return {
    data,
    diagnostics: {
      contract: "secondary-history-calculation-v1",
      playerCount: players.length,
      completedMatches: completed.reduce((sum, view) => sum + list(view.rawMatches).length, 0),
      currentFinalMatches: currentFinalMatches.length,
      currentNonFinalMatches: list(currentView.matches).length - currentFinalMatches.length,
      recordExclusions: data.ghostMatches.length,
      fingerprint: fingerprint(data),
    },
  };
}

export function buildSecondaryHistoryModel(input = {}, { createCalculations } = {}) {
  if (typeof createCalculations !== "function") {
    throw new Error("Secondary History requires the shared deterministic calculation engine.");
  }
  const built = buildSecondaryHistoryHistoricalData(input);
  const calculations = createCalculations(built.data);
  const completedScorecards = list(input.completedViews).flatMap((view) => list(view.analytics?.scorecards));
  const currentScorecards = list(input.currentView?.analytics?.scorecards);
  const ghostMatchExclusions = buildGhostMatchExclusionSet(built.data.ghostMatches);
  const scorecardAnalytics = {
    scorecards: [...completedScorecards, ...currentScorecards],
    canonicalCareerScorecards: [...completedScorecards, ...currentScorecards],
    ghostMatchExclusions,
  };
  return Object.freeze({
    source: "supabase",
    calculations,
    scorecardAnalytics,
    completedViews: input.completedViews,
    currentView: input.currentView,
    playerProjection: input.playerProjection,
    diagnostics: {
      ...built.diagnostics,
      scorecards: scorecardAnalytics.scorecards.length,
      googleForegroundRequests: 0,
    },
  });
}
