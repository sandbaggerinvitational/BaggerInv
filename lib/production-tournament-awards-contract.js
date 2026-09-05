export const PRODUCTION_TOURNAMENT_AWARDS_CONTRACT = "production-tournament-awards-v1";

export const PRODUCTION_TOURNAMENT_AWARD_RECIPIENT_KINDS = Object.freeze([
  "UNAVAILABLE",
  "PLAYER",
  "TEAM",
  "TEXT",
]);

export const PRODUCTION_TOURNAMENT_AWARD_STATES = Object.freeze([
  "DRAFT",
  "PUBLISHED",
  "RETIRED",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_ID = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

function awardError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function safeText(value, label, maximum, { required = false } = {}) {
  const result = clean(value).replace(/\s+/g, " ");
  if ((required && !result) || result.length > maximum || /[<>{}\u0000-\u001f\u007f]/.test(result)) {
    throw awardError("TOURNAMENT_AWARDS_TEXT_INVALID", `Enter a valid ${label.toLowerCase()}.`);
  }
  return result;
}

export function stableTournamentAwardsValue(value) {
  if (Array.isArray(value)) return value.map(stableTournamentAwardsValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      stableTournamentAwardsValue(value[key] === undefined ? null : value[key]),
    ]));
  }
  return value === undefined ? null : value;
}

export function canonicalTournamentAwardUuid(value, label = "Award ID") {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) {
    throw awardError("TOURNAMENT_AWARDS_STABLE_ID_INVALID", `A stable ${label.toLowerCase()} is required.`);
  }
  return result;
}

export function canonicalTournamentAwardStableId(value, label) {
  const result = upper(value);
  if (!STABLE_ID.test(result)) {
    throw awardError("TOURNAMENT_AWARDS_REFERENCE_INVALID", `Select a valid ${label.toLowerCase()}.`);
  }
  return result;
}

export function canonicalTournamentAwardsRevision(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw awardError("TOURNAMENT_AWARDS_REVISION_REQUIRED", "Refresh Awards before saving changes.");
  }
  return result;
}

export function canonicalTournamentAwardsOperationId(value) {
  const result = clean(value).toLowerCase();
  if (!UUID.test(result)) {
    throw awardError("TOURNAMENT_AWARDS_OPERATION_REQUEST_ID_REQUIRED", "A secure operation identity is required.");
  }
  return result;
}

export function canonicalTournamentAward(value = {}, index = 0) {
  const recipientKind = upper(value.recipientKind || value.recipient_kind || "UNAVAILABLE");
  const publicationState = upper(value.publicationState || value.publication_state || "DRAFT");
  if (!PRODUCTION_TOURNAMENT_AWARD_RECIPIENT_KINDS.includes(recipientKind)) {
    throw awardError("TOURNAMENT_AWARDS_RECIPIENT_KIND_INVALID", "Select a supported winner type.");
  }
  if (!PRODUCTION_TOURNAMENT_AWARD_STATES.includes(publicationState)) {
    throw awardError("TOURNAMENT_AWARDS_PUBLICATION_STATE_INVALID", "Select a supported publication state.");
  }
  const displayOrder = Number(value.displayOrder ?? value.display_order ?? index + 1);
  if (!Number.isSafeInteger(displayOrder) || displayOrder < 1 || displayOrder > 100) {
    throw awardError("TOURNAMENT_AWARDS_DISPLAY_ORDER_INVALID", "Award order must be between 1 and 100.");
  }
  const winnerPlayerId = recipientKind === "PLAYER"
    ? canonicalTournamentAwardStableId(value.winnerPlayerId || value.winner_player_id, "Player")
    : "";
  const winnerTeamId = recipientKind === "TEAM"
    ? canonicalTournamentAwardStableId(value.winnerTeamId || value.winner_team_id, "Team")
    : "";
  const recipientDisplay = recipientKind === "TEXT"
    ? safeText(value.recipientDisplay || value.recipient_display, "text winner", 160, { required: true })
    : "";
  if (publicationState === "PUBLISHED" && recipientKind === "UNAVAILABLE") {
    throw awardError("TOURNAMENT_AWARDS_PENDING_PUBLICATION_INVALID", "Assign a winner before publishing this Award.");
  }
  return Object.freeze({
    awardId: canonicalTournamentAwardUuid(value.awardId || value.award_id),
    title: safeText(value.title, "Award title", 160, { required: true }),
    description: safeText(value.description, "Award description", 1000),
    displayOrder,
    publicationState,
    recipientKind,
    winnerPlayerId,
    winnerTeamId,
    recipientDisplay,
  });
}

