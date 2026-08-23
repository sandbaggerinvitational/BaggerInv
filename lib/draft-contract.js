import { createHash } from "node:crypto";

import { deriveDraftState } from "./draft-state.js";

export const DRAFT_CONTRACT_VERSION = "draft-projection-v1";
export const DRAFT_SOURCE_TABS = Object.freeze(["Draft Settings", "Draft Picks"]);

// This is the same certified 2025 team-identity correction used by completed
// History. The raw workbook value remains in source payloads and diagnostics.
export const DRAFT_TEAM_ID_ALIASES = Object.freeze({
  "2025:CRIPSYBOYS": "CRISPYBOYS",
});

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export const draftCanonicalJson = (value) => JSON.stringify(stable(value));
export const draftFingerprint = (value) => createHash("sha256").update(draftCanonicalJson(value)).digest("hex");

export function draftSourceRow(row = {}) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("__")));
}

export function draftFirst(record, ...fields) {
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
          id: clean(captain["Player ID"] || captain.id),
          name: playerName(captain) || clean(captain.name),
          image: playerImage(captain) || clean(captain.image) || null,
        }
      : null,
  };
}

function teamAlias(year, teamId) {
  return DRAFT_TEAM_ID_ALIASES[`${year}:${upper(teamId)}`] || upper(teamId);
}

function resolveTeam({ year, teamId, playerId, teams, tournament, strict = false, diagnostics }) {
  const rawTeamId = upper(teamId);
  const canonicalId = teamAlias(year, rawTeamId);
  let team = teams.find((candidate) => upper(candidate?.id) === canonicalId);
  const rosterTeam = playerId
    ? tournament?.teams?.find((candidate) =>
        candidate.roster?.some((entry) => clean(entry.player?.["Player ID"] || entry.player?.id) === clean(playerId))
      )
    : null;
  if (team && rawTeamId && rawTeamId !== canonicalId) {
    diagnostics?.push({
      category: "TEAM_ID_ALIAS",
      year,
      sourceTeamId: rawTeamId,
      canonicalTeamId: canonicalId,
    });
  }
  if (!team && playerId) {
    team = teams.find((candidate) => clean(candidate.side) === clean(rosterTeam?.side)) || null;
    if (team) diagnostics?.push({
      category: "TEAM_ID_ROSTER_RESOLUTION",
      year,
      sourceTeamId: rawTeamId,
      canonicalTeamId: team.id,
      playerId: clean(playerId),
    });
  }
  if (strict && playerId && !rosterTeam) {
    const error = new Error(`Draft Pick references Player ID ${playerId} outside the ${year} tournament roster.`);
    error.code = "DRAFT_PLAYER_NOT_IN_TOURNAMENT";
    error.diagnostics = { year, sourceTeamId: rawTeamId, playerId: clean(playerId) };
    throw error;
  }
  if (strict && team && rosterTeam && clean(team.side) !== clean(rosterTeam.side)) {
    const error = new Error(`Draft Pick team does not match the canonical ${year} roster for Player ID ${playerId}.`);
    error.code = "DRAFT_PICK_ROSTER_TEAM_MISMATCH";
    error.diagnostics = {
      year,
      playerId: clean(playerId),
      sourceTeamId: rawTeamId,
      canonicalDraftTeamId: clean(team.id),
      canonicalRosterTeamId: clean(rosterTeam.id),
    };
    throw error;
  }
  if (!team && strict) {
    const error = new Error(`Draft team ${rawTeamId || "(blank)"} could not be resolved for ${year}.`);
    error.code = "DRAFT_TEAM_ID_UNRESOLVED";
    error.diagnostics = { year, sourceTeamId: rawTeamId, playerId: clean(playerId) };
    throw error;
  }
  return team || null;
}

function expectedSnakeTeamIds(teams, firstPickTeamId, totalPicks) {
  if (teams.length !== 2) return [];
  const first = teams.find((team) => upper(team.id) === upper(firstPickTeamId)) || teams[0];
  const second = teams.find((team) => team.id !== first.id);
  return Array.from({ length: totalPicks }, (_, index) => {
    const roundIndex = Math.floor(index / 2);
    const slot = index % 2;
    return roundIndex % 2 === 0
      ? (slot === 0 ? first.id : second.id)
      : (slot === 0 ? second.id : first.id);
  });
}

