import { scoringShadowPayloadHash } from "./scoring-shadow.js";

export const PRODUCTION_DRAFT_AUTHORING_CONTRACT =
  "production-draft-authoring-v1";

export const PRODUCTION_DRAFT_STATUS_MODES = Object.freeze([
  "Automatic",
  "Unscheduled",
  "Scheduled",
  "Live",
  "Complete",
]);

export const PRODUCTION_DRAFT_CONFIGURATION_FIELDS = Object.freeze([
  Object.freeze({ key: "year", label: "Year", type: "year", required: true }),
  Object.freeze({ key: "name", label: "Draft name override", type: "text" }),
  // Legacy Draft scheduling values are intentionally lossless strings (for
  // example `7/12/2026`, `7:00 PM`, and `CST`). Do not silently coerce them
  // through browser date/time controls during this authoring migration.
  Object.freeze({ key: "date", label: "Draft date", type: "text" }),
  Object.freeze({ key: "time", label: "Draft time", type: "text" }),
  Object.freeze({ key: "time_zone", label: "Time zone", type: "text" }),
  Object.freeze({ key: "location", label: "Location", type: "text" }),
  Object.freeze({ key: "status_mode", label: "Status", type: "select", options: PRODUCTION_DRAFT_STATUS_MODES }),
  Object.freeze({ key: "format", label: "Format", type: "text" }),
  Object.freeze({ key: "total_picks", label: "Total picks", type: "integer", required: true }),
  Object.freeze({ key: "team_1_id", label: "Team 1", type: "team", required: true }),
  Object.freeze({ key: "team_2_id", label: "Team 2", type: "team", required: true }),
  Object.freeze({ key: "team_1_captain_player_id", label: "Team 1 captain", type: "player" }),
  Object.freeze({ key: "team_2_captain_player_id", label: "Team 2 captain", type: "player" }),
  Object.freeze({ key: "first_pick_team_id", label: "First-pick team", type: "team", required: true }),
  Object.freeze({ key: "notes", label: "Notes", type: "textarea" }),
]);

export const PRODUCTION_DRAFT_PICK_FIELDS = Object.freeze([
  Object.freeze({ key: "pick_number", label: "Pick #", type: "integer", required: true }),
  Object.freeze({ key: "team_id", label: "Team", type: "team" }),
  Object.freeze({ key: "player_id", label: "Player", type: "player" }),
  Object.freeze({ key: "selected_at", label: "Selected at", type: "text", readOnly: true }),
  Object.freeze({ key: "selected_by", label: "Selected by", type: "text", readOnly: true }),
  Object.freeze({ key: "notes", label: "Notes", type: "textarea" }),
]);

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const CONFIGURATION_KEYS = new Set(PRODUCTION_DRAFT_CONFIGURATION_FIELDS.map((field) => field.key));
const PICK_KEYS = new Set(PRODUCTION_DRAFT_PICK_FIELDS.map((field) => field.key));
const STATUS_BY_UPPER = new Map(PRODUCTION_DRAFT_STATUS_MODES.map((value) => [value.toUpperCase(), value]));

function contractError(code, message, issues = []) {
  const error = new Error(message);
  error.code = code;
  error.status = 422;
  error.diagnostics = { issues };
  return error;
}

function record(value, code, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError(code, message);
  }
  return value;
}

function positiveInteger(value, code, label) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw contractError(code, `${label} must be a positive whole number.`);
  }
  return result;
}

function validCalendarDate(value) {
  const text = clean(value);
  if (!text) return true;
  const match = /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{4}))$/.exec(text);
  if (!match) return false;
  const year = Number(match[1] || match[6]);
  const month = Number(match[2] || match[4]);
  const day = Number(match[3] || match[5]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function validClockTime(value) {
  const text = clean(value);
  return !text || /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(text) ||
    /^(?:0?[1-9]|1[0-2]):[0-5]\d\s(?:AM|PM)$/i.test(text);
}

function validTimeZone(value) {
  const text = clean(value);
  if (!text) return true;
  if (["UTC", "GMT", "CST", "CDT", "EST", "EDT", "MST", "MDT", "PST", "PDT"].includes(upper(text))) {
    return true;
  }
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(text)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: text }).format(0);
    return true;
  } catch {
    return false;
  }
}

