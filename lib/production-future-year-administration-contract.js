export const PRODUCTION_FUTURE_YEAR_ADMINISTRATION_CONTRACT =
  "production-future-year-administration-v1";

export const PRODUCTION_FUTURE_YEAR_ADMINISTRATION_ACTIONS = Object.freeze([
  "create",
  "update",
  "configure-team",
  "replace-roster",
  "configure-round",
  "assign-course",
  "generate-match-structure",
  "mark-ready",
]);

export const PRODUCTION_FUTURE_YEAR_LIFECYCLES = Object.freeze([
  "DRAFT",
  "CONFIGURING",
  "READY_FOR_ACTIVATION",
  "ACTIVE",
  "CLOSED",
  "ARCHIVED",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID = /^[A-Z0-9][A-Z0-9_.:-]{0,95}$/;
const IANA_TIME_ZONE = /^[A-Za-z]+(?:[ _-]?[A-Za-z]+)*(?:\/[A-Za-z0-9_+.-]+)+$/;
const FORMATS = new Set(["BB", "SC", "SI"]);
const MEMBERSHIP_STATES = new Set(["ACTIVE", "INACTIVE", "WITHDRAWN"]);
const CREATION_MODES = new Set(["BLANK", "CLONE_STRUCTURE"]);
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

function safeBoolean(value) {
  return value === true || /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
}

function safeInteger(value, fallback = 0) {
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : fallback;
}

function safeDecimal(value) {
  const result = clean(value);
  return /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(result) ? result : "";
}

function safeCode(value, fallback = "") {
  const result = upper(value);
  return /^[A-Z][A-Z0-9_]{0,119}$/.test(result) ? result : fallback;
}

function safeBlockers(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.slice(0, 100).map((item) => {
    if (typeof item === "string") {
      return Object.freeze({ code: safeCode(item, "FUTURE_TOURNAMENT_NOT_READY"), section: "", message: safeText(item, 300), targetId: "" });
    }
    return Object.freeze({
      code: safeCode(item?.code, "FUTURE_TOURNAMENT_NOT_READY"),
      section: safeCode(item?.section),
      message: safeText(firstDefined(item?.message, item?.reason, item?.code), 300),
      targetId: safeText(firstDefined(item?.targetId, item?.target_id), 120),
    });
  }));
}

export function stableFutureYearAdministrationValue(value) {
  if (Array.isArray(value)) return value.map(stableFutureYearAdministrationValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      stableFutureYearAdministrationValue(value[key] === undefined ? null : value[key]),
    ]));
  }
  return value === undefined ? null : value;
}

export function canonicalFutureYearOperationId(value) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) {
    throw contractError(
      "FUTURE_YEAR_OPERATION_REQUEST_ID_REQUIRED",
      "A secure operation identity is required.",
    );
  }
  return result;
}

export function canonicalFutureYearRevision(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw contractError(
      "FUTURE_YEAR_REVISION_REQUIRED",
      "Refresh Future Tournaments before making this change.",
    );
  }
  return result;
}

export function canonicalFutureTournamentScope(tournamentId, tournamentYear) {
  const id = clean(tournamentId);
  const year = Number(tournamentYear ?? id);
  if (!/^\d{4}$/.test(id) || !Number.isSafeInteger(year) || year < 2027 || year > 2200 || id !== String(year)) {
    throw contractError(
      "FUTURE_YEAR_TARGET_TOURNAMENT_INVALID",
      "Select a valid future tournament year.",
    );
  }
  return Object.freeze({ tournamentId: id, tournamentYear: year });
}

export function canonicalOptionalFutureTournamentId(value) {
  const id = clean(value);
  if (!id) return "";
  return canonicalFutureTournamentScope(id, id).tournamentId;
}

