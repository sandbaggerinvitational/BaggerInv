import { createHash } from "node:crypto";

import { canonicalProductionPlayerId } from "./production-player-access-contract.js";

export const PRODUCTION_ACCESS_GOVERNANCE_CONTRACT = "production-access-governance-v1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HUMAN_NAME = /^[A-Za-z](?:[A-Za-z.' -]*[A-Za-z.])?$/;
const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

function governanceError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value === undefined ? null : value;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function safeText(value, maximum = 160) {
  return clean(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maximum);
}

function safeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function safeBoolean(value) {
  return value === true || /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
}

function safeCode(value, fallback = "") {
  const code = upper(value);
  return /^[A-Z][A-Z0-9_]{1,119}$/.test(code) ? code : fallback;
}

function safeStringArray(value, maximum = 24) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map((item) => {
    if (typeof item === "string") return safeText(item, 240);
    return safeText(firstDefined(item?.message, item?.label, item?.code, item?.reason), 240);
  }).filter(Boolean).slice(0, maximum));
}

function dependencyCount(source, ...keys) {
  for (const key of keys) {
    if (!Object.hasOwn(source, key)) continue;
    const value = Number(source[key]);
    if (Number.isSafeInteger(value) && value >= 0) return value;
  }
  return 0;
}

function normalizeDependencyCounts(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.freeze({
    matchAssignments: dependencyCount(source, "matchAssignments", "match_assignments", "assignedMatchCount"),
    activeMatches: dependencyCount(source, "activeMatches", "active_matches", "live_matches"),
    finalizedMatches: dependencyCount(source, "finalizedMatches", "finalized_matches"),
    scoringActivity: dependencyCount(source, "scoringActivity", "scoring_activity", "score_mutations", "competitionDependencyCount"),
    scoringSnapshots: dependencyCount(source, "scoringSnapshots", "scoring_snapshots", "scoringSnapshotCount"),
    unstartedPairings: dependencyCount(source, "unstartedPairings", "unstarted_pairings", "unstartedPairingCount"),
    netSkins: dependencyCount(source, "netSkins", "net_skins"),
    calcutta: dependencyCount(source, "calcutta"),
    draft: dependencyCount(source, "draft", "draft_picks", "currentDraftPickCount"),
    completedHistory: dependencyCount(source, "completedHistory", "completed_history", "completedHistoryAppearanceCount"),
  });
}

export function productionAccessGovernancePayloadHash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function canonicalProductionGovernanceOperationId(value) {
  const operationId = clean(value).toLowerCase();
  if (!UUID.test(operationId)) {
    throw governanceError(
      "ACCESS_GOVERNANCE_OPERATION_REQUEST_ID_REQUIRED",
      "A secure operation identity is required.",
    );
  }
  return operationId;
}

export function canonicalProductionGovernanceRevision(
  value,
  code = "ACCESS_GOVERNANCE_REVISION_REQUIRED",
  message = "Refresh Players & Access before making this change.",
) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw governanceError(
      code,
      message,
    );
  }
  return revision;
}

export function canonicalProductionGovernancePlayerId(value) {
  return canonicalProductionPlayerId(value);
}

export function canonicalProductionGovernanceName(value, label = "Player name") {
  const name = clean(value).replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80 || !HUMAN_NAME.test(name)) {
    throw governanceError(
      "ACCESS_GOVERNANCE_PLAYER_NAME_INVALID",
      `Enter a valid ${label.toLowerCase()}.`,
    );
  }
  return name;
}

export function canonicalProductionGovernanceDisplayName(value) {
  const displayName = clean(value).replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 160 || /[<>{}\u0000-\u001f\u007f]/.test(displayName)) {
    throw governanceError(
      "ACCESS_GOVERNANCE_DISPLAY_NAME_INVALID",
      "Enter a valid Player display name.",
    );
  }
  return displayName;
}

