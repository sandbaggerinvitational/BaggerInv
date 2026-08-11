import { createHash } from "node:crypto";

const clean = (value) => String(value ?? "").trim();
const EMAIL = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const truthy = (value) => typeof value === "boolean" ? value : /^(true|yes|y|1|active)$/i.test(clean(value));
const positiveRevision = (value) => {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 1;
};
const validTimestamp = (value) => {
  const timestamp = clean(value);
  return timestamp && !Number.isNaN(Date.parse(timestamp)) ? timestamp : "";
};

export function normalizeParticipantEmail(value) {
  return clean(value).toLowerCase();
}

export function isValidParticipantEmail(value) {
  return EMAIL.test(normalizeParticipantEmail(value));
}

export function maskParticipantEmail(value) {
  const email = normalizeParticipantEmail(value);
  const [local = "", domain = ""] = email.split("@");
  if (!local || !domain) return "Missing";
  const domains = domain.split(".");
  const host = domains.shift() || "";
  const suffix = domains.length ? `.${domains.join(".")}` : "";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(3, Math.min(8, local.length - 1)))}@${host.slice(0, 1)}***${suffix}`;
}

export function participantIdentityFingerprint(contacts = []) {
  const canonical = contacts.map((contact) => ({
    tournamentId: clean(contact.tournament_id || contact.tournamentId),
    playerId: clean(contact.player_id || contact.playerId),
    emailNormalized: normalizeParticipantEmail(contact.email_normalized || contact.email),
    identityActive: Boolean(contact.identity_active ?? contact.identityActive),
    configurationRevision: Number(contact.configuration_revision || contact.configurationRevision || 1),
    verifiedAt: clean(contact.verified_at || contact.verifiedAt),
    sourceUpdatedAt: clean(contact.source_updated_at || contact.sourceUpdatedAt),
  })).sort((left, right) => left.playerId.localeCompare(right.playerId));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function validateParticipantIdentityConfiguration({ tournamentId, roster = [], records = [] } = {}) {
  const targetTournament = clean(tournamentId);
  const activeRoster = roster.filter((player) => clean(player.participationStatus || player.participation_status || "ACTIVE").toUpperCase() === "ACTIVE");
  const rosterById = new Map(activeRoster.map((player) => [clean(player.playerId || player.player_id || player.id), player]));
  const scoped = records.filter((record) => clean(record["Tournament ID"] || record.tournament_id) === targetTournament);
  const contacts = scoped.map((record) => {
    const playerId = clean(record["Player ID"] || record.player_id);
    const email = clean(record.Email || record.email);
    const emailNormalized = normalizeParticipantEmail(email);
    return {
      tournament_id: targetTournament,
      player_id: playerId,
      email,
      email_normalized: emailNormalized,
      identity_active: truthy(record["Identity Active"] ?? record.identity_active),
      configuration_revision: positiveRevision(record["Configuration Revision"] || record.configuration_revision || 1),
      verified_by: clean(record["Verified By"] || record.verified_by),
      verified_at: validTimestamp(record["Verified At"] || record.verified_at),
      source_updated_at: validTimestamp(record["Updated At"] || record.source_updated_at),
    };
  });
  const playerCounts = new Map();
  const emailCounts = new Map();
  contacts.forEach((contact) => {
    playerCounts.set(contact.player_id, (playerCounts.get(contact.player_id) || 0) + 1);
    if (contact.identity_active && contact.email_normalized) emailCounts.set(contact.email_normalized, (emailCounts.get(contact.email_normalized) || 0) + 1);
  });
  const duplicateEmails = new Set([...emailCounts].filter(([, count]) => count > 1).map(([email]) => email));
  const duplicatePlayers = new Set([...playerCounts].filter(([, count]) => count > 1).map(([playerId]) => playerId));
  const byPlayer = new Map(contacts.map((contact) => [contact.player_id, contact]));
  const review = activeRoster.map((player) => {
    const playerId = clean(player.playerId || player.player_id || player.id);
    const contact = byPlayer.get(playerId);
    let validationState = "VALID";
    if (!contact?.email_normalized) validationState = "MISSING";
    else if (!isValidParticipantEmail(contact.email_normalized)) validationState = "MALFORMED";
    else if (duplicateEmails.has(contact.email_normalized)) validationState = "DUPLICATE";
    else if (duplicatePlayers.has(playerId)) validationState = "PLAYER_CONFLICT";
    else if (!contact.identity_active) validationState = "INACTIVE";
    return {
      playerId,
      displayName: clean(player.displayName || player.display_name || player.name || playerId),
      teamId: clean(player.teamId || player.team_id),
      maskedEmail: contact?.email ? maskParticipantEmail(contact.email) : "Missing",
      identityActive: Boolean(contact?.identity_active),
      validationState,
    };
  });
  const unknownPlayerIds = contacts.filter((contact) => !rosterById.has(contact.player_id)).map((contact) => contact.player_id).filter(Boolean);
  const missing = review.filter((item) => item.validationState === "MISSING").length;
  const malformed = review.filter((item) => item.validationState === "MALFORMED").length;
  const duplicate = duplicateEmails.size;
  const inactive = review.filter((item) => item.validationState === "INACTIVE").length;
  const mappingConflicts = review.filter((item) => item.validationState === "PLAYER_CONFLICT").length + unknownPlayerIds.length;
  const withEmail = review.filter((item) => item.validationState === "VALID").length;
  const quality = {
    activePlayers: activeRoster.length,
    playersWithEmail: withEmail,
    missingEmail: missing,
    duplicateEmail: duplicate,
    malformedEmail: malformed,
    sharedEmail: duplicate,
    inactiveIdentityRecords: inactive,
    unknownPlayerIds: unknownPlayerIds.length,
    mappingConflicts,
  };
  quality.pass = activeRoster.length > 0 && withEmail === activeRoster.length &&
    Object.entries(quality).filter(([key]) => !["activePlayers", "playersWithEmail", "pass"].includes(key)).every(([, value]) => value === 0);
  return { tournamentId: targetTournament, contacts, review, quality, fingerprint: participantIdentityFingerprint(contacts) };
}

const sorted = (value) => [...new Set(value || [])].map(clean).filter(Boolean).sort();
export function compareParticipantIdentityContexts({ passport = {}, auth = {} } = {}) {
  const diagnostics = {};
  const compare = (field, left, right) => { if (JSON.stringify(left) !== JSON.stringify(right)) diagnostics[field] = { passport: left, auth: right }; };
  compare("playerId", clean(passport.playerId), clean(auth.playerId));
  compare("tournamentId", clean(passport.tournamentId), clean(auth.tournamentId));
  compare("teamId", clean(passport.teamId), clean(auth.teamId));
  compare("membershipActive", Boolean(passport.membershipActive), Boolean(auth.membershipActive));
  compare("matchIds", sorted(passport.matchIds), sorted(auth.matchIds));
  compare("scoringPermissions", passport.scoringPermissions || {}, auth.scoringPermissions || {});
  return { status: Object.keys(diagnostics).length ? "MISMATCH" : "PASS", diagnostics };
}