function canonicalText(value, label, { minimum = 1, maximum = 240 } = {}) {
  const result = clean(value).replace(/\s+/g, " ");
  if (result.length < minimum || result.length > maximum || /[<>{}\u0000-\u001f\u007f]/.test(result)) {
    throw contractError("FUTURE_YEAR_TEXT_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

function canonicalDate(value, label) {
  const result = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw contractError("FUTURE_YEAR_DATE_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

function canonicalTimeZone(value) {
  const result = clean(value);
  if (result.length > 80 || !IANA_TIME_ZONE.test(result)) {
    throw contractError("FUTURE_YEAR_TIME_ZONE_INVALID", "Enter a valid IANA time zone.");
  }
  try { Intl.DateTimeFormat("en-US", { timeZone: result }); }
  catch { throw contractError("FUTURE_YEAR_TIME_ZONE_INVALID", "Enter a valid IANA time zone."); }
  return result;
}

function canonicalStableId(value, label) {
  const result = upper(value);
  if (!STABLE_ID.test(result)) {
    throw contractError("FUTURE_YEAR_STABLE_ID_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

function canonicalReason(value) {
  const result = clean(value).replace(/\s+/g, " ");
  if (result.length < 8 || result.length > 240 || /[\u0000-\u001f\u007f@]/.test(result) ||
      /\+[1-9][0-9]{7,14}|bearer\s|eyj[a-z0-9_-]{10,}|secret|token=/i.test(result)) {
    throw contractError("FUTURE_YEAR_REASON_REQUIRED", "Enter a concise non-sensitive reason.");
  }
  return result;
}

function boundedInteger(value, label, minimum, maximum) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw contractError("FUTURE_YEAR_NUMBER_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

function boundedDecimal(value, label, minimum, maximum) {
  const result = clean(value);
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(result) ||
      !Number.isFinite(Number(result)) || Number(result) < minimum || Number(result) > maximum) {
    throw contractError("FUTURE_YEAR_NUMBER_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

function canonicalMetadata(value, scope) {
  const startDate = canonicalDate(value.startDate, "Start date");
  const endDate = canonicalDate(value.endDate, "End date");
  if (startDate > endDate) {
    throw contractError("FUTURE_YEAR_DATE_RANGE_INVALID", "The tournament end date must not precede its start date.");
  }
  return {
    target_tournament_id: scope.tournamentId,
    tournament_year: scope.tournamentYear,
    tournament_name: canonicalText(value.name, "Tournament name", { maximum: 160 }),
    start_date: startDate,
    end_date: endDate,
    time_zone: canonicalTimeZone(value.timeZone),
    destination: canonicalText(value.destination, "Destination", { maximum: 160 }),
  };
}

function canonicalRoster(value) {
  if (!Array.isArray(value) || value.length > 128) {
    throw contractError("FUTURE_YEAR_ROSTER_INVALID", "Provide a valid reviewed tournament roster.");
  }
  const rows = value.map((item) => {
    const teamId = clean(firstDefined(item?.teamId, item?.team_id));
    const teamSideSource = firstDefined(item?.teamSide, item?.team_side);
    if (!teamId && teamSideSource !== undefined && teamSideSource !== null && clean(teamSideSource) !== "") {
      throw contractError("FUTURE_YEAR_ROSTER_TEAM_INVALID", "A team side requires a selected team.");
    }
    const status = upper(firstDefined(item?.participationStatus, item?.participation_status, "ACTIVE"));
    if (!MEMBERSHIP_STATES.has(status)) {
      throw contractError("FUTURE_YEAR_MEMBERSHIP_STATUS_INVALID", "Select a supported tournament membership status.");
    }
    return {
      player_id: canonicalStableId(firstDefined(item?.playerId, item?.player_id), "Player ID"),
      team_id: teamId ? canonicalStableId(teamId, "Team ID") : null,
      team_side: teamId ? boundedInteger(teamSideSource, "Team side", 1, 2) : null,
      participation_status: status,
    };
  }).sort((left, right) => left.player_id.localeCompare(right.player_id));
  if (new Set(rows.map((item) => item.player_id)).size !== rows.length) {
    throw contractError("FUTURE_YEAR_ROSTER_DUPLICATE_PLAYER", "A Player may appear only once in the reviewed roster.");
  }
  return rows;
}

function commonMutation(value) {
  return {
    expected_revision: canonicalFutureYearRevision(value.expectedRevision),
    operation_request_id: canonicalFutureYearOperationId(value.operationRequestId),
    reason: canonicalReason(value.reason),
  };
}

export function buildFutureYearAdministrationMutation(action, value = {}) {
  const selected = clean(action).toLowerCase();
  if (!PRODUCTION_FUTURE_YEAR_ADMINISTRATION_ACTIONS.includes(selected)) {
    throw contractError("FUTURE_YEAR_ACTION_INVALID", "Unsupported Future Tournament action.");
  }
  const scope = canonicalFutureTournamentScope(value.targetTournamentId, value.tournamentYear);
  const common = commonMutation(value);
  if (selected === "create") {
    if (common.expected_revision !== 0) {
      throw contractError("FUTURE_YEAR_CREATE_PREDECESSOR_INVALID", "A future tournament must be created from revision zero.");
    }
    const mode = upper(value.creationMode || "BLANK");
    if (!CREATION_MODES.has(mode)) {
      throw contractError("FUTURE_YEAR_CREATION_MODE_INVALID", "Select Start Blank or Clone Structure.");
    }
    const cloneSource = clean(value.cloneSourceTournamentId);
    if ((mode === "CLONE_STRUCTURE" && cloneSource !== "2026") || (mode === "BLANK" && cloneSource)) {
      throw contractError(
        "FUTURE_YEAR_CLONE_SOURCE_INVALID",
        "Structure cloning may use only the certified 2026 source and only in Clone Structure mode.",
      );
    }
    return {
      operation: "CREATE_TOURNAMENT",
      ...common,
      ...canonicalMetadata(value, scope),
      creation_mode: mode,
      clone_source_tournament_id: mode === "CLONE_STRUCTURE" ? "2026" : null,
    };
  }
  if (selected === "update") return {
    operation: "UPDATE_TOURNAMENT",
    ...common,
    ...canonicalMetadata(value, scope),
  };
  if (selected === "configure-team") {
    const captain = clean(value.captainPlayerId);
    return {
      operation: "CONFIGURE_TEAM",
      ...common,
      target_tournament_id: scope.tournamentId,
      team_id: canonicalStableId(value.teamId, "Team ID"),
      team_side: boundedInteger(value.teamSide, "Team side", 1, 2),
      team_name: canonicalText(value.teamName, "Team name", { maximum: 160 }),
      captain_player_id: captain ? canonicalStableId(captain, "Captain Player ID") : null,
      active: value.active === undefined ? true : value.active === true,
    };
  }
  if (selected === "replace-roster") return {
    operation: "REPLACE_ROSTER",
    ...common,
    target_tournament_id: scope.tournamentId,
    roster: canonicalRoster(value.roster),
  };
  if (selected === "configure-round") {
    const format = upper(value.format);
    if (!FORMATS.has(format)) {
      throw contractError("FUTURE_YEAR_FORMAT_INVALID", "Select Best Ball, Scramble, or Singles.");
    }
    const teamSize = boundedInteger(value.teamSize, "Team size", 1, 2);
    if ((format === "SI" && teamSize !== 1) || (format !== "SI" && teamSize !== 2)) {
      throw contractError("FUTURE_YEAR_FORMAT_TEAM_SIZE_INVALID", "The team size does not match the selected format.");
    }
    return {
      operation: "CONFIGURE_ROUND",
      ...common,
      target_tournament_id: scope.tournamentId,
      round_number: boundedInteger(value.roundNumber, "Round number", 1, 12),
      round_name: canonicalText(value.roundName, "Round name", { maximum: 160 }),
      format,
      team_size: teamSize,
      points_available: boundedDecimal(value.pointsAvailable, "Points available", 0, 100),
      handicap_allowance: boundedDecimal(value.handicapAllowance, "Handicap allowance", 0, 1),
    };
  }
  if (selected === "assign-course") {
    const sourceTournamentId = clean(value.sourceTournamentId);
    const sourceRoundNumber = firstDefined(value.sourceRoundNumber, value.source_round_number);
    if (sourceTournamentId && (!/^\d{4}$/.test(sourceTournamentId) || Number(sourceTournamentId) < 2017 || Number(sourceTournamentId) > 2026)) {
      throw contractError("FUTURE_YEAR_COURSE_SOURCE_INVALID", "Select a certified existing course reference.");
    }
    if ((sourceTournamentId && sourceRoundNumber == null) || (!sourceTournamentId && sourceRoundNumber != null)) {
      throw contractError("FUTURE_YEAR_COURSE_SOURCE_INVALID", "A source tournament and round must be supplied together.");
    }
    return {
      operation: "ASSIGN_COURSE",
      ...common,
      target_tournament_id: scope.tournamentId,
      round_number: boundedInteger(value.roundNumber, "Round number", 1, 12),
      course_id: canonicalStableId(value.courseId, "Course ID"),
      tee: canonicalText(value.tee, "Tee", { maximum: 100 }),
      source_tournament_id: sourceTournamentId || null,
      source_round_number: sourceTournamentId
        ? boundedInteger(sourceRoundNumber, "Source round number", 1, 12)
        : null,
    };
  }
  if (selected === "generate-match-structure") return {
    operation: "GENERATE_MATCH_STRUCTURE",
    ...common,
    target_tournament_id: scope.tournamentId,
    round_number: boundedInteger(value.roundNumber, "Round number", 1, 12),
    match_count: boundedInteger(value.matchCount, "Match count", 1, 64),
  };
  return {
    operation: "MARK_READY",
    ...common,
    target_tournament_id: scope.tournamentId,
  };
}

function normalizeTournament(value = {}) {
  const tournamentId = safeText(firstDefined(value.tournamentId, value.tournament_id, value.id), 32);
  return Object.freeze({
    tournamentId,
    tournamentYear: safeInteger(firstDefined(value.tournamentYear, value.tournament_year, value.year, tournamentId)),
    name: safeText(value.name, 160),
    lifecycle: safeCode(firstDefined(value.lifecycle, value.status), "DRAFT"),
    revision: Math.max(0, safeInteger(firstDefined(value.revision, value.setupRevision, value.setup_revision))),
    lifecycleRevision: Math.max(0, safeInteger(firstDefined(value.lifecycleRevision, value.lifecycle_revision))),
    destination: safeText(value.destination, 160),
    startDate: safeText(firstDefined(value.startDate, value.start_date), 32),
    endDate: safeText(firstDefined(value.endDate, value.end_date), 32),
    timeZone: safeText(firstDefined(value.timeZone, value.time_zone), 80),
    current: safeBoolean(firstDefined(value.current, value.isCurrent, value.is_current)),
    readinessState: safeCode(firstDefined(value.readinessState, value.readiness_state), "NEEDS_ATTENTION"),
    creationMode: safeCode(firstDefined(value.creationMode, value.creation_mode)),
    cloneSourceTournamentId: safeText(firstDefined(value.cloneSourceTournamentId, value.clone_source_tournament_id), 32),
  });
}

function normalizeCurrentTournament(value = {}) {
  const tournament = normalizeTournament(value);
  return Object.freeze({
    ...tournament,
    pointerRevision: Math.max(0, safeInteger(firstDefined(value.pointerRevision, value.pointer_revision))),
  });
}

function normalizeReadiness(value = {}) {
  const counts = value?.counts && typeof value.counts === "object" && !Array.isArray(value.counts)
    ? Object.fromEntries(Object.entries(value.counts).slice(0, 40).map(([key, count]) => [
      safeText(key, 80), Math.max(0, safeInteger(count)),
    ]))
    : {};
  return Object.freeze({
    readyForActivation: safeBoolean(firstDefined(value.readyForActivation, value.ready_for_activation, value.ready)),
    fingerprint: /^[0-9a-f]{64}$/i.test(clean(value.fingerprint)) ? clean(value.fingerprint).toLowerCase() : "",
    blockers: safeBlockers(value.blockers),
    counts: Object.freeze(counts),
  });
}

function normalizeCapabilities(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const enabled = (...keys) => keys.some((key) => safeBoolean(source[key]));
  return Object.freeze({
    createTournament: enabled("createTournament", "create_tournament"),
    cloneStructure: enabled("cloneStructure", "clone_structure"),
    editTournament: enabled("editTournament", "edit_tournament"),
    configureTeams: enabled("configureTeams", "configure_teams"),
    replaceRoster: enabled("replaceRoster", "replace_roster"),
    configureRounds: enabled("configureRounds", "configure_rounds"),
    assignExistingCourse: enabled("assignExistingCourse", "assign_existing_course"),
    generateMatchStructure: enabled("generateMatchStructure", "generate_match_structure"),
    markReady: enabled("markReady", "mark_ready"),
    activateTournament: false,
    closeTournament: false,
    archiveTournament: false,
    createGlobalCourse: false,
    runtimeMatchCreation: false,
    googleCompatibilityWriter: false,
  });
}

export function normalizeProductionFutureYearAdministrationPayload(payload = {}) {
  const value = payload?.data || payload?.result || payload;
  const contractVersion = safeText(firstDefined(value?.contractVersion, value?.contract_version), 120);
  if (contractVersion !== PRODUCTION_FUTURE_YEAR_ADMINISTRATION_CONTRACT || !Array.isArray(value?.catalog)) {
    throw contractError(
      "FUTURE_YEAR_RESPONSE_INVALID",
      "Future Tournament administration returned an invalid Production response.",
      503,
    );
  }
  const selectedSource = firstDefined(value.selectedTournament, value.selected_tournament);
  const selectedTournament = selectedSource ? normalizeTournament(selectedSource) : null;
  if (selectedTournament && Number(selectedTournament.tournamentYear) <= 2026) {
    throw contractError("FUTURE_YEAR_RESPONSE_INVALID", "Future Tournament administration returned an invalid target.", 503);
  }
  const activationSource = firstDefined(value.activationPlan, value.activation_plan) || {};
  return Object.freeze({
    contractVersion,
    currentTournament: normalizeCurrentTournament(firstDefined(value.currentTournament, value.current_tournament) || {}),
    selectedTournament,
    catalog: Object.freeze(value.catalog.map(normalizeTournament).filter((item) => item.tournamentId)
      .sort((left, right) => left.tournamentYear - right.tournamentYear)),
    playerCatalog: Object.freeze((Array.isArray(firstDefined(value.playerCatalog, value.player_catalog))
      ? firstDefined(value.playerCatalog, value.player_catalog) : []).map((item) => Object.freeze({
      playerId: safeText(firstDefined(item?.playerId, item?.player_id), 96),
      displayName: safeText(firstDefined(item?.displayName, item?.display_name), 160),
      status: safeCode(firstDefined(item?.status, item?.globalStatus, item?.global_status), "ACTIVE"),
    })).filter((item) => item.playerId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName) ||
        left.playerId.localeCompare(right.playerId))),
    courseLibrary: Object.freeze((Array.isArray(firstDefined(value.courseLibrary, value.course_library))
      ? firstDefined(value.courseLibrary, value.course_library) : []).map((item) => Object.freeze({
      courseId: safeText(firstDefined(item?.courseId, item?.course_id), 96),
      name: safeText(item?.name, 160),
      location: safeText(item?.location, 160),
      tees: Object.freeze((Array.isArray(item?.tees) ? item.tees : [])
        .map((tee) => safeText(tee, 100)).filter(Boolean)
        .filter((tee, index, values) => values.indexOf(tee) === index)
        .sort((left, right) => left.localeCompare(right))),
    })).filter((item) => item.courseId)
      .sort((left, right) => left.name.localeCompare(right.name) || left.courseId.localeCompare(right.courseId))),
    teams: Object.freeze((Array.isArray(value.teams) ? value.teams : []).map((item) => Object.freeze({
      teamId: safeText(firstDefined(item?.teamId, item?.team_id), 96),
      side: safeInteger(firstDefined(item?.side, item?.teamSide, item?.team_side)),
      name: safeText(item?.name, 160),
      captainPlayerId: safeText(firstDefined(item?.captainPlayerId, item?.captain_player_id), 96),
      active: item?.active === undefined ? true : safeBoolean(item.active),
    })).filter((item) => item.teamId)),
    roster: Object.freeze((Array.isArray(value.roster) ? value.roster : []).map((item) => Object.freeze({
      playerId: safeText(firstDefined(item?.playerId, item?.player_id), 96),
      displayName: safeText(firstDefined(item?.displayName, item?.display_name), 160),
      teamId: safeText(firstDefined(item?.teamId, item?.team_id), 96),
      teamSide: safeInteger(firstDefined(item?.teamSide, item?.team_side)),
      participationStatus: safeCode(firstDefined(item?.participationStatus, item?.participation_status), "ACTIVE"),
    })).filter((item) => item.playerId)),
    rounds: Object.freeze((Array.isArray(value.rounds) ? value.rounds : []).map((item) => Object.freeze({
      roundNumber: safeInteger(firstDefined(item?.roundNumber, item?.round_number)),
      name: safeText(item?.name, 160),
      format: safeCode(item?.format),
      teamSize: safeInteger(firstDefined(item?.teamSize, item?.team_size)),
      pointsAvailable: safeDecimal(firstDefined(item?.pointsAvailable, item?.points_available)),
      handicapAllowance: safeDecimal(firstDefined(item?.handicapAllowance, item?.handicap_allowance)),
    })).filter((item) => item.roundNumber > 0)),
    courseAssignments: Object.freeze((Array.isArray(firstDefined(value.courseAssignments, value.course_assignments))
      ? firstDefined(value.courseAssignments, value.course_assignments) : []).map((item) => Object.freeze({
      roundNumber: safeInteger(firstDefined(item?.roundNumber, item?.round_number)),
      courseId: safeText(firstDefined(item?.courseId, item?.course_id), 96),
      courseName: safeText(firstDefined(item?.courseName, item?.course_name), 160),
      tee: safeText(item?.tee, 100),
      complete: safeBoolean(item?.complete),
      sourceTournamentId: safeText(firstDefined(item?.sourceTournamentId, item?.source_tournament_id), 32),
      sourceSetupRevision: Math.max(0, safeInteger(firstDefined(item?.sourceSetupRevision, item?.source_setup_revision))),
      referenceStatus: safeCode(firstDefined(item?.referenceStatus, item?.reference_status)),
    }))),
    matchDefinitions: Object.freeze((Array.isArray(firstDefined(value.matchDefinitions, value.match_definitions))
      ? firstDefined(value.matchDefinitions, value.match_definitions) : []).map((item) => Object.freeze({
      matchId: safeText(firstDefined(item?.matchId, item?.match_id), 120),
      roundNumber: safeInteger(firstDefined(item?.roundNumber, item?.round_number)),
      matchNumber: safeInteger(firstDefined(item?.matchNumber, item?.match_number)),
      format: safeCode(item?.format),
      lifecycle: safeCode(firstDefined(item?.lifecycle, item?.status), "UPCOMING"),
      hasRuntimeMatch: safeBoolean(firstDefined(item?.hasRuntimeMatch, item?.has_runtime_match)),
      hasScoringSnapshot: safeBoolean(firstDefined(item?.hasScoringSnapshot, item?.has_scoring_snapshot)),
      hasScoringAccess: safeBoolean(firstDefined(item?.hasScoringAccess, item?.has_scoring_access)),
    }))),
    compatibilityJobs: Object.freeze((Array.isArray(firstDefined(value.compatibilityJobs, value.compatibility_jobs))
      ? firstDefined(value.compatibilityJobs, value.compatibility_jobs) : []).map((item) => Object.freeze({
      jobId: safeText(firstDefined(item?.jobId, item?.job_id), 120),
      matchId: safeText(firstDefined(item?.matchId, item?.match_id), 120),
      status: safeCode(item?.status, "NOT_REQUIRED"),
      requirementClass: safeCode(firstDefined(item?.requirementClass, item?.requirement_class)),
      writerInstalled: safeBoolean(firstDefined(item?.writerInstalled, item?.writer_installed)),
      requiredForActivation: safeBoolean(firstDefined(item?.requiredForActivation, item?.required_for_activation)),
      safeError: safeText(firstDefined(item?.safeError, item?.safe_error, item?.safeErrorCode, item?.safe_error_code), 240),
    }))),
    readiness: normalizeReadiness(value.readiness || {}),
    activationPlan: Object.freeze({
      status: safeCode(activationSource.status, "BLOCKED"),
      executable: false,
      code: safeCode(activationSource.code, "FUTURE_TOURNAMENT_ACTIVATION_NOT_INSTALLED"),
      blockers: safeBlockers(activationSource.blockers),
    }),
    capabilities: normalizeCapabilities(value.capabilities),
    audit: Object.freeze((Array.isArray(value.audit) ? value.audit : []).slice(0, 50).map((item) => Object.freeze({
      id: safeText(firstDefined(item?.id, item?.eventId, item?.event_id), 120),
      action: safeCode(item?.action, "UPDATED"),
      target: safeText(firstDefined(item?.target, item?.targetId, item?.target_id), 120),
      actor: safeText(firstDefined(item?.actor, item?.actorPlayerId, item?.actor_player_id), 96),
      result: safeCode(item?.result, "CHANGED"),
      timestamp: safeText(firstDefined(item?.timestamp, item?.occurredAt, item?.occurred_at), 64),
      summary: safeText(firstDefined(item?.summary, item?.message), 300),
    }))),
  });
}

export function normalizeProductionFutureYearAdministrationMutation(payload = {}) {
  const value = payload?.data || payload?.result || payload;
  if (!value || value.ok !== true) {
    throw contractError(
      safeCode(value?.code, "FUTURE_YEAR_OPERATION_FAILED"),
      "The Future Tournament change did not complete.",
      409,
    );
  }
  const targetTournamentId = canonicalOptionalFutureTournamentId(firstDefined(
    value.targetTournamentId,
    value.target_tournament_id,
  ));
  if (!targetTournamentId) {
    throw contractError("FUTURE_YEAR_RESPONSE_INVALID", "The Future Tournament receipt is incomplete.", 503);
  }
  return Object.freeze({
    ok: true,
    code: safeCode(value.code, "PRODUCTION_FUTURE_YEAR_OPERATION_COMPLETED"),
    operation: safeCode(firstDefined(value.operation, value.action)),
    idempotent: safeBoolean(value.idempotent),
    targetTournamentId,
    revision: canonicalFutureYearRevision(value.revision),
    lifecycle: safeCode(value.lifecycle, "DRAFT"),
    receiptId: safeText(firstDefined(value.receiptId, value.receipt_id), 120),
    readiness: normalizeReadiness(value.readiness || {}),
  });
}
