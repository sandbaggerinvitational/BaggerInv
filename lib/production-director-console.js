import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => value === true || /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

export const PRODUCTION_DIRECTOR_SECTIONS = Object.freeze([
  Object.freeze({ id: "overview", label: "Overview", href: "/admin/director" }),
  Object.freeze({ id: "handicaps", label: "Handicaps", href: "/admin/director?section=handicaps" }),
  Object.freeze({ id: "tournament-day", label: "Tournament Day", href: "/admin/director?section=tournament-day" }),
  Object.freeze({ id: "odds-side-games", label: "Odds & Side Games", href: "/admin/director?section=odds-side-games" }),
  Object.freeze({ id: "draft-guide", label: "Draft & Guide", href: "/admin/director?section=draft-guide" }),
  Object.freeze({ id: "system-audit", label: "System / Audit", href: "/admin/director?section=system-audit" }),
]);

export function productionDirectorSection(value) {
  const selected = clean(value).toLowerCase();
  return PRODUCTION_DIRECTOR_SECTIONS.some((section) => section.id === selected)
    ? selected
    : "overview";
}

export function productionDirectorAuthorizationFailure(authorization = {}) {
  if (authorization.status === "unavailable") {
    return Object.freeze({
      status: 503,
      code: "DIRECTOR_AUTHORIZATION_UNAVAILABLE",
      message: "Director access could not be verified right now. Please try again.",
      retryable: true,
    });
  }
  return Object.freeze({
    status: 403,
    code: "DIRECTOR_AUTHORIZATION_REQUIRED",
    message: "Active Tournament Director access is required.",
    retryable: false,
  });
}

function productionDirectorDataError(error) {
  const result = new Error("Production tournament data is temporarily unavailable.");
  result.code = "DIRECTOR_DATA_UNAVAILABLE";
  result.status = 503;
  result.causeCode = clean(error?.code || error?.causeCode || "PRODUCTION_DIRECTOR_READ_FAILED");
  return result;
}

function resultPayload(result) {
  if (!result || typeof result !== "object") return null;
  return result.payload?.data ?? result.payload ?? result.data ?? result;
}

function successfulPayload(result) {
  const payload = resultPayload(result);
  if (!payload || typeof payload !== "object") return null;
  if (result?.payload && result.payload.ok !== true) return null;
  if (Object.hasOwn(payload, "ok") && payload.ok !== true) return null;
  return payload;
}

function optionalRead(settled) {
  if (settled?.status !== "fulfilled") return { available: false, data: null };
  const data = successfulPayload(settled.value);
  return { available: Boolean(data), data };
}

function stateValue(source, ...keys) {
  for (const key of keys) if (source && Object.hasOwn(source, key)) return source[key];
  return undefined;
}

function rosterCount(view = {}, enrollment = null) {
  const enrolledTotal = stateValue(enrollment, "activeRosterCount", "active_roster_count");
  if (Number.isFinite(Number(enrolledTotal))) return Number(enrolledTotal);
  return (view.players || []).filter((player) =>
    upper(player.participation_status || player.status || "ACTIVE") === "ACTIVE").length;
}

function currentRound(live = {}) {
  const numberValue = number(live.tournament?.currentRound, 0);
  const round = (live.rounds || []).find((item) => number(item.number) === numberValue) || null;
  return {
    number: numberValue || null,
    label: clean(round?.label || (numberValue ? `Round ${numberValue}` : "Not started")),
    status: upper(round?.status || live.tournament?.status || "UPCOMING"),
    format: clean(round?.format),
  };
}

