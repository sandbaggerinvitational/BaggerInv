import { normalizeParticipantAuthPhone } from "./participant-auth-phone.js";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const truthy = (value) => value === true || /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const EMAIL = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const PLACEHOLDER_EMAIL_HOST = /(^|\.)(?:example\.(?:com|net|org)|invalid|test|localhost)$/i;
const PLACEHOLDER_EMAIL_LOCAL = /(?:^|[+._-])(?:test|fake|placeholder|dummy)(?:[+._-]|$)/i;

export const PRODUCTION_DIRECTOR_PLAYERS_ACCESS_CONTRACT = "production-players-access-v1";

const ACTION_CAPABILITIES = Object.freeze({
  "approve-email": ["approveEmail", "approve_email", "approve-email"],
  "approve-phone": ["approvePhone", "approve_phone", "approve-phone"],
  "revoke-phone": ["revokePhone", "revoke_phone", "revoke-phone"],
  "set-login-preference": ["setLoginPreference", "set_login_preference", "set-login-preference"],
  "suspend-access": ["suspendAccess", "suspend_access", "suspend-access", "suspendParticipantAccess"],
  "resume-access": ["resumeAccess", "resume_access", "resume-access", "resumeParticipantAccess"],
  "bulk-enroll": ["bulkEnroll", "bulk_enroll", "bulk-enroll", "bulkEnrollment"],
  "create-player": ["createPlayer", "create_player", "create-player", "globalPlayerCreation", "createGlobalPlayer"],
  "set-global-status": ["setGlobalStatus", "set_global_status", "set-global-status"],
  "withdraw-membership": ["withdrawMembership", "withdraw_membership", "withdraw-membership"],
  "reactivate-membership": ["reactivateMembership", "reactivate_membership", "reactivate-membership"],
  "grant-director": ["grantDirector", "grant_director", "grant-director"],
  "revoke-director": ["revokeDirector", "revoke_director", "revoke-director"],
  "mutate-director-role": ["mutateDirectorRole", "mutate_director_role", "mutate-director-role", "directorRoleMutation", "manageDirectorEntitlement"],
});

export const PRODUCTION_PLAYER_ACCESS_FILTERS = Object.freeze([
  Object.freeze({ id: "all", label: "All" }),
  Object.freeze({ id: "roster", label: "2026 Roster" }),
  Object.freeze({ id: "enrolled", label: "Enrolled" }),
  Object.freeze({ id: "not-enrolled", label: "Not Enrolled" }),
  Object.freeze({ id: "needs-attention", label: "Needs Attention" }),
  Object.freeze({ id: "directors", label: "Directors" }),
  Object.freeze({ id: "alumni-not-playing", label: "Alumni-Not Playing" }),
]);

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function safeText(value, maximum = 160) {
  return clean(value).slice(0, maximum);
}

function safeRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function safeMaskedEmail(value) {
  const masked = safeText(value, 180);
  return /^[^@\s*•][*•]{3,8}@[A-Z0-9][*•]{3}\.[A-Z0-9-]{2,63}$/i.test(masked)
    ? masked
    : "";
}

function safeMaskedPhone(value) {
  const masked = safeText(value, 80);
  return /^(?:\+)?(?:[*•]{2,4}[ .()\-]*){1,4}\d{2,4}$/.test(masked)
    ? masked
    : "";
}

function normalizeMembership(value = {}) {
  const status = upper(firstDefined(value.status, value.membershipStatus, value.membership_status));
  const existsValue = firstDefined(value.exists, value.membershipExists, value.membership_exists);
  const blockers = (Array.isArray(value.blockers) ? value.blockers : [])
    .map((item) => safeText(typeof item === "string" ? item : item?.code || item?.message, 160))
    .filter(Boolean)
    .slice(0, 24);
  const readiness = (Array.isArray(value.readiness) ? value.readiness : [])
    .map((item) => safeText(typeof item === "string" ? item : item?.code || item?.message, 240))
    .filter(Boolean)
    .slice(0, 24);
  const suppliedCounts = value.dependencyCounts || value.dependency_counts || {};
  const dependencyCounts = Object.freeze(Object.fromEntries([
    "matchAssignments", "activeMatches", "finalizedMatches", "scoringActivity",
    "scoringSnapshots", "unstartedPairings", "netSkins", "calcutta", "draft",
    "completedHistory",
  ].map((key) => [key, safeRevision(suppliedCounts[key])])));
  return Object.freeze({
    exists: existsValue === undefined ? Boolean(status) : truthy(existsValue),
    status: status || "NOT_PLAYING",
    teamId: safeText(firstDefined(value.teamId, value.team_id), 64),
    teamName: safeText(firstDefined(value.teamName, value.team_name), 160),
    revision: safeRevision(firstDefined(value.revision, value.membershipRevision, value.membership_revision)),
    canChange: truthy(firstDefined(value.canChange, value.can_change)),
    blocker: safeText(firstDefined(value.blocker, value.blockerCode, value.blocker_code), 120),
    canAdd: truthy(firstDefined(value.canAdd, value.can_add)),
    canWithdraw: truthy(firstDefined(value.canWithdraw, value.can_withdraw)),
    canReactivate: truthy(firstDefined(value.canReactivate, value.can_reactivate)),
    blockers: Object.freeze(blockers),
    readiness: Object.freeze(readiness),
    readinessMessage: safeText(firstDefined(value.readinessMessage, value.readiness_message, readiness[0]), 240),
    dependencyCounts,
  });
}

