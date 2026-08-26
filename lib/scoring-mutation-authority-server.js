import "server-only";

import { requireScoringAuthority } from "./scoring-authority.js";
import {
  assertScoringMutationAuthorityContract,
  normalizeScoringMutationAuthorityContract,
  SCORING_MUTATION_AUTHORITY_CONTRACT_VERSION,
} from "./scoring-mutation-authority-contract.js";
import {
  inspectProductionScoringMutationAuthority,
  productionGoogleIngressLeaseEnvironment,
} from "./production-cutover-scoring-ingress.js";

const clean = (value) => String(value ?? "").trim();

function nonProductionContract(authority, env) {
  return Object.freeze({
    version: SCORING_MUTATION_AUTHORITY_CONTRACT_VERSION,
    scoringAuthority: authority.resolved,
    authorityGeneration: clean(env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH).toLowerCase(),
    admissionGeneration: "",
    activationRevision: -1,
    admissionRevision: -1,
    deploymentId: "",
    deploymentCommit: clean(env.VERCEL_GIT_COMMIT_SHA).toLowerCase(),
  });
}

export async function currentScoringMutationAuthorityContract({
  request,
  env = process.env,
  fetchImpl,
} = {}) {
  const current = requireScoringAuthority(env);
  if (!current.productionDeployment) return nonProductionContract(current, env);
  if (!request) {
    const error = new Error("Production scoring authority request identity is required.");
    error.code = "SCORING_AUTHORITY_CONTRACT_UNAVAILABLE";
    error.status = 503;
    throw error;
  }
  const inspected = await inspectProductionScoringMutationAuthority({
    request,
    expectedAuthority: current.resolved,
  }, { env, fetchImpl });
  return Object.freeze({
    version: SCORING_MUTATION_AUTHORITY_CONTRACT_VERSION,
    scoringAuthority: inspected.scoringAuthority.toLowerCase(),
    authorityGeneration: inspected.authorityGeneration,
    admissionGeneration: inspected.admissionGeneration,
    activationRevision: inspected.activationRevision,
    admissionRevision: inspected.admissionRevision,
    deploymentId: inspected.deploymentId,
    deploymentCommit: inspected.deploymentCommit,
  });
}

export async function assertCurrentScoringMutationAuthorityContract(candidate, options = {}) {
  const env = options.env || process.env;
  const current = await currentScoringMutationAuthorityContract({ ...options, env });
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  if (!production && !candidate) return current;
  return assertScoringMutationAuthorityContract(candidate, current, {
    production,
  });
}

/**
 * Route-level guard before selecting Google versus Supabase. Google needs a
 * second, lease-aware check inside BEGIN so an exact response-lost admission
 * can recover during CLOSING with its original revisions.
 */
export async function assertScoringMutationAuthorityContractBeforeDispatch(candidate, options = {}) {
  const env = options.env || process.env;
  const authority = requireScoringAuthority(env);
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  if (!production || authority.resolved !== "google") {
    return assertCurrentScoringMutationAuthorityContract(candidate, options);
  }
  const supplied = normalizeScoringMutationAuthorityContract(candidate);
  const state = productionGoogleIngressLeaseEnvironment(env);
  const expected = {
    version: SCORING_MUTATION_AUTHORITY_CONTRACT_VERSION,
    scoringAuthority: "google",
    authorityGeneration: state.expectedAuthorityGeneration,
    admissionGeneration: state.expectedAdmissionGeneration,
    activationRevision: supplied?.activationRevision,
    admissionRevision: supplied?.admissionRevision,
    deploymentId: state.deploymentId,
    deploymentCommit: state.activation.resources.commitSha,
  };
  return assertScoringMutationAuthorityContract(candidate, expected, { production: true });
}

export function attachScoringMutationAuthorityContract(data = {}, contract) {
  return {
    ...data,
    authority: {
      ...(data.authority || {}),
      mutationContract: contract,
    },
  };
}
