export const SCORING_MUTATION_AUTHORITY_CONTRACT_VERSION =
  "scoring-mutation-authority-v1";

export const SCORING_AUTHORITY_TRANSITION_CODES = Object.freeze(new Set([
  "SCORING_AUTHORITY_CONTRACT_REQUIRED",
  "SCORING_AUTHORITY_CONTRACT_STALE",
  "SCORING_AUTHORITY_UNAVAILABLE",
  "SCORING_INGRESS_PAUSED",
  "SUPABASE_NOT_AUTHORITY",
  "AUTHORITY_BOUNDARY_MISMATCH",
]));

const clean = (value) => String(value ?? "").trim();
const authority = (value) => {
  const normalized = clean(value).toLowerCase();
  return normalized === "google" || normalized === "supabase" ? normalized : "";
};
const revision = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0
  ? Number(value)
  : -1;

export function normalizeScoringMutationAuthorityContract(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const normalized = {
    version: clean(value.version),
    scoringAuthority: authority(value.scoringAuthority || value.scoring_authority),
    authorityGeneration: clean(value.authorityGeneration || value.authority_generation).toLowerCase(),
    admissionGeneration: clean(value.admissionGeneration || value.admission_generation).toLowerCase(),
    activationRevision: revision(value.activationRevision ?? value.activation_revision),
    admissionRevision: revision(value.admissionRevision ?? value.admission_revision),
    deploymentId: clean(value.deploymentId || value.deployment_id),
    deploymentCommit: clean(value.deploymentCommit || value.deployment_commit).toLowerCase(),
  };
  if (normalized.version !== SCORING_MUTATION_AUTHORITY_CONTRACT_VERSION ||
      !normalized.scoringAuthority) return null;
  return Object.freeze(normalized);
}

export function scoringMutationAuthorityContractFromData(data = {}) {
  return normalizeScoringMutationAuthorityContract(
    data?.authority?.mutationContract || data?.mutationAuthorityContract || data?.mutationContract,
  );
}

export function sameScoringMutationAuthorityContract(left, right) {
  const normalizedLeft = normalizeScoringMutationAuthorityContract(left);
  const normalizedRight = normalizeScoringMutationAuthorityContract(right);
  if (!normalizedLeft || !normalizedRight) return normalizedLeft === normalizedRight;
  return Object.keys(normalizedLeft).every((key) => normalizedLeft[key] === normalizedRight[key]);
}

export function scoringMutationAuthorityContractError(code = "SCORING_AUTHORITY_CONTRACT_STALE") {
  const error = new Error("Scoring authority changed after this match was loaded. Refresh the match before saving again.");
  error.code = code;
  error.status = 409;
  return error;
}

export function assertScoringMutationAuthorityContract(candidate, current, {
  production = false,
} = {}) {
  const expected = normalizeScoringMutationAuthorityContract(current);
  const supplied = normalizeScoringMutationAuthorityContract(candidate);
  if (!expected) {
    const error = scoringMutationAuthorityContractError("SCORING_AUTHORITY_CONTRACT_UNAVAILABLE");
    error.status = 503;
    throw error;
  }
  if (!supplied) throw scoringMutationAuthorityContractError("SCORING_AUTHORITY_CONTRACT_REQUIRED");
  const fields = production
    ? Object.keys(expected)
    : ["version", "scoringAuthority", "authorityGeneration"];
  const mismatches = fields.filter((key) => supplied[key] !== expected[key]);
  if (mismatches.length) {
    const error = scoringMutationAuthorityContractError();
    error.authorityDiagnostics = Object.freeze({
      expectedAuthority: expected.scoringAuthority,
      suppliedAuthority: supplied.scoringAuthority,
      mismatchFields: mismatches,
    });
    throw error;
  }
  return supplied;
}

export function isScoringAuthorityTransitionFailure(error = {}) {
  const code = clean(error?.code).toUpperCase();
  return SCORING_AUTHORITY_TRANSITION_CODES.has(code) ||
    [
      "PRODUCTION_SCORING_ADMISSION_INSPECTION_MISMATCH",
      "PRODUCTION_SCORING_ADMISSION_V2_REJECTED",
      "PRODUCTION_SCORING_ADMISSION_V2_UNAVAILABLE",
      "PRODUCTION_SCORING_ADMISSION_V3_REJECTED",
      "PRODUCTION_SCORING_ADMISSION_V3_UNAVAILABLE",
      "PRODUCTION_SCORING_ADMISSION_V3_CONTRACT_UNAVAILABLE",
      "PRODUCTION_SCORING_ADMISSION_RPC_REJECTED",
      "PRODUCTION_SCORING_OPERATION_REQUEST_ID_REQUIRED",
    ].includes(code) ||
    code.startsWith("PRODUCTION_CANONICAL_GOOGLE_") ||
    code.startsWith("PRODUCTION_CUTOVER_REQUEST_");
}

export function isScoringMutationReconciliationFailure(error = {}) {
  const code = clean(error?.code).toUpperCase();
  return code === "PRODUCTION_SCORING_ADMISSION_OUTCOME_UNCONFIRMED" ||
    code === "PRODUCTION_SCORING_WRITE_START_UNCONFIRMED" ||
    code.includes("WRITE_AMBIGUOUS_RECONCILIATION_REQUIRED") ||
    code.includes("PARTIAL_WRITE_RECONCILIATION_REQUIRED");
}