export function normalizeProductionPlayerAccessPlayer(player = {}) {
  const playerId = upper(firstDefined(player.playerId, player.player_id, player.id));
  const membership = normalizeMembership(player.membership || {});
  const enrollmentState = upper(firstDefined(
    player.enrollmentState,
    player.enrollment_state,
    player.enrollmentStatus,
    player.enrollment_status,
  )) || "NOT_ENROLLED";
  const directorStatus = upper(firstDefined(player.directorStatus, player.director_status)) || "NOT_DIRECTOR";
  const attentionStates = new Set(["INVALID", "CONFLICT", "BLOCKED", "NEEDS_REVIEW", "UNAVAILABLE"]);
  const needsAttention = truthy(firstDefined(player.needsAttention, player.needs_attention)) ||
    [
      enrollmentState,
      upper(firstDefined(player.emailStatus, player.email_status)),
      upper(firstDefined(player.phoneStatus, player.phone_status)),
      upper(firstDefined(player.authLinkState, player.auth_link_state)),
      upper(firstDefined(player.participantAccessState, player.participant_access_state)),
    ].some((value) => attentionStates.has(value) || value.includes("CONFLICT") || value.includes("INVALID"));
  const profile = player.profile && typeof player.profile === "object" ? player.profile : {};
  const governance = player.governance && typeof player.governance === "object" ? player.governance : {};
  return Object.freeze({
    playerId,
    displayName: safeText(firstDefined(player.displayName, player.display_name, player.name), 160) || playerId,
    globalStatus: upper(firstDefined(player.globalStatus, player.global_status)) || "ACTIVE",
    membership,
    enrollmentState,
    maskedEmail: safeMaskedEmail(firstDefined(player.maskedEmail, player.masked_email)),
    emailStatus: upper(firstDefined(player.emailStatus, player.email_status)) || "NOT_CONFIGURED",
    maskedPhone: safeMaskedPhone(firstDefined(player.maskedPhone, player.masked_phone)),
    phoneStatus: upper(firstDefined(player.phoneStatus, player.phone_status)) || "NOT_CONFIGURED",
    preferredLoginMethod: upper(firstDefined(player.preferredLoginMethod, player.preferred_login_method)) || "EMAIL_PRIMARY",
    effectiveLoginMethod: upper(firstDefined(player.effectiveLoginMethod, player.effective_login_method)) || "UNAVAILABLE",
    authLinkState: upper(firstDefined(player.authLinkState, player.auth_link_state)) || "NOT_LINKED",
    participantAccessState: upper(firstDefined(player.participantAccessState, player.participant_access_state)) || "NOT_ENROLLED",
    roles: Object.freeze((Array.isArray(player.roles) ? player.roles : [])
      .map(upper)
      .filter((role) => ["PARTICIPANT", "CAPTAIN", "DIRECTOR", "IDENTITY_ADMIN"].includes(role))),
    directorStatus,
    needsAttention,
    profile: Object.freeze({
      firstName: safeText(firstDefined(profile.firstName, profile.first_name), 80),
      lastName: safeText(firstDefined(profile.lastName, profile.last_name), 80),
      slug: safeText(firstDefined(profile.slug, profile.profileSlug, profile.profile_slug), 120).toLowerCase(),
      globalStatus: upper(firstDefined(profile.globalStatus, profile.global_status, player.globalStatus, player.global_status)) || "ACTIVE",
      revision: safeRevision(firstDefined(profile.revision, profile.profileRevision, profile.profile_revision)),
      canSetGlobalStatus: truthy(firstDefined(profile.canSetGlobalStatus, profile.can_set_global_status, player.canSetGlobalStatus)),
      statusBlocker: upper(firstDefined(profile.statusBlocker, profile.status_blocker, player.globalStatusBlocker)),
    }),
    canSetGlobalStatus: truthy(firstDefined(player.canSetGlobalStatus, player.can_set_global_status, profile.canSetGlobalStatus)),
    globalStatusBlocker: upper(firstDefined(player.globalStatusBlocker, player.global_status_blocker, profile.statusBlocker)),
    governance: Object.freeze({
      ownerStatus: upper(firstDefined(governance.ownerStatus, governance.owner_status)) || "NONE",
      directorStatus: upper(firstDefined(governance.directorStatus, governance.director_status, directorStatus)) || "NOT_DIRECTOR",
      canGrant: truthy(firstDefined(governance.canGrant, governance.can_grant)),
      canRevoke: truthy(firstDefined(governance.canRevoke, governance.can_revoke)),
      blockers: Object.freeze((Array.isArray(governance.blockers) ? governance.blockers : [])
        .map((item) => safeText(typeof item === "string" ? item : item?.code || item?.message, 160))
        .filter(Boolean)
        .slice(0, 24)),
    }),
  });
}