export function canonicalProductionGovernanceSlug(value, fallbackValue = "") {
  const supplied = clean(value);
  const slug = supplied
    ? supplied.toLowerCase()
    : clean(fallbackValue)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  if (slug.length < 2 || slug.length > 120 || !SLUG.test(slug)) {
    throw governanceError(
      "ACCESS_GOVERNANCE_PLAYER_SLUG_INVALID",
      "Use a unique lowercase profile slug containing letters, numbers, and hyphens.",
    );
  }
  return slug;
}

export function canonicalProductionGovernanceGlobalStatus(value) {
  const status = upper(value);
  if (!["ACTIVE", "ALUMNI"].includes(status)) {
    throw governanceError(
      "ACCESS_GOVERNANCE_GLOBAL_STATUS_INVALID",
      "Select Active or Alumni.",
    );
  }
  return status;
}

export function canonicalProductionGovernanceReason(value) {
  const reason = clean(value).replace(/\s+/g, " ");
  if (reason.length < 10 || reason.length > 240 || /[\u0000-\u001f\u007f@]/.test(reason) ||
      /\+[1-9][0-9]{7,14}|bearer\s|eyj[a-z0-9_-]{10,}|secret|token=/i.test(reason)) {
    throw governanceError(
      "ACCESS_GOVERNANCE_REASON_REQUIRED",
      "Enter a concise non-sensitive reason.",
    );
  }
  return reason;
}

export function canonicalProductionGovernanceConfirmation(value) {
  if (value !== true) {
    throw governanceError(
      "ACCESS_GOVERNANCE_CONFIRMATION_REQUIRED",
      "Confirm this high-impact access change before continuing.",
    );
  }
  return true;
}

function normalizeGovernanceProfile(value = {}, actions = {}) {
  return Object.freeze({
    firstName: safeText(firstDefined(value.firstName, value.first_name), 80),
    lastName: safeText(firstDefined(value.lastName, value.last_name), 80),
    slug: safeText(firstDefined(value.slug, value.profileSlug, value.profile_slug), 120).toLowerCase(),
    globalStatus: safeCode(firstDefined(value.globalStatus, value.global_status), "ACTIVE"),
    revision: safeRevision(firstDefined(
      value.revision,
      value.profileRevision,
      value.profile_revision,
      value.globalStatusRevision,
      value.global_status_revision,
    )),
    canSetGlobalStatus: safeBoolean(firstDefined(
      value.canSetGlobalStatus,
      value.can_set_global_status,
      actions.setGlobalStatus,
      actions.set_global_status,
    )),
    statusBlocker: safeCode(firstDefined(value.statusBlocker, value.status_blocker)),
  });
}

function normalizeGovernanceMembership(value = {}, actions = {}) {
  const dependencies = firstDefined(value.dependencyCounts, value.dependency_counts, value.dependencies) || {};
  const blockers = firstDefined(
    value.blockers,
    value.blocker_codes,
    value.blockerCodes,
    dependencies.hardBlockers,
    dependencies.hard_blockers,
  );
  const readiness = firstDefined(
    value.readiness,
    value.readiness_items,
    value.readinessItems,
    dependencies.warnings,
  );
  const readinessItems = safeStringArray(Array.isArray(readiness) ? readiness : readiness ? [readiness] : []);
  return Object.freeze({
    exists: safeBoolean(firstDefined(value.exists, value.membership_exists, value.membershipExists)),
    status: safeCode(firstDefined(value.status, value.membership_status, value.membershipStatus), "NOT_PLAYING"),
    revision: safeRevision(firstDefined(value.revision, value.membership_revision, value.membershipRevision)),
    teamId: safeText(firstDefined(value.teamId, value.team_id), 64),
    teamName: safeText(firstDefined(value.teamName, value.team_name), 160),
    teamSide: safeText(firstDefined(value.teamSide, value.team_side), 40),
    canAdd: safeBoolean(firstDefined(value.canAdd, value.can_add, value.addSupported, value.add_supported)),
    canWithdraw: safeBoolean(firstDefined(value.canWithdraw, value.can_withdraw, actions.withdrawMembership, actions.withdraw_membership)),
    canReactivate: safeBoolean(firstDefined(value.canReactivate, value.can_reactivate, actions.reactivateMembership, actions.reactivate_membership)),
    blockers: safeStringArray(blockers),
    readiness: readinessItems,
    readinessMessage: readinessItems[0] || "",
    dependencyCounts: normalizeDependencyCounts(dependencies),
  });
}