function rejectUnknownKeys(value, allowed, code, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    throw contractError(
      code,
      `${label} contains unsupported fields.`,
      unknown.map((key) => ({ code: "UNKNOWN_FIELD", key })),
    );
  }
}

function normalizeConfiguration(configuration) {
  const source = record(
    configuration,
    "DRAFT_CONFIGURATION_REQUIRED",
    "A complete Draft configuration is required.",
  );
  rejectUnknownKeys(source, CONFIGURATION_KEYS, "DRAFT_CONFIGURATION_INVALID", "Draft configuration");
  const year = positiveInteger(source.year, "DRAFT_TOURNAMENT_REQUIRED", "Draft year");
  if (year < 2000 || year > 2200) {
    throw contractError("DRAFT_TOURNAMENT_REQUIRED", "Draft year must be a valid four-digit year.");
  }
  const totalPicks = positiveInteger(source.total_picks, "DRAFT_TOTAL_PICKS_INVALID", "Total picks");
  const teamOne = upper(source.team_1_id);
  const teamTwo = upper(source.team_2_id);
  if (!teamOne || !teamTwo || teamOne === teamTwo) {
    throw contractError("DRAFT_CONFIGURATION_TEAMS_INVALID", "Draft Setup requires two distinct Team IDs.");
  }
  const captainOne = upper(source.team_1_captain_player_id);
  const captainTwo = upper(source.team_2_captain_player_id);
  if (captainOne && captainTwo && captainOne === captainTwo) {
    throw contractError("DRAFT_CONFIGURATION_CAPTAINS_INVALID", "Each Draft team must have a different captain.");
  }
  const firstPickTeam = upper(source.first_pick_team_id);
  if (!firstPickTeam || ![teamOne, teamTwo].includes(firstPickTeam)) {
    throw contractError("DRAFT_FIRST_PICK_TEAM_INVALID", "First-pick Team must be one of the two Draft teams.");
  }
  const status = STATUS_BY_UPPER.get(upper(source.status_mode));
  if (!status) {
    throw contractError("DRAFT_STATUS_INVALID", "Select a supported Draft status.");
  }
  if (!validCalendarDate(source.date)) {
    throw contractError("DRAFT_DATE_INVALID", "Draft date must be a real calendar date.");
  }
  if (!validClockTime(source.time)) {
    throw contractError("DRAFT_TIME_INVALID", "Draft time must use a supported clock format.");
  }
  if (!validTimeZone(source.time_zone)) {
    throw contractError("DRAFT_TIME_ZONE_INVALID", "Select a recognized time zone.");
  }
  return Object.freeze({
    year,
    name: clean(source.name),
    date: clean(source.date),
    time: clean(source.time),
    time_zone: clean(source.time_zone),
    location: clean(source.location),
    status_mode: status,
    format: clean(source.format),
    total_picks: totalPicks,
    team_1_id: teamOne,
    team_2_id: teamTwo,
    team_1_captain_player_id: captainOne,
    team_2_captain_player_id: captainTwo,
    first_pick_team_id: firstPickTeam,
    notes: clean(source.notes),
  });
}

