export const PRODUCTION_TOURNAMENT_SETUP_CONTRACT = "production-tournament-setup-v1";

export const PRODUCTION_TOURNAMENT_SETUP_ACTIONS = Object.freeze([
  "update-tournament",
  "update-team",
  "assign-roster-team",
  "update-round",
  "upsert-course",
  "upsert-match",
  "replace-pairings",
  "prepare-scoring-context",
]);

export const PRODUCTION_TOURNAMENT_FORMATS = Object.freeze(["BB", "SC", "SI"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const COURSE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;
const IANA_TIME_ZONE = /^[A-Za-z]+(?:[ _-]?[A-Za-z]+)*(?:\/[A-Za-z0-9_+.-]+)+$/;
const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

function contractError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function safeText(value, maximum = 240) {
  return clean(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maximum);
}

function safeInteger(value, fallback = 0) {
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : fallback;
}

function safeDecimal(value) {
  const result = clean(value);
  return /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(result) ? result : "";
}

function safeBoolean(value) {
  return value === true || /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
}

function safeCode(value, fallback = "") {
  const result = upper(value);
  return /^[A-Z][A-Z0-9_]{0,119}$/.test(result) ? result : fallback;
}

function safeList(value, maximum = 64) {
  return Object.freeze((Array.isArray(value) ? value : []).map((item) => safeText(
    typeof item === "string" ? item : firstDefined(item?.message, item?.label, item?.code),
    300,
  )).filter(Boolean).slice(0, maximum));
}

export function stableTournamentSetupValue(value) {
  if (Array.isArray(value)) return value.map(stableTournamentSetupValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      stableTournamentSetupValue(value[key] === undefined ? null : value[key]),
    ]));
  }
  return value === undefined ? null : value;
}

export function canonicalTournamentSetupOperationId(value) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) {
    throw contractError(
      "TOURNAMENT_SETUP_OPERATION_REQUEST_ID_REQUIRED",
      "A secure operation identity is required.",
    );
  }
  return result;
}

export function canonicalTournamentSetupRevision(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw contractError(
      "TOURNAMENT_SETUP_REVISION_REQUIRED",
      "Refresh Tournament Setup before making this change.",
    );
  }
  return result;
}