function normalizeGovernancePlayer(value = {}) {
  const playerId = upper(firstDefined(value.playerId, value.player_id, value.id));
  const governance = value.governance || {};
  const actions = value.governanceActions || value.governance_actions || {};
  return Object.freeze({
    playerId: /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(playerId) ? playerId : "",
    displayName: safeText(firstDefined(value.displayName, value.display_name), 160),
    profile: normalizeGovernanceProfile(value.profile || value, actions),
    membership: normalizeGovernanceMembership(value.membership || {}, actions),
    governance: Object.freeze({
      ownerStatus: safeCode(firstDefined(
        governance.ownerStatus,
        governance.owner_status,
        value.ownerStatus,
        value.owner_status,
        safeBoolean(value.owner) ? "ACTIVE" : "NONE",
      ), "NONE"),
      directorStatus: safeCode(firstDefined(
        governance.directorStatus,
        governance.director_status,
        value.directorStatus,
        value.director_status,
      )),
      canGrant: safeBoolean(firstDefined(governance.canGrant, governance.can_grant, actions.grantDirector, actions.grant_director)),
      canRevoke: safeBoolean(firstDefined(governance.canRevoke, governance.can_revoke, actions.revokeDirector, actions.revoke_director)),
      blockers: safeStringArray(firstDefined(governance.blockers, governance.blocker_codes)),
    }),
  });
}

function normalizeGovernanceCapabilities(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const enabled = (...keys) => keys.some((key) => safeBoolean(source[key]));
  return Object.freeze({
    "create-player": enabled("createPlayer", "create_player", "create-player", "createGlobalPlayer"),
    "set-global-status": enabled("setGlobalStatus", "set_global_status", "set-global-status"),
    "withdraw-membership": enabled("withdrawMembership", "withdraw_membership", "withdraw-membership"),
    "reactivate-membership": enabled("reactivateMembership", "reactivate_membership", "reactivate-membership", "createMembership"),
    "grant-director": enabled("grantDirector", "grant_director", "grant-director"),
    "revoke-director": enabled("revokeDirector", "revoke_director", "revoke-director"),
  });
}

function normalizeGovernanceAuditEntry(value = {}) {
  return Object.freeze({
    id: safeText(firstDefined(value.id, value.eventId, value.event_id), 100),
    action: safeCode(firstDefined(value.action, value.event_type, value.eventType), "UPDATED"),
    targetPlayerId: upper(firstDefined(value.targetPlayerId, value.target_player_id, value.playerId, value.player_id)),
    actorDisplayName: safeText(firstDefined(
      value.actorDisplayName,
      value.actor_display_name,
      value.actorPlayerId,
      value.actor_player_id,
    ), 160),
    result: safeCode(value.result, "SUCCEEDED"),
    timestamp: safeText(firstDefined(value.timestamp, value.occurredAt, value.occurred_at, value.created_at), 64),
    summary: safeText(firstDefined(value.summary, value.safe_summary, value.message), 240),
  });
}

function normalizeDeferredItem(value) {
  if (typeof value === "string") {
    return Object.freeze({ id: safeText(value, 100), label: safeText(value, 160), reason: "Coming Soon" });
  }
  return Object.freeze({
    id: safeText(firstDefined(value?.id, value?.key, value?.code), 100),
    label: safeText(firstDefined(value?.label, value?.title, value?.id, value?.code), 160),
    reason: safeText(firstDefined(value?.reason, value?.message), 240) || "Coming Soon",
  });
}