export function hydrateDraftPresentation(seed = {}) {
  const picks = Array.isArray(seed.picks) ? seed.picks : [];
  const teams = Array.isArray(seed.teams) ? seed.teams : [];
  const draftedCount = picks.filter((pick) => pick.player).length;
  const totalDraftPicks = positiveInteger(seed.totalDraftPicks) || picks.length;
  const state = deriveDraftState({
    draftDate: seed.date,
    draftedCount,
    totalDraftPicks,
  });
  return {
    ...seed,
    totalDraftPicks,
    picks,
    teams,
    state,
    draftedCount,
    nextPick: picks.find((pick) => !pick.player) || null,
    rosters: teams.map((team) => ({
      team,
      picks: picks.filter((pick) => pick.team?.id === team.id && pick.player),
    })),
  };
}

export function buildDraftPresentationSeed(settings, allPicks, history, options = {}) {
  const strict = options.strict === true;
  const diagnostics = options.diagnostics || [];
  const year = positiveInteger(settings?.Year);
  const tournament = year ? history?.getTournament?.(year) : null;
  if (!year || !tournament) {
    if (!strict) return null;
    const error = new Error(`Draft Settings references unavailable tournament ${year || "(blank)"}.`);
    error.code = "DRAFT_TOURNAMENT_UNAVAILABLE";
    throw error;
  }
  const playerMap = history.getPlayerMap();
  const configuredTeamOneId = clean(draftFirst(settings, "Team One ID", "Team 1 ID"));
  const configuredTeamTwoId = clean(draftFirst(settings, "Team Two ID", "Team 2 ID"));
  const teamOneSource = tournament.teams.find((team) => upper(team.id) === teamAlias(year, configuredTeamOneId)) || (strict ? null : tournament.team1);
  const teamTwoSource = tournament.teams.find((team) => upper(team.id) === teamAlias(year, configuredTeamTwoId)) || (strict ? null : tournament.team2);
  if (strict && (!configuredTeamOneId || !configuredTeamTwoId || !teamOneSource || !teamTwoSource)) {
    const error = new Error(`Draft Settings contains an unresolved team identity for ${year}.`);
    error.code = "DRAFT_CONFIGURATION_TEAM_UNRESOLVED";
    error.diagnostics = { year, configuredTeamOneId, configuredTeamTwoId };
    throw error;
  }
  const teamOneCaptainId = clean(draftFirst(settings, "Team One Captain Player ID", "Team 1 Captain Player ID"));
  const teamTwoCaptainId = clean(draftFirst(settings, "Team Two Captain Player ID", "Team 2 Captain Player ID"));
  if (strict && ((teamOneCaptainId && !playerMap[teamOneCaptainId]) || (teamTwoCaptainId && !playerMap[teamTwoCaptainId]))) {
    const error = new Error(`Draft Settings contains an unresolved captain identity for ${year}.`);
    error.code = "DRAFT_CAPTAIN_ID_UNRESOLVED";
    error.diagnostics = { year, teamOneCaptainId, teamTwoCaptainId };
    throw error;
  }
  const teams = [
    normalizeTeam(teamOneSource, teamOneCaptainId, playerMap),
    normalizeTeam(teamTwoSource, teamTwoCaptainId, playerMap),
  ].filter(Boolean);
  if (strict && (teams.length !== 2 || teams[0].id === teams[1].id)) {
    const error = new Error(`Draft Settings requires two distinct canonical teams for ${year}.`);
    error.code = "DRAFT_CONFIGURATION_TEAMS_INVALID";
    throw error;
  }
  if (configuredTeamOneId && upper(configuredTeamOneId) !== upper(teamOneSource?.id)) diagnostics.push({
    category: "TEAM_ID_ALIAS", year, sourceTeamId: upper(configuredTeamOneId), canonicalTeamId: clean(teamOneSource?.id),
  });
  if (configuredTeamTwoId && upper(configuredTeamTwoId) !== upper(teamTwoSource?.id)) diagnostics.push({
    category: "TEAM_ID_ALIAS", year, sourceTeamId: upper(configuredTeamTwoId), canonicalTeamId: clean(teamTwoSource?.id),
  });

  const sourcePicks = allPicks
    .filter((pick) => Number(pick.Year) === year)
    .sort((left, right) => Number(left["Pick Number"]) - Number(right["Pick Number"]));
  const duplicateNumbers = sourcePicks.map((pick) => positiveInteger(pick["Pick Number"]))
    .filter((pickNumber, index, values) => pickNumber && values.indexOf(pickNumber) !== index);
  if (strict && duplicateNumbers.length) {
    const error = new Error(`Draft Picks contains duplicate pick numbers for ${year}.`);
    error.code = "DRAFT_PICK_NUMBER_DUPLICATE";
    error.diagnostics = { year, pickNumbers: [...new Set(duplicateNumbers)] };
    throw error;
  }
  const totalDraftPicks = positiveInteger(draftFirst(settings, "Total Draft Picks", "Total Picks")) ||
    sourcePicks.reduce((maximum, pick) => Math.max(maximum, positiveInteger(pick["Pick Number"])), 0);
  if (strict && !totalDraftPicks) {
    const error = new Error(`Draft Settings has no valid pick count for ${year}.`);
    error.code = "DRAFT_PICK_COUNT_REQUIRED";
    throw error;
  }
  if (strict && sourcePicks.some((pick) => positiveInteger(pick["Pick Number"]) > totalDraftPicks)) {
    const error = new Error(`Draft Picks exceeds the configured pick count for ${year}.`);
    error.code = "DRAFT_PICK_OUT_OF_RANGE";
    throw error;
  }

  const sourceByNumber = new Map(sourcePicks.map((pick) => [positiveInteger(pick["Pick Number"]), pick]));
  const selectedPlayerIds = new Set();
  const picks = Array.from({ length: totalDraftPicks }, (_, index) => {
    const pickNumber = index + 1;
    const source = sourceByNumber.get(pickNumber) || {};
    const playerId = clean(source["Player ID"]);
    const sourceTeamId = clean(source["Team ID"]);
    const player = playerMap[playerId] || null;
    if (strict && playerId && !player) {
      const error = new Error(`Draft Pick ${pickNumber} references unknown Player ID ${playerId}.`);
      error.code = "DRAFT_PLAYER_ID_UNRESOLVED";
      error.diagnostics = { year, pickNumber, playerId };
      throw error;
    }
    if (strict && playerId && selectedPlayerIds.has(playerId)) {
      const error = new Error(`Draft Picks selects Player ID ${playerId} more than once in ${year}.`);
      error.code = "DRAFT_PLAYER_DUPLICATE";
      error.diagnostics = { year, playerId };
      throw error;
    }
    if (playerId) selectedPlayerIds.add(playerId);
    const team = sourceTeamId || playerId
      ? resolveTeam({ year, teamId: sourceTeamId, playerId, teams, tournament, strict, diagnostics })
      : null;
    return {
      pickNumber,
      round: Math.ceil(pickNumber / Math.max(1, teams.length)),
      pickWithinRound: ((pickNumber - 1) % Math.max(1, teams.length)) + 1,
      sourceTeamId,
      teamId: clean(team?.id || sourceTeamId),
      team,
      playerId,
      player: player
        ? {
            id: playerId,
            name: playerName(player),
            image: playerImage(player),
            handicap: history.getTournamentHandicap(playerId, year),
          }
        : null,
      selectedAt: clean(source["Selected At"]),
      selectedBy: clean(source["Selected By"]),
      status: player ? "SELECTED" : "PENDING",
      notes: clean(source.Notes),
    };
  });

  const firstPickSourceId = clean(settings["First Pick Team ID"]);
  const firstPickTeam = resolveTeam({ year, teamId: firstPickSourceId, teams, tournament, strict, diagnostics });
  const firstPickTeamId = clean(firstPickTeam?.id || firstPickSourceId);
  if (strict && upper(settings["Draft Format"]) === "SNAKE") {
    const expected = expectedSnakeTeamIds(teams, firstPickTeamId, totalDraftPicks);
    for (const mismatch of picks.filter((pick, index) => pick.player && pick.team?.id !== expected[index])) {
      // Draft Settings describes the default format, while Draft Picks is the
      // authoritative record of the actual selecting team. Historical trades
      // and Director-approved pick-order changes must not be rewritten merely
      // because they differ from the default two-team snake sequence.
      diagnostics.push({
        category: "SOURCE_TEAM_ORDER_OVERRIDE",
        year,
        pickNumber: mismatch.pickNumber,
        expectedTeamId: expected[mismatch.pickNumber - 1],
        actualTeamId: mismatch.team?.id || mismatch.teamId,
      });
    }
  }
  if (strict && upper(settings["Draft Status Mode"]) === "COMPLETE" && picks.some((pick) => !pick.player)) {
    const error = new Error(`Completed Draft ${year} contains missing selections.`);
    error.code = "DRAFT_COMPLETED_PICK_MISSING";
    throw error;
  }

  return {
    year,
    name: clean(settings["Draft Name Override"]) || `${year} Sandbagger Draft`,
    date: clean(settings["Draft Date"]),
    time: clean(settings["Draft Time"]),
    timeZone: clean(settings["Time Zone"]),
    location: clean(settings["Draft Location"]),
    statusMode: clean(settings["Draft Status Mode"]),
    format: clean(settings["Draft Format"]),
    totalDraftPicks,
    firstPickTeamId,
    firstPickSourceTeamId: firstPickSourceId,
    notes: clean(settings.Notes),
    teams,
    picks,
  };
}

