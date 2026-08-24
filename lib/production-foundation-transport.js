import "server-only";

import {
  assertProductionFoundationResources,
  PRODUCTION_FOUNDATION_CONTRACT_VERSION,
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "./production-foundation-resource-contract.js";

export const PRODUCTION_SHADOW_IMPORT_RPCS = Object.freeze({
  COMPLETED_HISTORY: Object.freeze({
    import: "import_production_completed_history_year",
    readback: "read_production_completed_history_shadow",
    authorizationScope: "PRODUCTION_COMPLETED_HISTORY_SHADOW_IMPORT",
    importOperation: "COMPLETED_HISTORY_IMPORT",
    readOperation: "COMPLETED_HISTORY_READBACK",
  }),
  CURRENT_TOURNAMENT: Object.freeze({
    import: "bootstrap_import_production_current_tournament_shadow",
    readback: "read_production_current_tournament_shadow",
    authorizationScope: "PRODUCTION_CURRENT_TOURNAMENT_SHADOW_IMPORT",
    importOperation: "CURRENT_TOURNAMENT_SHADOW_IMPORT",
    scoringImportOperation: "CURRENT_SCORING_SHADOW_IMPORT",
    readOperation: "CURRENT_SHADOW_READBACK",
  }),
  SECURITY: Object.freeze({
    inspect: "inspect_production_shadow_import_security",
  }),
});

const clean = (value) => String(value ?? "").trim();
const isSha256 = (value) => /^[0-9a-f]{64}$/i.test(clean(value));

function assertProductionShadowAuthorization(authorization, expectedScope, actorId) {
  if (authorization?.authorized !== true ||
      clean(authorization.scope) !== expectedScope ||
      clean(authorization.actor_id) !== clean(actorId) ||
      clean(authorization.authorization_id).length < 8 ||
      !Number.isFinite(Date.parse(clean(authorization.authorized_at)))) {
    const error = new Error("A current Production shadow-import authorization is required.");
    error.code = "PRODUCTION_SHADOW_IMPORT_AUTHORIZATION_REQUIRED";
    throw error;
  }
}

/**
 * Server-only credentials and resource tuple for dormant Production shadow
 * work. This helper is intentionally not imported by a route or source
 * selector; adding Production traffic requires a separate reviewed cutover.
 */
export function productionFoundationTransport({
  env = process.env,
  operation,
  tournamentId,
  tournamentYear,
} = {}) {
  const scope = assertProductionFoundationResources({
    env,
    operation,
    tournamentId,
    tournamentYear,
  });

  return {
    contractVersion: PRODUCTION_FOUNDATION_CONTRACT_VERSION,
    operation: scope.operation,
    policy: scope.policy,
    environment: "PRODUCTION",
    mode: "DORMANT_SHADOW",
    supabase: {
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      url: PRODUCTION_SUPABASE_URL,
      secretKey: env.PRODUCTION_SUPABASE_SECRET_KEY,
    },
    google: {
      sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID,
      writeAllowed: false,
    },
    tournament: {
      id: scope.resources.tournamentId,
      year: scope.resources.tournamentYear,
      scopeKind: scope.tournamentScopeKind,
    },
    safety: {
      currentTournamentAuthority: "google",
      scoringAuthority: "google",
      participantIdentityAuthority: "passport",
      scoringIngressEnabled: false,
      googleMirrorDeliveryEnabled: false,
      publicReadEnabled: false,
      oddsPublicationEnabled: false,
      authUserCreationEnabled: false,
    },
  };
}

export function productionFoundationTransportDiagnostics(options = {}) {
  const transport = productionFoundationTransport(options);
  return {
    contractVersion: transport.contractVersion,
    operation: transport.operation,
    policy: transport.policy,
    environment: transport.environment,
    mode: transport.mode,
    supabase: {
      projectRef: transport.supabase.projectRef,
      host: new URL(transport.supabase.url).hostname,
      credentialsConfigured: Boolean(transport.supabase.secretKey),
    },
    google: transport.google,
    tournament: transport.tournament,
    safety: transport.safety,
  };
}

export function productionCompletedHistoryShadowTransport({ env = process.env, year } = {}) {
  return productionFoundationTransport({
    env,
    operation: PRODUCTION_SHADOW_IMPORT_RPCS.COMPLETED_HISTORY.importOperation,
    tournamentId: String(year),
    tournamentYear: Number(year),
  });
}

export function productionCurrentTournamentShadowTransport({ env = process.env, scoring = false } = {}) {
  return productionFoundationTransport({
    env,
    operation: scoring
      ? PRODUCTION_SHADOW_IMPORT_RPCS.CURRENT_TOURNAMENT.scoringImportOperation
      : PRODUCTION_SHADOW_IMPORT_RPCS.CURRENT_TOURNAMENT.importOperation,
  });
}

export function productionCompletedHistoryImportInput({
  env = process.env,
  previewCompatibleEnvelope,
  authorization,
  correction,
} = {}) {
  const envelope = previewCompatibleEnvelope || {};
  const year = Number(envelope.tournament_year);
  const transport = productionCompletedHistoryShadowTransport({ env, year });
  const actorId = clean(envelope.actor_id);
  assertProductionShadowAuthorization(
    authorization,
    PRODUCTION_SHADOW_IMPORT_RPCS.COMPLETED_HISTORY.authorizationScope,
    actorId,
  );
  if (!isSha256(envelope.source_fingerprint) || !isSha256(envelope.payload_fingerprint)) {
    const error = new Error("Production completed-History source and payload fingerprints are required.");
    error.code = "PRODUCTION_HISTORY_FINGERPRINT_REQUIRED";
    throw error;
  }
  return {
    ...envelope,
    environment: "PRODUCTION",
    project_ref: transport.supabase.projectRef,
    source_workbook_id: transport.google.sourceWorkbookId,
    tournament_id: transport.tournament.id,
    tournament_year: transport.tournament.year,
    director_authorization: authorization,
    ...(correction ? { correction } : {}),
  };
}

export function productionCurrentTournamentImportInput({
  env = process.env,
  canonicalImport,
  sourceFingerprint,
  payloadFingerprint,
  importContractVersion = "production-current-shadow-v1",
  actorId,
  authorization,
} = {}) {
  const transport = productionCurrentTournamentShadowTransport({ env, scoring: true });
  assertProductionShadowAuthorization(
    authorization,
    PRODUCTION_SHADOW_IMPORT_RPCS.CURRENT_TOURNAMENT.authorizationScope,
    actorId,
  );
  if (!isSha256(sourceFingerprint) || !isSha256(payloadFingerprint)) {
    const error = new Error("Production current-tournament source and payload fingerprints are required.");
    error.code = "PRODUCTION_CURRENT_SHADOW_FINGERPRINT_REQUIRED";
    throw error;
  }
  const sourcePayload = canonicalImport?.payload || canonicalImport;
  if (!sourcePayload || typeof sourcePayload !== "object") {
    const error = new Error("A canonical current-tournament import payload is required.");
    error.code = "PRODUCTION_CURRENT_SHADOW_PAYLOAD_REQUIRED";
    throw error;
  }
  return {
    environment: "PRODUCTION",
    project_ref: transport.supabase.projectRef,
    source_workbook_id: transport.google.sourceWorkbookId,
    tournament_id: transport.tournament.id,
    tournament_year: transport.tournament.year,
    actor_id: clean(actorId),
    director_authorization: authorization,
    source_fingerprint: clean(sourceFingerprint).toLowerCase(),
    payload_fingerprint: clean(payloadFingerprint).toLowerCase(),
    import_contract_version: clean(importContractVersion),
    payload: {
      ...sourcePayload,
      environment: "PRODUCTION",
      source_workbook_id: transport.google.sourceWorkbookId,
      tournament: {
        ...(sourcePayload.tournament || {}),
        tournament_id: transport.tournament.id,
        tournament_year: transport.tournament.year,
      },
    },
  };
}