function normalizeReadinessProjection(value) {
  if (!value) return Object.freeze({ summary: "", blockers: Object.freeze([]), warnings: Object.freeze([]), dependencyCounts: normalizeDependencyCounts() });
  if (typeof value === "string" || Array.isArray(value)) {
    const warnings = safeStringArray(Array.isArray(value) ? value : [value]);
    return Object.freeze({
      summary: warnings[0] || "",
      blockers: Object.freeze([]),
      warnings,
      dependencyCounts: normalizeDependencyCounts(),
    });
  }
  const blockers = safeStringArray(firstDefined(value.hardBlockers, value.hard_blockers, value.blockers));
  const warnings = safeStringArray(firstDefined(value.warnings, value.items, value.readiness));
  return Object.freeze({
    summary: safeText(firstDefined(value.summary, value.message), 240) || blockers[0] || warnings[0] || "",
    blockers,
    warnings,
    dependencyCounts: normalizeDependencyCounts(firstDefined(
      value.dependencyCounts,
      value.dependency_counts,
      value,
    )),
  });
}

export function normalizeProductionAccessGovernancePayload(payload = {}) {
  const value = payload?.data || payload?.result || payload;
  const contractVersion = safeText(firstDefined(value?.contractVersion, value?.contract_version), 120);
  const revision = Number(value?.revision);
  if (contractVersion !== PRODUCTION_ACCESS_GOVERNANCE_CONTRACT ||
      !Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(value?.players)) {
    throw governanceError(
      "ACCESS_GOVERNANCE_RESPONSE_INVALID",
      "Access governance returned an invalid Production response.",
      503,
    );
  }
  const actor = value.actor || {};
  const players = value.players.map(normalizeGovernancePlayer).filter((player) => player.playerId)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
  const membershipAddSource = value.membershipAdd || value.membership_add || {};
  const membershipAdd = Object.freeze({
    supported: safeBoolean(membershipAddSource.supported),
    state: safeCode(membershipAddSource.state, "TEAM_ASSIGNMENT_REQUIRED"),
    reason: safeText(membershipAddSource.reason, 240),
  });
  const deferred = (Array.isArray(value.deferred) ? value.deferred : []).map(normalizeDeferredItem);
  if (!membershipAdd.supported && membershipAdd.reason) {
    deferred.push(Object.freeze({
      id: "tournament-membership-add",
      label: "Add to Tournament",
      reason: membershipAdd.reason,
    }));
  }
  return Object.freeze({
    contractVersion,
    revision,
    actor: Object.freeze({
      playerId: upper(firstDefined(actor.playerId, actor.player_id)),
      owner: safeBoolean(firstDefined(actor.owner, actor.isOwner, actor.is_owner)),
      ownerAdoptionRequired: safeBoolean(firstDefined(
        actor.ownerAdoptionRequired,
        actor.owner_adoption_required,
        value.ownerAdoptionRequired,
        value.owner_adoption_required,
      )),
    }),
    ownerAdoptionRequired: safeBoolean(firstDefined(
      value.ownerAdoptionRequired,
      value.owner_adoption_required,
      actor.ownerAdoptionRequired,
      actor.owner_adoption_required,
    )),
    capabilities: normalizeGovernanceCapabilities(value.capabilities || {}),
    membershipAdd,
    players: Object.freeze(players),
    audit: Object.freeze((Array.isArray(value.audit) ? value.audit : []).map(normalizeGovernanceAuditEntry).slice(0, 50)),
    deferred: Object.freeze(deferred),
  });
}

function mergedMembership(base = {}, governance = {}) {
  return Object.freeze({
    ...base,
    exists: governance.exists,
    status: governance.status || base.status,
    teamId: governance.teamId || base.teamId,
    teamName: governance.teamName || base.teamName,
    revision: governance.revision,
    canChange: governance.canAdd || governance.canWithdraw || governance.canReactivate,
    blocker: governance.blockers[0] || base.blocker || "",
    canAdd: governance.canAdd,
    canWithdraw: governance.canWithdraw,
    canReactivate: governance.canReactivate,
    blockers: governance.blockers,
    readiness: governance.readiness,
    readinessMessage: governance.readinessMessage,
    dependencyCounts: governance.dependencyCounts,
  });
}