function authorityModel(readState = {}, workers = null) {
  const scoring = upper(stateValue(readState, "scoring_authority", "scoringAuthority"));
  const reads = upper(stateValue(readState, "current_tournament_read_authority", "currentTournamentReadAuthority"));
  const identity = upper(stateValue(readState, "participant_identity_authority", "participantIdentityAuthority"));
  const workerIngress = stateValue(workers, "ingress") || {};
  const ingress = upper(workerIngress.state || stateValue(readState, "scoring_ingress_state", "scoringIngressState") ||
    (truthy(stateValue(readState, "scoring_ingress_enabled", "scoringIngressEnabled")) ? "OPEN" : "PAUSED"));
  const activation = upper(stateValue(readState, "activation_state", "activationState"));
  const maintenance = upper(stateValue(readState, "maintenance_state", "maintenanceState"));
  const maintenanceNormal = maintenance === "NORMAL" || (!maintenance && ingress === "OPEN" &&
    (!activation || ["ACTIVE", "OBSERVATION", "SCORING_COMMITTED"].includes(activation)));
  return {
    scoring: { value: scoring || "UNAVAILABLE", label: scoring === "SUPABASE" ? "Supabase" : "Needs attention" },
    reads: { value: reads || "UNAVAILABLE", label: reads === "SUPABASE" ? "Supabase" : "Needs attention" },
    identity: { value: identity || "UNAVAILABLE", label: identity === "SUPABASE" ? "Supabase" : "Needs attention" },
    ingress: { value: ingress || "UNAVAILABLE", label: ingress === "OPEN" ? "Open" : "Paused" },
    maintenance: {
      value: maintenanceNormal ? "NORMAL" : "ATTENTION",
      label: maintenanceNormal ? "Normal" : "Attention",
    },
    phase: clean(stateValue(readState, "read_cutover_phase", "readCutoverPhase")),
  };
}

function enrollmentModel(enrollment = null, view = {}) {
  if (!enrollment) {
    const total = rosterCount(view, null);
    return { available: false, total, enrolled: 0, pending: total, invalid: 0, state: "UNAVAILABLE" };
  }
  const total = number(stateValue(enrollment, "activeRosterCount", "active_roster_count"));
  const enrolled = number(stateValue(enrollment, "enrolledCount", "enrolled_count"));
  const pending = number(stateValue(enrollment, "notEnrolledCount", "not_enrolled_count"), Math.max(0, total - enrolled));
  const invalid = number(stateValue(enrollment, "invalidEnrolledCount", "invalid_enrolled_count"));
  return {
    available: true,
    total,
    enrolled,
    pending,
    invalid,
    state: invalid > 0 ? "ATTENTION" : pending > 0 ? "IN_PROGRESS" : "READY",
  };
}

function workerModel(readState = {}, workers = null) {
  if (!workers) return { available: false, enabled: false, healthy: false, state: "UNAVAILABLE", items: [], pending: 0 };
  const controls = stateValue(workers, "worker_controls", "workerControls") || {};
  const items = Object.entries(controls).map(([id, control]) => ({
    id: clean(id),
    enabled: control?.enabled === true,
    scheduled: control?.scheduler_installed === true || control?.schedulerInstalled === true,
  }));
  const counts = [
    stateValue(workers, "outbox_counts", "outboxCounts") || {},
    stateValue(workers, "archive_counts", "archiveCounts") || {},
  ];
  const pending = counts.reduce((total, count) => total + Object.entries(count).reduce((subtotal, [status, amount]) =>
    ["DELIVERED", "COMPLETE", "COMPLETED"].includes(upper(status)) ? subtotal : subtotal + number(amount), 0), 0);
  const globallyEnabled = truthy(stateValue(readState, "workers_enabled", "workersEnabled"));
  const enabled = globallyEnabled && items.length > 0 && items.every((item) => item.enabled);
  return {
    available: true,
    enabled,
    healthy: enabled && pending === 0,
    state: !enabled ? "ATTENTION" : pending > 0 ? "WORKING" : "HEALTHY",
    items,
    pending,
  };
}

function oddsModel(odds = null) {
  if (!odds) return { available: false, state: "UNAVAILABLE", label: "Unavailable", publishedAt: "" };
  const rows = Array.isArray(odds.snapshots) ? odds.snapshots : [];
  const current = rows.find((row) => row?.is_current_official === true) || null;
  return {
    available: true,
    state: current ? "PUBLISHED" : rows.length ? "ATTENTION" : "NOT_PUBLISHED",
    label: current ? "Published" : rows.length ? "Review required" : "Not published",
    publishedAt: clean(current?.published_at || current?.payload?.publishedAt),
    milestone: clean(current?.milestone || current?.payload?.phase),
  };
}

function sideGameModel(result, property) {
  if (!result) return { available: false, state: "UNAVAILABLE", label: "Unavailable" };
  const state = upper(result[property]?.state || "UNAVAILABLE");
  const labels = {
    NOT_CONFIGURED: "Not configured",
    CONFIGURED: "Configured",
    IN_PROGRESS: "In progress",
    OFFICIAL: "Official",
    PUBLISHED: "Published",
    OPEN: "Open",
    CLOSED: "Closed",
    SETTLED: "Settled",
    UNAVAILABLE: "Unavailable",
  };
  return {
    available: result[property]?.available !== false && state !== "UNAVAILABLE",
    state,
    label: labels[state] || state.toLowerCase().replaceAll("_", " "),
    stale: result[property]?.stale === true,
  };
}

