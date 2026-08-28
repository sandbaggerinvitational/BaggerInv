import {
  buildCompletedHistoryYearContract,
  completedHistoryImportEnvelope,
} from "./completed-history-contract.js";
import {
  buildCanonicalScoringAuthorityImport,
  canonicalAuthorityFingerprint,
} from "./scoring-authority-supabase.js";
import { canonicalJson } from "./scoring-shadow.js";
import {
  PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_CONTRACT,
  productionCurrentShadowSemanticProjection,
} from "./production-current-shadow-semantic-parity.js";
import {
  PRODUCTION_COMPLETED_HISTORY_YEARS,
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";

export const PRODUCTION_SHADOW_PAYLOAD_CONTRACT =
  "production-shadow-payload-preparation-v2";

export const PRODUCTION_CURRENT_SHADOW_CONTRACT = "production-current-shadow-v2";
export const PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_ACTOR =
  "step10b-production-shadow-bootstrap";
export const PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_OPERATION =
  "CURRENT_TOURNAMENT_SHADOW_IMPORT";
export const PRODUCTION_2026_CURRENT_ONLY_PLAYER_IDS = Object.freeze([
  "CM01",
  "JK02",
  "PN01",
]);

const PREVIEW_PROJECT_REF = "idgigvjjqkfbqjeredpb";
const PREVIEW_WORKBOOK_ID = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const clean = (value) => String(value ?? "").trim();
const PRODUCTION_CURRENT_SHADOW_SHEETS = Object.freeze([
  "Tournaments", "Live Tournaments", "Players", "Handicaps", "Team Names", "Rounds",
  "Tournament Rules", "Courses",
  "Course Holes", "Live Matches", "Matches", "Live Hole Scores",
  "Match Update Log", "Admin Audit Log",
]);
const HISTORY_RPC = "import_production_completed_history_year";
const CURRENT_RPC = "bootstrap_import_production_current_tournament_shadow";
const HISTORY_AUTHORIZATION_SCOPE = "PRODUCTION_COMPLETED_HISTORY_SHADOW_IMPORT";
const CURRENT_AUTHORIZATION_SCOPE = "PRODUCTION_CURRENT_TOURNAMENT_SHADOW_IMPORT";

function sortedStructuredSource(source = {}) {
  return PRODUCTION_CURRENT_SHADOW_SHEETS.map((sheetName) => {
    const sheet = source[sheetName] || {};
    return {
      sheet: sheetName,
      headers: Array.isArray(sheet.headers) ? sheet.headers : [],
      records: Array.isArray(sheet.records)
        ? sheet.records.map(({ record }) => record || {})
        : [],
    };
  });
}

const sourceRecords = (source, sheetName) => (source?.[sheetName]?.records || [])
  .map(({ record }) => record || {});
const upper = (value) => clean(value).toUpperCase();
const integer = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Math.trunc(Number(value))
  : fallback;
const numeric = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Number(value)
  : fallback;
const explicitRoundNumber = (value) => {
  const token = clean(value);
  const match = token.match(/^Round\s+([1-9]\d*)$/i) || token.match(/^([1-9]\d*)$/);
  return match ? integer(match[1]) : 0;
};
const truthy = (value) => ["TRUE", "YES", "1", "ACTIVE", "OPEN", "ENABLED", "LOCKED"]
  .includes(upper(value));
const formatCode = (value) => ({
  "BEST BALL": "BB",
  BESTBALL: "BB",
  SCRAMBLE: "SC",
  SINGLES: "SI",
  SINGLE: "SI",
})[upper(value).replace(/[^A-Z ]/g, "")] || upper(value);

function productionCurrentTournamentContext(source = {}) {
  const liveRows = sourceRecords(source, "Live Tournaments");
  const tournamentRows = sourceRecords(source, "Tournaments");
  const live = liveRows.find((row) => integer(row.Year) === PRODUCTION_TOURNAMENT_YEAR) || {};
  const tournament = tournamentRows.find((row) =>
    integer(row.Year) === PRODUCTION_TOURNAMENT_YEAR ||
    clean(row["Tournament ID"]) === PRODUCTION_TOURNAMENT_ID
  ) || {};
  const status = upper(
    live["Tournament Status"] || live.Status ||
    tournament["Tournament Status"] || tournament.Status,
  );
  return {
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    status,
    current_round: integer(live["Current Round"] || tournament["Current Round"], 0),
    team_1_score: numeric(live["Team 1 Score"], 0),
    team_2_score: numeric(live["Team 2 Score"], 0),
    live_message: clean(live["Live Message"]),
    source_present: Object.keys(live).length > 0,
    source_payload: {
      Year: live.Year ?? PRODUCTION_TOURNAMENT_YEAR,
      "Tournament Status": clean(live["Tournament Status"] || live.Status),
      "Current Round": clean(live["Current Round"]),
      "Team 1 Score": live["Team 1 Score"] ?? "",
      "Team 2 Score": live["Team 2 Score"] ?? "",
      "Live Message": clean(live["Live Message"]),
    },
  };
}

function productionCurrentRules(source = {}) {
  return sourceRecords(source, "Tournament Rules")
    .filter((row) => {
      const year = integer(row.Year || row["Tournament ID"]);
      return year === PRODUCTION_TOURNAMENT_YEAR;
    })
    .map((row) => ({
      tournament_id: PRODUCTION_TOURNAMENT_ID,
      round_number: explicitRoundNumber(row.Round),
      format: formatCode(row.Format),
      points_available: numeric(row["Points Available"], 0),
      source_payload: {
        Year: row.Year ?? PRODUCTION_TOURNAMENT_YEAR,
        Round: row.Round ?? "",
        Format: clean(row.Format),
        "Points Available": row["Points Available"] ?? "",
      },
    }))
    .sort((left, right) => left.round_number - right.round_number);
}

function pairingSlotsForMatch(match = {}) {
  const format = formatCode(match.Format);
  const requiredSlots = format === "SI"
    ? ["Team 1 Player 1", "Team 2 Player 1"]
    : ["Team 1 Player 1", "Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2"];
  const forbiddenSlots = format === "SI"
    ? ["Team 1 Player 2", "Team 2 Player 2"]
    : [];
  return { format, requiredSlots, forbiddenSlots };
}

/**
 * Production is legitimately pre-tournament before official pairings exist.
 * This contract preserves every supplied slot and never infers a participant.
 * PENDING/PARTIAL is safe only while Google proves there is no active scoring,
 * access, lock, or finalized/archive state.
 */
export function productionCurrentPairingContract(source = {}) {
  const liveMatches = sourceRecords(source, "Live Matches")
    .filter((row) => integer(row.Year) === PRODUCTION_TOURNAMENT_YEAR);
  const archivedByMatch = new Map(sourceRecords(source, "Matches")
    .filter((row) => clean(row["Match ID"]))
    .map((row) => [clean(row["Match ID"]), row]));
  const scoredMatchIds = new Set(sourceRecords(source, "Live Hole Scores")
    .filter((row) => clean(row["Match ID"]) && integer(row["Hole Number"]) >= 1)
    .map((row) => clean(row["Match ID"])));
  const rosterSideByPlayer = new Map(sourceRecords(source, "Handicaps")
    .filter((row) => integer(row.Year) === PRODUCTION_TOURNAMENT_YEAR && clean(row["Player ID"]))
    .map((row) => [
      clean(row["Player ID"]),
      integer(clean(row["Team Side"]).replace(/\D/g, ""), 0),
    ]));

  const matches = liveMatches.map((match) => {
    const matchId = clean(match["Match ID"]);
    const { format, requiredSlots, forbiddenSlots } = pairingSlotsForMatch(match);
    const supplied = requiredSlots
      .map((field) => ({ field, player_id: clean(match[field]) }))
      .filter((entry) => entry.player_id);
    const missing = requiredSlots.filter((field) => !clean(match[field]));
    const forbidden = forbiddenSlots
      .map((field) => ({ field, player_id: clean(match[field]) }))
      .filter((entry) => entry.player_id);
    const playerIds = supplied.map((entry) => entry.player_id);
    const duplicates = [...new Set(playerIds.filter((id, index) => playerIds.indexOf(id) !== index))];
    const teamMismatches = supplied.filter(({ field, player_id: playerId }) => {
      const expectedSide = integer(field.match(/^Team (\d)/)?.[1]);
      const actualSide = rosterSideByPlayer.get(playerId);
      return !actualSide || actualSide !== expectedSide;
    });
    const archived = archivedByMatch.get(matchId) || {};
    const active = /^(LIVE|REOPENED)$/i.test(clean(match["Match Status"] || match.Status));
    const finalized = /^FINAL$/i.test(clean(match["Match Status"] || match.Status)) ||
      /^FINAL$/i.test(clean(archived["Match Status"] || archived.Status)) ||
      Boolean(clean(match["Finalized At"] || archived["Finalized At"] || archived["Final Result"]));
    const accessActive = truthy(match["Access Active"]);
    const scoringLocked = truthy(match["Scoring Locked"]);
    const scored = scoredMatchIds.has(matchId);
    const invalidReasons = [
      ...!["BB", "SC", "SI"].includes(format) ? ["UNSUPPORTED_FORMAT"] : [],
      ...forbidden.length ? ["SINGLES_SLOT_2_PRESENT"] : [],
      ...duplicates.length ? ["DUPLICATE_PARTICIPANT"] : [],
      ...teamMismatches.length ? ["ROSTER_TEAM_MISMATCH"] : [],
    ];
    const state = invalidReasons.length
      ? "INVALID"
      : missing.length === requiredSlots.length
        ? "PENDING"
        : missing.length
          ? "PARTIAL"
          : "COMPLETE";
    return {
      match_id: matchId,
      round_number: integer(match.Round),
      format,
      state,
      required_slots: requiredSlots,
      supplied_slots: supplied,
      missing_slots: missing,
      forbidden_slots: forbidden,
      duplicate_player_ids: duplicates,
      roster_team_mismatches: teamMismatches,
      invalid_reasons: invalidReasons,
      activity: {
        active,
        scored,
        access_active: accessActive,
        scoring_locked: scoringLocked,
        finalized,
      },
    };
  });
  const states = new Set(matches.map((match) => match.state));
  const state = states.has("INVALID")
    ? "INVALID"
    : states.size === 1
      ? [...states][0] || "PENDING"
      : states.has("PARTIAL") || (states.has("PENDING") && states.has("COMPLETE"))
        ? "PARTIAL"
        : "PENDING";
  return {
    contract_version: "production-current-pairing-state-v1",
    state,
    matches,
    counts: Object.fromEntries(["COMPLETE", "PARTIAL", "PENDING", "INVALID"]
      .map((value) => [value.toLowerCase(), matches.filter((match) => match.state === value).length])),
    no_pairings_inferred: true,
  };
}

function currentIdentityReconciliation(source = {}) {
  const playerIds = new Set(sourceRecords(source, "Players").map((row) => clean(row["Player ID"])).filter(Boolean));
  const rosterIds = new Set(sourceRecords(source, "Handicaps")
    .filter((row) => integer(row.Year) === PRODUCTION_TOURNAMENT_YEAR)
    .map((row) => clean(row["Player ID"]))
    .filter(Boolean));
  const currentOnly = PRODUCTION_2026_CURRENT_ONLY_PLAYER_IDS.map((playerId) => ({
    player_id: playerId,
    player_source_present: playerIds.has(playerId),
    roster_source_present: rosterIds.has(playerId),
  }));
  return {
    current_only_player_ids: currentOnly,
    missing_player_source_ids: [...rosterIds].filter((playerId) => !playerIds.has(playerId)).sort(),
    unresolved_current_only_ids: currentOnly
      .filter((entry) => !entry.player_source_present || !entry.roster_source_present)
      .map((entry) => entry.player_id),
    join_key: "Player ID",
    historical_appearances_inferred: false,
  };
}

function assertProductionOnly(value) {
  const serialized = JSON.stringify(value);
  if (serialized.includes(PREVIEW_PROJECT_REF) || serialized.includes(PREVIEW_WORKBOOK_ID)) {
    const error = new Error("Prepared shadow payload contains a Preview resource identity.");
    error.code = "PREVIEW_RESOURCE_CONTAMINATION";
    throw error;
  }
}

export function productionizeCompletedHistoryEnvelope(previewCompatibleEnvelope = {}) {
  const year = Number(previewCompatibleEnvelope.tournament_year);
  if (!PRODUCTION_COMPLETED_HISTORY_YEARS.includes(year) ||
      clean(previewCompatibleEnvelope.tournament_id) !== String(year) ||
      clean(previewCompatibleEnvelope.source_workbook_id) !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      !/^[0-9a-f]{64}$/i.test(clean(previewCompatibleEnvelope.source_fingerprint)) ||
      !/^[0-9a-f]{64}$/i.test(clean(previewCompatibleEnvelope.payload_fingerprint))) {
    const error = new Error("A certified Production completed-History envelope is required.");
    error.code = "PRODUCTION_HISTORY_PAYLOAD_INVALID";
    throw error;
  }
  const input = {
    ...previewCompatibleEnvelope,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: String(year),
    tournament_year: year,
    director_authorization: null,
  };
  assertProductionOnly(input);
  return input;
}

export function productionCurrentShadowSourceFingerprint(source = {}) {
  return canonicalAuthorityFingerprint(productionCurrentShadowCanonicalSource(source));
}

export function productionCurrentShadowCanonicalSource(source = {}) {
  return {
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    sheets: sortedStructuredSource(source),
  };
}

export function productionizeCurrentShadowImport(canonicalImport = {}, {
  actorId: _actorId,
  sourceFingerprint,
  source,
} = {}) {
  const actor = PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_ACTOR;
  const sourcePayload = canonicalImport?.payload;
  if (!sourcePayload || typeof sourcePayload !== "object") {
    const error = new Error("A canonical Production current-tournament payload is required.");
    error.code = "PRODUCTION_CURRENT_SHADOW_PAYLOAD_INVALID";
    throw error;
  }
  if (!/^[0-9a-f]{64}$/i.test(clean(sourceFingerprint))) {
    const error = new Error("A deterministic Production current source fingerprint is required.");
    error.code = "PRODUCTION_CURRENT_SOURCE_FINGERPRINT_REQUIRED";
    throw error;
  }
  const currentContext = productionCurrentTournamentContext(source);
  const rules = productionCurrentRules(source);
  const pairingContract = productionCurrentPairingContract(source);
  const identityReconciliation = currentIdentityReconciliation(source);
  const payloadDraft = {
    ...sourcePayload,
    environment: "PRODUCTION",
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    requested_by: actor,
    tournament: {
      ...(sourcePayload.tournament || {}),
      tournament_id: PRODUCTION_TOURNAMENT_ID,
      tournament_year: PRODUCTION_TOURNAMENT_YEAR,
      scoring_authority: "GOOGLE",
      lifecycle: currentContext.status,
      current_round: currentContext.current_round,
      team_1_score: currentContext.team_1_score,
      team_2_score: currentContext.team_2_score,
      live_message: currentContext.live_message,
      source_payload: currentContext.source_payload,
    },
    matches: (sourcePayload.matches || []).map((match) => ({
      ...match,
      unresolved_mutations: 0,
    })),
    rules,
    pairing_contract: pairingContract,
    identity_reconciliation: identityReconciliation,
    shadow_safety: {
      direction: "PRODUCTION_GOOGLE_TO_PRODUCTION_SUPABASE",
      authoritative: false,
      scoring_authority: "GOOGLE",
      scoring_ingress_enabled: false,
      google_outbox_enabled: false,
      scorecard_archive_enabled: false,
      google_mirror_enabled: false,
      participant_scoring_enabled: false,
      public_reads_enabled: false,
    },
  };
  // RPC JSON cannot represent `undefined`; normalize once before hashing so
  // the in-memory template, canonical evidence string, and transported JSON
  // are the same logical object.
  const payload = JSON.parse(canonicalJson(payloadDraft));
  const sourceFingerprintValue = clean(sourceFingerprint).toLowerCase();
  const payloadFingerprintValue = canonicalAuthorityFingerprint(payload);
  const request = {
    actor_id: actor,
    environment: "PRODUCTION",
    import_contract_version: PRODUCTION_CURRENT_SHADOW_CONTRACT,
    operation: PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_OPERATION,
    payload_fingerprint: payloadFingerprintValue,
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_fingerprint: sourceFingerprintValue,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
  };
  const input = {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    actor_id: actor,
    operation: PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_OPERATION,
    claim_id: null,
    request_fingerprint: canonicalAuthorityFingerprint(request),
    request_canonical_json: canonicalJson(request),
    source_fingerprint: sourceFingerprintValue,
    payload_fingerprint: payloadFingerprintValue,
    source_payload: productionCurrentShadowCanonicalSource(source),
    source_canonical_json: canonicalJson(productionCurrentShadowCanonicalSource(source)),
    payload_canonical_json: canonicalJson(payload),
    import_contract_version: PRODUCTION_CURRENT_SHADOW_CONTRACT,
    payload,
  };
  assertProductionOnly(input);
  return input;
}

export function productionCurrentShadowClaimInput(inputTemplate = {}) {
  if (inputTemplate.import_contract_version !== PRODUCTION_CURRENT_SHADOW_CONTRACT ||
      clean(inputTemplate.project_ref) !== PRODUCTION_SUPABASE_PROJECT_REF ||
      clean(inputTemplate.project_url) !== PRODUCTION_SUPABASE_URL ||
      clean(inputTemplate.source_workbook_id) !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      clean(inputTemplate.tournament_id) !== PRODUCTION_TOURNAMENT_ID ||
      Number(inputTemplate.tournament_year) !== PRODUCTION_TOURNAMENT_YEAR ||
      clean(inputTemplate.actor_id) !== PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_ACTOR ||
      clean(inputTemplate.operation) !== PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_OPERATION ||
      !/^[0-9a-f]{64}$/i.test(clean(inputTemplate.request_fingerprint)) ||
      !/^[0-9a-f]{64}$/i.test(clean(inputTemplate.source_fingerprint)) ||
      !/^[0-9a-f]{64}$/i.test(clean(inputTemplate.payload_fingerprint))) {
    const error = new Error("A certified Production current-shadow V2 template is required.");
    error.code = "PRODUCTION_CURRENT_SHADOW_V2_TEMPLATE_REQUIRED";
    throw error;
  }
  return {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    import_contract_version: PRODUCTION_CURRENT_SHADOW_CONTRACT,
    operation: PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_OPERATION,
    actor_id: PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_ACTOR,
    request_fingerprint: inputTemplate.request_fingerprint,
    request_canonical_json: inputTemplate.request_canonical_json,
    source_fingerprint: inputTemplate.source_fingerprint,
    payload_fingerprint: inputTemplate.payload_fingerprint,
  };
}

export function claimPreparedProductionCurrentShadowInput(inputTemplate = {}, {
  claimId,
} = {}) {
  const claimInput = productionCurrentShadowClaimInput(inputTemplate);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(claimId)) ||
      clean(claimInput.request_fingerprint) !== clean(inputTemplate.request_fingerprint)) {
    const error = new Error("A matching one-time Production service-role bootstrap claim is required.");
    error.code = "PRODUCTION_CURRENT_SHADOW_V2_CLAIM_REQUIRED";
    throw error;
  }
  const input = {
    ...inputTemplate,
    claim_id: clean(claimId),
    actor_id: PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_ACTOR,
    operation: PRODUCTION_CURRENT_SHADOW_BOOTSTRAP_OPERATION,
  };
  assertProductionOnly(input);
  return input;
}

