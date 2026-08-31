import "server-only";

import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";
import {
  PRODUCTION_CANONICAL_ORIGIN,
  PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_VERCEL_PROJECT_NAME,
} from "./production-cutover-activation-contract.js";
import { productionScoringOperationsRpc } from "./production-scoring-operations-server.js";

const clean = (value) => String(value ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CONTRACT = "production-future-google-match-provisioning-v2";
const contexts = new WeakSet();
const RPCS = Object.freeze({
  claim: "claim_production_future_match_google_compatibility_v2",
  complete: "complete_production_future_match_google_compatibility_v2",
  fail: "fail_production_future_match_google_compatibility_v2",
});

function writerError(code, message, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function exactContract(payload, targetTournamentId) {
  const target = clean(payload?.targetTournamentId || payload?.target_tournament_id);
  const writerGenerationId = clean(payload?.writerGenerationId || payload?.writer_generation_id).toLowerCase();
  const destinationWorkbookId = clean(payload?.destinationWorkbookId || payload?.destination_workbook_id);
  const targetContractFingerprint = clean(
    payload?.targetContractFingerprint || payload?.target_contract_fingerprint,
  ).toLowerCase();
  const implementationFingerprint = clean(
    payload?.implementationFingerprint || payload?.implementation_fingerprint,
  ).toLowerCase();
  if (payload?.ok !== true || clean(payload?.contractVersion || payload?.contract_version) !== CONTRACT ||
      target !== clean(targetTournamentId) || !/^\d{4}$/.test(target) ||
      target === PRODUCTION_TOURNAMENT_ID || !UUID.test(writerGenerationId) ||
      destinationWorkbookId !== PRODUCTION_GOOGLE_WORKBOOK_ID ||
      !SHA256.test(targetContractFingerprint) || !SHA256.test(implementationFingerprint) ||
      payload?.nonAuthoritative !== true || payload?.rollbackAllowed !== false) {
    throw writerError(
      "PRODUCTION_FUTURE_GOOGLE_WRITER_CERTIFICATION_INVALID",
      "The future Google writer certification is incomplete.",
    );
  }
  return { target, writerGenerationId, destinationWorkbookId,
    targetContractFingerprint, implementationFingerprint };
}

/** Resolve one separately certified, inactive-tournament writer target. */
export async function resolveProductionFutureGoogleWriterContext({
  targetTournamentId,
  env = process.env,
  rpc = productionScoringOperationsRpc,
  ...rpcOptions
} = {}) {
  const target = clean(targetTournamentId);
  if (!/^\d{4}$/.test(target) || target === PRODUCTION_TOURNAMENT_ID) {
    throw writerError(
      "PRODUCTION_FUTURE_GOOGLE_WRITER_TARGET_REQUIRED",
      "An exact inactive tournament target is required.",
      400,
    );
  }
  const response = await rpc(
    "resolve_production_future_match_google_compatibility_v2",
    { contract_version: CONTRACT, target_tournament_id: target },
    { env, ...rpcOptions },
  );
  const contract = exactContract(response?.payload, target);
  const context = Object.freeze({
    contractVersion: CONTRACT,
    targetTournamentId: contract.target,
    tournamentYear: Number(contract.target),
    writerGenerationId: contract.writerGenerationId,
    destinationWorkbookId: contract.destinationWorkbookId,
    targetContractFingerprint: contract.targetContractFingerprint,
    implementationFingerprint: contract.implementationFingerprint,
    nonAuthoritative: true,
    rollbackAllowed: false,
  });
  contexts.add(context);
  return context;
}

export function productionFutureGoogleWriterResources(context) {
  if (!contexts.has(context)) {
    throw writerError(
      "PRODUCTION_FUTURE_GOOGLE_WRITER_CONTEXT_REQUIRED",
      "A server-resolved future Google writer context is required.",
      403,
    );
  }
  return Object.freeze({
    supabaseProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    supabaseProjectUrl: PRODUCTION_SUPABASE_URL,
    googleWorkbookId: context.destinationWorkbookId,
    tournamentId: context.targetTournamentId,
    tournamentYear: context.tournamentYear,
    vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
    vercelProjectName: PRODUCTION_VERCEL_PROJECT_NAME,
    canonicalHostname: new URL(PRODUCTION_CANONICAL_ORIGIN).hostname,
    futureGoogleWriterContext: context,
  });
}

export function assertProductionFutureGoogleWriterResources(resources = {}) {
  const context = resources.futureGoogleWriterContext;
  if (!contexts.has(context)) {
    throw writerError(
      "PRODUCTION_FUTURE_GOOGLE_WRITER_CONTEXT_REQUIRED",
      "A server-resolved future Google writer context is required.",
      403,
    );
  }
  const expected = productionFutureGoogleWriterResources(context);
  for (const key of [
    "supabaseProjectRef", "supabaseProjectUrl", "googleWorkbookId",
    "tournamentId", "tournamentYear", "vercelProjectId",
    "vercelProjectName", "canonicalHostname",
  ]) {
    if (String(resources[key] ?? "") !== String(expected[key])) {
      throw writerError(
        "PRODUCTION_FUTURE_GOOGLE_WRITER_RESOURCE_MISMATCH",
        "The future Google writer resource tuple is not exact.",
        403,
      );
    }
  }
  return true;
}

export async function productionFutureGoogleWriterRpc(operation, input = {}, {
  writerContext,
  env = process.env,
  rpc = productionScoringOperationsRpc,
  ...rpcOptions
} = {}) {
  const functionName = RPCS[clean(operation).toLowerCase()];
  if (!functionName || !contexts.has(writerContext)) {
    throw writerError(
      "PRODUCTION_FUTURE_GOOGLE_WRITER_RPC_FORBIDDEN",
      "The future Google writer operation is not certified.",
      403,
    );
  }
  const caller = { ...(input || {}) };
  for (const key of [
    "contract_version", "target_tournament_id",
    "expected_writer_generation_id", "destination_workbook_id",
    "expected_target_contract_fingerprint",
  ]) delete caller[key];
  return rpc(functionName, {
    ...caller,
    contract_version: writerContext.contractVersion,
    target_tournament_id: writerContext.targetTournamentId,
    expected_writer_generation_id: writerContext.writerGenerationId,
    destination_workbook_id: writerContext.destinationWorkbookId,
    expected_target_contract_fingerprint:
      writerContext.targetContractFingerprint,
  }, { env, ...rpcOptions });
}

export const PRODUCTION_FUTURE_GOOGLE_WRITER_CONTRACT = CONTRACT;
