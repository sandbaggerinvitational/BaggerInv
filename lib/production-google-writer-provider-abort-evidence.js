import { createHash } from "node:crypto";

function postgresJsonbKeyOrder(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length - rightBytes.length || Buffer.compare(leftBytes, rightBytes);
}

function postgresJsonbText(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(postgresJsonbText).join(", ")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => postgresJsonbKeyOrder(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}: ${postgresJsonbText(item)}`)
      .join(", ")}}`;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  throw new TypeError("Provider abort evidence must be an exact JSON value.");
}

const text = (value) => value === undefined || value === null
  ? null
  : String(value);
const lower = (value) => text(value)?.toLowerCase() ?? null;

/**
 * Exact field set and normalization used by migration 040's
 * `google_writer_provider_fence_abort_evidence_hash`. Keep this deliberately
 * explicit: optimistic-control fields such as deployment identity and source
 * fingerprint are transmitted and validated separately, but are not members
 * of the SQL evidence hash.
 */
export function productionGoogleWriterProviderAbortHashPayload(input) {
  return {
    operation: text(input.operation),
    environment: text(input.environment),
    project_ref: text(input.project_ref),
    project_url: text(input.project_url),
    source_workbook_id: text(input.source_workbook_id),
    tournament_id: text(input.tournament_id),
    fence_id: text(input.fence_id),
    install_request_id: text(input.install_request_id),
    abort_request_id: text(input.abort_request_id),
    restore_quiesce_evidence_id: text(input.restore_quiesce_evidence_id),
    candidate_deployment_id: text(input.candidate_deployment_id),
    candidate_deployment_commit: lower(input.candidate_deployment_commit),
    removed_protected_range_ids: input.removed_protected_range_ids ?? null,
    active_run_owned_protection_count:
      input.active_run_owned_protection_count ?? null,
    provider_rollback_verified: input.provider_rollback_verified ?? null,
    restored_legacy_role: text(input.restored_legacy_role),
    restored_legacy_can_edit: input.restored_legacy_can_edit ?? null,
    restored_legacy_can_share: input.restored_legacy_can_share ?? null,
    restore_transition_proof_fingerprint:
      lower(input.restore_transition_proof_fingerprint),
    restored_provider_fingerprint: lower(input.restored_provider_fingerprint),
    restored_acl_fingerprint: lower(input.restored_acl_fingerprint),
    restored_canonical_value_fingerprint:
      lower(input.restored_canonical_value_fingerprint),
    restored_combined_value_fingerprint:
      lower(input.restored_combined_value_fingerprint),
    restored_formula_fingerprint: lower(input.restored_formula_fingerprint),
    provider_observed_at: text(input.provider_observed_at),
    expected_activation_revision: input.expected_activation_revision ?? null,
    expected_authority_generation: text(input.expected_authority_generation),
    expected_admission_generation: text(input.expected_admission_generation),
    expected_admission_revision: input.expected_admission_revision ?? null,
    actor_id: text(input.actor_id),
    authenticated_actor_fingerprint:
      lower(input.authenticated_actor_fingerprint),
  };
}

export function productionGoogleWriterProviderAbortEvidenceHash(input) {
  const payload = productionGoogleWriterProviderAbortHashPayload(input);
  return createHash("sha256").update(postgresJsonbText(payload)).digest("hex");
}