export function mergeProductionPlayerAccessGovernance(base, governancePayload) {
  const governance = governancePayload?.contractVersion === PRODUCTION_ACCESS_GOVERNANCE_CONTRACT
    ? governancePayload
    : normalizeProductionAccessGovernancePayload(governancePayload);
  const governanceByPlayer = new Map(governance.players.map((player) => [player.playerId, player]));
  const baseByPlayer = new Map((base?.players || []).map((player) => [player.playerId, player]));
  const playerIds = [...new Set([...baseByPlayer.keys(), ...governanceByPlayer.keys()])].sort();
  const players = playerIds.map((playerId) => {
    const current = baseByPlayer.get(playerId) || {};
    const addition = governanceByPlayer.get(playerId);
    if (!addition) return current;
    return Object.freeze({
      ...current,
      playerId,
      displayName: current.displayName || addition.displayName || playerId,
      globalStatus: addition.profile.globalStatus,
      profile: addition.profile,
      canSetGlobalStatus: addition.profile.canSetGlobalStatus,
      globalStatusBlocker: addition.profile.statusBlocker,
      membership: mergedMembership(current.membership, addition.membership),
      governance: addition.governance,
      directorStatus: addition.governance.ownerStatus === "ACTIVE"
        ? "OWNER"
        : addition.governance.directorStatus || current.directorStatus || "NOT_DIRECTOR",
    });
  }).sort((left, right) => String(left.displayName).localeCompare(String(right.displayName)) ||
    left.playerId.localeCompare(right.playerId));
  const audit = [...(governance.audit || []), ...(base?.audit || [])]
    .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)))
    .slice(0, 50);
  const deferredById = new Map([...(base?.deferred || []), ...(governance.deferred || [])]
    .map((item) => [item.id || item.label, item]));
  return Object.freeze({
    ...base,
    players: Object.freeze(players),
    governanceRevision: governance.revision,
    ownerAdoptionRequired: governance.ownerAdoptionRequired,
    actor: governance.actor,
    membershipAdd: governance.membershipAdd,
    capabilities: Object.freeze({ ...(base?.capabilities || {}), ...governance.capabilities }),
    audit: Object.freeze(audit),
    governanceAudit: governance.audit,
    deferred: Object.freeze([...deferredById.values()]),
  });
}

export function normalizeProductionAccessGovernanceMutation(payload = {}) {
  const value = payload?.data || payload?.result || payload;
  if (!value || value.ok !== true) {
    throw governanceError(
      safeCode(value?.code, "ACCESS_GOVERNANCE_OPERATION_FAILED"),
      "The access-governance operation did not complete.",
      409,
    );
  }
  const membership = value.membership ? normalizeGovernanceMembership(value.membership) : null;
  return Object.freeze({
    ok: true,
    code: safeCode(value.code, "ACCESS_GOVERNANCE_UPDATED"),
    action: safeCode(value.action),
    changed: value.changed !== false,
    idempotent: value.idempotent === true,
    governanceRevision: safeRevision(firstDefined(value.governanceRevision, value.governance_revision, value.revision)),
    profileRevision: safeRevision(firstDefined(value.profileRevision, value.profile_revision)),
    membershipRevision: safeRevision(firstDefined(value.membershipRevision, value.membership_revision)),
    playerId: upper(firstDefined(value.playerId, value.player_id, value.allocatedPlayerId, value.allocated_player_id)),
    allocatedPlayerId: upper(firstDefined(value.allocatedPlayerId, value.allocated_player_id)),
    globalStatus: safeCode(firstDefined(value.globalStatus, value.global_status)),
    directorStatus: safeCode(firstDefined(value.directorStatus, value.director_status)),
    membership,
    readiness: normalizeReadinessProjection(firstDefined(value.readiness, membership?.readiness)),
    membershipCreated: safeBoolean(firstDefined(value.membershipCreated, value.membership_created)),
    teamChanged: safeBoolean(firstDefined(value.teamChanged, value.team_changed)),
    authUserCreated: safeBoolean(firstDefined(value.authUserCreated, value.auth_user_created)),
  });
}