export function canonicalTournamentAwards(value) {
  if (!Array.isArray(value) || value.length > 100) {
    throw awardError("TOURNAMENT_AWARDS_COLLECTION_INVALID", "Awards must contain no more than 100 items.");
  }
  const awards = value.map(canonicalTournamentAward)
    .sort((left, right) => left.displayOrder - right.displayOrder || left.awardId.localeCompare(right.awardId));
  if (new Set(awards.map((award) => award.awardId)).size !== awards.length) {
    throw awardError("TOURNAMENT_AWARDS_STABLE_ID_DUPLICATE", "Each Award requires a unique stable identity.");
  }
  if (new Set(awards.map((award) => award.displayOrder)).size !== awards.length) {
    throw awardError("TOURNAMENT_AWARDS_DISPLAY_ORDER_DUPLICATE", "Each Award requires a unique display position.");
  }
  return Object.freeze(awards);
}

export function buildTournamentAwardsMutation({ awards, expectedRevision, operationRequestId } = {}) {
  return Object.freeze({
    operation: "SAVE_PRODUCTION_TOURNAMENT_AWARDS_V1",
    expected_revision: canonicalTournamentAwardsRevision(expectedRevision),
    operation_request_id: canonicalTournamentAwardsOperationId(operationRequestId),
    awards: canonicalTournamentAwards(awards).map((award) => ({
      award_id: award.awardId,
      title: award.title,
      description: award.description,
      display_order: award.displayOrder,
      publication_state: award.publicationState,
      recipient_kind: award.recipientKind,
      winner_player_id: award.winnerPlayerId || null,
      winner_team_id: award.winnerTeamId || null,
      recipient_display: award.recipientDisplay || null,
    })),
  });
}

function normalizedRecipient(value = {}) {
  return Object.freeze({
    kind: upper(value.kind || value.recipientKind || value.recipient_kind || "UNAVAILABLE"),
    id: clean(value.id || value.playerId || value.teamId),
    name: clean(value.name || value.displayName),
    slug: clean(value.slug),
    image: clean(value.image || value.logo),
    teamId: clean(value.teamId),
    teamName: clean(value.teamName),
  });
}

export function normalizeProductionTournamentAwardsPayload(value = {}) {
  const source = value.data && typeof value.data === "object" ? value.data : value;
  return Object.freeze({
    tournamentId: clean(source.tournamentId || source.tournament_id),
    revision: canonicalTournamentAwardsRevision(source.revision ?? 0),
    revisionId: clean(source.revisionId || source.revision_id),
    awards: Object.freeze((Array.isArray(source.awards) ? source.awards : []).map((award, index) => Object.freeze({
      ...canonicalTournamentAward(award, index),
      recipient: normalizedRecipient(award.recipient),
    }))),
    roster: Object.freeze((Array.isArray(source.roster) ? source.roster : []).map((player) => Object.freeze({
      playerId: clean(player.playerId || player.player_id),
      displayName: clean(player.displayName || player.display_name),
      teamId: clean(player.teamId || player.team_id),
      teamName: clean(player.teamName || player.team_name),
      slug: clean(player.slug),
      image: clean(player.image),
    }))),
    teams: Object.freeze((Array.isArray(source.teams) ? source.teams : []).map((team) => Object.freeze({
      teamId: clean(team.teamId || team.team_id),
      name: clean(team.name),
      side: Number(team.side || team.teamSide || team.team_side || 0),
      logo: clean(team.logo),
    }))),
    history: Object.freeze(Array.isArray(source.history) ? source.history : []),
    audit: Object.freeze(Array.isArray(source.audit) ? source.audit : []),
  });
}
