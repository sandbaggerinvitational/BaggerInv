import { productionGoogleWriterCriticalWindowWafContract } from
  "./production-google-writer-critical-window-waf.js";

const clean = (value) => String(value ?? "").trim();

export function productionWriterQuiesceRoutingRulePayload(value) {
  return Object.freeze({
    routing_rule_id: clean(value?.ruleId),
    routing_rule_revision: clean(value?.revision),
    routing_rule_scope: clean(value?.scope),
    routing_rule_hostname_operator:
      clean(value?.hostnameOperator).toUpperCase(),
    routing_rule_canonical_hostname:
      clean(value?.canonicalHostname).toLowerCase(),
    routing_rule_all_method_fence_required_host_count:
      Number(value?.allMethodFenceRequiredHostCount),
    routing_rule_all_method_fence_required_hosts_fingerprint:
      clean(value?.allMethodFenceRequiredHostsFingerprint).toLowerCase(),
    routing_rule_all_method_fence_required_path_count:
      Number(value?.allMethodFenceRequiredPathCount),
    routing_rule_all_method_fence_required_paths_fingerprint:
      clean(value?.allMethodFenceRequiredPathsFingerprint).toLowerCase(),
    routing_rule_global_invocation_quiescence_proved:
      value?.globalInvocationQuiescenceProved === true,
    routing_rule_canonical_apex_safe_method_count:
      Number(value?.canonicalApexSafeMethodCount),
    routing_rule_canonical_apex_safe_methods_fingerprint:
      clean(value?.canonicalApexSafeMethodsFingerprint).toLowerCase(),
    routing_rule_canonical_apex_safe_method_writer_route_count:
      Number(value?.canonicalApexSafeMethodWriterRouteCount),
    routing_rule_canonical_apex_safe_method_writer_routes_fingerprint:
      clean(value?.canonicalApexSafeMethodWriterRoutesFingerprint).toLowerCase(),
  });
}