export function currentShadowImportReadiness(canonicalImport = {}, { source } = {}) {
  const payload = canonicalImport?.payload || {};
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const participants = Array.isArray(payload.match_participants) ? payload.match_participants : [];
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
  const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  const matchHoles = Array.isArray(payload.match_holes) ? payload.match_holes : [];
  const currentContext = productionCurrentTournamentContext(source);
  const rules = productionCurrentRules(source);
  const pairingContract = productionCurrentPairingContract(source);
  const identityReconciliation = currentIdentityReconciliation(source);
  const matchActivity = pairingContract.matches.filter((match) =>
    Object.values(match.activity).some(Boolean)
  );
  const codes = [];
  if (!matches.length) codes.push("CURRENT_MATCHES_UNAVAILABLE");
  if (snapshots.length !== matches.length) codes.push("CURRENT_SNAPSHOT_COUNT_MISMATCH");
  if (permissions.length !== participants.length) codes.push("CURRENT_PERMISSION_COUNT_MISMATCH");
  if (matchHoles.length !== matches.length * 18) codes.push("CURRENT_HOLE_CONFIGURATION_INCOMPLETE");
  if (!currentContext.source_present) codes.push("CURRENT_LIVE_TOURNAMENT_UNAVAILABLE");
  if (!["UPCOMING", "SCHEDULED"].includes(currentContext.status)) {
    codes.push("CURRENT_TOURNAMENT_NOT_PRE_TOURNAMENT");
  }
  if (currentContext.team_1_score !== 0 || currentContext.team_2_score !== 0) {
    codes.push("CURRENT_TOURNAMENT_SCORE_ACTIVITY_PRESENT");
  }
  const expectedRuleFormats = new Map([[1, "BB"], [2, "SC"], [3, "SI"]]);
  const ruleRoundNumbers = rules.map((rule) => rule.round_number);
  if (rules.length !== 3 || new Set(ruleRoundNumbers).size !== 3 ||
      ruleRoundNumbers.some((round) => !expectedRuleFormats.has(round)) ||
      rules.some((rule) => expectedRuleFormats.get(rule.round_number) !== rule.format)) {
    codes.push("CURRENT_RULES_UNAVAILABLE");
  }
  if (pairingContract.state === "INVALID") codes.push("CURRENT_PAIRINGS_INVALID");
  if (matchActivity.some((match) => match.activity.active)) codes.push("CURRENT_ACTIVE_MATCH_PRESENT");
  if (matchActivity.some((match) => match.activity.scored)) codes.push("CURRENT_SCORED_HOLES_PRESENT");
  if (matchActivity.some((match) => match.activity.access_active)) codes.push("CURRENT_ACCESS_ACTIVE");
  if (matchActivity.some((match) => match.activity.scoring_locked)) codes.push("CURRENT_SCORING_LOCKED");
  if (matchActivity.some((match) => match.activity.finalized)) codes.push("CURRENT_FINALIZED_ARCHIVE_PRESENT");
  if (permissions.some((permission) => permission.can_score === true)) codes.push("CURRENT_SCORING_PERMISSION_ACTIVE");
  if (Array.isArray(payload.hole_scores) && payload.hole_scores.length) codes.push("CURRENT_CANONICAL_SCORES_PRESENT");
  if (identityReconciliation.missing_player_source_ids.length ||
      identityReconciliation.unresolved_current_only_ids.length) {
    codes.push("CURRENT_2026_IDENTITIES_UNRESOLVED");
  }
  return {
    ready: codes.length === 0,
    codes,
    diagnostics: {
      matches: matches.length,
      snapshots: snapshots.length,
      participants: participants.length,
      permissions: permissions.length,
      match_holes: matchHoles.length,
      expected_match_holes: matches.length * 18,
      pairing_state: pairingContract.state,
      pairing_counts: pairingContract.counts,
      pairings: pairingContract.matches,
      current_context: currentContext,
      rules,
      identity_reconciliation: identityReconciliation,
      active_or_scored_match_count: matchActivity.length,
      no_pairings_inferred: pairingContract.no_pairings_inferred,
    },
  };
}

