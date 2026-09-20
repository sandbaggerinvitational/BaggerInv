import assert from "node:assert/strict";

// Owner-approved Director-only extension. This constructs one exact expected
// file; it never removes or normalizes differences from the current source.
export function withDirectorCalcuttaRead(original) {
  const anchor = '  inspect_production_calcutta_v1: "OBSERVATION",\n';
  assert.equal(original.split(anchor).length, 2, "exact frozen anchor required");
  assert.equal(original.includes("read_production_calcutta_management_v1"), false,
    "the frozen source must not already contain the extension");
  return original.replace(anchor,
    `${anchor}  read_production_calcutta_management_v1: "OBSERVATION",\n`);
}

// Exact owner-authorized provider-validation change; retain byte-for-byte guard elsewhere.
export function withAuthoritySpecificProviderValidation(original) {
  { const before = "    (inspected.executionGate === \"OPEN\" && inspected.scoringIngressEnabled);\n"; assert.equal(original.split(before).length, 2); original = original.replace(before, "    (inspected.executionGate === \"OPEN\" && inspected.scoringIngressEnabled);\n  // Legacy provider credentials fence Google writes, not Supabase authority.\n  // Authority equality and the canonical Supabase ingress checks remain mandatory.\n  const providerValid = expectedAuthority === \"SUPABASE\" ||\n    (expectedAuthority === \"GOOGLE\" &&\n      inspected.providerCredentialClass === PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS &&\n      inspected.providerPrincipalFingerprint === state.providerPrincipalFingerprint);\n"); }
  { const before = "    inspected.rpcContractVersion === PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION &&\n    inspected.providerCredentialClass === PRODUCTION_SCORING_LEGACY_PROVIDER_CREDENTIAL_CLASS &&\n    inspected.providerPrincipalFingerprint === state.providerPrincipalFingerprint &&\n    validAuthority && googleOpen && supabaseOpen;\n"; assert.equal(original.split(before).length, 2); original = original.replace(before, "    inspected.rpcContractVersion === PRODUCTION_SCORING_ADMISSION_RPC_CONTRACT_VERSION &&\n    providerValid && validAuthority && googleOpen && supabaseOpen;\n"); }
  return original;
}