function recentActivity(view = {}) {
  return (view.matches || []).flatMap((entry) => {
    const match = entry.match || {};
    const updatedAt = clean(match.updated_at || match.finalized_at || match.started_at);
    if (!updatedAt) return [];
    return [{
      id: clean(match.match_id || `${match.round_number || "round"}-${match.match_number || "match"}`),
      label: `Round ${number(match.round_number)} · Match ${clean(match.match_number || match.match_id || "updated")}`,
      status: upper(match.status || "UPDATED"),
      updatedAt,
    }];
  }).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 6);
}

function readinessIssues({ authority, enrollment, workers, optional }) {
  const issues = [];
  for (const [key, title] of [["scoring", "Scoring authority"], ["reads", "Tournament reads"], ["identity", "Participant identity"]]) {
    if (authority[key].value !== "SUPABASE") issues.push({ id: `authority-${key}`, level: "action", title, message: "This Production authority needs attention before tournament operations continue." });
  }
  if (authority.ingress.value !== "OPEN") issues.push({ id: "ingress", level: "action", title: "Scoring is paused", message: "Scoring ingress is not open. Review System / Audit before tournament play." });
  if (!enrollment.available) issues.push({ id: "enrollment-unavailable", level: "warning", title: "Enrollment summary unavailable", message: "Participant enrollment could not be loaded. Tournament data remains available." });
  else if (enrollment.invalid > 0) issues.push({ id: "enrollment-invalid", level: "action", title: "Enrollment needs review", message: `${enrollment.invalid} participant enrollment ${enrollment.invalid === 1 ? "record needs" : "records need"} attention.` });
  else if (enrollment.pending > 0) issues.push({ id: "enrollment-pending", level: "info", title: "Participant enrollment in progress", message: `${enrollment.pending} of ${enrollment.total} active participants ${enrollment.pending === 1 ? "has" : "have"} not enrolled yet.` });
  if (!workers.available) issues.push({ id: "workers-unavailable", level: "warning", title: "Worker status unavailable", message: "Background processing status could not be confirmed." });
  else if (!workers.enabled) issues.push({ id: "workers-disabled", level: "action", title: "Background workers need attention", message: "One or more required Production workers are not enabled." });
  else if (workers.pending > 0) issues.push({ id: "workers-pending", level: "info", title: "Background work in progress", message: `${workers.pending} background ${workers.pending === 1 ? "item is" : "items are"} pending.` });
  for (const [id, label] of [["odds", "Odds publication"], ["netSkins", "Net Skins"], ["calcutta", "Calcutta"]]) {
    if (!optional[id].available) issues.push({ id: `${id}-unavailable`, level: "warning", title: `${label} unavailable`, message: `${label} status could not be loaded. Other Director data remains available.` });
  }
  return issues;
}

export function buildProductionDirectorOverview({
  view = {},
  live = {},
  readState = {},
  enrollment = null,
  workers = null,
  odds = null,
  netSkins = null,
  calcutta = null,
  handicaps = null,
} = {}) {
  const authority = authorityModel(readState, workers);
  const enrollmentSummary = enrollmentModel(enrollment, view);
  const workerSummary = workerModel(readState, workers);
  const optional = {
    odds: oddsModel(odds),
    netSkins: sideGameModel(netSkins, "netSkinsState"),
    calcutta: sideGameModel(calcutta, "calcuttaState"),
  };
  const round = currentRound(live);
  return {
    mode: "production",
    navigation: PRODUCTION_DIRECTOR_SECTIONS,
    tournament: {
      id: clean(live.tournament?.id || view.tournament?.tournament_id || PRODUCTION_TOURNAMENT_ID),
      year: number(live.tournament?.year || view.tournament?.tournament_year),
      name: clean(live.tournament?.name || view.tournament?.name || "Sandbagger Invitational"),
      destination: clean(live.tournament?.location),
      dates: clean(live.tournament?.dates),
      status: upper(live.tournament?.status || "UPCOMING"),
      rosterCount: rosterCount(view, enrollment),
      currentRound: round,
    },
    authority,
    enrollment: enrollmentSummary,
    workers: workerSummary,
    handicaps: {
      available: Boolean(handicaps),
      currentRevision: handicaps
        ? number(stateValue(handicaps, "current_revision", "revision_number", "revision"), 0) || null
        : null,
    },
    publications: optional,
    readinessIssues: readinessIssues({ authority, enrollment: enrollmentSummary, workers: workerSummary, optional }),
    recentActivity: recentActivity(view),
    capabilities: {
      legacyProductionEditors: false,
      previewTools: false,
      productionOverview: true,
      handicapManagement: true,
    },
  };
}