export function canonicalTournamentSetupId(value, label = "Stable ID") {
  const result = upper(value);
  if (!STABLE_ID.test(result)) {
    throw contractError("TOURNAMENT_SETUP_STABLE_ID_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

export function canonicalTournamentSetupText(value, label, { minimum = 1, maximum = 160 } = {}) {
  const result = clean(value).replace(/\s+/g, " ");
  if (result.length < minimum || result.length > maximum || /[<>{}\u0000-\u001f\u007f]/.test(result)) {
    throw contractError("TOURNAMENT_SETUP_TEXT_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

export function canonicalTournamentSetupDate(value, label) {
  const result = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw contractError("TOURNAMENT_SETUP_DATE_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

export function canonicalTournamentSetupTime(value) {
  const result = clean(value);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result)) {
    throw contractError("TOURNAMENT_SETUP_TEE_TIME_INVALID", "Enter a valid tee time.");
  }
  return result;
}

export function canonicalTournamentSetupTimeZone(value) {
  const result = clean(value);
  if (result.length > 80 || !IANA_TIME_ZONE.test(result)) {
    throw contractError("TOURNAMENT_SETUP_TIME_ZONE_INVALID", "Enter a valid IANA time zone.");
  }
  try { Intl.DateTimeFormat("en-US", { timeZone: result }); }
  catch { throw contractError("TOURNAMENT_SETUP_TIME_ZONE_INVALID", "Enter a valid IANA time zone."); }
  return result;
}

export function canonicalTournamentSetupFormat(value) {
  const result = upper(value);
  if (!PRODUCTION_TOURNAMENT_FORMATS.includes(result)) {
    throw contractError("TOURNAMENT_SETUP_FORMAT_INVALID", "Select Best Ball, Scramble, or Singles.");
  }
  return result;
}

export function productionTournamentFormatParticipantCount(format) {
  return canonicalTournamentSetupFormat(format) === "SI" ? 2 : 4;
}

function boundedInteger(value, label, minimum, maximum) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw contractError("TOURNAMENT_SETUP_NUMBER_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

function boundedDecimal(value, label, minimum, maximum) {
  const source = clean(value);
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(source)) {
    throw contractError("TOURNAMENT_SETUP_NUMBER_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  const result = Number(source);
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw contractError("TOURNAMENT_SETUP_NUMBER_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return source;
}

export function canonicalTournamentSetupHoles(value) {
  if (!Array.isArray(value) || value.length !== 18) {
    throw contractError("TOURNAMENT_SETUP_HOLES_INCOMPLETE", "Provide all 18 hole definitions.");
  }
  const holes = value.map((hole, index) => Object.freeze({
    number: boundedInteger(firstDefined(hole?.number, hole?.holeNumber, hole?.hole_number, index + 1), "hole number", 1, 18),
    par: boundedInteger(hole?.par, "hole par", 3, 6),
    strokeIndex: boundedInteger(firstDefined(hole?.strokeIndex, hole?.stroke_index), "stroke index", 1, 18),
    yardage: hole?.yardage === null || clean(hole?.yardage) === ""
      ? null
      : boundedInteger(hole.yardage, "yardage", 50, 900),
  }));
  if (new Set(holes.map((hole) => hole.number)).size !== 18 ||
      new Set(holes.map((hole) => hole.strokeIndex)).size !== 18) {
    throw contractError(
      "TOURNAMENT_SETUP_HOLE_SEQUENCE_INVALID",
      "Hole numbers and stroke indexes must each contain 1 through 18 exactly once.",
    );
  }
  return holes.sort((left, right) => left.number - right.number);
}

export function canonicalTournamentSetupParticipants(value, format) {
  const expected = productionTournamentFormatParticipantCount(format);
  if (!Array.isArray(value) || (value.length !== 0 && value.length !== expected)) {
    throw contractError(
      "TOURNAMENT_SETUP_PAIRING_COUNT_INVALID",
      `${format} requires either no participants or exactly ${expected} participants.`,
    );
  }
  if (value.length === 0) return Object.freeze([]);
  const sideCounts = new Map([[1, 0], [2, 0]]);
  const participants = value.map((item) => {
    const teamSide = boundedInteger(firstDefined(item?.teamSide, item?.team_side), "team side", 1, 2);
    const playerSlot = boundedInteger(firstDefined(item?.playerSlot, item?.player_slot), "player slot", 1, format === "SI" ? 1 : 2);
    sideCounts.set(teamSide, sideCounts.get(teamSide) + 1);
    return Object.freeze({
      playerId: canonicalTournamentSetupId(firstDefined(item?.playerId, item?.player_id), "Player ID"),
      teamSide,
      playerSlot,
    });
  });
  if (new Set(participants.map((item) => item.playerId)).size !== expected ||
      sideCounts.get(1) !== expected / 2 || sideCounts.get(2) !== expected / 2 ||
      new Set(participants.map((item) => `${item.teamSide}:${item.playerSlot}`)).size !== expected) {
    throw contractError(
      "TOURNAMENT_SETUP_PAIRING_STRUCTURE_INVALID",
      "Pairings require unique Players and valid team-side slots.",
    );
  }
  return participants.sort((left, right) => left.teamSide - right.teamSide || left.playerSlot - right.playerSlot);
}

export function buildTournamentSetupParticipantSlots(value, format) {
  const expected = productionTournamentFormatParticipantCount(format);
  const slotsPerSide = expected / 2;
  const slots = Array.from({ length: expected }, (_, index) => ({
    teamSide: index < slotsPerSide ? 1 : 2,
    playerSlot: index % slotsPerSide + 1,
    playerId: "",
  }));
  for (const participant of Array.isArray(value) ? value : []) {
    const normalized = normalizeParticipant(participant);
    const index = slots.findIndex((slot) =>
      slot.teamSide === normalized.teamSide && slot.playerSlot === normalized.playerSlot);
    if (index >= 0 && !slots[index].playerId) slots[index] = { ...slots[index], ...normalized };
  }
  return Object.freeze(slots.map((slot) => Object.freeze(slot)));
}

export function buildTournamentSetupMutation(action, value = {}) {
  const selected = clean(action).toLowerCase();
  if (!PRODUCTION_TOURNAMENT_SETUP_ACTIONS.includes(selected)) {
    throw contractError("TOURNAMENT_SETUP_ACTION_INVALID", "Unsupported Tournament Setup action.");
  }
  const common = {
    expected_revision: canonicalTournamentSetupRevision(value.expectedRevision),
    operation_request_id: canonicalTournamentSetupOperationId(value.operationRequestId),
  };
  if (selected === "update-tournament") return {
    operation: "UPDATE_TOURNAMENT",
    ...common,
    tournament_name: canonicalTournamentSetupText(value.name, "Tournament name"),
    destination: canonicalTournamentSetupText(value.destination, "Destination"),
    start_date: canonicalTournamentSetupDate(value.startDate, "Start date"),
    end_date: canonicalTournamentSetupDate(value.endDate, "End date"),
    time_zone: canonicalTournamentSetupTimeZone(value.timeZone),
    operational_status: safeCode(value.operationalStatus, "UPCOMING"),
  };
  if (selected === "update-team") return {
    operation: "UPDATE_TEAM",
    ...common,
    team_id: canonicalTournamentSetupId(value.teamId, "Team ID"),
    team_name: canonicalTournamentSetupText(value.teamName, "Team name"),
    captain_player_id: canonicalTournamentSetupId(value.captainPlayerId, "Captain Player ID"),
  };
  if (selected === "assign-roster-team") return {
    operation: "ASSIGN_ROSTER_TEAM",
    ...common,
    player_id: canonicalTournamentSetupId(value.playerId, "Player ID"),
    team_id: canonicalTournamentSetupId(value.teamId, "Team ID"),
  };
  if (selected === "update-round") return {
    operation: "UPDATE_ROUND",
    ...common,
    round_number: boundedInteger(value.roundNumber, "round number", 1, 3),
    round_name: canonicalTournamentSetupText(value.roundName, "Round name"),
    format: canonicalTournamentSetupFormat(value.format),
    team_size: boundedInteger(value.teamSize, "team size", 1, 2),
    points_available: boundedDecimal(value.pointsAvailable, "points available", 0, 100),
    handicap_allowance: boundedDecimal(value.handicapAllowance, "handicap allowance", 0, 1),
  };
  if (selected === "upsert-course") {
    const courseId = clean(value.courseId);
    if (!COURSE_ID.test(courseId)) throw contractError("TOURNAMENT_SETUP_COURSE_ID_INVALID", "Select a valid existing course.");
    const par = boundedInteger(value.par, "course par", 54, 90);
    const holes = canonicalTournamentSetupHoles(value.holes);
    if (holes.reduce((total, hole) => total + hole.par, 0) !== par) {
      throw contractError(
        "TOURNAMENT_SETUP_COURSE_PAR_MISMATCH",
        "Course par must equal the total par across all 18 holes.",
      );
    }
    return {
      operation: "UPSERT_COURSE",
      ...common,
      round_number: boundedInteger(value.roundNumber, "round number", 1, 3),
      course_id: courseId,
      course_name: canonicalTournamentSetupText(value.courseName, "Course name"),
      city: canonicalTournamentSetupText(value.city, "City", { minimum: 0 }),
      state: canonicalTournamentSetupText(value.state, "State", { minimum: 0, maximum: 80 }),
      tee: canonicalTournamentSetupText(value.tee, "Tee"),
      rating: boundedDecimal(value.rating, "course rating", 50, 90),
      slope: boundedInteger(value.slope, "course slope", 55, 155),
      par,
      holes: holes.map((hole) => ({
        hole_number: hole.number,
        par: hole.par,
        stroke_index: hole.strokeIndex,
        yardage: hole.yardage,
      })),
    };
  }
  if (selected === "upsert-match") {
    if (!clean(value.matchId)) {
      throw contractError(
        "TOURNAMENT_SETUP_EXISTING_MATCH_REQUIRED",
        "Select an existing Production match to configure.",
      );
    }
    return {
      operation: "UPSERT_MATCH",
      ...common,
      match_id: canonicalTournamentSetupId(value.matchId, "Match ID"),
      round_number: boundedInteger(value.roundNumber, "round number", 1, 3),
      match_number: boundedInteger(value.matchNumber, "match number", 1, 99),
      course_id: clean(value.courseId),
      tee: canonicalTournamentSetupText(value.tee, "Tee"),
      tee_time: canonicalTournamentSetupTime(value.teeTime),
      starting_hole: boundedInteger(value.startingHole, "starting hole", 1, 18),
    };
  }
  if (selected === "replace-pairings") return {
    operation: "REPLACE_PAIRINGS",
    ...common,
    match_id: canonicalTournamentSetupId(value.matchId, "Match ID"),
    format: canonicalTournamentSetupFormat(value.format),
    participants: canonicalTournamentSetupParticipants(value.participants, value.format).map((participant) => ({
      player_id: participant.playerId,
      team_side: participant.teamSide,
      player_slot: participant.playerSlot,
    })),
  };
  return {
    operation: "PREPARE_SCORING_CONTEXT",
    ...common,
    match_id: canonicalTournamentSetupId(value.matchId, "Match ID"),
  };
}

function normalizeCapability(value = {}) {
  if (typeof value === "boolean") return Object.freeze({ allowed: value, reason: "" });
  return Object.freeze({
    allowed: safeBoolean(firstDefined(value.allowed, value.enabled, value.canMutate, value.can_mutate)),
    reason: safeText(firstDefined(value.reason, value.message), 300),
  });
}

function normalizeReadiness(value = {}) {
  const sectionSource = Array.isArray(value.sections)
    ? value.sections
    : value.sections && typeof value.sections === "object"
      ? Object.entries(value.sections).map(([id, state]) => ({
        id,
        label: id === "scoringContext" ? "Scoring Context" : id,
        state,
        complete: state === "COMPLETE",
        blockers: (Array.isArray(value.blockers) ? value.blockers : []).filter((item) =>
          typeof item === "object" && item?.section === id),
      }))
      : [];
  return Object.freeze({
    state: safeCode(value.state, "NEEDS_ATTENTION"),
    complete: safeBoolean(firstDefined(value.complete, value.ready)),
    blockers: safeList(value.blockers),
    warnings: safeList(value.warnings),
    sections: Object.freeze(sectionSource.map((section) => Object.freeze({
      id: safeText(section?.id, 80),
      label: safeText(section?.label, 160).replace(/\b\w/g, (letter) => letter.toUpperCase()),
      state: safeCode(section?.state, "NEEDS_ATTENTION"),
      complete: safeBoolean(section?.complete),
      blockers: safeList(section?.blockers),
      warnings: safeList(section?.warnings),
    })).filter((section) => section.id)),
  });
}

function normalizeTournament(value = {}) {
  return Object.freeze({
    id: safeText(firstDefined(value.id, value.tournamentId, value.tournament_id), 64),
    year: safeInteger(firstDefined(value.year, value.tournamentYear, value.tournament_year)),
    name: safeText(value.name, 160),
    destination: safeText(value.destination, 160),
    startDate: safeText(firstDefined(value.startDate, value.start_date), 32),
    endDate: safeText(firstDefined(value.endDate, value.end_date), 32),
    timeZone: safeText(firstDefined(value.timeZone, value.time_zone, value.timezone), 80),
    operationalStatus: safeCode(firstDefined(value.operationalStatus, value.operational_status, value.status), "UPCOMING"),
  });
}

function normalizeTeam(value = {}) {
  return Object.freeze({
    teamId: safeText(firstDefined(value.teamId, value.team_id), 64),
    side: safeInteger(firstDefined(value.side, value.teamSide, value.team_side)),
    name: safeText(value.name, 160),
    captainPlayerId: safeText(firstDefined(value.captainPlayerId, value.captain_player_id), 64),
    captainName: safeText(firstDefined(value.captainName, value.captain_name), 160),
    active: value.active === undefined ? true : safeBoolean(value.active),
    locked: safeBoolean(value.locked),
  });
}

function normalizeRosterPlayer(value = {}) {
  return Object.freeze({
    playerId: safeText(firstDefined(value.playerId, value.player_id), 64),
    displayName: safeText(firstDefined(value.displayName, value.display_name), 160),
    membershipStatus: safeCode(firstDefined(value.membershipStatus, value.membership_status, value.participationStatus, value.participation_status), "ACTIVE"),
    teamId: safeText(firstDefined(value.teamId, value.team_id), 64),
    teamSide: safeInteger(firstDefined(value.teamSide, value.team_side)),
    teamName: safeText(firstDefined(value.teamName, value.team_name), 160),
    tournamentHandicap: safeDecimal(firstDefined(value.tournamentHandicap, value.tournament_handicap)),
    handicapRevisionId: safeText(firstDefined(value.handicapRevisionId, value.handicap_revision_id), 80),
    pairedMatchCount: Math.max(0, safeInteger(firstDefined(value.pairedMatchCount, value.paired_match_count))),
    frozenMatchCount: Math.max(0, safeInteger(firstDefined(value.frozenMatchCount, value.frozen_match_count))),
    canAssignTeam: safeBoolean(firstDefined(value.canAssignTeam, value.can_assign_team,
      safeInteger(firstDefined(value.frozenMatchCount, value.frozen_match_count)) === 0)),
    blockers: safeList(value.blockers),
  });
}

function normalizeRound(value = {}) {
  const format = safeCode(value.format);
  return Object.freeze({
    number: safeInteger(firstDefined(value.number, value.roundNumber, value.round_number)),
    name: safeText(value.name, 160),
    format,
    teamSize: safeInteger(firstDefined(value.teamSize, value.team_size), format === "SI" ? 1 : 2),
    pointsAvailable: safeDecimal(firstDefined(value.pointsAvailable, value.points_available)),
    handicapAllowance: safeDecimal(firstDefined(value.handicapAllowance, value.handicap_allowance)),
    status: safeCode(value.status, "UPCOMING"),
    locked: safeBoolean(value.locked),
    matchCount: Math.max(0, safeInteger(firstDefined(value.matchCount, value.match_count))),
  });
}

function normalizeHole(value = {}, index = 0) {
  return Object.freeze({
    number: safeInteger(firstDefined(value.number, value.holeNumber, value.hole_number), index + 1),
    par: safeInteger(value.par),
    strokeIndex: safeInteger(firstDefined(value.strokeIndex, value.stroke_index)),
    yardage: firstDefined(value.yardage) === null ? null : safeInteger(value.yardage),
  });
}

function normalizeCourse(value = {}) {
  const roundNumbers = Array.isArray(firstDefined(value.roundNumbers, value.round_numbers))
    ? firstDefined(value.roundNumbers, value.round_numbers)
    : [];
  return Object.freeze({
    roundNumber: safeInteger(firstDefined(value.roundNumber, value.round_number, roundNumbers[0])),
    courseId: safeText(firstDefined(value.courseId, value.course_id), 96),
    name: safeText(firstDefined(value.name, value.courseName, value.course_name, value.displayName, value.display_name), 160),
    city: safeText(value.city, 120),
    state: safeText(value.state, 80),
    tee: safeText(value.tee, 100),
    rating: safeDecimal(value.rating),
    slope: safeInteger(value.slope),
    par: safeInteger(value.par),
    holes: Object.freeze((Array.isArray(value.holes) ? value.holes : []).map(normalizeHole)),
    complete: safeBoolean(firstDefined(value.complete,
      safeInteger(firstDefined(value.holeCount, value.hole_count), (value.holes || []).length) === 18)),
    locked: safeBoolean(value.locked),
    source: safeCode(value.source, "CANONICAL_SUPABASE"),
  });
}

function normalizeCourseIdentity(value = {}) {
  return Object.freeze({
    courseId: safeText(firstDefined(value.courseId, value.course_id), 96),
    name: safeText(firstDefined(value.name, value.canonicalName, value.canonical_name), 160),
    location: safeText(firstDefined(value.location, value.canonicalLocation, value.canonical_location), 160),
    requiresTeeConfiguration: safeBoolean(firstDefined(
      value.requiresTeeConfiguration,
      value.requires_tee_configuration,
      true,
    )),
    requiresHoleConfiguration: safeBoolean(firstDefined(
      value.requiresHoleConfiguration,
      value.requires_hole_configuration,
      true,
    )),
  });
}

function normalizeParticipant(value = {}) {
  return Object.freeze({
    playerId: safeText(firstDefined(value.playerId, value.player_id), 64),
    displayName: safeText(firstDefined(value.displayName, value.display_name), 160),
    teamId: safeText(firstDefined(value.teamId, value.team_id), 64),
    teamSide: safeInteger(firstDefined(value.teamSide, value.team_side)),
    playerSlot: safeInteger(firstDefined(value.playerSlot, value.player_slot)),
    tournamentHandicap: safeDecimal(firstDefined(value.tournamentHandicap, value.tournament_handicap)),
  });
}

function normalizeMatch(value = {}) {
  const strictlyUnstarted = safeBoolean(firstDefined(value.strictlyUnstarted, value.strictly_unstarted));
  const scoringReady = safeBoolean(firstDefined(
    value.scoringReady,
    value.scoring_ready,
    value.markLiveReadiness?.ready,
    value.mark_live_readiness?.ready,
  ));
  const preparedSetupRevision = Math.max(0, safeInteger(firstDefined(
    value.preparedSetupRevision,
    value.prepared_setup_revision,
    value.snapshot?.preparedSetupRevision,
    value.snapshot?.prepared_setup_revision,
  )));
  const participants = Object.freeze((Array.isArray(value.participants) ? value.participants : []).map(normalizeParticipant));
  const accessActive = safeBoolean(firstDefined(value.accessActive, value.access_active));
  return Object.freeze({
    matchId: safeText(firstDefined(value.matchId, value.match_id), 80),
    roundNumber: safeInteger(firstDefined(value.roundNumber, value.round_number)),
    matchNumber: safeInteger(firstDefined(value.matchNumber, value.match_number, value.displayMatchNumber, value.display_match_number)),
    format: safeCode(value.format),
    status: safeCode(value.status, "UPCOMING"),
    courseId: safeText(firstDefined(value.courseId, value.course_id), 96),
    courseName: safeText(firstDefined(value.courseName, value.course_name), 160),
    tee: safeText(firstDefined(value.tee, value.teeId, value.tee_id), 100),
    teeTime: safeText(firstDefined(value.teeTime, value.tee_time), 40),
    startingHole: safeInteger(firstDefined(value.startingHole, value.starting_hole), 1),
    scoringLocked: safeBoolean(firstDefined(value.scoringLocked, value.scoring_locked)),
    scoredHoles: Math.max(0, safeInteger(firstDefined(value.scoredHoles, value.scored_holes))),
    participantCount: Math.max(0, safeInteger(firstDefined(value.participantCount, value.participant_count))),
    participants,
    snapshot: Object.freeze({
      id: safeText(firstDefined(value.snapshot?.id, value.snapshotId, value.snapshot_id), 100),
      revision: Math.max(0, safeInteger(firstDefined(value.snapshot?.revision, value.snapshotRevision, value.snapshot_revision))),
      prepared: preparedSetupRevision > 0 || (scoringReady && safeBoolean(firstDefined(
        value.snapshot?.prepared, value.snapshotPrepared, value.snapshot_prepared, value.prepared,
      ))),
      preparedSetupRevision,
      handicapRevisionId: safeText(firstDefined(value.snapshot?.handicapRevisionId, value.snapshot?.handicap_revision_id), 80),
      current: safeBoolean(firstDefined(value.snapshot?.current, value.snapshotCurrent, value.snapshot_current)),
    }),
    scoringReady,
    scoringReadinessCode: safeCode(firstDefined(
      value.scoringReadinessCode,
      value.scoring_readiness_code,
      value.markLiveReadiness?.code,
      value.mark_live_readiness?.code,
    ), "PRODUCTION_MATCH_NOT_SCORING_READY"),
    scoringReadinessReasons: safeList(firstDefined(
      value.scoringReadinessReasons,
      value.scoring_readiness_reasons,
      value.markLiveReadiness?.reasons,
      value.mark_live_readiness?.reasons,
      [],
    )),
    locked: safeBoolean(firstDefined(value.locked,
      value.strictlyUnstarted === undefined && value.strictly_unstarted === undefined ? false : !strictlyUnstarted)),
    strictlyUnstarted,
    accessActive,
    canClearPairings: participants.length > 0 && strictlyUnstarted && !accessActive,
    blockers: safeList(value.blockers),
    warnings: safeList(value.warnings),
  });
}

export function normalizeProductionTournamentSetupPayload(payload = {}) {
  const value = payload?.data || payload?.result || payload;
  const revision = Number(value?.revision);
  const contractVersion = safeText(firstDefined(value?.contractVersion, value?.contract_version), 120);
  if (contractVersion !== PRODUCTION_TOURNAMENT_SETUP_CONTRACT ||
      !Number.isSafeInteger(revision) || revision < 0 ||
      !Array.isArray(value?.teams) || !Array.isArray(value?.roster) ||
      !Array.isArray(value?.rounds) || !Array.isArray(value?.courses) ||
      !Array.isArray(value?.matches)) {
    throw contractError(
      "TOURNAMENT_SETUP_RESPONSE_INVALID",
      "Tournament Setup returned an invalid Production response.",
      503,
    );
  }
  const capabilities = Object.fromEntries(PRODUCTION_TOURNAMENT_SETUP_ACTIONS.map((action) => [
    action,
    normalizeCapability(value.capabilities?.[action] ||
      value.capabilities?.[action.replaceAll("-", "_")] ||
      value.capabilities?.[action.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ||
      (action === "upsert-course" ? value.capabilities?.upsertExistingCourse : null) || {}),
  ]));
  return Object.freeze({
    contractVersion,
    revision,
    actor: Object.freeze({
      playerId: safeText(firstDefined(value.actor?.playerId, value.actor?.player_id), 64),
      owner: safeBoolean(firstDefined(value.actor?.owner, value.actor?.isOwner, value.actor?.is_owner)),
    }),
    tournament: normalizeTournament(value.tournament),
    teams: Object.freeze(value.teams.map(normalizeTeam).filter((item) => item.teamId).sort((a, b) => a.side - b.side)),
    roster: Object.freeze(value.roster.map(normalizeRosterPlayer).filter((item) => item.playerId).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.playerId.localeCompare(b.playerId))),
    availablePlayers: Object.freeze((Array.isArray(value.availablePlayers) ? value.availablePlayers :
      Array.isArray(value.available_players) ? value.available_players : []).map(normalizeRosterPlayer)
      .filter((item) => item.playerId)
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.playerId.localeCompare(b.playerId))),
    rounds: Object.freeze(value.rounds.map(normalizeRound).filter((item) => item.number > 0).sort((a, b) => a.number - b.number)),
    courses: Object.freeze(value.courses.map(normalizeCourse).filter((item) => item.roundNumber > 0).sort((a, b) => a.roundNumber - b.roundNumber)),
    availableCourseIdentities: Object.freeze((
      Array.isArray(value.availableCourseIdentities) ? value.availableCourseIdentities
        : Array.isArray(value.available_course_identities) ? value.available_course_identities
          : []
    ).map(normalizeCourseIdentity).filter((item) => item.courseId)
      .sort((left, right) => left.name.localeCompare(right.name) || left.courseId.localeCompare(right.courseId))),
    matches: Object.freeze(value.matches.map(normalizeMatch).filter((item) => item.matchId).sort((a, b) => a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber)),
    readiness: normalizeReadiness(value.readiness),
    capabilities: Object.freeze(capabilities),
    dependencies: Object.freeze({
      oddsPublished: safeBoolean(firstDefined(value.dependencies?.oddsPublished, value.dependencies?.odds_published)),
      netSkinsConfigured: safeBoolean(firstDefined(value.dependencies?.netSkinsConfigured, value.dependencies?.net_skins_configured)),
      calcuttaConfigured: safeBoolean(firstDefined(value.dependencies?.calcuttaConfigured, value.dependencies?.calcutta_configured)),
      draftPickCount: Math.max(0, safeInteger(firstDefined(value.dependencies?.draftPickCount, value.dependencies?.draft_pick_count))),
    }),
    audit: Object.freeze((Array.isArray(value.audit) ? value.audit : []).slice(0, 50).map((item) => Object.freeze({
      id: safeText(firstDefined(item.id, item.eventId, item.event_id), 100),
      action: safeCode(item.action, "UPDATED"),
      domain: safeCode(item.domain, "TOURNAMENT_SETUP"),
      target: safeText(firstDefined(item.target, item.targetId, item.target_id), 120),
      actor: safeText(firstDefined(item.actor, item.actorPlayerId, item.actor_player_id), 80),
      result: safeCode(item.result, "CHANGED"),
      timestamp: safeText(firstDefined(item.timestamp, item.occurredAt, item.occurred_at), 64),
      summary: safeText(firstDefined(item.summary, item.message), 300),
    }))),
    deferred: safeList(value.deferred),
  });
}

export function normalizeProductionTournamentSetupMutation(payload = {}) {
  const value = payload?.data || payload?.result || payload;
  if (!value || value.ok !== true) {
    throw contractError(
      safeCode(value?.code, "TOURNAMENT_SETUP_OPERATION_FAILED"),
      "The Tournament Setup change did not complete.",
      409,
    );
  }
  return Object.freeze({
    ok: true,
    code: safeCode(value.code, "TOURNAMENT_SETUP_UPDATED"),
    action: safeCode(value.action),
    revision: canonicalTournamentSetupRevision(value.revision),
    idempotent: safeBoolean(value.idempotent),
    target: safeText(firstDefined(value.target, value.targetId, value.target_id), 120),
    snapshotPrepared: safeBoolean(firstDefined(value.snapshotPrepared, value.snapshot_prepared)),
    readiness: value.readiness ? normalizeReadiness(value.readiness) : null,
    timestamp: safeText(firstDefined(value.timestamp, value.updatedAt, value.updated_at), 64),
  });
}
