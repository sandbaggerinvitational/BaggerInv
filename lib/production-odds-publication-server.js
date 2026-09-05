import "server-only";

import { createHash } from "node:crypto";

import {
  productionCurrentOddsCalculationRpc,
  resolveProductionOddsRuntimeContext,
} from "./production-odds-calculation-server.js";
import { PRODUCTION_TOURNAMENT_ID } from "./production-foundation-resource-contract.js";
import { PRODUCTION_VERCEL_TEAM_ID } from "./production-maintenance-precommit-deployment-rebind.js";
import { canonicalJson, scoringShadowPayloadHash } from "./scoring-shadow.js";

export const PRODUCTION_ODDS_PUBLICATION_CONTRACT =
  "production-odds-publication-v1";
export const PRODUCTION_ODDS_WITHDRAWAL_CONTRACT =
  "production-odds-publication-withdrawal-v1";
export const PRODUCTION_ODDS_WITHDRAWAL_REASONS = Object.freeze([
  "TOURNAMENT_SETUP_CHANGED",
  "PUBLICATION_CORRECTION_REQUIRED",
]);

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const uuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(clean(value));

function operationError(code, message, diagnostics = {}, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.diagnostics = diagnostics;
  return error;
}

function publicationData(payload = {}) {
  const data = payload?.data && typeof payload.data === "object"
    ? payload.data
    : payload;
  const publication = data?.publication && typeof data.publication === "object"
    ? data.publication
    : data;
  return {
    ...publication,
    tournament_id: clean(
      data?.tournament?.tournament_id || data?.tournament_id,
    ),
    publication_authority: clean(
      publication.authority || publication.publication_authority,
    ),
    published_snapshot_id: clean(
      publication.snapshot_id || publication.published_snapshot_id,
    ) || null,
    snapshots: Array.isArray(data?.snapshots) ? data.snapshots : [],
    withdrawal_history: Array.isArray(data?.withdrawal_history)
      ? data.withdrawal_history
      : [],
    history_count: Number(data?.history_count || 0),
  };
}

async function publicationRuntimeContext({
  env,
  runtimeContext,
  resolveRuntime,
}) {
  if (runtimeContext) return runtimeContext;
  // A custom transport is not authority evidence. Tests and callers that
  // replace the RPC must also inject the server-authoritative resolver (or an
  // already validated runtime context); no implicit 2026 fallback is allowed.
  return resolveRuntime({ env });
}

export async function readProductionOddsPublicationState({
  env = process.env,
  rpc = productionCurrentOddsCalculationRpc,
  runtimeContext,
  resolveRuntime = resolveProductionOddsRuntimeContext,
} = {}) {
  const context = await publicationRuntimeContext({
    env,
    runtimeContext,
    resolveRuntime,
  });
  const target = context.runtime.tournamentId;
  const result = await rpc(
    "read_production_odds_publication_v1",
    {
      operation: "READ_PRODUCTION_ODDS_PUBLICATION_V1",
      contract_version: PRODUCTION_ODDS_PUBLICATION_CONTRACT,
      vercel_team_id: PRODUCTION_VERCEL_TEAM_ID,
      vercel_environment: "production",
    },
    { env, runtimeContext: context },
  );
  const payload = result?.payload || {};
  const data = publicationData(payload);
  if (payload.ok !== true || clean(data.tournament_id) !== target) {
    throw operationError(
      clean(payload.code || "PRODUCTION_ODDS_PUBLICATION_STATE_UNAVAILABLE"),
      "Production Championship Odds publication state is unavailable.",
    );
  }
  const revision = Number(data.publication_revision);
  const activationRevision = Number(data.activation_revision);
  const authorityEpochId = lower(data.authority_epoch_id);
  const currentSnapshotId = clean(data.published_snapshot_id || data.snapshot_id);
  const publicationState = clean(data.state || data.publication_state ||
    (currentSnapshotId ? "PUBLISHED" : "UNPUBLISHED")).toUpperCase();
  const pointerRevision = Number(
    data.publication_pointer_revision ?? data.publication_revision,
  );
  const predecessorSnapshotId = clean(
    data.predecessor_snapshot_id || currentSnapshotId,
  );
  if (!Number.isSafeInteger(revision) || revision < 0 ||
      !Number.isSafeInteger(activationRevision) || activationRevision < 0 ||
      !Number.isSafeInteger(pointerRevision) || pointerRevision < 0 ||
      !uuid(authorityEpochId) ||
      clean(data.publication_authority).toUpperCase() !== "SUPABASE" ||
      !["PUBLISHED", "WITHDRAWN", "UNPUBLISHED"].includes(publicationState) ||
      (currentSnapshotId && !uuid(currentSnapshotId)) ||
      (predecessorSnapshotId && !uuid(predecessorSnapshotId)) ||
      (publicationState === "PUBLISHED" && !currentSnapshotId) ||
      (publicationState !== "PUBLISHED" && currentSnapshotId)) {
    throw operationError(
      "PRODUCTION_ODDS_PUBLICATION_STATE_INVALID",
      "Production Championship Odds publication state is invalid.",
      {},
      409,
    );
  }
  return {
    ...data,
    publication_state: publicationState,
    publication_revision: revision,
    published_snapshot_id: currentSnapshotId || null,
    publication_pointer_revision: pointerRevision,
    publication_predecessor_snapshot_id: predecessorSnapshotId || null,
    activation_revision: activationRevision,
    authority_epoch_id: authorityEpochId,
    runtimeContext: context,
  };
}