export function buildDraftPresentation(settings, allPicks, history, options = {}) {
  const seed = buildDraftPresentationSeed(settings, allPicks, history, options);
  return seed ? hydrateDraftPresentation(seed) : null;
}

export function buildDraftProjection({ settingsRows = [], pickRows = [], history, sourceWorkbookId, requestedBy = "" } = {}) {
  if (!history?.getTournament || !history?.getPlayerMap || !history?.getTournamentHandicap) {
    const error = new Error("Canonical tournament, player, team, and handicap facts are required for Draft synchronization.");
    error.code = "DRAFT_CANONICAL_HISTORY_REQUIRED";
    throw error;
  }
  const settings = settingsRows.map(draftSourceRow).filter((row) => positiveInteger(row.Year));
  const picks = pickRows.map(draftSourceRow).filter((row) => positiveInteger(row.Year));
  const duplicateYears = settings.map((row) => Number(row.Year)).filter((year, index, years) => years.indexOf(year) !== index);
  if (duplicateYears.length) {
    const error = new Error("Draft Settings contains duplicate tournament years.");
    error.code = "DRAFT_SETTINGS_YEAR_DUPLICATE";
    error.diagnostics = { years: [...new Set(duplicateYears)] };
    throw error;
  }
  const configuredYears = new Set(settings.map((row) => Number(row.Year)));
  const orphanPickYears = [...new Set(picks.map((row) => Number(row.Year)).filter((year) => !configuredYears.has(year)))];
  if (orphanPickYears.length) {
    const error = new Error("Draft Picks contains years without Draft Settings.");
    error.code = "DRAFT_SETTINGS_REQUIRED_FOR_PICKS";
    error.diagnostics = { years: orphanPickYears };
    throw error;
  }
  if (!settings.length) {
    const error = new Error("Draft Settings is empty.");
    error.code = "DRAFT_SETTINGS_UNAVAILABLE";
    throw error;
  }

  const drafts = settings.map((row) => {
    const year = Number(row.Year);
    const sourcePicks = picks.filter((pick) => Number(pick.Year) === year);
    const corrections = [];
    const presentationSeed = buildDraftPresentationSeed(row, sourcePicks, history, {
      strict: true,
      diagnostics: corrections,
    });
    const configuration = {
      year,
      name: presentationSeed.name,
      date: presentationSeed.date,
      time: presentationSeed.time,
      time_zone: presentationSeed.timeZone,
      location: presentationSeed.location,
      status_mode: presentationSeed.statusMode,
      format: presentationSeed.format,
      total_picks: presentationSeed.totalDraftPicks,
      team_1_id: presentationSeed.teams[0]?.id || "",
      team_2_id: presentationSeed.teams[1]?.id || "",
      team_1_captain_player_id: presentationSeed.teams[0]?.captainId || "",
      team_2_captain_player_id: presentationSeed.teams[1]?.captainId || "",
      first_pick_team_id: presentationSeed.firstPickTeamId,
      notes: presentationSeed.notes,
    };
    const normalizedPicks = presentationSeed.picks.map((pick) => ({
      pick_number: pick.pickNumber,
      round_number: pick.round,
      pick_within_round: pick.pickWithinRound,
      source_team_id: pick.sourceTeamId,
      team_id: pick.team?.id || pick.teamId,
      player_id: pick.player?.id || "",
      player_name: pick.player?.name || "",
      selected_at: pick.selectedAt,
      selected_by: pick.selectedBy,
      status: pick.status,
      notes: pick.notes,
      presentation: {
        team: pick.team,
        player: pick.player,
      },
    }));
    const sourceSettings = draftSourceRow(row);
    const sourceYearPicks = sourcePicks.map(draftSourceRow).sort((left, right) => Number(left["Pick Number"]) - Number(right["Pick Number"]));
    const configurationFingerprint = draftFingerprint(configuration);
    const picksFingerprint = draftFingerprint(normalizedPicks);
    const sourceFingerprint = draftFingerprint({ settings: sourceSettings, picks: sourceYearPicks });
    const payloadFingerprint = draftFingerprint({ configuration, picks: normalizedPicks, presentationSeed });
    return {
      tournament_id: clean(history.getTournament(year)?.id || year),
      tournament_year: year,
      source_fingerprint: sourceFingerprint,
      configuration_fingerprint: configurationFingerprint,
      picks_fingerprint: picksFingerprint,
      payload_fingerprint: payloadFingerprint,
      configuration,
      picks: normalizedPicks,
      presentation_seed: presentationSeed,
      source_settings: sourceSettings,
      source_picks: sourceYearPicks,
      validation_status: "VALID",
      validation_diagnostics: {
        settingsRows: 1,
        sourcePickRows: sourceYearPicks.length,
        projectedPickRows: normalizedPicks.length,
        selectedPicks: normalizedPicks.filter((pick) => pick.player_id).length,
        missingPicks: normalizedPicks.filter((pick) => !pick.player_id).map((pick) => pick.pick_number),
        corrections,
      },
    };
  }).sort((left, right) => left.tournament_year - right.tournament_year);

  return {
    environment: "PREVIEW",
    project_ref: "idgigvjjqkfbqjeredpb",
    source_workbook_id: clean(sourceWorkbookId),
    source_tabs: [...DRAFT_SOURCE_TABS],
    synchronization_fingerprint: draftFingerprint(drafts.map((draft) => ({
      year: draft.tournament_year,
      source: draft.source_fingerprint,
      payload: draft.payload_fingerprint,
    }))),
    contract_version: DRAFT_CONTRACT_VERSION,
    requested_by: clean(requestedBy || "Tournament Director"),
    drafts,
  };
}

