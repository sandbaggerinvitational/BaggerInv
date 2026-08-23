import {
  buildCompletedHistoryYearContract,
  completedHistoryImportEnvelope,
} from "./completed-history-contract.js";
import {
  buildCanonicalScoringAuthorityImport,
  canonicalAuthorityFingerprint,
} from "./scoring-authority-supabase.js";
import {
  PRODUCTION_COMPLETED_HISTORY_YEARS,
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
  PRODUCTION_TOURNAMENT_YEAR,
} from "./production-foundation-resource-contract.js";

export const PRODUCTION_SHADOW_PAYLOAD_CONTRACT =
  "production-shadow-payload-preparation-v1";

const PREVIEW_PROJECT_REF = "idgigvjjqkfbqjeredpb";
const PREVIEW_WORKBOOK_ID = "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts";
const clean = (value) => String(value ?? "").trim();
const PRODUCTION_CURRENT_SHADOW_SHEETS = Object.freeze([
  "Tournaments", "Players", "Handicaps", "Team Names", "Rounds", "Courses",
  "Course Holes", "Live Matches", "Matches", "Live Hole Scores",
  "Match Update Log", "Admin Audit Log",
]);
const HISTORY_RPC = "import_production_completed_history_year";
const CURRENT_RPC = "import_production_current_tournament_shadow";
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
  return canonicalAuthorityFingerprint({
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    sheets: sortedStructuredSource(source),
  });
}

export function productionizeCurrentShadowImport(canonicalImport = {}, {
  actorId,
  sourceFingerprint,
} = {}) {
  const actor = clean(actorId);
  const sourcePayload = canonicalImport?.payload;
  if (!actor || !sourcePayload || typeof sourcePayload !== "object") {
    const error = new Error("A Production actor and canonical current-tournament payload are required.");
    error.code = "PRODUCTION_CURRENT_SHADOW_PAYLOAD_INVALID";
    throw error;
  }
  if (!/^[0-9a-f]{64}$/i.test(clean(sourceFingerprint))) {
    const error = new Error("A deterministic Production current source fingerprint is required.");
    error.code = "PRODUCTION_CURRENT_SOURCE_FINGERPRINT_REQUIRED";
    throw error;
  }
  const payload = {
    ...sourcePayload,
    environment: "PRODUCTION",
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    requested_by: actor,
    tournament: {
      ...(sourcePayload.tournament || {}),
      tournament_id: PRODUCTION_TOURNAMENT_ID,
      tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    },
  };
  const input = {
    environment: "PRODUCTION",
    project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
    tournament_id: PRODUCTION_TOURNAMENT_ID,
    tournament_year: PRODUCTION_TOURNAMENT_YEAR,
    actor_id: actor,
    director_authorization: null,
    source_fingerprint: clean(sourceFingerprint).toLowerCase(),
    payload_fingerprint: canonicalAuthorityFingerprint(payload),
    import_contract_version: "production-current-shadow-v1",
    payload,
  };
  assertProductionOnly(input);
  return input;
}

export function currentShadowImportReadiness(canonicalImport = {}) {
  const payload = canonicalImport?.payload || {};
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const participants = Array.isArray(payload.match_participants) ? payload.match_participants : [];
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
  const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  const matchHoles = Array.isArray(payload.match_holes) ? payload.match_holes : [];
  const participantCounts = new Map();
  for (const participant of participants) {
    participantCounts.set(participant.match_id, (participantCounts.get(participant.match_id) || 0) + 1);
  }
  const incompletePairings = matches.flatMap((match) => {
    const expected = clean(match.format).toUpperCase() === "SI" ? 2 : 4;
    const actual = participantCounts.get(match.match_id) || 0;
    return actual === expected ? [] : [{ match_id: match.match_id, format: match.format, expected, actual }];
  });
  const codes = [];
  if (!matches.length) codes.push("CURRENT_MATCHES_UNAVAILABLE");
  if (snapshots.length !== matches.length) codes.push("CURRENT_SNAPSHOT_COUNT_MISMATCH");
  if (permissions.length !== participants.length) codes.push("CURRENT_PERMISSION_COUNT_MISMATCH");
  if (matchHoles.length !== matches.length * 18) codes.push("CURRENT_HOLE_CONFIGURATION_INCOMPLETE");
  if (incompletePairings.length) codes.push("CURRENT_PAIRINGS_INCOMPLETE");
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
      incomplete_pairing_count: incompletePairings.length,
      incomplete_pairings: incompletePairings,
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
  });
  const currentReadiness = currentShadowImportReadiness(canonicalCurrent);

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
      canonical_builder_fingerprint: canonicalCurrent.fingerprint,
      counts: canonicalCurrent.counts,
      lifecycle: canonicalCurrent.lifecycle,
      readiness: currentReadiness,
      input_template: currentReadiness.ready ? currentInput : null,
    },
    import_blockers: [{
      code: "FRESH_DIRECTOR_AUTHORIZATION_REQUIRED_AT_IMPORT",
      message: "Templates are intentionally inert until a fresh, matching Director authorization is attached immediately before RPC invocation.",
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
