import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";

const childMode = process.env.STEP11_6_WAF_RECEIPT_REACT_SERVER_TEST === "1";

if (!childMode) {
  test("critical-WAF receipt adapters bind signed Preview evidence to exact RPCs", () => {
    const child = spawnSync(process.execPath, [process.argv[1]], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        STEP11_6_WAF_RECEIPT_REACT_SERVER_TEST: "1",
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
          .filter(Boolean).join(" "),
      },
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.deepEqual(JSON.parse(child.stdout), {
      activeRejectedEpochRecoveredWithoutBrowserState: true,
      candidateMismatchRejectedBeforeRpc: true,
      candidateTarget: "PREVIEW",
      conflictingRecoveryRejected: true,
      exactRpcCount: 9,
      missingRecoveryRejected: true,
      rejectedRetirementExactRpc: true,
      shortenedFinalizeRpc: true,
      signedDispatchProjectionCount: 56,
      signedWafProjectionCount: 49,
    });
  });
} else {
  process.env.NODE_TEST_CONTEXT = "child-v8";
  const attestation = await import("../lib/vercel-provider-attestation.js");
  const criticalWaf = await import(
    "../lib/production-google-writer-critical-window-waf.js"
  );
  const receiptServer = await import(
    "../lib/production-google-writer-fence-receipt-server.js"
  );
  const wafOperator = await import(
    "../tools/step11-6-operator/waf-critical-epoch.mjs"
  );
  const { PRODUCTION_VERCEL_PROJECT_ID } = await import(
    "../lib/google-service-account-credential-context.js"
  );

  const teamId = "team_SandbaggerInvitational01";
  const candidateDeploymentId = "dpl_WafReceiptCandidate123";
  const candidateCommitSha = "7".repeat(40);
  const candidateAliasOrigin =
    "https://bagger-inv-git-waf-receipt-sandbagger-invitational.vercel.app";
  const candidateImmutableOrigin =
    "https://bagger-wafreceipt-sandbagger-invitational.vercel.app";
  const runOwnedRuleNonce = "11111111-1111-4111-8111-111111111111";
  const runOwnedRuleName = `writer-quiesce-${runOwnedRuleNonce}`;
  const providerAssignedRuleId = "provider-assigned-waf-rule";
  const wafEpochId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const fenceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const installRequestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const quiesceEvidenceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const now = Date.now();
  const keyPair = generateKeyPairSync("ed25519");
  const insertDocument =
    criticalWaf.buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
      candidateAliasOrigin,
      candidateImmutableOrigin,
      runOwnedRuleName,
      runOwnedRuleNonce,
    });
  const historicalDeploymentId = "dpl_HistoricalWafCandidate1";
  const historicalCommitSha = "6".repeat(40);
  const historicalImmutableOrigin =
    "https://bagger-historicalwaf-sandbagger-invitational.vercel.app";
  const historicalInsertDocument =
    criticalWaf.buildProductionGoogleWriterCriticalWindowVercelRuleInsert({
      candidateAliasOrigin,
      candidateImmutableOrigin: historicalImmutableOrigin,
      runOwnedRuleName,
      runOwnedRuleNonce,
    });

  function providerConfiguration({ critical = false, version } = {}) {
    const selectedVersion = version ?? (critical ? "17" : "10");
    const rules = critical ? [{
      id: providerAssignedRuleId,
      ...structuredClone(insertDocument.body.value),
    }] : [];
    const active = {
      version: selectedVersion,
      id: `waf-config-${selectedVersion}`,
      ownerId: teamId,
      firewallEnabled: true,
      ips: [],
      crs: [],
      changes: [{ action: "active.read" }],
      projectKey: "bagger-inv-active",
      updatedAt: new Date(now - 1_000).toISOString(),
      rules,
    };
    return {
      active,
      draft: null,
      versions: [],
      activeVersion: {
        ...structuredClone(active),
        changes: [],
        projectKey: "bagger-inv-version-read",
        updatedAt: new Date(now - 2_000).toISOString(),
      },
    };
  }

  function wafRequest({
    stage,
    evidenceRequestId,
    transitionRequestId,
    baselineEvidenceId = null,
    criticalEvidenceId = null,
    baselineSemanticFingerprint = null,
    criticalSemanticFingerprint = null,
    baselineConfigurationVersion = null,
    baselineSourceVersionReadFingerprint = null,
    expectedConfigurationVersion,
    ruleDocument = insertDocument,
    requestAliasOrigin = candidateAliasOrigin,
    requestImmutableOrigin = candidateImmutableOrigin,
    assignedRuleId = new Set(["CRITICAL_ACTIVE", "CRITICAL_REATTEST"])
      .has(stage) ? providerAssignedRuleId : null,
  }) {
    return {
      schemaVersion: attestation.VERCEL_WAF_PROVIDER_EVIDENCE_REQUEST_SCHEMA,
      evidenceRequestId,
      wafEpochId,
      transitionRequestId,
      stage,
      purpose: "REHEARSAL",
      transitionMode: "REHEARSAL",
      projectId: PRODUCTION_VERCEL_PROJECT_ID,
      teamId,
      candidateAliasOrigin: requestAliasOrigin,
      candidateImmutableOrigin: requestImmutableOrigin,
      candidateDeploymentId,
      candidateCommitSha,
      candidateDeploymentTarget: "PREVIEW",
      runOwnedRuleName,
      runOwnedRuleNonce,
      runOwnedRuleFingerprint: ruleDocument.runOwnedRuleFingerprint,
      runOwnedInsertDocumentFingerprint:
        ruleDocument.runOwnedInsertDocumentFingerprint,
      providerAssignedRuleId: assignedRuleId,
      baselineEvidenceId,
      criticalEvidenceId,
      baselineSemanticFingerprint,
      criticalSemanticFingerprint,
      baselineConfigurationVersion,
      baselineSourceVersionReadFingerprint,
      expectedConfigurationVersion,
    };
  }

  const baselineRequest = wafRequest({
    stage: "BASELINE_CAPTURE",
    evidenceRequestId: "10000000-0000-4000-8000-000000000001",
    transitionRequestId: "10000000-0000-4000-8000-000000000002",
    expectedConfigurationVersion: "10",
  });
  const baselineEnvelope = attestation.createVercelWafProviderEvidence({
    request: baselineRequest,
    firewallPayload: providerConfiguration(),
    privateKey: keyPair.privateKey,
    now,
    evidenceId: "10000000-0000-4000-8000-000000000003",
  });
  const baseline = baselineEnvelope.evidence;
  const retirementRequestId = "15000000-0000-4000-8000-000000000001";
  const retirementBaselineRequest = wafRequest({
    stage: "BASELINE_CAPTURE",
    evidenceRequestId: "15000000-0000-4000-8000-000000000002",
    transitionRequestId: retirementRequestId,
    expectedConfigurationVersion: "10",
    ruleDocument: historicalInsertDocument,
    requestImmutableOrigin: historicalImmutableOrigin,
  });
  const retirementBaselineEnvelope =
    attestation.createVercelWafProviderEvidence({
      request: retirementBaselineRequest,
      firewallPayload: providerConfiguration(),
      privateKey: keyPair.privateKey,
      now: now + 500,
      evidenceId: "15000000-0000-4000-8000-000000000003",
    });

  const criticalRequest = wafRequest({
    stage: "CRITICAL_ACTIVE",
    evidenceRequestId: "20000000-0000-4000-8000-000000000001",
    transitionRequestId: "20000000-0000-4000-8000-000000000002",
    baselineEvidenceId: baseline.evidenceId,
    baselineSemanticFingerprint: baseline.semanticConfigurationFingerprint,
    baselineConfigurationVersion: baseline.configurationVersion,
    baselineSourceVersionReadFingerprint: baseline.sourceVersionReadFingerprint,
    expectedConfigurationVersion: "17",
  });
  const criticalEnvelope = attestation.createVercelWafProviderEvidence({
    request: criticalRequest,
    firewallPayload: providerConfiguration({ critical: true }),
    privateKey: keyPair.privateKey,
    now: now + 1_000,
    evidenceId: "20000000-0000-4000-8000-000000000003",
  });
  const critical = criticalEnvelope.evidence;

  const reattestRequest = wafRequest({
    stage: "CRITICAL_REATTEST",
    evidenceRequestId: "30000000-0000-4000-8000-000000000001",
    transitionRequestId: "30000000-0000-4000-8000-000000000002",
    baselineEvidenceId: baseline.evidenceId,
    criticalEvidenceId: critical.evidenceId,
    baselineSemanticFingerprint: baseline.semanticConfigurationFingerprint,
    criticalSemanticFingerprint: critical.semanticConfigurationFingerprint,
    baselineConfigurationVersion: baseline.configurationVersion,
    baselineSourceVersionReadFingerprint: baseline.sourceVersionReadFingerprint,
    expectedConfigurationVersion: "17",
  });
  const reattestEnvelope = attestation.createVercelWafProviderEvidence({
    request: reattestRequest,
    firewallPayload: providerConfiguration({ critical: true }),
    privateKey: keyPair.privateKey,
    now: now + 2_000,
    evidenceId: "30000000-0000-4000-8000-000000000003",
  });

  const dispatchId = "40000000-0000-4000-8000-000000000001";
  const dispatchRequestId = "40000000-0000-4000-8000-000000000002";
  const dispatchTransitionRequestId =
    "40000000-0000-4000-8000-000000000003";
  const dispatchResultRequest = {
    schemaVersion:
      attestation.VERCEL_WAF_RULE_INSERT_DISPATCH_RESULT_REQUEST_SCHEMA,
    dispatchResultId: "40000000-0000-4000-8000-000000000004",
    dispatchId,
    dispatchRequestId,
    wafEpochId,
    transitionRequestId: dispatchTransitionRequestId,
    requestFingerprint: "1".repeat(64),
    dispatchStep: "CRITICAL_RULE_INSERT",
    purpose: "REHEARSAL",
    transitionMode: "REHEARSAL",
    projectId: PRODUCTION_VERCEL_PROJECT_ID,
    teamId,
    candidateAliasOrigin,
    candidateImmutableOrigin,
    candidateDeploymentId,
    candidateCommitSha,
    candidateDeploymentTarget: "PREVIEW",
    baselineEvidenceId: baseline.evidenceId,
    baselineConfigurationVersion: baseline.configurationVersion,
    baselineConfigurationEtag: baseline.configurationEtag,
    baselineConfigurationIdentityFingerprint:
      baseline.configurationIdentityFingerprint,
    baselineSourceVersionReadFingerprint: baseline.sourceVersionReadFingerprint,
    baselineSemanticFingerprint: baseline.semanticConfigurationFingerprint,
    baselineOrderedCustomRulesFingerprint:
      baseline.orderedCustomRulesFingerprint,
    providerIntentFingerprint: "2".repeat(64),
    runOwnedRuleName,
    runOwnedRuleNonce,
    runOwnedRuleFingerprint: insertDocument.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      insertDocument.runOwnedInsertDocumentFingerprint,
  };
  const dispatchResultEnvelope =
    attestation.createVercelWafRuleInsertDispatchResult({
      request: dispatchResultRequest,
      outcomeStatus: "OUTCOME_UNKNOWN",
      privateKey: keyPair.privateKey,
      now: now + 3_000,
    });

  const calls = [];
  const response = (payload, status = 200) => new Response(
    JSON.stringify(payload),
    { status, headers: { "content-type": "application/json" } },
  );
  const fetchImpl = async (rawUrl, init = {}) => {
    const functionName = new URL(rawUrl).pathname.split("/").at(-1);
    const body = JSON.parse(init.body);
    const input = body.input;
    calls.push({ functionName, input });
    if (functionName === "inspect_production_scoring_admission") {
      return response({
        ok: true,
        activation_state: "ROLLED_BACK",
        authority: "GOOGLE",
        scoring_authority: "GOOGLE",
        scoring_ingress_enabled: false,
        database_execution_gate: "PAUSED",
        database_admission_state: "CLOSED",
        admission_protocol_enforced: true,
        active_closure_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        provider_admission_reservation_active: true,
        provider_admission_reservation_status: "INSTALLED",
        v2_unresolved: 0,
        legacy_unclassified: 0,
        activation_revision: 1,
        authority_generation_id: "abababab-abab-4bab-8bab-abababababab",
        admission_generation_id: "acacacac-acac-4cac-8cac-acacacacacac",
        admission_revision: 4,
      });
    }
    return response({ ok: true, ...input });
  };
  const recoveryDispatchId = "16000000-0000-4000-8000-000000000001";
  const recoveryResultId = "16000000-0000-4000-8000-000000000002";
  const recoveryRpcCalls = [];
  const recoveryRow = {
    ok: true,
    epoch_id: wafEpochId,
    status: "ACTIVATION_PENDING",
    purpose: "REHEARSAL",
    transition_mode: "REHEARSAL",
    vercel_project_id: PRODUCTION_VERCEL_PROJECT_ID,
    vercel_team_id: teamId,
    candidate_deployment_id: historicalDeploymentId,
    candidate_deployment_commit: historicalCommitSha,
    candidate_deployment_target: "PREVIEW",
    candidate_alias_origin: candidateAliasOrigin,
    candidate_immutable_origin: historicalImmutableOrigin,
    candidate_control_hosts_fingerprint:
      criticalWaf.productionGoogleWriterCriticalWindowProviderRuleContract({
        candidateAliasOrigin,
        candidateImmutableOrigin: historicalImmutableOrigin,
        runOwnedRuleName,
        runOwnedRuleNonce,
      }).candidateControlHostsFingerprint,
    run_owned_rule_name: runOwnedRuleName,
    run_owned_rule_nonce: runOwnedRuleNonce,
    run_owned_rule_fingerprint:
      historicalInsertDocument.runOwnedRuleFingerprint,
    run_owned_insert_document_fingerprint:
      historicalInsertDocument.runOwnedInsertDocumentFingerprint,
    retirement_request_id: null,
    retirement_candidate_deployment_id: null,
    retirement_candidate_deployment_commit: null,
    retirement_reason: null,
    retired_at: null,
    rejected_dispatch_id: recoveryDispatchId,
    rejected_dispatch_result_id: recoveryResultId,
    provider_response_status: 400,
  };
  const recoveryFetch = (mode = "one") => async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    assert.equal(init.method, "POST");
    const functionName = url.pathname.split("/").at(-1);
    const input = JSON.parse(init.body).input;
    recoveryRpcCalls.push({ functionName, input });
    if (functionName === "inspect_production_scoring_admission") {
      return response({
        ok: true,
        activation_state: "DORMANT",
        authority: "GOOGLE",
        scoring_authority: "GOOGLE",
        scoring_ingress_enabled: false,
        execution_gate: "PAUSED",
        admission_state: "OPEN",
        admission_protocol_enforced: false,
        active_closure_id: null,
        v2_unresolved: 0,
        legacy_unclassified: 0,
        first_supabase_canonical_write_possible: false,
        first_supabase_canonical_write_observed: false,
        activation_revision: 1,
        authority_generation_id: "abababab-abab-4bab-8bab-abababababab",
        admission_generation_id: "acacacac-acac-4cac-8cac-acacacacacac",
        admission_revision: 4,
      });
    }
    if (functionName ===
        "retire_production_vercel_writer_rejected_waf_epoch") {
      return response({
        ok: true,
        epoch_id: wafEpochId,
        status: "REJECTED_RETIRED",
        purpose: "REHEARSAL",
        transition_mode: "REHEARSAL",
        run_owned_rule_name: runOwnedRuleName,
        run_owned_rule_nonce: runOwnedRuleNonce,
        run_owned_rule_fingerprint:
          historicalInsertDocument.runOwnedRuleFingerprint,
        run_owned_insert_document_fingerprint:
          historicalInsertDocument.runOwnedInsertDocumentFingerprint,
        provider_mutation_performed: false,
      });
    }
    assert.equal(functionName,
      "inspect_production_vercel_writer_critical_waf_epoch");
    if (input.operation ===
        "RECOVER_PRODUCTION_VERCEL_WRITER_REJECTED_WAF_EPOCH") {
      assert.equal(input.vercel_project_id, PRODUCTION_VERCEL_PROJECT_ID);
      assert.equal(input.expected_status,
        input.expected_epoch_id && input.retirement_request_id
        ? "ACTIVATION_PENDING_OR_REJECTED_RETIRED"
        : "ACTIVATION_PENDING");
      assert.equal(input.expected_purpose, "REHEARSAL");
      assert.equal(input.expected_transition_mode, "REHEARSAL");
      if (mode === "zero") {
        return response({
          message: "STEP11_6_VERCEL_WAF_RECOVERY_NOT_FOUND",
        }, 409);
      }
      if (mode === "two") {
        return response({
          message: "STEP11_6_VERCEL_WAF_RECOVERY_CONFLICT",
        }, 409);
      }
      return response(recoveryRow);
    }
    assert.equal(input.candidate_deployment_id, historicalDeploymentId);
    assert.equal(input.candidate_deployment_commit, historicalCommitSha);
    return response({
      ok: true,
      found: true,
      epoch_id: wafEpochId,
      status: "ACTIVATION_PENDING",
      purpose: "REHEARSAL",
      transition_mode: "REHEARSAL",
      baseline_active_config_version: "10",
      run_owned_rule_name: runOwnedRuleName,
      run_owned_rule_nonce: runOwnedRuleNonce,
      run_owned_rule_fingerprint:
        historicalInsertDocument.runOwnedRuleFingerprint,
      run_owned_insert_document_fingerprint:
        historicalInsertDocument.runOwnedInsertDocumentFingerprint,
    });
  };
  const env = {
    NODE_TEST_CONTEXT: "child-v8",
    PRODUCTION_SUPABASE_SECRET_KEY: "test-secret-key-that-is-long-enough",
    VERCEL_DEPLOYMENT_ID: candidateDeploymentId,
    VERCEL_ENV: "preview",
    [attestation.VERCEL_PROVIDER_ATTESTATION_PUBLIC_KEY_ENV]:
      attestation.pinnedEd25519PublicKeyBase64(keyPair.publicKey),
    [attestation.VERCEL_PROVIDER_ATTESTATION_TEAM_ID_ENV]: teamId,
  };
  const environment = {
    resources: {
      commitSha: candidateCommitSha,
      candidateHostname: new URL(candidateAliasOrigin).hostname,
      deploymentHostname: new URL(candidateImmutableOrigin).hostname,
      vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
    },
  };
  const baseOperatorManifest = () => ({
    mode: "DRY_RUN",
    execution: {
      enabled: false,
      networkAllowed: false,
      providerSdkAllowed: false,
      sqlExecutionAllowed: false,
    },
    resources: {
      environment: "PRODUCTION",
      projectRef: "ymqhhtxaywtqllynrmxe",
      projectUrl: "https://ymqhhtxaywtqllynrmxe.supabase.co",
      sourceWorkbookId: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
      tournamentId: "2026",
      vercelProjectId: PRODUCTION_VERCEL_PROJECT_ID,
      vercelTeamId: teamId,
    },
    release: {
      deploymentId: candidateDeploymentId,
      frozenSha: candidateCommitSha,
      candidateSha: candidateCommitSha,
    },
    providerQuiesceEvidence: {
      candidateDeploymentId,
      candidateDeploymentCommit: candidateCommitSha,
      candidateAliasOrigin,
      candidateImmutableOrigin,
    },
    wafCriticalEpoch: {
      contractVersion: "CRITICAL_WINDOW_WAF_V1",
      epochId: wafEpochId,
      epochRequestId: "50000000-0000-4000-8000-000000000001",
      purpose: "REHEARSAL",
      transitionMode: "REHEARSAL",
      status: "MISSING",
      authenticatedActorId: "CB01",
      authenticatedActorFingerprint: "3".repeat(64),
      signerPublicKeyBase64:
        attestation.pinnedEd25519PublicKeyBase64(keyPair.publicKey),
      candidateDeploymentId,
      candidateDeploymentCommit: candidateCommitSha,
      candidateDeploymentTarget: "PREVIEW",
      candidateAliasOrigin,
      candidateImmutableOrigin,
      candidateControlHostsFingerprint:
        criticalWaf.productionGoogleWriterCriticalWindowProviderRuleContract({
          candidateAliasOrigin,
          candidateImmutableOrigin,
          runOwnedRuleName,
          runOwnedRuleNonce,
        }).candidateControlHostsFingerprint,
      runOwnedRuleName,
      runOwnedRuleNonce,
      runOwnedRuleId: null,
      runOwnedRuleFingerprint: insertDocument.runOwnedRuleFingerprint,
      runOwnedInsertDocumentFingerprint:
        insertDocument.runOwnedInsertDocumentFingerprint,
      boundFenceId: null,
      boundQuiesceEvidenceId: null,
      criticalActiveObservationId: null,
      latestCriticalReattestObservationId: null,
      baselineRestoredObservationId: null,
      criticalActiveAt: null,
      baselineRestoredAt: null,
      aclWriterFenceStatus: "MISSING",
      dispatches: {
        CRITICAL_RULE_INSERT: {
          dispatchRequestId,
          transitionRequestId: dispatchTransitionRequestId,
          dispatchId: null,
          requestFingerprint: null,
          status: "NOT_DISPATCHED",
          dispatchUsable: false,
          replayUsable: false,
        },
        CRITICAL_DRAFT_ACTIVATE: {
          dispatchRequestId: "60000000-0000-4000-8000-000000000003",
          transitionRequestId: criticalRequest.transitionRequestId,
          dispatchId: null,
          requestFingerprint: null,
          status: "NOT_DISPATCHED",
          dispatchUsable: false,
          replayUsable: false,
        },
        BASELINE_VERSION_ACTIVATE: {
          dispatchRequestId: "80000000-0000-4000-8000-000000000002",
          transitionRequestId: "80000000-0000-4000-8000-000000000003",
          dispatchId: null,
          requestFingerprint: null,
          status: "NOT_DISPATCHED",
          dispatchUsable: false,
          replayUsable: false,
        },
      },
      operationInputs: {
        "begin-critical-waf-epoch": {
          evidenceEnvelope: baselineEnvelope,
          evidenceRequest: baselineRequest,
          baselineObservationRequestId:
            "50000000-0000-4000-8000-000000000002",
        },
        "begin-critical-rule-insert-dispatch": {
          providerIntentFingerprint: "2".repeat(64),
        },
        "mark-critical-rule-insert-dispatch-started": {},
        "record-critical-rule-insert-result": {
          dispatchResultEnvelope,
          dispatchResultRequest,
        },
        "begin-critical-draft-activate-dispatch": {
          providerIntentFingerprint: "5".repeat(64),
        },
        "mark-critical-draft-activate-dispatch-started": {},
        "record-critical-draft-activate-result": {
          evidenceEnvelope: criticalEnvelope,
          evidenceRequest: criticalRequest,
          observationRequestId: "60000000-0000-4000-8000-000000000002",
        },
        "record-critical-waf-reattestation": {
          evidenceEnvelope: reattestEnvelope,
          evidenceRequest: reattestRequest,
          observationRequestId: "70000000-0000-4000-8000-000000000001",
        },
        "begin-baseline-version-activate-dispatch": {
          providerIntentFingerprint: "6".repeat(64),
          restoreRequestId: "80000000-0000-4000-8000-000000000004",
          restoreRequestFingerprint: "7".repeat(64),
        },
        "mark-baseline-version-activate-dispatch-started": {},
        "record-baseline-version-activate-result": {},
        "finalize-baseline-restored-fence": {},
      },
    },
  });
  const operatorPayload = (manifest, operation) =>
    wafOperator.buildWafCriticalEpochEnvelope(manifest, operation, {
      now: now + 4_000,
    }).payload;
  const control = receiptServer
    .productionGoogleWriterProviderFenceControlDependencies({
      actor: {
        actorId: "CB01",
        authenticatedActorFingerprint: "3".repeat(64),
      },
      env,
      fetchImpl,
    });

  const recoveryControl = receiptServer
    .productionGoogleWriterProviderFenceControlDependencies({
      actor: {
        actorId: "CB01",
        authenticatedActorFingerprint: "3".repeat(64),
      },
      env,
      fetchImpl: recoveryFetch("one"),
    });
  const recoveredEpoch = await recoveryControl
    .recoverRejectedCriticalWafEpoch({ environment });
  assert.equal(recoveredEpoch.epoch_id, wafEpochId);
  assert.equal(recoveredEpoch.status, "ACTIVATION_PENDING");
  assert.equal(recoveredEpoch.recoverable_rejected, true);
  assert.equal(recoveredEpoch.provider_mutation_performed, false);
  assert.equal(recoveredEpoch.candidate_deployment_id,
    historicalDeploymentId);
  assert.equal(recoveryRpcCalls.filter(({ input }) => input.operation ===
    "RECOVER_PRODUCTION_VERCEL_WRITER_REJECTED_WAF_EPOCH").length, 1);

  const missingRecoveryControl = receiptServer
    .productionGoogleWriterProviderFenceControlDependencies({
      actor: {
        actorId: "CB01",
        authenticatedActorFingerprint: "3".repeat(64),
      },
      env,
      fetchImpl: recoveryFetch("zero"),
    });
  await assert.rejects(() => missingRecoveryControl
    .recoverRejectedCriticalWafEpoch({ environment }), {
    code: "STEP11_6_VERCEL_WAF_RECOVERY_NOT_FOUND",
  });

  const conflictingRecoveryControl = receiptServer
    .productionGoogleWriterProviderFenceControlDependencies({
      actor: {
        actorId: "CB01",
        authenticatedActorFingerprint: "3".repeat(64),
      },
      env,
      fetchImpl: recoveryFetch("two"),
    });
  await assert.rejects(() => conflictingRecoveryControl
    .recoverRejectedCriticalWafEpoch({ environment }), {
    code: "STEP11_6_VERCEL_WAF_RECOVERY_CONFLICT",
  });

  await control.inspectCriticalWafEpoch({
    epochId: wafEpochId,
    environment,
  });
  assert.equal(calls.at(-1).functionName,
    "inspect_production_vercel_writer_critical_waf_epoch");
  assert.equal(calls.at(-1).input.candidate_deployment_id,
    candidateDeploymentId);

  await control.beginCriticalWafEpoch({
    evidenceEnvelope: baselineEnvelope,
    evidenceRequest: baselineRequest,
    environment,
    epochRequestId: "50000000-0000-4000-8000-000000000001",
    baselineObservationRequestId: "50000000-0000-4000-8000-000000000002",
  });
  assert.equal(calls.at(-1).functionName,
    "begin_production_vercel_writer_critical_waf_epoch");
  assert.equal(calls.at(-1).input.candidate_deployment_target, "PREVIEW");
  assert.equal(calls.at(-1).input.baseline_waf_evidence.candidateDeploymentId,
    candidateDeploymentId);
  assert.deepEqual(calls.at(-1).input, operatorPayload(
    baseOperatorManifest(), "begin-critical-waf-epoch"));

  await recoveryControl.retireRejectedCriticalWafEpoch({
    epochId: wafEpochId,
    retirementRequestId,
    freshBaselineObservationRequestId:
      "15000000-0000-4000-8000-000000000004",
    evidenceEnvelope: retirementBaselineEnvelope,
    evidenceRequest: retirementBaselineRequest,
    environment,
  });
  assert.equal(recoveryRpcCalls.at(-1).functionName,
    "retire_production_vercel_writer_rejected_waf_epoch");
  assert.equal(recoveryRpcCalls.at(-1).input.operation,
    "RETIRE_PRODUCTION_VERCEL_WRITER_REJECTED_WAF_EPOCH");
  assert.equal(recoveryRpcCalls.at(-1).input.epoch_id, wafEpochId);
  assert.equal(recoveryRpcCalls.at(-1).input.retirement_request_id,
    retirementRequestId);
  assert.equal(recoveryRpcCalls.at(-1).input.verified_waf_evidence.stage,
    "BASELINE_CAPTURE");
  assert.equal(recoveryRpcCalls.at(-1).input.candidate_deployment_id,
    candidateDeploymentId);

  const beforeMismatch = calls.length;
  await assert.rejects(() => control.beginCriticalWafEpoch({
    evidenceEnvelope: baselineEnvelope,
    evidenceRequest: baselineRequest,
    environment: {
      resources: {
        ...environment.resources,
        candidateHostname:
          "bagger-inv-git-other-sandbagger-invitational.vercel.app",
      },
    },
    epochRequestId: "50000000-0000-4000-8000-000000000003",
    baselineObservationRequestId: "50000000-0000-4000-8000-000000000004",
  }), { code: "STEP11_6_VERCEL_WAF_CANDIDATE_SCOPE_MISMATCH" });
  assert.equal(calls.length, beforeMismatch);

  await control.beginCriticalWafDispatch({
    epochId: wafEpochId,
    dispatchRequestId,
    transitionRequestId: dispatchTransitionRequestId,
    dispatchStep: "CRITICAL_RULE_INSERT",
    providerIntentFingerprint: "2".repeat(64),
  });
  assert.equal(calls.at(-1).functionName,
    "begin_production_vercel_writer_critical_waf_dispatch");
  {
    const manifest = baseOperatorManifest();
    manifest.wafCriticalEpoch.status = "ACTIVATION_PENDING";
    assert.deepEqual(calls.at(-1).input, operatorPayload(
      manifest, "begin-critical-rule-insert-dispatch"));
  }

  await control.markCriticalWafDispatchStarted({
    dispatchId,
    dispatchRequestId,
    transitionRequestId: dispatchTransitionRequestId,
    requestFingerprint: "4".repeat(64),
  });
  assert.equal(calls.at(-1).functionName,
    "mark_production_vercel_writer_critical_waf_dispatch_started");
  {
    const manifest = baseOperatorManifest();
    manifest.wafCriticalEpoch.status = "ACTIVATION_PENDING";
    Object.assign(manifest.wafCriticalEpoch.dispatches.CRITICAL_RULE_INSERT, {
      status: "RESERVED",
      dispatchId,
      requestFingerprint: "4".repeat(64),
      dispatchUsable: true,
      replayUsable: true,
    });
    assert.deepEqual(calls.at(-1).input, operatorPayload(
      manifest, "mark-critical-rule-insert-dispatch-started"));
  }

  await control.recordCriticalWafDispatchResult({
    dispatchId,
    dispatchResultEnvelope,
    dispatchResultRequest,
  });
  assert.equal(calls.at(-1).functionName,
    "record_production_vercel_writer_critical_waf_dispatch_result");
  assert.equal(Object.keys(calls.at(-1).input.verified_dispatch_result).length, 56);
  {
    const manifest = baseOperatorManifest();
    manifest.wafCriticalEpoch.status = "ACTIVATION_PENDING";
    Object.assign(manifest.wafCriticalEpoch.dispatches.CRITICAL_RULE_INSERT, {
      status: "PROVIDER_MUTATING",
      dispatchId,
      requestFingerprint: dispatchResultRequest.requestFingerprint,
    });
    assert.deepEqual(calls.at(-1).input, operatorPayload(
      manifest, "record-critical-rule-insert-result"));
  }

  await control.recordCriticalWafDispatchResult({
    dispatchId: "60000000-0000-4000-8000-000000000001",
    wafEvidenceEnvelope: criticalEnvelope,
    wafEvidenceRequest: criticalRequest,
    observationRequestId: "60000000-0000-4000-8000-000000000002",
  });
  assert.equal(Object.keys(calls.at(-1).input.verified_waf_evidence).length, 49);
  {
    const manifest = baseOperatorManifest();
    manifest.wafCriticalEpoch.status = "ACTIVATION_PENDING";
    manifest.wafCriticalEpoch.dispatches.CRITICAL_RULE_INSERT.status =
      "TARGET_CONFIRMED";
    Object.assign(manifest.wafCriticalEpoch.dispatches.CRITICAL_DRAFT_ACTIVATE, {
      status: "PROVIDER_MUTATING",
      dispatchId: "60000000-0000-4000-8000-000000000001",
    });
    assert.deepEqual(calls.at(-1).input, operatorPayload(
      manifest, "record-critical-draft-activate-result"));
  }

  await control.recordCriticalWafReattestation({
    evidenceEnvelope: reattestEnvelope,
    evidenceRequest: reattestRequest,
    observationRequestId: "70000000-0000-4000-8000-000000000001",
  });
  assert.equal(calls.at(-1).functionName,
    "record_production_vercel_writer_critical_waf_reattestation");
  {
    const manifest = baseOperatorManifest();
    manifest.wafCriticalEpoch.status = "FENCE_BOUND";
    manifest.wafCriticalEpoch.runOwnedRuleId = providerAssignedRuleId;
    manifest.wafCriticalEpoch.boundFenceId = fenceId;
    assert.deepEqual(calls.at(-1).input, operatorPayload(
      manifest, "record-critical-waf-reattestation"));
  }

  await control.finalizeWafBaselineRestore({
    fenceId,
    epochId: wafEpochId,
    baselineRestoredObservationId:
      "80000000-0000-4000-8000-000000000001",
  });
  assert.equal(calls.at(-1).functionName,
    "finalize_production_google_writer_fence_waf_restore");
  {
    const manifest = baseOperatorManifest();
    manifest.wafCriticalEpoch.status = "BASELINE_RESTORED";
    manifest.wafCriticalEpoch.runOwnedRuleId = providerAssignedRuleId;
    manifest.wafCriticalEpoch.boundFenceId = fenceId;
    manifest.wafCriticalEpoch.baselineRestoredObservationId =
      "80000000-0000-4000-8000-000000000001";
    manifest.wafCriticalEpoch.aclWriterFenceStatus =
      "ACL_RESTORED_WAF_ACTIVE";
    assert.deepEqual(calls.at(-1).input, operatorPayload(
      manifest, "finalize-baseline-restored-fence"));
  }

  const controlReceipt = {
    fence_id: fenceId,
    install_request_id: installRequestId,
    candidate_deployment_id: candidateDeploymentId,
    candidate_deployment_commit: candidateCommitSha,
  };
  await control.bindRollbackCriticalWafEpoch({
    controlReceipt,
    input: { installRequestId, quiesceEvidenceId },
    environment,
    criticalWafEpochId: wafEpochId,
    quiesceEvidenceId,
    bindRequestId: "90000000-0000-4000-8000-000000000001",
  });
  assert.equal(calls.at(-1).functionName,
    "bind_production_google_writer_provider_fence_rollback_waf_epoch");

  const criticalRpcs = calls.filter(({ functionName }) =>
    functionName !== "inspect_production_scoring_admission");
  assert.equal(criticalRpcs.length, 9);
  console.log(JSON.stringify({
    activeRejectedEpochRecoveredWithoutBrowserState: true,
    candidateMismatchRejectedBeforeRpc: true,
    candidateTarget: calls.find(({ functionName }) => functionName ===
      "begin_production_vercel_writer_critical_waf_epoch")
      .input.candidate_deployment_target,
    conflictingRecoveryRejected: true,
    exactRpcCount: criticalRpcs.length,
    missingRecoveryRejected: true,
    rejectedRetirementExactRpc: recoveryRpcCalls.some(({ functionName }) =>
      functionName === "retire_production_vercel_writer_rejected_waf_epoch"),
    shortenedFinalizeRpc: calls.some(({ functionName }) =>
      functionName === "finalize_production_google_writer_fence_waf_restore"),
    signedDispatchProjectionCount:
      Object.keys(dispatchResultEnvelope.evidence).length + 4,
    signedWafProjectionCount: Object.keys(baselineEnvelope.evidence).length + 4,
  }));
}