export function productionOddsWithdrawalRequest({
  tournamentId,
  expectedAnnualPointerRevision,
  expectedPublicationPointerRevision,
  expectedPublicationRevision,
  expectedPublicationSnapshotId,
  actorAuthUserId,
  actorPlayerId,
  reasonCode = "TOURNAMENT_SETUP_CHANGED",
} = {}) {
  const target = clean(tournamentId);
  const annualRevision = Number(expectedAnnualPointerRevision);
  const pointerRevision = Number(expectedPublicationPointerRevision);
  const publicationRevision = Number(expectedPublicationRevision);
  const snapshotId = lower(expectedPublicationSnapshotId);
  const authUserId = lower(actorAuthUserId);
  const playerId = clean(actorPlayerId).toUpperCase();
  const reason = clean(reasonCode).toUpperCase();
  if (!/^20\d{2}$/.test(target) || !uuid(authUserId) || !playerId ||
      !uuid(snapshotId) || !Number.isSafeInteger(annualRevision) ||
      annualRevision < 1 || !Number.isSafeInteger(pointerRevision) ||
      pointerRevision < 1 || !Number.isSafeInteger(publicationRevision) ||
      publicationRevision < 1 ||
      !PRODUCTION_ODDS_WITHDRAWAL_REASONS.includes(reason)) {
    throw operationError(
      "ODDS_WITHDRAWAL_INPUT_INVALID",
      "The bounded Championship Odds withdrawal input is incomplete.",
      {},
      400,
    );
  }
  const canonical = {
    actorAuthUserId: authUserId,
    actorPlayerId: playerId,
    contractVersion: PRODUCTION_ODDS_WITHDRAWAL_CONTRACT,
    expectedAnnualPointerRevision: annualRevision,
    expectedCurrentTournamentId: target,
    expectedPublicationPointerRevision: pointerRevision,
    expectedPublicationRevision: publicationRevision,
    expectedPublicationSnapshotId: snapshotId,
    operation: "WITHDRAW",
    reasonCode: reason,
    targetTournamentId: target,
  };
  return Object.freeze({
    canonical,
    canonicalJson: canonicalJson(canonical),
    payloadHash: scoringShadowPayloadHash(canonical),
  });
}

