import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const childMode = process.env.STEP12_DRIVE_ACL_REACT_SERVER_TEST === "1";

if (!childMode) {
  test("Drive ACL fence is exact, redacted, capability-bound, and resumable", () => {
    const child = spawnSync(process.execPath, [process.argv[1]], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        STEP12_DRIVE_ACL_REACT_SERVER_TEST: "1",
        NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
          .filter(Boolean).join(" "),
      },
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.deepEqual(JSON.parse(child.stdout), {
      exactForwardRole: "reader",
      exactRestoreRole: "writer",
      lostResponseRecovered: true,
      rawIdentifiersRedacted: true,
      rejectedDedicatedExpiry: true,
      retainedDeterministicProviderRejection: true,
      rejectedExtraWriter: true,
      rejectedFabricatedDatabaseDispatch: true,
      rejectedProductionFetchInjection: true,
      rejectedReceiptAccessorAndProxy: true,
      retainedAmbiguousMutation: true,
      retainedReadbackFailure: true,
      rejectedLegacyCanShare: true,
      rejectedLegacyExpiry: true,
      rejectedMissingCapability: true,
      rejectedOwnerAction: true,
      rejectedTokenPrincipalMismatch: true,
    });
  });
} else {
  const acl = await import("../lib/production-google-drive-acl-fence.js");
  const dbDispatch = await import(
    "../lib/production-google-drive-acl-db-dispatch.js"
  );
  const receiptServer = await import(
    "../lib/production-google-writer-fence-receipt-server.js"
  );
  const { PRODUCTION_GOOGLE_WORKBOOK_ID } = await import(
    "../lib/production-foundation-resource-contract.js"
  );

  const dedicatedEmail = "dedicated@example.iam.gserviceaccount.com";
  const legacyEmail = "legacy@example.iam.gserviceaccount.com";
  const dedicatedReadToken = "dedicated-read-token-123456789";
  const dedicatedPermissionToken = "dedicated-drive-file-token-123456789";
  const legacyReadToken = "legacy-read-token-123456789";
  const fenceId = "11111111-1111-4111-8111-111111111111";
  const installRequestId = "22222222-2222-4222-8222-222222222222";
  const quiesceEvidenceId = "77777777-7777-4777-8777-777777777777";
  const candidateDeploymentId = "dpl_candidate12345678";
  const candidateCommit = "a".repeat(40);
  let sequence = 0;

  const response = (payload, status = 200) => new Response(
    JSON.stringify(payload),
    { status, headers: { "content-type": "application/json" } },
  );

  const originalNodeTestContext = process.env.NODE_TEST_CONTEXT;
  try {
    for (const context of [undefined, "truthy-but-not-child-v8"]) {
      if (context === undefined) delete process.env.NODE_TEST_CONTEXT;
      else process.env.NODE_TEST_CONTEXT = context;
      for (const createControl of [
        receiptServer.productionGoogleWriterFenceReceiptDependencies,
        receiptServer.productionGoogleWriterProviderFenceControlDependencies,
        receiptServer.productionGoogleWriterQuiesceReceiptDependencies,
      ]) {
        assert.throws(
          () => createControl({
            actor: {
              actorId: "CB01",
              authenticatedActorFingerprint: "c".repeat(64),
            },
            env: {
              PRODUCTION_SUPABASE_SECRET_KEY:
                "fake-secret-that-is-long-enough",
            },
            fetchImpl: async () => response({ ok: true }),
          }),
          {
            code:
              "STEP12_GOOGLE_DRIVE_ACL_RECEIPT_DEPENDENCY_INJECTION_FORBIDDEN",
          },
        );
        assert.throws(
          () => createControl({ authorization: {
            status: "active",
            source: "production-director-entitlement",
            identity: {
              actor: { id: "CB01" },
              tournamentId: "2026",
              authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            },
          } }),
          { code: "STEP11_6_WRITER_FENCE_AUTHORIZATION_CAPABILITY_INVALID" },
        );
      }
    }
  } finally {
    if (originalNodeTestContext === undefined) {
      delete process.env.NODE_TEST_CONTEXT;
    } else {
      process.env.NODE_TEST_CONTEXT = originalNodeTestContext;
    }
  }
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "fetchImpl", {
    enumerable: true,
    get() { return async () => response({ ok: true }); },
  });
  assert.throws(
    () => receiptServer.productionGoogleWriterProviderFenceControlDependencies(
      accessorOptions,
    ),
    { code: "STEP12_GOOGLE_DRIVE_ACL_RECEIPT_DEPENDENCY_INJECTION_FORBIDDEN" },
  );
  assert.throws(
    () => receiptServer.productionGoogleWriterProviderFenceControlDependencies(
      new Proxy({}, {}),
    ),
    { code: "STEP12_GOOGLE_DRIVE_ACL_RECEIPT_DEPENDENCY_INJECTION_FORBIDDEN" },
  );

  function fakeDrive({
    canShare = true,
    applyPatch = true,
    dedicatedAboutEmail = dedicatedEmail,
    dedicatedExpirationTime = "",
    extraWriter = false,
    failPermissionReadbackAfterPatch = false,
    initialRole = "writer",
    legacyExpirationTime = "",
    readerCanShare = false,
    patchStatus = 200,
    throwBeforePatch = false,
    throwAfterPatch = false,
  } = {}) {
    const state = {
      calls: [],
      patchCount: 0,
      role: initialRole,
    };
    const permissions = () => [
      { id: "permission-owner-secret", type: "user", role: "owner",
        emailAddress: "owner@example.com" },
      { id: "permission-dedicated-secret", type: "user", role: "writer",
        emailAddress: dedicatedEmail,
        ...(dedicatedExpirationTime ? { expirationTime: dedicatedExpirationTime } : {}) },
      { id: "permission-legacy-secret", type: "user", role: state.role,
        emailAddress: legacyEmail,
        ...(legacyExpirationTime ? { expirationTime: legacyExpirationTime } : {}) },
      { id: "permission-viewer-secret", type: "user", role: "reader",
        emailAddress: "viewer@example.com" },
      ...(extraWriter ? [{ id: "permission-extra-secret", type: "user", role: "writer",
        emailAddress: "unexpected@example.com" }] : []),
    ];
    const fetchImpl = async (rawUrl, options = {}) => {
      const url = new URL(rawUrl);
      const token = String(options.headers?.authorization || "").replace(/^Bearer /, "");
      const method = options.method || "GET";
      const isLegacy = token === legacyReadToken;
      state.calls.push({ method, pathname: url.pathname, token,
        fields: url.searchParams.get("fields") || "" });
      if (url.pathname.endsWith("/about")) {
        return response({
          user: isLegacy
            ? { me: true, emailAddress: legacyEmail,
              permissionId: "permission-legacy-secret" }
            : { me: true, emailAddress: dedicatedAboutEmail,
              permissionId: "permission-dedicated-secret" },
        });
      }
      if (method === "PATCH" && url.pathname.includes("/permissions/")) {
        assert.equal(token, dedicatedPermissionToken);
        assert.match(url.pathname, /permission-legacy-secret$/);
        const body = JSON.parse(options.body);
        assert.ok(["reader", "writer"].includes(body.role));
        state.patchCount += 1;
        if (throwBeforePatch) throw new Error("synthetic pre-dispatch response loss");
        if (applyPatch) state.role = body.role;
        if (throwAfterPatch) throw new Error("synthetic lost response");
        return response(patchStatus >= 400 ? {
          error: { status: "SYNTHETIC", errors: [{ reason: "syntheticFailure" }] },
        } : { id: "permission-legacy-secret", type: "user",
          role: state.role, emailAddress: legacyEmail }, patchStatus);
      }
      if (url.pathname.endsWith("/permissions")) {
        assert.equal(isLegacy, false);
        if (failPermissionReadbackAfterPatch && state.patchCount > 0) {
          return response({ error: { status: "UNAVAILABLE" } }, 503);
        }
        return response({ permissions: permissions() });
      }
      if (url.pathname.includes(`/files/${PRODUCTION_GOOGLE_WORKBOOK_ID}`)) {
        if (url.searchParams.get("fields")?.includes("writersCanShare")) {
          assert.equal(isLegacy, false);
          return response({
            id: PRODUCTION_GOOGLE_WORKBOOK_ID,
            mimeType: "application/vnd.google-apps.spreadsheet",
            writersCanShare: canShare,
            capabilities: { canShare },
          });
        }
        assert.equal(isLegacy, true);
        return response({
          id: PRODUCTION_GOOGLE_WORKBOOK_ID,
          mimeType: "application/vnd.google-apps.spreadsheet",
          capabilities: {
            canEdit: state.role === "writer",
            canShare: state.role === "writer" ? canShare : readerCanShare,
          },
        });
      }
      throw new Error(`Unexpected fake Drive request: ${method} ${rawUrl}`);
    };
    return { fetchImpl, state };
  }

  const productionInjectedProvider = fakeDrive();
  const savedTestContextForProvider = process.env.NODE_TEST_CONTEXT;
  try {
    process.env.NODE_TEST_CONTEXT = "truthy-but-not-child-v8";
    await assert.rejects(
      acl.inspectProductionGoogleDriveAclFence({
        accessToken: dedicatedReadToken,
        dedicatedPrincipalEmail: dedicatedEmail,
        fetchImpl: productionInjectedProvider.fetchImpl,
        legacyPrincipalEmail: legacyEmail,
      }),
      { code: "STEP12_GOOGLE_DRIVE_ACL_DEPENDENCY_INJECTION_FORBIDDEN" },
    );
    await assert.rejects(
      acl.preflightProductionGoogleDriveAclTransition(new Proxy({}, {})),
      { code: "STEP12_GOOGLE_DRIVE_ACL_DEPENDENCY_INJECTION_FORBIDDEN" },
    );
  } finally {
    process.env.NODE_TEST_CONTEXT = savedTestContextForProvider;
  }

  async function captureSource(provider, expectedCanEdit = true) {
    const beforeState = await acl.inspectProductionGoogleDriveAclFence({
      accessToken: dedicatedReadToken,
      dedicatedPrincipalEmail: dedicatedEmail,
      fetchImpl: provider.fetchImpl,
      legacyPrincipalEmail: legacyEmail,
    });
    const beforeLegacyCapability =
      await acl.inspectProductionGoogleDriveLegacyEditCapability({
        accessToken: legacyReadToken,
        expectedCanEdit,
        expectedCanShare: expectedCanEdit,
        fetchImpl: provider.fetchImpl,
        legacyPrincipalEmail: legacyEmail,
      });
    return { beforeLegacyCapability, beforeState };
  }

  function transitionIntent(source, targetRole) {
    return acl.createProductionGoogleDriveAclTransitionIntent({
      ...source,
      fenceId,
      installRequestId,
      targetRole,
    });
  }

  async function preflight(provider, currentState, intent) {
    return acl.preflightProductionGoogleDriveAclTransition({
      currentState,
      fetchImpl: provider.fetchImpl,
      legacyReadAccessToken: legacyReadToken,
      permissionAccessToken: dedicatedPermissionToken,
      transitionIntent: intent,
    });
  }

  async function officialDatabaseCapability(intent, providerPreflight, {
    recovery = false,
  } = {}) {
    const issuedAtMs = Date.now();
    sequence += 1;
    const abortRequestId =
      `88888888-8888-4888-8888-${String(sequence).padStart(12, "8")}`;
    const authority = {
      ok: true,
      activation_state: "GOOGLE_LEASE_ARMED",
      authority: "GOOGLE",
      scoring_authority: "GOOGLE",
      scoring_ingress_enabled: false,
      database_execution_gate: "OPEN",
      database_admission_state: "OPEN",
      provider_admission_reservation_active: true,
      provider_admission_reservation_status:
        intent.targetRole === "reader" ? "INSTALLING" : "ABORTING",
      v2_unresolved: 0,
      legacy_unclassified: 0,
      first_supabase_canonical_write_possible: false,
      first_supabase_canonical_write_observed: false,
      expected_source_fingerprint: "b".repeat(64),
      activation_revision: 1,
      admission_revision: 2,
      authority_generation_id: "99999999-9999-4999-8999-999999999999",
      admission_generation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const rpcFetch = async (rawUrl, options = {}) => {
      const functionName = new URL(rawUrl).pathname.split("/").at(-1);
      if (functionName === "inspect_production_scoring_admission") {
        return response(authority);
      }
      const input = JSON.parse(options.body).input;
      if (functionName ===
          "record_production_google_writer_acl_dispatch_result") {
        assert.equal(input.direction,
          intent.targetRole === "reader" ? "INSTALL" : "RESTORE");
        assert.ok(["TARGET_CONFIRMED", "OUTCOME_UNKNOWN"].includes(
          input.outcome_status,
        ));
        if (input.outcome_status === "TARGET_CONFIRMED") {
          assert.equal(input.transition_proof.currentRole, intent.targetRole);
          assert.equal(input.transition_proof_fingerprint,
            input.transition_proof.transitionFingerprint);
        } else {
          assert.equal(input.transition_proof, null);
          assert.equal(input.transition_proof_fingerprint, null);
        }
        return response({
          ok: true,
          result_id:
            `44444444-4444-4444-8444-${String(sequence).padStart(12, "4")}`,
          result_request_id: input.result_request_id,
          direction: input.direction,
          outcome_status: input.outcome_status,
          transition_proof_fingerprint: input.transition_proof_fingerprint,
          provider_observed_at: input.provider_observed_at,
          idempotent: false,
        });
      }
      const expectedFunction = intent.targetRole === "reader"
        ? "begin_production_google_writer_provider_fence_install_dispatch"
        : "begin_production_google_writer_provider_fence_abort_dispatch";
      assert.equal(functionName, expectedFunction);
      return response({
        ...input,
        dispatch_id:
          `33333333-3333-4333-8333-${String(sequence).padStart(12, "3")}`,
        dispatch_request_id: input.dispatch_request_id || input.abort_request_id,
        status: recovery ? "OUTCOME_UNKNOWN" : "PROVIDER_MUTATING",
        issued_at: new Date(issuedAtMs).toISOString(),
        expires_at: new Date(issuedAtMs + 15_000).toISOString(),
        remaining_dispatch_budget_ms: 14_000,
        dispatch_usable: !recovery,
        replay_usable: !recovery,
        idempotent: recovery,
      });
    };
    const control = receiptServer
      .productionGoogleWriterProviderFenceControlDependencies({
        actor: {
          actorId: "CB01",
          authenticatedActorFingerprint: "c".repeat(64),
        },
        env: {
          PRODUCTION_SUPABASE_SECRET_KEY: "test-secret-key-that-is-long-enough",
          VERCEL_DEPLOYMENT_ID: candidateDeploymentId,
        },
        fetchImpl: rpcFetch,
      });
    const details = {
      controlReceipt: {
        fence_id: fenceId,
        install_request_id: installRequestId,
        candidate_deployment_id: candidateDeploymentId,
        candidate_deployment_commit: candidateCommit,
      },
      environment: { resources: { commitSha: candidateCommit } },
      input: {
        installRequestId,
        operationRequestId: abortRequestId,
        quiesceEvidenceId,
      },
      operationRequestFingerprint: "d".repeat(64),
      providerPreflight,
      transitionIntent: intent,
    };
    const receipt = intent.targetRole === "reader"
      ? await control.beginInstallDispatch(details)
      : await control.beginAbortDispatch(details);
    return recovery
      ? receipt.databaseRecoveryCapability
      : receipt.databaseDispatchCapability;
  }

  async function dispatch(intent, providerPreflight) {
    const databaseDispatchCapability = await officialDatabaseCapability(
      intent,
      providerPreflight,
    );
    return acl.acceptProductionGoogleDriveAclProviderMutationDispatch({
      databaseDispatchCapability,
      providerPreflight,
      transitionIntent: intent,
    });
  }

  const provider = fakeDrive();
  const source = await captureSource(provider);
  assert.equal(source.beforeState.inspectionScope,
    acl.PRODUCTION_GOOGLE_DRIVE_ACL_READ_SCOPE);
  assert.equal(source.beforeState.nonOwnerEditorCount, 2);
  assert.equal(source.beforeState.dedicatedCanShare, true);
  assert.equal(source.beforeState.writersCanShare, true);
  const downgradeIntent = transitionIntent(source, "reader");
  const downgradePreflight = await preflight(
    provider,
    source.beforeState,
    downgradeIntent,
  );
  assert.equal(downgradePreflight.position, "SOURCE");
  const downgrade = await acl.transitionProductionGoogleLegacyDriveRole({
    providerPreflight: downgradePreflight,
    providerMutationCapability: await dispatch(downgradeIntent, downgradePreflight),
    transitionIntent: downgradeIntent,
  });
  assert.equal(downgrade.durableAclResultReceipt.outcome_status,
    "TARGET_CONFIRMED");
  assert.equal(downgrade.currentRole, "reader");
  assert.equal(downgrade.currentLegacyCanEdit, false);
  assert.equal(downgrade.currentLegacyCanShare, false);
  assert.equal(downgrade.afterState.nonOwnerEditorCount, 1);
  assert.equal(downgrade.providerPatchDispatched, true);
  assert.equal(provider.state.patchCount, 1);

  const readerSource = await captureSource(provider, false);
  const resumePreflight = await preflight(
    provider,
    readerSource.beforeState,
    downgradeIntent,
  );
  const resumed = await acl.transitionProductionGoogleLegacyDriveRole({
    providerPreflight: resumePreflight,
    transitionIntent: downgradeIntent,
  });
  assert.equal(resumed.idempotentResume, true);
  assert.equal(resumed.currentRole, "reader");
  assert.equal(provider.state.patchCount, 1);

  const restoreIntent = transitionIntent(readerSource, "writer");
  const restorePreflight = await preflight(
    provider,
    readerSource.beforeState,
    restoreIntent,
  );
  const restored = await acl.transitionProductionGoogleLegacyDriveRole({
    providerPreflight: restorePreflight,
    providerMutationCapability: await dispatch(restoreIntent, restorePreflight),
    transitionIntent: restoreIntent,
  });
  assert.equal(restored.durableAclResultReceipt.outcome_status,
    "TARGET_CONFIRMED");
  assert.equal(restored.currentRole, "writer");
  assert.equal(restored.currentLegacyCanEdit, true);
  assert.equal(restored.currentLegacyCanShare, true);
  assert.equal(restored.afterState.nonOwnerEditorCount, 2);
  assert.equal(provider.state.patchCount, 2);

  const missingCapabilityProvider = fakeDrive();
  const missingSource = await captureSource(missingCapabilityProvider);
  const missingIntent = transitionIntent(missingSource, "reader");
  const missingPreflight = await preflight(
    missingCapabilityProvider,
    missingSource.beforeState,
    missingIntent,
  );
  await assert.rejects(
    acl.transitionProductionGoogleLegacyDriveRole({
      providerPreflight: missingPreflight,
      transitionIntent: missingIntent,
    }),
    { code: "STEP12_GOOGLE_DRIVE_ACL_PROVIDER_DISPATCH_DENIED" },
  );
  assert.equal(missingCapabilityProvider.state.patchCount, 0);

  const cloneProvider = fakeDrive();
  const cloneSource = await captureSource(cloneProvider);
  const cloneIntent = transitionIntent(cloneSource, "reader");
  const clonePreflight = await preflight(
    cloneProvider,
    cloneSource.beforeState,
    cloneIntent,
  );
  const realDatabaseCapability = await officialDatabaseCapability(
    cloneIntent,
    clonePreflight,
  );
  await assert.throws(
    () => acl.acceptProductionGoogleDriveAclProviderMutationDispatch({
      databaseDispatchCapability: JSON.parse(JSON.stringify(realDatabaseCapability)),
      providerPreflight: clonePreflight,
      transitionIntent: cloneIntent,
    }),
    { code: "STEP12_GOOGLE_DRIVE_ACL_DB_DISPATCH_REQUIRED" },
  );
  const cloneProviderCapability =
    acl.acceptProductionGoogleDriveAclProviderMutationDispatch({
      databaseDispatchCapability: realDatabaseCapability,
      providerPreflight: clonePreflight,
      transitionIntent: cloneIntent,
    });
  assert.equal(typeof cloneProviderCapability, "object");

  const attackerChannel =
    dbDispatch.createProductionGoogleDriveAclDbDispatchChannel();
  const attackerClaim = attackerChannel.beginClaim();
  const attackerNow = Date.now();
  const fabricatedDatabaseCapability = attackerChannel.issueReceipt(
    attackerClaim,
    {
      dispatchId: "55555555-5555-4555-8555-555555555555",
      dispatchRequestId: "66666666-6666-4666-8666-666666666666",
      fenceId,
      installRequestId,
      providerMutationClass: cloneIntent.providerMutationClass,
      targetRole: cloneIntent.targetRole,
      transitionIntentFingerprint: cloneIntent.transitionIntentFingerprint,
      providerPreflightFingerprint: clonePreflight.providerPreflightFingerprint,
      status: "PROVIDER_MUTATING",
      issuedAt: new Date(attackerNow).toISOString(),
      expiresAt: new Date(attackerNow + 15_000).toISOString(),
      remainingDispatchBudgetMs: 14_000,
    },
    async () => ({ ok: true }),
  );
  assert.throws(
    () => acl.acceptProductionGoogleDriveAclProviderMutationDispatch({
      databaseDispatchCapability: fabricatedDatabaseCapability,
      providerPreflight: clonePreflight,
      transitionIntent: cloneIntent,
    }),
    { code: "STEP12_GOOGLE_DRIVE_ACL_DB_DISPATCH_REQUIRED" },
  );

  const lostProvider = fakeDrive({ throwAfterPatch: true });
  const lostSource = await captureSource(lostProvider);
  const lostIntent = transitionIntent(lostSource, "reader");
  const lostPreflight = await preflight(
    lostProvider,
    lostSource.beforeState,
    lostIntent,
  );
  const lostRecovered = await acl.transitionProductionGoogleLegacyDriveRole({
    providerPreflight: lostPreflight,
    providerMutationCapability: await dispatch(lostIntent, lostPreflight),
    transitionIntent: lostIntent,
  });
  assert.equal(lostRecovered.providerResponseKnown, false);
  assert.equal(lostRecovered.ambiguousOutcomeRecovered, true);
  assert.equal(lostRecovered.currentRole, "reader");
  assert.equal(lostRecovered.currentLegacyCanEdit, false);
  assert.equal(lostRecovered.currentLegacyCanShare, false);

  const orphanedProvider = fakeDrive();
  const orphanedSource = await captureSource(orphanedProvider);
  const orphanedIntent = transitionIntent(orphanedSource, "reader");
  orphanedProvider.state.role = "reader";
  const orphanedTargetState = await acl.inspectProductionGoogleDriveAclFence({
    accessToken: dedicatedReadToken,
    dedicatedPrincipalEmail: dedicatedEmail,
    fetchImpl: orphanedProvider.fetchImpl,
    legacyPrincipalEmail: legacyEmail,
  });
  const orphanedPreflight = await preflight(
    orphanedProvider,
    orphanedTargetState,
    orphanedIntent,
  );
  const orphanedRecovery =
    await acl.recoverProductionGoogleDriveAclTransitionOutcome({
      databaseRecoveryCapability: await officialDatabaseCapability(
        orphanedIntent,
        orphanedPreflight,
        { recovery: true },
      ),
      providerPreflight: orphanedPreflight,
      transitionIntent: orphanedIntent,
    });
  assert.equal(orphanedRecovery.currentRole, "reader");
  assert.equal(orphanedRecovery.providerPatchDispatched, false);
  assert.equal(orphanedRecovery.durableAclResultReceipt.outcome_status,
    "TARGET_CONFIRMED");
  assert.equal(orphanedProvider.state.patchCount, 0);

  const unresolvedProvider = fakeDrive();
  const unresolvedSource = await captureSource(unresolvedProvider);
  const unresolvedIntent = transitionIntent(unresolvedSource, "reader");
  const unresolvedPreflight = await preflight(
    unresolvedProvider,
    unresolvedSource.beforeState,
    unresolvedIntent,
  );
  await assert.rejects(
    acl.recoverProductionGoogleDriveAclTransitionOutcome({
      databaseRecoveryCapability: await officialDatabaseCapability(
        unresolvedIntent,
        unresolvedPreflight,
        { recovery: true },
      ),
      providerPreflight: unresolvedPreflight,
      transitionIntent: unresolvedIntent,
    }),
    (error) => error.code ===
        "STEP12_GOOGLE_DRIVE_ACL_UPDATE_OUTCOME_UNKNOWN" &&
      error.safeDiagnostics.durableAclResultRecorded === true,
  );
  assert.equal(unresolvedProvider.state.patchCount, 0);

  for (const transientProvider of [
    fakeDrive({ applyPatch: false, patchStatus: 500 }),
    fakeDrive({ applyPatch: false, throwBeforePatch: true }),
  ]) {
    const transientSource = await captureSource(transientProvider);
    const transientIntent = transitionIntent(transientSource, "reader");
    const transientPreflight = await preflight(
      transientProvider,
      transientSource.beforeState,
      transientIntent,
    );
    await assert.rejects(
      acl.transitionProductionGoogleLegacyDriveRole({
        providerPreflight: transientPreflight,
        providerMutationCapability: await dispatch(
          transientIntent,
          transientPreflight,
        ),
        transitionIntent: transientIntent,
      }),
      (error) => error.code ===
          "STEP12_GOOGLE_DRIVE_ACL_UPDATE_OUTCOME_UNKNOWN" &&
        error.safeDiagnostics.providerMutationRecoveryRequired === true,
    );
    assert.equal(transientProvider.state.role, "writer");
  }

  const failedReadbackProvider = fakeDrive({
    failPermissionReadbackAfterPatch: true,
  });
  const failedReadbackSource = await captureSource(failedReadbackProvider);
  const failedReadbackIntent = transitionIntent(failedReadbackSource, "reader");
  const failedReadbackPreflight = await preflight(
    failedReadbackProvider,
    failedReadbackSource.beforeState,
    failedReadbackIntent,
  );
  await assert.rejects(
    acl.transitionProductionGoogleLegacyDriveRole({
      providerPreflight: failedReadbackPreflight,
      providerMutationCapability: await dispatch(
        failedReadbackIntent,
        failedReadbackPreflight,
      ),
      transitionIntent: failedReadbackIntent,
    }),
    (error) => error.code === "STEP12_GOOGLE_DRIVE_ACL_UPDATE_OUTCOME_UNKNOWN" &&
      error.safeDiagnostics.providerMutationRecoveryRequired === true,
  );

  const deterministicRejectProvider = fakeDrive({
    applyPatch: false,
    patchStatus: 403,
  });
  const deterministicRejectSource = await captureSource(
    deterministicRejectProvider,
  );
  const deterministicRejectIntent = transitionIntent(
    deterministicRejectSource,
    "reader",
  );
  const deterministicRejectPreflight = await preflight(
    deterministicRejectProvider,
    deterministicRejectSource.beforeState,
    deterministicRejectIntent,
  );
  await assert.rejects(
    acl.transitionProductionGoogleLegacyDriveRole({
      providerPreflight: deterministicRejectPreflight,
      providerMutationCapability: await dispatch(
        deterministicRejectIntent,
        deterministicRejectPreflight,
      ),
      transitionIntent: deterministicRejectIntent,
    }),
    (error) => error.code ===
        "STEP12_GOOGLE_DRIVE_ACL_UPDATE_OUTCOME_UNKNOWN" &&
      error.safeDiagnostics.providerMutationRecoveryRequired === true &&
      error.safeDiagnostics.durableAclResultRecorded === true,
  );

  const unsafeReaderCapabilityProvider = fakeDrive({ readerCanShare: true });
  const unsafeReaderSource = await captureSource(unsafeReaderCapabilityProvider);
  const unsafeReaderIntent = transitionIntent(unsafeReaderSource, "reader");
  const unsafeReaderPreflight = await preflight(
    unsafeReaderCapabilityProvider,
    unsafeReaderSource.beforeState,
    unsafeReaderIntent,
  );
  await assert.rejects(
    acl.transitionProductionGoogleLegacyDriveRole({
      providerPreflight: unsafeReaderPreflight,
      providerMutationCapability: await dispatch(
        unsafeReaderIntent,
        unsafeReaderPreflight,
      ),
      transitionIntent: unsafeReaderIntent,
    }),
    { code: "STEP12_GOOGLE_DRIVE_ACL_UPDATE_OUTCOME_UNKNOWN" },
  );

  const extraProvider = fakeDrive({ extraWriter: true });
  await assert.rejects(
    acl.inspectProductionGoogleDriveAclFence({
      accessToken: dedicatedReadToken,
      dedicatedPrincipalEmail: dedicatedEmail,
      fetchImpl: extraProvider.fetchImpl,
      legacyPrincipalEmail: legacyEmail,
    }),
    (error) => error.code === "STEP12_GOOGLE_DRIVE_ACL_INVENTORY_UNSAFE" &&
      error.safeDiagnostics.unexpectedNonOwnerEditorCount === 1,
  );

  const ownerActionProvider = fakeDrive({ canShare: false });
  await assert.rejects(
    acl.inspectProductionGoogleDriveAclFence({
      accessToken: dedicatedReadToken,
      dedicatedPrincipalEmail: dedicatedEmail,
      fetchImpl: ownerActionProvider.fetchImpl,
      legacyPrincipalEmail: legacyEmail,
    }),
    { code: "STEP12_GOOGLE_DRIVE_ACL_OWNER_ACTION_REQUIRED" },
  );

  const expirationTime = "2030-01-01T00:00:00.000Z";
  const dedicatedExpiryProvider = fakeDrive({
    dedicatedExpirationTime: expirationTime,
  });
  await assert.rejects(
    acl.inspectProductionGoogleDriveAclFence({
      accessToken: dedicatedReadToken,
      dedicatedPrincipalEmail: dedicatedEmail,
      fetchImpl: dedicatedExpiryProvider.fetchImpl,
      legacyPrincipalEmail: legacyEmail,
    }),
    (error) => error.code === "STEP12_GOOGLE_DRIVE_ACL_INVENTORY_UNSAFE" &&
      error.safeDiagnostics.dedicatedPermissionExpiring === true,
  );
  const legacyExpiryProvider = fakeDrive({
    legacyExpirationTime: expirationTime,
  });
  await assert.rejects(
    acl.inspectProductionGoogleDriveAclFence({
      accessToken: dedicatedReadToken,
      dedicatedPrincipalEmail: dedicatedEmail,
      fetchImpl: legacyExpiryProvider.fetchImpl,
      legacyPrincipalEmail: legacyEmail,
    }),
    (error) => error.code === "STEP12_GOOGLE_DRIVE_ACL_INVENTORY_UNSAFE" &&
      error.safeDiagnostics.legacyPermissionExpiring === true,
  );

  const wrongTokenProvider = fakeDrive({
    dedicatedAboutEmail: "wrong@example.iam.gserviceaccount.com",
  });
  await assert.rejects(
    acl.inspectProductionGoogleDriveAclFence({
      accessToken: dedicatedReadToken,
      dedicatedPrincipalEmail: dedicatedEmail,
      fetchImpl: wrongTokenProvider.fetchImpl,
      legacyPrincipalEmail: legacyEmail,
    }),
    { code: "STEP12_GOOGLE_DRIVE_ACL_TOKEN_PRINCIPAL_INVALID" },
  );

  const serialized = JSON.stringify({
    downgrade,
    downgradeIntent,
    downgradePreflight,
    restored,
    source,
  });
  for (const secret of [
    dedicatedEmail,
    legacyEmail,
    "permission-owner-secret",
    "permission-dedicated-secret",
    "permission-legacy-secret",
    dedicatedReadToken,
    dedicatedPermissionToken,
    legacyReadToken,
  ]) assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const moduleSource = await readFile(
    new URL("../lib/production-google-drive-acl-fence.js", import.meta.url),
    "utf8",
  );
  assert.match(moduleSource, /^import "server-only";/);
  assert.equal("registerProductionGoogleDriveAclProviderMutationDispatch" in acl, false);
  assert.equal("beginProductionGoogleDriveAclProviderMutationClaimClock" in acl, false);
  assert.deepEqual(Object.keys(dbDispatch), [
    "createProductionGoogleDriveAclDbDispatchChannel",
  ]);
  assert.doesNotMatch(moduleSource, /Date\.now\(\)\s*</);
  assert.match(moduleSource,
    /assertProviderMutationDispatch\([\s\S]*?\);\n  }\n  try \{\n    return await fetchImpl/);
  const libDirectory = new URL("../lib/", import.meta.url);
  const dbChannelImports = [];
  const dbReceiptIssuers = [];
  for (const entry of await readdir(libDirectory)) {
    if (!entry.endsWith(".js") ||
        entry === "production-google-drive-acl-db-dispatch.js") continue;
    const source = await readFile(new URL(entry, libDirectory), "utf8");
    if (source.includes("createProductionGoogleDriveAclDbDispatchChannel"))
      dbChannelImports.push(entry);
    if (source.includes(".issueReceipt(")) dbReceiptIssuers.push(entry);
  }
  assert.deepEqual(dbChannelImports,
    ["production-google-writer-fence-receipt-server.js"]);
  assert.deepEqual(dbReceiptIssuers,
    ["production-google-writer-fence-receipt-server.js"]);

  process.stdout.write(JSON.stringify({
    exactForwardRole: downgrade.currentRole,
    exactRestoreRole: restored.currentRole,
    lostResponseRecovered: lostRecovered.ambiguousOutcomeRecovered,
    rawIdentifiersRedacted: true,
    rejectedDedicatedExpiry: true,
    retainedDeterministicProviderRejection: true,
    rejectedExtraWriter: true,
    rejectedFabricatedDatabaseDispatch: true,
    rejectedProductionFetchInjection: true,
    rejectedReceiptAccessorAndProxy: true,
    retainedAmbiguousMutation: true,
    retainedReadbackFailure: true,
    rejectedLegacyCanShare: true,
    rejectedLegacyExpiry: true,
    rejectedMissingCapability: true,
    rejectedOwnerAction: true,
    rejectedTokenPrincipalMismatch: true,
  }));
}