function normalizeAuditEntry(entry = {}) {
  const summary = safeText(firstDefined(entry.summary, entry.safeSummary, entry.safe_summary), 240);
  return Object.freeze({
    id: safeText(firstDefined(entry.id, entry.eventId, entry.event_id), 100),
    action: upper(firstDefined(entry.action, entry.eventType, entry.event_type)) || "UPDATED",
    targetPlayerId: upper(firstDefined(entry.targetPlayerId, entry.target_player_id, entry.playerId, entry.player_id)),
    actorDisplayName: safeText(firstDefined(entry.actorDisplayName, entry.actor_display_name, entry.actorName, entry.actor_name,
      entry.actorPlayerId, entry.actor_player_id), 160),
    result: upper(entry.result) || "SUCCEEDED",
    timestamp: safeText(firstDefined(entry.timestamp, entry.occurredAt, entry.occurred_at, entry.createdAt, entry.created_at), 64),
    ...(summary ? { summary } : {}),
  });
}

function normalizeDeferredItem(item) {
  if (typeof item === "string") {
    return Object.freeze({ id: safeText(item, 100), label: safeText(item, 160), reason: "Coming Soon" });
  }
  return Object.freeze({
    id: safeText(firstDefined(item?.id, item?.key), 100),
    label: safeText(firstDefined(item?.label, item?.title), 160),
    reason: safeText(firstDefined(item?.reason, item?.message), 240) || "Coming Soon",
  });
}

function capabilitySourceValue(source, action) {
  const aliases = ACTION_CAPABILITIES[action] || [action];
  const locations = [source, source?.actions, source?.mutations];
  for (const location of locations) {
    if (!location || typeof location !== "object") continue;
    for (const key of aliases) {
      if (!Object.hasOwn(location, key)) continue;
      const value = location[key];
      return value && typeof value === "object"
        ? firstDefined(value.enabled, value.allowed, value.available)
        : value;
    }
  }
  return false;
}

function normalizeCapabilities(value = {}) {
  return Object.freeze(Object.fromEntries(Object.keys(ACTION_CAPABILITIES).map((action) => [
    action,
    truthy(capabilitySourceValue(value, action)),
  ])));
}