async function defaultDependencies() {
  const [tournament, identity, readControl, scoring, odds, netSkins, calcutta, handicaps] = await Promise.all([
    import("./tournament-live-supabase.js"),
    import("./participant-identity-supabase.js"),
    import("./production-cutover-read-control.js"),
    import("./production-scoring-operations-server.js"),
    import("./published-odds-supabase.js"),
    import("./production-net-skins-v1.js"),
    import("./production-calcutta-v1.js"),
    import("./production-handicap-management-server.js"),
  ]);
  return {
    readTournamentLiveView: tournament.readTournamentLiveView,
    tournamentLiveDataFromSupabaseView: tournament.tournamentLiveDataFromSupabaseView,
    inspectEnrollment: identity.inspectProductionParticipantIdentityEnrollment,
    inspectReadState: readControl.inspectProductionCutoverReadState,
    inspectWorkers: (options) => scoring.productionScoringOperationsRpc("inspect_production_scoring_workers", {}, options),
    readOdds: odds.readPublishedOddsView,
    readNetSkins: netSkins.currentProductionNetSkinsV1,
    readCalcutta: calcutta.currentProductionCalcuttaV1,
    readHandicaps: handicaps.readProductionHandicapCurrent,
  };
}

function completeDependencies(dependencies = {}) {
  return [
    "readTournamentLiveView",
    "tournamentLiveDataFromSupabaseView",
    "inspectEnrollment",
    "inspectReadState",
    "inspectWorkers",
    "readOdds",
    "readNetSkins",
    "readCalcutta",
  ].every((name) => typeof dependencies[name] === "function");
}

/**
 * Reads the Production console only from the current Supabase read, identity,
 * and runtime contracts. Optional status panels fail independently so a side
 * game outage does not hide the active tournament.
 */
export async function readProductionDirectorOverview({
  env = process.env,
  dependencies = {},
  actorAuthUserId,
  actorPlayerId,
} = {}) {
  const adapters = completeDependencies(dependencies)
    ? dependencies
    : { ...(await defaultDependencies()), ...dependencies };
  const settled = await Promise.allSettled([
    adapters.readTournamentLiveView(PRODUCTION_TOURNAMENT_ID, { env }),
    adapters.inspectReadState({ env }),
    adapters.inspectEnrollment({ env }),
    adapters.inspectWorkers({ env }),
    adapters.readOdds({ tournamentId: PRODUCTION_TOURNAMENT_ID, sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID }, { env }),
    adapters.readNetSkins({ env }),
    adapters.readCalcutta({ env }),
    typeof adapters.readHandicaps === "function"
      ? adapters.readHandicaps({ actorAuthUserId, actorPlayerId }, { env })
      : Promise.resolve(null),
  ]);
  const [liveRead, readStateRead, enrollmentRead, workersRead, oddsRead, netSkinsRead, calcuttaRead, handicapRead] = settled;
  if (liveRead.status !== "fulfilled" || readStateRead.status !== "fulfilled") {
    throw productionDirectorDataError(liveRead.reason || readStateRead.reason);
  }
  const view = successfulPayload(liveRead.value);
  const readState = successfulPayload(readStateRead.value);
  if (!view || !readState) throw productionDirectorDataError({ code: "PRODUCTION_DIRECTOR_CORE_READ_INCOMPLETE" });
  let live;
  try {
    live = adapters.tournamentLiveDataFromSupabaseView(view);
  } catch (error) {
    throw productionDirectorDataError(error);
  }
  return buildProductionDirectorOverview({
    view,
    live,
    readState,
    enrollment: optionalRead(enrollmentRead).data,
    workers: optionalRead(workersRead).data,
    odds: optionalRead(oddsRead).data,
    netSkins: netSkinsRead.status === "fulfilled" ? netSkinsRead.value : null,
    calcutta: calcuttaRead.status === "fulfilled" ? calcuttaRead.value : null,
    handicaps: optionalRead(handicapRead).data,
  });
}