export function compareDraftProjection(expected = [], actual = []) {
  const normalize = (drafts) => drafts.map((draft) => {
    const seed = draft.presentation_seed || draft.presentationSeed || draft;
    return {
      year: Number(seed.year),
      configuration: {
        name: clean(seed.name), date: clean(seed.date), time: clean(seed.time), timeZone: clean(seed.timeZone),
        location: clean(seed.location), statusMode: clean(seed.statusMode), format: clean(seed.format),
        totalDraftPicks: Number(seed.totalDraftPicks), firstPickTeamId: clean(seed.firstPickTeamId), notes: clean(seed.notes),
        teams: (seed.teams || []).map((team) => ({ id: clean(team.id), captainId: clean(team.captainId) })),
      },
      picks: (seed.picks || []).map((pick) => ({
        pickNumber: Number(pick.pickNumber), teamId: clean(pick.team?.id || pick.teamId),
        playerId: clean(pick.player?.id || pick.playerId), selectedAt: clean(pick.selectedAt), notes: clean(pick.notes),
      })),
    };
  }).sort((left, right) => left.year - right.year);
  const left = normalize(expected);
  const right = normalize(actual);
  return {
    pass: draftFingerprint(left) === draftFingerprint(right),
    expectedFingerprint: draftFingerprint(left),
    actualFingerprint: draftFingerprint(right),
    expected: left,
    actual: right,
  };
}