export function normalizeProductionPlayerAccessPayload(payload = {}) {
  const value = payload?.data || payload?.result || payload;
  const contractVersion = safeText(firstDefined(value?.contractVersion, value?.contract_version), 120);
  if (contractVersion !== PRODUCTION_DIRECTOR_PLAYERS_ACCESS_CONTRACT ||
      !Array.isArray(value?.players) || !Number.isSafeInteger(Number(value?.revision)) || Number(value.revision) < 0) {
    throw new Error("Players & Access returned an invalid Production response.");
  }
  const players = Array.isArray(value?.players)
    ? value.players.map(normalizeProductionPlayerAccessPlayer).filter((player) => player.playerId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.playerId.localeCompare(right.playerId))
    : [];
  const suppliedSummary = value?.summary || {};
  const summary = Object.freeze({
    total: safeRevision(firstDefined(suppliedSummary.total, suppliedSummary.globalPlayers, suppliedSummary.global_players,
      suppliedSummary.playerCount, suppliedSummary.player_count, players.length)),
    roster: safeRevision(firstDefined(suppliedSummary.roster, suppliedSummary.activeRoster, suppliedSummary.active_roster,
      suppliedSummary.rosterCount, suppliedSummary.roster_count,
      players.filter((player) => player.membership.exists).length)),
    enrolled: safeRevision(firstDefined(suppliedSummary.enrolled, suppliedSummary.enrolledCount, suppliedSummary.enrolled_count,
      players.filter((player) => player.enrollmentState === "ENROLLED").length)),
    notEnrolled: safeRevision(firstDefined(suppliedSummary.notEnrolled, suppliedSummary.not_enrolled,
      suppliedSummary.notEnrolledCount, suppliedSummary.not_enrolled_count,
      players.filter((player) => player.enrollmentState === "NOT_ENROLLED").length)),
    needsAttention: safeRevision(firstDefined(suppliedSummary.needsAttention, suppliedSummary.needs_attention,
      suppliedSummary.needsAttentionCount, suppliedSummary.needs_attention_count,
      players.filter((player) => player.needsAttention).length)),
    directors: safeRevision(firstDefined(suppliedSummary.directors, suppliedSummary.directorCount, suppliedSummary.director_count,
      players.filter((player) => ["ACTIVE", "DIRECTOR", "OWNER"].includes(player.directorStatus)).length)),
  });
  return Object.freeze({
    contractVersion,
    revision: safeRevision(value?.revision),
    summary,
    players: Object.freeze(players),
    audit: Object.freeze((Array.isArray(value?.audit) ? value.audit : []).map(normalizeAuditEntry).slice(0, 50)),
    deferred: Object.freeze((Array.isArray(value?.deferred) ? value.deferred : []).map(normalizeDeferredItem)),
    capabilities: normalizeCapabilities(value?.capabilities || {}),
    governanceRevision: safeRevision(firstDefined(value?.governanceRevision, value?.governance_revision)),
    ownerAdoptionRequired: truthy(firstDefined(value?.ownerAdoptionRequired, value?.owner_adoption_required)),
    actor: Object.freeze({
      playerId: upper(firstDefined(value?.actor?.playerId, value?.actor?.player_id)),
      owner: truthy(firstDefined(value?.actor?.owner, value?.actor?.isOwner, value?.actor?.is_owner)),
      ownerAdoptionRequired: truthy(firstDefined(
        value?.actor?.ownerAdoptionRequired,
        value?.actor?.owner_adoption_required,
        value?.ownerAdoptionRequired,
        value?.owner_adoption_required,
      )),
    }),
    membershipAdd: Object.freeze({
      supported: truthy(firstDefined(value?.membershipAdd?.supported, value?.membership_add?.supported)),
      state: upper(firstDefined(value?.membershipAdd?.state, value?.membership_add?.state)),
      reason: safeText(firstDefined(value?.membershipAdd?.reason, value?.membership_add?.reason), 240),
    }),
    governanceAudit: Object.freeze((Array.isArray(value?.governanceAudit) ? value.governanceAudit : [])
      .map(normalizeAuditEntry)
      .slice(0, 50)),
  });
}

function playerMatchesFilter(player, filter) {
  switch (filter) {
    case "roster": return player.membership.exists && player.membership.status === "ACTIVE";
    case "enrolled": return player.enrollmentState === "ENROLLED";
    case "not-enrolled": return player.enrollmentState === "NOT_ENROLLED";
    case "needs-attention": return player.needsAttention;
    case "directors": return ["ACTIVE", "DIRECTOR", "OWNER"].includes(player.directorStatus);
    case "alumni-not-playing": return ["ALUMNI", "NOT_PLAYING"].includes(player.globalStatus) ||
      ["ALUMNI", "NOT_PLAYING", "INACTIVE"].includes(player.membership.status);
    default: return true;
  }
}

