import { requireScoringAuthority } from "./scoring-authority.js";
import { beginScoringIngress, completeScoringIngress, finalizeCanonicalMatch, mutateCanonicalMatchControl, readCanonicalScoringAuthority, reopenCanonicalMatch, submitCanonicalHoleScore } from "./scoring-authority-supabase.js";
import { confirmLiveMatchScorecard, saveLiveHoleScore, withWorkbookWriteDiagnostics } from "./google-sheets-write.js";
import { mobileNativeDevelopmentAuthorityEnvironment } from "./mobile-native-development-authority.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

async function withProductionGoogleAuthorityWriteBoundary(input, operation, env = process.env) {
  const { withProductionGoogleAuthorityWrite } = await import("./production-cutover-scoring-ingress.js");
  return withProductionGoogleAuthorityWrite(input, operation, { env });
}

async function assertParticipantMutationAuthorityContract(contract, request, env = process.env) {
  const { assertCurrentScoringMutationAuthorityContract } = await import("./scoring-mutation-authority-server.js");
  return assertCurrentScoringMutationAuthorityContract(contract, { request, env });
}

function canonicalAuthorization(current, matchId, verified = {}, {
  previewMobileIdentityVerified = false,
  mobileNativeContext = false,
  mobileIdentityBound = false,
  productionDeployment = false,
} = {}) {
  const verifiedIdentity = mobileNativeContext && !mobileIdentityBound
    ? {}
    : verified.identity || verified.director || {};
  return {
    // These are server-to-RPC transport assertions, never client claims. The
    // Preview RPC's legacy passport assertion is true only after the complete
    // isolated native authority and exact server-resolved identity are proven.
    // Production retains its separate translation unchanged.
    passport_verified: previewMobileIdentityVerified,
    production_verified: mobileNativeContext ? productionDeployment : true,
    auth_user_id: clean(verifiedIdentity.authUserId || current.authUserId),
    tournament_id: clean(current.tournamentId || current.year || "2026"),
    match_id: matchId,
    player_id: clean(verifiedIdentity.playerId || current.playerId || `match-access:${matchId}`),
    permission_revision: Math.max(1, number(current.accessVersion, 1)),
    role: current.scope === "admin" ? "DIRECTOR" : current.playerId ? "PLAYER" : "MATCH_ACCESS",
  };
}

async function canonicalMatchContext(current, matchId) {
  const read = await readCanonicalScoringAuthority({ match_id: matchId, mode: "MATCH" });
  const match = read.payload?.data;
  if (!read.payload?.ok || !match) throw new Error("The authoritative match was not found.");
  return {
    tournamentId: clean(current.tournamentId || match.tournament_id),
    matchRevision: number(match.match_revision),
    permissionRevision: Math.max(1, number(match.permission_revision, current.accessVersion || 1)),
  };
}

function participantHole(result, includeCanonicalAcknowledgement = false) {
  return {
    "Hole Score ID": `${result.match_id}-H${result.hole_number}`,
    "Match ID": result.match_id,
    "Hole Number": result.hole_number,
    "Team 1 Gross Scores": result.gross?.team_1,
    "Team 2 Gross Scores": result.gross?.team_2,
    ...(includeCanonicalAcknowledgement ? {
      "Team 1 Strokes": result.strokes?.team_1,
      "Team 2 Strokes": result.strokes?.team_2,
    } : {}),
    "Team 1 Net Score": result.net?.team_1,
    "Team 2 Net Score": result.net?.team_2,
    "Hole Winner": result.hole_winner,
    Revision: result.hole_revision,
    "Updated At": result.updated_at,
    "Updated By": "Authorized participant",
  };
}