export async function withdrawProductionOddsPublication({
  expectedPublicationPointerRevision,
  expectedPublicationRevision,
  expectedPublicationSnapshotId,
  actorAuthUserId,
  actorPlayerId,
  operationRequestId,
  reasonCode = "TOURNAMENT_SETUP_CHANGED",
  env = process.env,
  rpc = productionCurrentOddsCalculationRpc,
  runtimeContext,
  resolveRuntime = resolveProductionOddsRuntimeContext,
} = {}) {
  const context = await publicationRuntimeContext({
    env,
    runtimeContext,
    resolveRuntime,
  });
  const target = context.runtime.tournamentId;
  const annualPointerRevision = Number(context.runtime.pointerRevision);
  const operationId = lower(operationRequestId);
  if (!uuid(operationId)) {
    throw operationError(
      "ODDS_WITHDRAWAL_INPUT_INVALID",
      "A secure Odds withdrawal operation identity is required.",
      {},
      400,
    );
  }
  const request = productionOddsWithdrawalRequest({
    tournamentId: target,
    expectedAnnualPointerRevision: annualPointerRevision,
    expectedPublicationPointerRevision,
    expectedPublicationRevision,
    expectedPublicationSnapshotId,
    actorAuthUserId,
    actorPlayerId,
    reasonCode,
  });
  const annual = context.frozen2026 ? {} : {
    expected_runtime_generation_id: context.runtime.runtimeGenerationId,
    expected_annual_authority_generation_id:
      context.runtime.authorityGenerationId,
    expected_annual_admission_generation_id:
      context.runtime.admissionGenerationId,
  };
  const result = await rpc("withdraw_production_odds_publication_v1", {
    operation: "WITHDRAW_PRODUCTION_ODDS_PUBLICATION_V1",
    contract_version: PRODUCTION_ODDS_WITHDRAWAL_CONTRACT,
    operation_request_id: operationId,
    target_tournament_id: target,
    expected_current_tournament_id: target,
    expected_annual_pointer_revision: annualPointerRevision,
    expected_publication_pointer_revision:
      Number(expectedPublicationPointerRevision),
    expected_publication_revision: Number(expectedPublicationRevision),
    expected_snapshot_id: lower(expectedPublicationSnapshotId),
    reason_code: clean(reasonCode).toUpperCase(),
    request_canonical_json: request.canonicalJson,
    request_payload_hash: request.payloadHash,
    ...annual,
    authorization: {
      auth_user_id: lower(actorAuthUserId),
      player_id: clean(actorPlayerId).toUpperCase(),
      role: "DIRECTOR",
      tournament_id: target,
    },
  }, { env, runtimeContext: context });
  const payload = result?.payload || {};
  const pointerRevision = Number(payload.publication_pointer_revision);
  if (payload.ok !== true ||
      clean(payload.publication_state).toUpperCase() !== "WITHDRAWN" ||
      payload.current_publication !== false ||
      payload.current_snapshot_id !== null ||
      lower(payload.withdrawn_snapshot_id) !== lower(expectedPublicationSnapshotId) ||
      Number(payload.publication_revision) !== Number(expectedPublicationRevision) ||
      pointerRevision !== Number(expectedPublicationPointerRevision) + 1 ||
      payload.historical_publication_preserved !== true ||
      payload.calculation_created !== false ||
      payload.publication_created !== false || Number(payload.google_writes) !== 0) {
    throw operationError(
      clean(payload.code || "ODDS_WITHDRAWAL_OPERATION_FAILED"),
      "The Championship Odds withdrawal could not be verified.",
      {},
      409,
    );
  }
  return payload;
}

export function productionOddsPublicationRequestFingerprint({
  jobId,
  expectedPublicationRevision,
  expectedSnapshotId,
  expectedActivationRevision,
  expectedAuthorityEpochId,
  actorAuthUserId,
  actorPlayerId,
  tournamentId = PRODUCTION_TOURNAMENT_ID,
} = {}) {
  const normalizedJobId = lower(jobId);
  const revision = Number(expectedPublicationRevision);
  const snapshotId = lower(expectedSnapshotId);
  const authUserId = lower(actorAuthUserId);
  const playerId = clean(actorPlayerId);
  const activationRevision = Number(expectedActivationRevision);
  const authorityEpochId = lower(expectedAuthorityEpochId);
  const target = clean(tournamentId);
  if (!/^[0-9a-f]{64}$/.test(normalizedJobId) ||
      !Number.isSafeInteger(revision) || revision < 0 ||
      (snapshotId && !uuid(snapshotId)) || !uuid(authUserId) || !playerId ||
      !/^\d{4}$/.test(target)) {
    throw operationError(
      "PRODUCTION_ODDS_PUBLICATION_INPUT_INVALID",
      "The bounded Production Championship Odds publication input is incomplete.",
      {},
      400,
    );
  }
  if (!Number.isSafeInteger(activationRevision) || activationRevision < 0 ||
      !uuid(authorityEpochId)) {
    throw operationError(
      "PRODUCTION_ODDS_PUBLICATION_AUTHORITY_BINDING_INVALID",
      "The bounded Production Championship Odds authority binding is incomplete.",
      {},
      400,
    );
  }
  return createHash("sha256").update([
    PRODUCTION_ODDS_PUBLICATION_CONTRACT,
    "PUBLISH",
    target,
    normalizedJobId,
    String(activationRevision),
    authorityEpochId,
    authUserId,
    playerId,
  ].join("\n")).digest("hex");
}