export function authorizePreparedProductionShadowInput(inputTemplate = {}, authorization = {}) {
  const actor = clean(inputTemplate.actor_id);
  const scope = Number(inputTemplate.tournament_year) === PRODUCTION_TOURNAMENT_YEAR
    ? CURRENT_AUTHORIZATION_SCOPE
    : HISTORY_AUTHORIZATION_SCOPE;
  if (authorization?.authorized !== true ||
      clean(authorization.scope) !== scope ||
      clean(authorization.actor_id) !== actor ||
      clean(authorization.authorization_id).length < 8 ||
      !Number.isFinite(Date.parse(clean(authorization.authorized_at)))) {
    const error = new Error("A matching, current Director shadow-import authorization is required.");
    error.code = "PRODUCTION_SHADOW_IMPORT_AUTHORIZATION_REQUIRED";
    throw error;
  }
  const input = { ...inputTemplate, director_authorization: { ...authorization } };
  assertProductionOnly(input);
  return input;
}

export async function prepareProductionShadowPayloadArtifact({
  actorId,
  requestedBy = actorId,
  loadHistorySource,
  loadCurrentSource,
  buildHistoryEnvelope = ({ source, year }) => completedHistoryImportEnvelope(
    buildCompletedHistoryYearContract({ source, year, requestedBy }),
  ),
} = {}) {
  const actor = clean(actorId);
  if (!actor) {
    const error = new Error("--actor is required for Production import provenance.");
    error.code = "PRODUCTION_IMPORT_ACTOR_REQUIRED";
    throw error;
  }
  if (typeof loadHistorySource !== "function" || typeof loadCurrentSource !== "function") {
    const error = new Error("Server-only Production source loaders are required.");
    error.code = "PRODUCTION_SHADOW_SOURCE_LOADERS_REQUIRED";
    throw error;
  }

  const [historySource, currentSource] = await Promise.all([
    loadHistorySource(),
    loadCurrentSource(),
  ]);
  const completedHistory = PRODUCTION_COMPLETED_HISTORY_YEARS.map((year) => {
    const previewCompatibleEnvelope = buildHistoryEnvelope({ source: historySource, year });
    const inputTemplate = productionizeCompletedHistoryEnvelope({
      ...previewCompatibleEnvelope,
      actor_id: actor,
    });
    return {
      year,
      rpc: HISTORY_RPC,
      source_fingerprint: inputTemplate.source_fingerprint,
      payload_fingerprint: inputTemplate.payload_fingerprint,
      certification: {
        counts: inputTemplate.source_counts || {},
        parity: inputTemplate.certification || {},
      },
      input_template: inputTemplate,
    };
  });

  let canonicalCurrent;
  try {
    canonicalCurrent = buildCanonicalScoringAuthorityImport({
      sheets: currentSource,
      sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
      requestedBy: actor,
    });
  } catch (cause) {
    const error = new Error(`Production current shadow source is not importable: ${cause?.message || cause}`);
    error.code = "PRODUCTION_CURRENT_SHADOW_SOURCE_INVALID";
    error.cause = cause;
    throw error;
  }
  if (clean(canonicalCurrent?.payload?.tournament?.tournament_id) !== PRODUCTION_TOURNAMENT_ID ||
      Number(canonicalCurrent?.payload?.tournament?.tournament_year) !== PRODUCTION_TOURNAMENT_YEAR) {
    const error = new Error("Production current shadow source does not resolve to tournament 2026.");
    error.code = "PRODUCTION_CURRENT_TOURNAMENT_SCOPE_MISMATCH";
    throw error;
  }
  const currentInput = productionizeCurrentShadowImport(canonicalCurrent, {
    actorId: actor,
    sourceFingerprint: productionCurrentShadowSourceFingerprint(currentSource),
    source: currentSource,
  });
  const currentReadiness = currentShadowImportReadiness(canonicalCurrent, { source: currentSource });
  const semanticPayload = currentReadiness.ready
    ? productionCurrentShadowSemanticProjection(currentInput.payload)
    : null;
  const semanticPayloadCanonicalJson = semanticPayload
    ? canonicalJson(semanticPayload)
    : null;
  const semanticPayloadFingerprint = semanticPayload
    ? canonicalAuthorityFingerprint(semanticPayload)
    : null;

  const artifact = {
    contract_version: PRODUCTION_SHADOW_PAYLOAD_CONTRACT,
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    project_url: PRODUCTION_SUPABASE_URL,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    safety: {
      google_reads_only: true,
      supabase_requests: 0,
      google_writes: 0,
      auth_users_created: 0,
      otp_or_sms_sends: 0,
      scoring_ingress_enabled: false,
      google_mirror_enabled: false,
      public_read_source_changed: false,
      authorization_embedded: false,
      current_shadow_import_ready: currentReadiness.ready,
    },
    completed_history: completedHistory,
    current_tournament: {
      rpc: CURRENT_RPC,
      source_fingerprint: currentInput.source_fingerprint,
      payload_fingerprint: currentInput.payload_fingerprint,
      semantic_parity_contract:
        PRODUCTION_CURRENT_SHADOW_SEMANTIC_PARITY_CONTRACT,
      semantic_payload_fingerprint: semanticPayloadFingerprint,
      semantic_payload_canonical_json: semanticPayloadCanonicalJson,
      canonical_builder_fingerprint: canonicalCurrent.fingerprint,
      counts: canonicalCurrent.counts,
      lifecycle: canonicalCurrent.lifecycle,
      readiness: currentReadiness,
      input_template: currentReadiness.ready ? currentInput : null,
    },
    import_blockers: [{
      code: "ONE_TIME_SERVICE_BOOTSTRAP_CLAIM_REQUIRED_AT_IMPORT",
      message: "Templates are intentionally inert until the approved five-minute, single-use service-role bootstrap claim is attached immediately before RPC invocation.",
    }, ...currentReadiness.ready ? [] : [{
      code: "PRODUCTION_CURRENT_SHADOW_NOT_IMPORTABLE",
      message: `Current Production shadow input is blocked: ${currentReadiness.codes.join(", ")}.`,
      diagnostics: currentReadiness.diagnostics,
    }]],
  };
  artifact.artifact_fingerprint = canonicalAuthorityFingerprint(artifact);
  assertProductionOnly(artifact);
  return artifact;
}