function normalizePicks(picks, configuration) {
  if (!Array.isArray(picks) || picks.length !== configuration.total_picks) {
    throw contractError(
      "DRAFT_COMPLETE_PICK_BOARD_REQUIRED",
      "The complete Draft Board must contain one row for every configured pick.",
    );
  }
  const teamIds = new Set([configuration.team_1_id, configuration.team_2_id]);
  const captainIds = new Set([
    configuration.team_1_captain_player_id,
    configuration.team_2_captain_player_id,
  ].filter(Boolean));
  const selectedPlayers = new Set();
  const seenPicks = new Set();
  const normalized = picks.map((value, index) => {
    const source = record(value, "DRAFT_PICK_INVALID", `Draft Pick ${index + 1} is invalid.`);
    rejectUnknownKeys(source, PICK_KEYS, "DRAFT_PICK_INVALID", `Draft Pick ${index + 1}`);
    const pickNumber = positiveInteger(source.pick_number, "DRAFT_PICK_NUMBER_INVALID", "Pick number");
    if (pickNumber > configuration.total_picks || seenPicks.has(pickNumber)) {
      throw contractError("DRAFT_PICK_NUMBER_INVALID", "Draft pick numbers must be unique and within the configured range.");
    }
    seenPicks.add(pickNumber);
    const teamId = upper(source.team_id);
    const playerId = upper(source.player_id);
    if (teamId && !teamIds.has(teamId)) {
      throw contractError("DRAFT_PICK_TEAM_INVALID", `Draft Pick ${pickNumber} references an unconfigured Team ID.`);
    }
    if (playerId && !teamId) {
      throw contractError("DRAFT_PICK_TEAM_REQUIRED", `Draft Pick ${pickNumber} requires a Team ID.`);
    }
    if (playerId && captainIds.has(playerId)) {
      throw contractError("DRAFT_CAPTAIN_PICK_PROHIBITED", "Captains are assigned in Draft Setup and cannot also be selected as Draft picks.");
    }
    if (playerId && selectedPlayers.has(playerId)) {
      throw contractError("DRAFT_PLAYER_DUPLICATE", "A Player may be selected only once in a Draft.");
    }
    if (playerId) selectedPlayers.add(playerId);
    return Object.freeze({
      pick_number: pickNumber,
      team_id: teamId,
      player_id: playerId,
      selected_at: clean(source.selected_at),
      selected_by: clean(source.selected_by),
      notes: clean(source.notes),
    });
  }).sort((left, right) => left.pick_number - right.pick_number);
  if (normalized.some((pick, index) => pick.pick_number !== index + 1)) {
    throw contractError("DRAFT_PICK_NUMBER_SEQUENCE_INVALID", "Draft pick numbers must be contiguous from 1 through Total Picks.");
  }
  if (upper(configuration.status_mode) === "COMPLETE" && normalized.some((pick) => !pick.player_id)) {
    throw contractError("DRAFT_COMPLETED_PICK_MISSING", "A completed Draft cannot contain an unselected pick.");
  }
  return Object.freeze(normalized);
}

export function normalizeProductionDraftAuthoring({ configuration, picks } = {}) {
  const normalizedConfiguration = normalizeConfiguration(configuration);
  const normalizedPicks = normalizePicks(picks, normalizedConfiguration);
  return Object.freeze({
    contractVersion: PRODUCTION_DRAFT_AUTHORING_CONTRACT,
    configuration: normalizedConfiguration,
    picks: normalizedPicks,
    configurationFingerprint: scoringShadowPayloadHash(normalizedConfiguration),
    picksFingerprint: scoringShadowPayloadHash(normalizedPicks),
    payloadFingerprint: scoringShadowPayloadHash({
      configuration: normalizedConfiguration,
      picks: normalizedPicks,
    }),
  });
}

export function productionDraftAuthoringPayloadHash(value) {
  return scoringShadowPayloadHash({
    contractVersion: PRODUCTION_DRAFT_AUTHORING_CONTRACT,
    value,
  });
}

export function productionDraftChangedFields(current = {}, proposed = {}) {
  const currentConfiguration = current.configuration || {};
  const proposedConfiguration = proposed.configuration || {};
  const configuration = PRODUCTION_DRAFT_CONFIGURATION_FIELDS
    .map((field) => field.key)
    .filter((key) => JSON.stringify(currentConfiguration[key]) !== JSON.stringify(proposedConfiguration[key]));
  const currentPicks = new Map((current.picks || []).map((pick) => [Number(pick.pick_number), pick]));
  const picks = (proposed.picks || []).filter((pick) =>
    JSON.stringify(currentPicks.get(Number(pick.pick_number)) || null) !== JSON.stringify(pick)
  ).map((pick) => Number(pick.pick_number));
  return Object.freeze({ configuration, picks });
}