export async function publishProductionOddsCalculation({
  jobId,
  expectedPublicationRevision,
  expectedSnapshotId,
  expectedActivationRevision,
  expectedAuthorityEpochId,
  actorAuthUserId,
  actorPlayerId,
  requestFingerprint,
  env = process.env,
  rpc = productionCurrentOddsCalculationRpc,
  runtimeContext,
  resolveRuntime = resolveProductionOddsRuntimeContext,
} = {}) {
  const context = await publicationRuntimeContext({
    env,
    runtimeContext,
    resolveRuntime,
  });
  const target = context.runtime.tournamentId;
  const normalizedJobId = lower(jobId);
  const revision = Number(expectedPublicationRevision);
  const snapshotId = lower(expectedSnapshotId);
  const authUserId = lower(actorAuthUserId);
  const playerId = clean(actorPlayerId);
  const activationRevision = Number(expectedActivationRevision);
  const authorityEpochId = lower(expectedAuthorityEpochId);
  const fingerprint = lower(requestFingerprint);
  const expectedFingerprint = productionOddsPublicationRequestFingerprint({
    jobId: normalizedJobId,
    expectedPublicationRevision: revision,
    expectedSnapshotId: snapshotId,
    expectedActivationRevision: activationRevision,
    expectedAuthorityEpochId: authorityEpochId,
    actorAuthUserId: authUserId,
    actorPlayerId: playerId,
    tournamentId: target,
  });
  if (!/^[0-9a-f]{64}$/.test(fingerprint) || fingerprint !== expectedFingerprint) {
    throw operationError(
      "PRODUCTION_ODDS_PUBLICATION_FINGERPRINT_INVALID",
      "The bounded Production Championship Odds publication fingerprint is invalid.",
      {},
      400,
    );
  }
  const result = await rpc(
    "publish_production_championship_odds_v1",
    {
      operation: "PUBLISH_PRODUCTION_CHAMPIONSHIP_ODDS_V1",
      contract_version: PRODUCTION_ODDS_PUBLICATION_CONTRACT,
      job_id: normalizedJobId,
      expected_publication_revision: revision,
      expected_snapshot_id: snapshotId || null,
      expected_activation_revision: activationRevision,
      expected_authority_epoch_id: authorityEpochId,
      vercel_team_id: PRODUCTION_VERCEL_TEAM_ID,
      vercel_environment: "production",
      authorization: {
        auth_user_id: authUserId,
        player_id: playerId,
        role: "DIRECTOR",
        tournament_id: target,
      },
      request_fingerprint: fingerprint,
    },
    { env, runtimeContext: context },
  );
  const payload = result?.payload || {};
  const publishedRevision = Number(payload.publication_revision);
  if (payload.ok !== true ||
      clean(payload.publication_authority).toUpperCase() !== "SUPABASE" ||
      clean(payload.publication_state).toUpperCase() !== "PUBLISHED" ||
      !uuid(payload.snapshot_id) ||
      publishedRevision !== revision + 1 ||
      payload.mirror_created !== false || Number(payload.google_writes) !== 0 ||
      !payload.published_payload || typeof payload.published_payload !== "object") {
    throw operationError(
      clean(payload.code || "PRODUCTION_ODDS_PUBLICATION_FAILED"),
      "Production Championship Odds publication could not be verified.",
      {
        authority: clean(payload.publication_authority),
        state: clean(payload.publication_state),
        revision: Number.isFinite(publishedRevision) ? publishedRevision : null,
      },
      409,
    );
  }
  return payload;
}