export async function persistParticipantScore({
  matchId,
  input,
  current,
  updatedBy,
  canonicalContext: suppliedCanonicalContext,
  authorizationContext = {},
  includeCanonicalAcknowledgement = false,
  request,
  env = process.env,
  dependencies = {},
}) {
  const authority = (dependencies.requireScoringAuthority || requireScoringAuthority)(env);
  if (authority.resolved === "google") {
    let ingressLease = "";
    if (authority.previewDeployment && authority.credentialsConfigured) {
      const lease = await beginScoringIngress({ tournament_id: clean(current.tournamentId || current.year || "2026"), match_id: matchId,
        expected_authority: "GOOGLE", actor_id: clean(current.playerId || updatedBy), lease_seconds: 180 });
      if (!lease.payload?.ok) throw canonicalPersistenceError(lease.payload);
      ingressLease = clean(lease.payload.lease_id);
    }
    try {
      const measured = await withProductionGoogleAuthorityWriteBoundary({
        tournamentId: clean(current.tournamentId || current.year || "2026"),
        matchId,
        actorId: clean(current.playerId || updatedBy),
        operation: `PARTICIPANT:${clean(input.action || "SCORE")}`,
        operationRequestId: clean(input.operationRequestId || input.operation_request_id || input.clientMutationId),
        scoringAuthorityContract: input.scoringAuthorityContract,
        request,
      }, () => withWorkbookWriteDiagnostics("participant-score", () => input.action === "confirm"
        ? confirmLiveMatchScorecard(matchId, updatedBy)
        : saveLiveHoleScore(matchId, input, updatedBy)));
      return { authority: "google", result: measured.result, diagnostics: measured.diagnostics };
    } finally {
      if (ingressLease) await completeScoringIngress({ lease_id: ingressLease }).catch((error) => {
        console.error("Scoring ingress lease completion failed", { matchId, reason: error?.message || "unknown" });
      });
    }
  }
  const mobileNativeContext = authorizationContext.source === "mobile-native-certified";
  const serverBoundMobileV1 = Boolean(
    suppliedCanonicalContext &&
    includeCanonicalAcknowledgement &&
    mobileNativeContext &&
    clean(current.identityAuthority).toLowerCase() === "supabase" &&
    clean(current.authUserId) &&
    clean(current.playerId) &&
    clean(current.matchId || matchId) === clean(matchId) &&
    clean(current.tournamentId) === clean(suppliedCanonicalContext.tournamentId) &&
    clean(authorizationContext.identity?.authUserId) === clean(current.authUserId) &&
    clean(authorizationContext.identity?.playerId) === clean(current.playerId) &&
    clean(authorizationContext.identity?.tournamentId) === clean(current.tournamentId)
  );
  const nativeAuthority = serverBoundMobileV1
    ? (dependencies.mobileNativeDevelopmentAuthorityEnvironment || mobileNativeDevelopmentAuthorityEnvironment)(env)
    : null;
  const previewMobileIdentityVerified = Boolean(
    authority.previewDeployment &&
    serverBoundMobileV1 &&
    nativeAuthority?.available &&
    clean(nativeAuthority.identityAuthority).toLowerCase() === "supabase"
  );
  if ((authority.productionDeployment && !serverBoundMobileV1) || input.scoringAuthorityContract) {
    await assertParticipantMutationAuthorityContract(input.scoringAuthorityContract, request);
  }
  const context = suppliedCanonicalContext || await canonicalMatchContext(current, matchId);
  const authoritativeCurrent = { ...current, tournamentId: context.tournamentId, accessVersion: context.permissionRevision };
  if (input.action === "confirm") {
    const response = await (dependencies.finalizeCanonicalMatch || finalizeCanonicalMatch)({
      match_id: matchId,
      mutation_key: input.clientMutationId || `finalize:${matchId}:${Date.now()}`,
      expected_match_revision: input.expectedMatchRevision == null ? context.matchRevision : number(input.expectedMatchRevision, -1),
      authorization: canonicalAuthorization(authoritativeCurrent, matchId, authorizationContext, {
        previewMobileIdentityVerified,
        mobileNativeContext,
        mobileIdentityBound: serverBoundMobileV1,
        productionDeployment: authority.productionDeployment,
      }),
    }, { env });
    if (!response.payload?.ok) throw canonicalPersistenceError(response.payload);
    return { authority: "supabase", result: {
      "Match ID": matchId, "Match Status": "Final", "Finalized At": response.payload.updated_at,
      updatedAt: response.payload.updated_at, matchRevision: response.payload.match_revision,
      matchComplete: true, resultWinner: response.payload.result_winner,
      ...(includeCanonicalAcknowledgement ? {
        permissionRevision: response.payload.permission_revision,
        acceptedCode: response.payload.code,
        idempotent: response.payload.idempotent === true,
        auditCreated: response.payload.audit_created !== false,
        googleOutboxCreated: response.payload.google_outbox_created !== false,
      } : {}),
    }, diagnostics: { supabaseAuthoritativeMs: response.durationMs } };
  }
  const response = await (dependencies.submitCanonicalHoleScore || submitCanonicalHoleScore)({
    match_id: matchId,
    hole_number: input.holeNumber,
    team_1_gross_scores: input.team1GrossScores,
    team_2_gross_scores: input.team2GrossScores,
    expected_match_revision: input.expectedMatchRevision ?? context.matchRevision,
    expected_match_updated_at: input.expectedUpdatedAt,
    expected_hole_revision: input.expectedRevision,
    mutation_key: input.clientMutationId,
    authorization: canonicalAuthorization(authoritativeCurrent, matchId, authorizationContext, {
      previewMobileIdentityVerified,
      mobileNativeContext,
      mobileIdentityBound: serverBoundMobileV1,
      productionDeployment: authority.productionDeployment,
    }),
  }, { env });
  if (!response.payload?.ok) throw canonicalPersistenceError(response.payload);
  return { authority: "supabase", result: {
    hole: participantHole(response.payload, includeCanonicalAcknowledgement),
    liveStatus: {
      currentHole: response.payload.match?.current_hole,
      holesRemaining: response.payload.match?.holes_remaining,
      team1HolesWon: response.payload.match?.team_1_holes_won,
      team2HolesWon: response.payload.match?.team_2_holes_won,
      statusText: response.payload.match?.running_result,
      complete: response.payload.match?.clinched,
      winner: response.payload.match?.result_winner,
    },
    points: {
      frontWinner: response.payload.match?.front_winner,
      backWinner: response.payload.match?.back_winner,
      overallWinner: response.payload.match?.overall_winner,
      team1Points: response.payload.match?.team_1_points,
      team2Points: response.payload.match?.team_2_points,
    },
    matchComplete: Boolean(response.payload.match?.scorecard_complete),
    updatedAt: response.payload.updated_at,
    matchRevision: response.payload.match_revision,
    ...(includeCanonicalAcknowledgement ? {
      acceptedCode: response.payload.code,
      idempotent: response.payload.idempotent === true,
      semanticNoop: response.payload.semantic_noop === true,
      auditCreated: response.payload.audit_created !== false,
      googleOutboxCreated: response.payload.google_outbox_created !== false,
    } : {}),
    updatedBy,
  }, diagnostics: { supabaseAuthoritativeMs: response.durationMs, postgresTimings: response.payload.timings } };
}