export function filterProductionPlayerAccessPlayers(players = [], { filter = "all", search = "" } = {}) {
  const selectedFilter = PRODUCTION_PLAYER_ACCESS_FILTERS.some((item) => item.id === filter) ? filter : "all";
  const terms = clean(search).toLowerCase().split(/\s+/).filter(Boolean);
  return players.filter((player) => {
    if (!playerMatchesFilter(player, selectedFilter)) return false;
    if (!terms.length) return true;
    const haystack = [
      player.playerId,
      player.displayName,
      player.globalStatus,
      player.membership.teamId,
      player.membership.teamName,
      player.membership.status,
      player.enrollmentState,
      player.maskedEmail,
      player.maskedPhone,
      player.directorStatus,
    ].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function productionPlayerAccessFilterCounts(players = []) {
  return Object.freeze(Object.fromEntries(PRODUCTION_PLAYER_ACCESS_FILTERS.map((filter) => [
    filter.id,
    players.filter((player) => playerMatchesFilter(player, filter.id)).length,
  ])));
}

export function productionPlayerAccessActionAvailable(capabilities = {}, action, player = null) {
  if (capabilities?.[action] !== true) return false;
  if (action === "approve-email" && player) {
    return player.membership?.status === "ACTIVE" &&
      ["NOT_LINKED", "NOT_PROVISIONED"].includes(player.authLinkState);
  }
  if (action === "approve-phone" && player) {
    return player.membership?.status === "ACTIVE" && player.phoneStatus !== "VERIFIED";
  }
  if (action === "revoke-phone" && player) {
    return player.phoneStatus === "APPROVED";
  }
  if (action === "set-login-preference" && player) {
    return player.membership?.status === "ACTIVE";
  }
  if (action === "suspend-access" && player) {
    return player.participantAccessState === "ACTIVE" &&
      !["ACTIVE", "DIRECTOR", "OWNER"].includes(player.directorStatus);
  }
  if (action === "resume-access" && player) {
    return player.participantAccessState === "SUSPENDED" &&
      !["ACTIVE", "DIRECTOR", "OWNER"].includes(player.directorStatus);
  }
  return true;
}

export function productionPlayerAccessStatusLabel(value) {
  const normalized = upper(value);
  const exact = {
    ACTIVE: "Active",
    ALUMNI: "Alumni",
    NOT_PLAYING: "Not Playing",
    ENROLLED: "Enrolled",
    NOT_ENROLLED: "Not Enrolled",
    INVALID_ENROLLMENT: "Needs Review",
    NOT_CONFIGURED: "Not Configured",
    NOT_PROVISIONED: "Not Provisioned",
    NOT_LINKED: "Not Linked",
    LINKED: "Linked",
    VERIFIED: "Verified",
    ELIGIBLE: "Eligible",
    REVOKED: "Revoked",
    SUSPENDED: "Suspended",
    EMAIL: "Email",
    PHONE: "Mobile",
    EMAIL_PRIMARY: "Email Primary",
    PHONE_PRIMARY: "Mobile Primary",
    ELIGIBLE_NOT_PROVISIONED: "Eligible — Not Provisioned",
    ACTIVE_RECORD: "Active Record",
    APPROVED: "Approved",
    NONE: "Not a Director",
    AUTO: "Automatic",
    UNAVAILABLE: "Unavailable",
    NOT_DIRECTOR: "Not a Director",
  };
  return exact[normalized] || normalized.toLowerCase().replaceAll("_", " ").replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Unavailable";
}

function bulkParts(line) {
  if (line.includes("\t")) return line.split("\t").map(clean);
  if (line.includes("|")) return line.split("|").map(clean);
  if (line.includes(",")) return line.split(",").map(clean);
  return null;
}

function optionalBulkValue(value) {
  const normalized = clean(value);
  return /^(?:-|—|none|n\/a)$/i.test(normalized) ? "" : normalized;
}

function normalizeBulkEmail(value) {
  const email = optionalBulkValue(value).toLowerCase();
  if (!email) return { value: "", error: "" };
  const [local = "", host = ""] = email.split("@");
  if (email.length > 254 || !EMAIL.test(email) || PLACEHOLDER_EMAIL_HOST.test(host) ||
      PLACEHOLDER_EMAIL_LOCAL.test(local)) {
    return { value: "", error: "email is missing, malformed, or a placeholder" };
  }
  return { value: email, error: "" };
}

function normalizeBulkPhone(value) {
  const phone = optionalBulkValue(value);
  if (!phone) return { value: "", masked: "", error: "" };
  try {
    const normalized = normalizeParticipantAuthPhone(phone);
    return { value: normalized.e164, masked: normalized.masked, error: "" };
  } catch {
    return { value: "", masked: "", error: "mobile number is invalid" };
  }
}

function maskDraftEmail(value) {
  const [local = "", domain = ""] = clean(value).split("@");
  const [host = "", ...suffixParts] = domain.split(".");
  const suffix = suffixParts.length ? `.${suffixParts.join(".")}` : "";
  return local && host ? `${local.slice(0, 1)}***@${host.slice(0, 1)}***${suffix}` : "Not provided";
}

export function parseProductionPlayerAccessBulk(value, players = []) {
  const directory = players.map((player) => player.playerId ? player : normalizeProductionPlayerAccessPlayer(player));
  const byId = new Map(directory.map((player) => [upper(player.playerId), player]));
  const entries = [];
  const review = [];
  const errors = [];
  const seenPlayers = new Set();
  const seenEmails = new Set();
  const seenPhones = new Set();
  const lines = String(value ?? "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = clean(lines[index]);
    if (!line) continue;
    const parts = bulkParts(line);
    if (parts && /^player\s*(?:id)?$/i.test(parts[0]) &&
        /email/i.test(parts[1] || "") && /phone|mobile/i.test(parts[2] || "")) continue;
    if (!parts || parts.length < 2 || parts.length > 3 || !parts[0]) {
      errors.push(`Line ${index + 1}: use Player ID | Email | Phone.`);
      continue;
    }
    while (parts.length < 3) parts.push("");
    const playerId = upper(parts[0]);
    const player = byId.get(playerId);
    if (!player || !player.membership?.exists || player.membership.status !== "ACTIVE") {
      errors.push(`Line ${index + 1}: ${playerId || "Player"} is not on the active tournament roster.`);
      continue;
    }
    if (seenPlayers.has(playerId)) {
      errors.push(`Line ${index + 1}: ${playerId} appears more than once.`);
      continue;
    }
    seenPlayers.add(playerId);
    if (player.enrollmentState === "ENROLLED") {
      errors.push(`Line ${index + 1}: ${playerId} is already enrolled; use the individual access controls.`);
      continue;
    }
    const email = normalizeBulkEmail(parts[1]);
    const phone = normalizeBulkPhone(parts[2]);
    if (email.error) errors.push(`Line ${index + 1}: ${playerId} ${email.error}.`);
    if (phone.error) errors.push(`Line ${index + 1}: ${playerId} ${phone.error}.`);
    if (!email.value && !phone.value && !email.error && !phone.error) {
      errors.push(`Line ${index + 1}: ${playerId} needs an email or mobile number.`);
    }
    if (email.value && seenEmails.has(email.value)) {
      errors.push(`Line ${index + 1}: ${playerId} duplicates an email in this batch.`);
    }
    if (phone.value && seenPhones.has(phone.value)) {
      errors.push(`Line ${index + 1}: ${playerId} duplicates a mobile number in this batch.`);
    }
    if (email.error || phone.error || (!email.value && !phone.value) ||
        (email.value && seenEmails.has(email.value)) || (phone.value && seenPhones.has(phone.value))) continue;
    if (email.value) seenEmails.add(email.value);
    if (phone.value) seenPhones.add(phone.value);
    entries.push(Object.freeze({ playerId, email: email.value || null, phone: phone.value || null }));
    review.push(Object.freeze({
      playerId,
      displayName: player.displayName || playerId,
      maskedEmail: email.value ? maskDraftEmail(email.value) : "Not provided",
      maskedPhone: phone.value ? phone.masked : "Not provided",
    }));
  }
  if (entries.length > 100) {
    errors.push("Bulk enrollment supports at most 100 players per atomic update.");
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    review: Object.freeze(review),
    errors: Object.freeze(errors),
    valid: entries.length > 0 && errors.length === 0,
    summary: Object.freeze({ playerCount: entries.length, emailCount: entries.filter((entry) => entry.email).length,
      phoneCount: entries.filter((entry) => entry.phone).length }),
  });
}

export function productionPlayerAccessMaskedDraft({ email = "", phone = "" } = {}) {
  const emailResult = normalizeBulkEmail(email);
  const phoneResult = normalizeBulkPhone(phone);
  return Object.freeze({
    email: emailResult.value ? maskDraftEmail(emailResult.value) : "Not provided",
    phone: phoneResult.value ? phoneResult.masked : "Not provided",
    emailError: emailResult.error,
    phoneError: phoneResult.error,
    normalizedEmail: emailResult.value,
    normalizedPhone: phoneResult.value,
  });
}
