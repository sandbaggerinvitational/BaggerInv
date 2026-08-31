import "server-only";

import { createHash } from "node:crypto";

import {
  productionCurrentOddsCalculationRpc,
  resolveProductionOddsRuntimeContext,
} from "./production-odds-calculation-server.js";
import { PRODUCTION_TOURNAMENT_ID } from "./production-foundation-resource-contract.js";
import { PRODUCTION_VERCEL_TEAM_ID } from "./production-maintenance-precommit-deployment-rebind.js";

export const PRODUCTION_ODDS_PUBLICATION_CONTRACT =
  "production-odds-publication-v1";

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
  if (!Number.isSafeInteger(revision) || revision < 0 ||
      !Number.isSafeInteger(activationRevision) || activationRevision < 0 ||
      !uuid(authorityEpochId) ||
      clean(data.publication_authority).toUpperCase() !== "SUPABASE" ||
      (currentSnapshotId && !uuid(currentSnapshotId))) {
    throw operationError(
      "PRODUCTION_ODDS_PUBLICATION_STATE_INVALID",
      "Production Championship Odds publication state is invalid.",
      {},
      409,
    );
  }
  return {
    ...data,
    publication_revision: revision,
    published_snapshot_id: currentSnapshotId || null,
    activation_revision: activationRevision,
    authority_epoch_id: authorityEpochId,
    runtimeContext: context,
  };
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