export function canonicalPersistenceError(payload = {}) {
  const message = ({
    MATCH_REVISION_CONFLICT: "This match was updated by someone else. Refresh before saving again.",
    HOLE_REVISION_CONFLICT: "This hole was updated by someone else. Refresh before saving again.",
    IDEMPOTENCY_CONFLICT: "This score mutation conflicts with a previous request.",
    SCORING_LOCKED: "Scoring has been locked by the Tournament Director.",
    MATCH_FINAL: "This scorecard is already finalized.",
    UNAUTHORIZED: "Scoring authorization needs to be refreshed.",
    PERMISSION_STALE: "Scoring authorization needs to be refreshed.",
    SCORECARD_INCOMPLETE: "All 18 holes must be confirmed before final submission.",
    UNRESOLVED_MUTATIONS: "Resolve pending score issues before final submission.",
    SCORING_INGRESS_PAUSED: "Scoring is briefly paused for a verified authority transition.",
    SUPABASE_NOT_AUTHORITY: "Supabase scoring authority is not active.",
    AUTHORITY_BOUNDARY_MISMATCH: "Scoring is briefly paused while the verified authority changes.",
    PRODUCTION_MATCH_NOT_SCORING_READY: "Complete Tournament Setup and prepare a current scoring snapshot before marking this match Live.",
  })[payload.code] || "The authoritative score transaction could not be completed.";
  const error = new Error(message);
  error.code = payload.code;
  error.status = /CONFLICT|PRODUCTION_MATCH_NOT_SCORING_READY/.test(payload.code || "")
    ? 409
    : /UNAUTHORIZED|PERMISSION_STALE/.test(payload.code || "") ? 403 : 400;
  error.authoritativeDiagnostics = payload;
  return error;
}

export async function persistDirectorMatchLifecycle({
  action,
  matchId,
  updatedBy,
  authUserId,
  playerId,
  operationRequestId,
  expectedMatchRevision,
  expectedPermissionRevision,
}) {
  const authority = requireScoringAuthority();
  if (authority.resolved === "google") return { authority: "google", delegated: false };
  const read = await readCanonicalScoringAuthority({ match_id: matchId, mode: "MATCH" });
  const match = read.payload?.data;
  if (!match) throw new Error("The authoritative match was not found.");
  const input = {
    match_id: matchId,
    mutation_key: clean(operationRequestId || `director:${action}:${matchId}:${globalThis.crypto?.randomUUID?.() || Date.now()}`),
    expected_match_revision: expectedMatchRevision == null
      ? number(match.match_revision)
      : number(expectedMatchRevision, -1),
    authorization: {
      passport_verified: true,
      auth_user_id: clean(authUserId),
      tournament_id: match.tournament_id,
      match_id: matchId,
      player_id: clean(playerId || updatedBy || "Tournament Director"),
      permission_revision: expectedPermissionRevision == null
        ? number(match.permission_revision, 1)
        : number(expectedPermissionRevision, -1),
      role: "DIRECTOR",
    },
  };
  const response = action === "finalize"
    ? await finalizeCanonicalMatch(input)
    : action === "reopen"
      ? await reopenCanonicalMatch(input)
      : ["mark-live", "scoring-lock", "scoring-unlock", "access-activate", "access-revoke"].includes(action)
        ? await mutateCanonicalMatchControl({
            ...input,
            operation: action.replaceAll("-", "_").toUpperCase(),
          })
        : null;
  if (!response) {
    const error = new Error("This Director operation is not supported under Supabase scoring authority.");
    error.code = "OPERATION_NOT_SUPPORTED_UNDER_SUPABASE_AUTHORITY";
    error.status = 409;
    throw error;
  }
  if (!response.payload?.ok) throw canonicalPersistenceError(response.payload);
  return { authority: "supabase", delegated: true, result: response.payload };
}