export function verifiedProviderAttestationPayload(value, expectedStage) {
  if (!value || value.signatureVerified !== true ||
      clean(value.stage).toUpperCase() !== expectedStage) {
    const error = new Error("A fresh signed Vercel provider attestation was required.");
    error.code = "STEP11_6_VERCEL_PROVIDER_ATTESTATION_REQUIRED";
    error.status = 400;
    throw error;
  }
  const criticalWindow = productionGoogleWriterCriticalWindowWafContract(value);
  if (Number(value.routingRuleCandidateControlHostCount) !==
        criticalWindow.candidateControlHosts.hostCount ||
      clean(value.routingRuleCandidateControlHostsFingerprint).toLowerCase() !==
        criticalWindow.candidateControlHosts.hostsFingerprint ||
      Number(value.routingRuleCanonicalApexSafeMethodCount) !==
        criticalWindow.canonicalApexContainment.allowedSafeMethods.length ||
      clean(value.routingRuleCanonicalApexSafeMethodsFingerprint).toLowerCase() !==
        criticalWindow.canonicalApexContainment.allowedSafeMethodsFingerprint ||
      Number(value.routingRuleCanonicalApexSafeMethodWriterRouteCount) !==
        criticalWindow.canonicalApexContainment
          .exhaustiveHistoricalSafeMethodWriterRouteCount ||
      clean(value.routingRuleCanonicalApexSafeMethodWriterRoutesFingerprint)
        .toLowerCase() !== criticalWindow.canonicalApexContainment
          .exhaustiveHistoricalSafeMethodWriterRoutesFingerprint ||
      value.routingRuleGlobalInvocationQuiescenceProved !== true ||
      Number(value.canonicalRoutingAliasRecordCount) !== 4 ||
      !/^[0-9a-f]{64}$/.test(
        clean(value.canonicalRoutingAliasRecordsFingerprint).toLowerCase(),
      ) ||
      clean(value.canonicalRoutingAliasPolicy) !==
        (clean(value.purpose).toUpperCase() === "CUTOVER"
          ? "APEX_WWW_DIRECT_TO_EXACT_CANDIDATE_MAIN_RETAINED"
          : "APEX_WWW_DIRECT_MAIN_RETAINED_DURING_REHEARSAL")) {
    const error = new Error(
      "The signed Vercel rule did not bind the exact two candidate control hosts.",
    );
    error.code = "STEP11_6_VERCEL_PROVIDER_ATTESTATION_REQUIRED";
    error.status = 400;
    throw error;
  }
  return Object.freeze({
    attestation_id: clean(value.attestationId).toLowerCase(),
    attestation_fingerprint: clean(value.attestationFingerprint).toLowerCase(),
    signer_key_fingerprint: clean(value.signerKeyFingerprint).toLowerCase(),
    signer_key_version: clean(value.signerKeyVersion),
    stage: clean(value.stage).toUpperCase(),
    purpose: clean(value.purpose).toUpperCase(),
    challenge_id: clean(value.challengeId).toLowerCase(),
    challenge_request_fingerprint:
      clean(value.challengeRequestFingerprint).toLowerCase(),
    operation_request_id: clean(value.operationRequestId).toLowerCase(),
    request_fingerprint: clean(value.requestFingerprint).toLowerCase(),
    signature_verified: true,
    vercel_project_id: clean(value.vercelProjectId),
    vercel_team_id: clean(value.vercelTeamId),
    candidate_deployment_id: clean(value.candidateDeploymentId),
    candidate_deployment_commit: clean(value.candidateDeploymentCommit).toLowerCase(),
    candidate_deployment_target: clean(value.candidateDeploymentTarget).toUpperCase(),
    candidate_alias_origin: clean(value.candidateAliasOrigin).toLowerCase(),
    candidate_immutable_origin: clean(value.candidateImmutableOrigin).toLowerCase(),
    routing_rule_id: clean(value.routingRuleId),
    routing_rule_config_version: clean(value.routingRuleConfigVersion),
    routing_rule_etag: clean(value.routingRuleEtag) || null,
    routing_rule_fingerprint: clean(value.routingRuleFingerprint).toLowerCase(),
    routing_rule_pending_draft_change_count:
      Number(value.routingRulePendingDraftChangeCount),
    routing_rule_hostname_operator:
      clean(value.routingRuleHostnameOperator).toUpperCase(),
    routing_rule_canonical_hostname:
      clean(value.routingRuleCanonicalHostname).toLowerCase(),
    routing_rule_earlier_active_bypass_rule_count:
      Number(value.routingRuleEarlierActiveBypassRuleCount),
    routing_rule_global_invocation_quiescence_proved: true,
    routing_rule_canonical_apex_safe_method_count:
      Number(value.routingRuleCanonicalApexSafeMethodCount),
    routing_rule_canonical_apex_safe_methods_fingerprint:
      clean(value.routingRuleCanonicalApexSafeMethodsFingerprint).toLowerCase(),
    routing_rule_canonical_apex_safe_method_writer_route_count:
      Number(value.routingRuleCanonicalApexSafeMethodWriterRouteCount),
    routing_rule_canonical_apex_safe_method_writer_routes_fingerprint:
      clean(value.routingRuleCanonicalApexSafeMethodWriterRoutesFingerprint)
        .toLowerCase(),
    canonical_routing_alias_record_count:
      Number(value.canonicalRoutingAliasRecordCount),
    canonical_routing_alias_records_fingerprint:
      clean(value.canonicalRoutingAliasRecordsFingerprint).toLowerCase(),
    canonical_routing_alias_policy: clean(value.canonicalRoutingAliasPolicy),
    routing_rule_all_method_fence_required_host_count:
      Number(value.routingRuleAllMethodFenceRequiredHostCount),
    routing_rule_all_method_fence_required_hosts_fingerprint:
      clean(value.routingRuleAllMethodFenceRequiredHostsFingerprint).toLowerCase(),
    routing_rule_all_method_fence_required_path_count:
      Number(value.routingRuleAllMethodFenceRequiredPathCount),
    routing_rule_all_method_fence_required_paths_fingerprint:
      clean(value.routingRuleAllMethodFenceRequiredPathsFingerprint).toLowerCase(),
    retained_origin_inventory_count: Number(value.retainedOriginInventoryCount),
    retained_origin_inventory_fingerprint:
      clean(value.retainedOriginInventoryFingerprint).toLowerCase(),
    live_origin_inventory_count: Number(value.liveOriginInventoryCount),
    live_origin_inventory_fingerprint:
      clean(value.liveOriginInventoryFingerprint).toLowerCase(),
    provider_inventory_schema: clean(value.providerInventorySchema),
    retained_provider_inventory_count:
      Number(value.retainedProviderInventoryCount),
    retained_provider_inventory_fingerprint:
      clean(value.retainedProviderInventoryFingerprint).toLowerCase(),
    live_provider_inventory_count: Number(value.liveProviderInventoryCount),
    live_provider_inventory_fingerprint:
      clean(value.liveProviderInventoryFingerprint).toLowerCase(),
    alias_inventory_count: Number(value.aliasInventoryCount),
    alias_inventory_fingerprint:
      clean(value.aliasInventoryFingerprint).toLowerCase(),
    alias_inventory_records: Array.isArray(value.aliasInventoryRecords)
      ? value.aliasInventoryRecords : [],
    alias_pagination_page_count: Number(value.aliasPaginationPageCount),
    alias_pagination_fingerprint:
      clean(value.aliasPaginationFingerprint).toLowerCase(),
    redacted_environment_scope_fingerprint:
      clean(value.redactedEnvironmentScopeFingerprint).toLowerCase(),
    credential_confinement_evidence_schema:
      clean(value.credentialConfinementEvidenceSchema),
    credential_confinement_record_count:
      Number(value.credentialConfinementRecordCount),
    credential_confinement_records_fingerprint:
      clean(value.credentialConfinementRecordsFingerprint).toLowerCase(),
    credential_confinement_evidence_fingerprint:
      clean(value.credentialConfinementEvidenceFingerprint).toLowerCase(),
    provider_observed_at: value.providerObservedAt,
  });
}
