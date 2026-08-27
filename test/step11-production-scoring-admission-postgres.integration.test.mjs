import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

import { productionGoogleWriterProviderAbortEvidenceHash } from
  "../lib/production-google-writer-provider-abort-evidence.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationsDirectory = path.join(
  repositoryRoot,
  "supabase",
  "production_migrations",
);
const pgBin = "/opt/homebrew/opt/postgresql@17/bin";
const postgresBinaries = Object.fromEntries(
  ["createdb", "initdb", "pg_ctl", "psql"].map((name) => [
    name,
    path.join(pgBin, name),
  ]),
);

const scope = Object.freeze({
  environment: "PRODUCTION",
  project_ref: "ymqhhtxaywtqllynrmxe",
  project_url: "https://ymqhhtxaywtqllynrmxe.supabase.co",
  source_workbook_id: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4",
  tournament_id: "2026",
});
const actor = "postgres-admission-integration-test";
const deploymentCommit = "1234567890abcdef1234567890abcdef12345678";
const deploymentId = "dpl_PostgresAdmission034";
const sourceFingerprint = fingerprint("staged-source-boundary");
const legacyProviderPrincipalFingerprint = fingerprint(
  "google-drive-permission-principal-v1\nuser\nlegacy-writer@example.invalid",
);
const advisoryLockKey = 731102026032n;
const originInventoryArtifact = JSON.parse(await readFile(path.join(
  repositoryRoot,
  "test/fixtures/step11-6-production-origin-inventory-v2.json",
), "utf8"));
const originInventory = Object.freeze(originInventoryArtifact.records);
const originInventoryFingerprint =
  "533178a28a5458c5f2f727b77af3024de4cc0402c49e90dcd763b950d26fb4c6";
const originInventoryV3Artifact = JSON.parse(await readFile(path.join(
  repositoryRoot,
  "docs/evidence/step11-6-production-origin-inventory.json",
), "utf8"));
const originInventoryV3 = Object.freeze(originInventoryV3Artifact.records);
const originInventoryV3Fingerprint =
  "d238c5eeefef4606e0a05c2d0dbcee1a2b29cd07a2dd480435c0e75a0c3a91a6";
const providerInventoryV3Fingerprint =
  "6488da5c86e50bd0c524a94a8c8f97c1aeb8576393fc14d68a7bd76ebe338692";
const originInventoryV4Artifact = JSON.parse(await readFile(path.join(
  repositoryRoot,
  "docs/evidence/step11-6-production-origin-inventory-v4.json",
), "utf8"));
const activeAliasCensusArtifact = JSON.parse(await readFile(path.join(
  repositoryRoot,
  "docs/evidence/step11-6-production-active-alias-census-v1.json",
), "utf8"));
const originInventoryV4 = Object.freeze(originInventoryV4Artifact.records);
const originInventoryV4Fingerprint =
  "9d25299c72424a2b5c3c613649b7f07760fda64c0b0bb4823edaf2cd91622774";
const providerInventoryV4Fingerprint =
  "abd27e4e2747c17053f6debf71ec0f523d39fea8e2383d4911f9dc4b87959cbe";
const credentialConfinementV4Artifact = JSON.parse(await readFile(path.join(
  repositoryRoot,
  "docs/evidence/step11-6-production-google-credential-confinement-v4.json",
), "utf8"));
// Migrations 036-038 remain historical and are exercised against the exact
// post-capture additions they originally certified.  Runtime code intentionally
// no longer exports this partial-inventory compatibility list after v3.
const reviewedPostCapturePreviewDeployments = Object.freeze([
  ["dpl_32Upq6iEQoD2MVdxcWWVihj66hEg",
    "41b0517e4e1679536438109ea61028663c80508f",
    "https://bagger-c1miwfnb1-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT"],
  ["dpl_3wULxzmgsbsmUPLmK7B1Ld4FAjeT",
    "68c81debe4c8f99662bb5615d5c82a34a10a011e",
    "https://bagger-99mqqt7qn-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT"],
  ["dpl_44fXUMdcS7QbQiJvMimX1DozcZrR",
    "fdda563eaab6569a6c8e0442ef8118fdc0db8569",
    "https://bagger-m3t3ao7ui-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT"],
  ["dpl_6m9FqCvd8pe1epaxyYMmkRhK7Pc6",
    "3fcbaa287fcb306fa3b47310f01ed6eb3901749c",
    "https://bagger-phzmni50c-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT"],
  ["dpl_ENU4XkC1dpbj9aho5gTz2x8zw9qP",
    "85eb5efce7f5c9d9292e007fc093c05d7dd5c356",
    "https://bagger-7zpm6cjp3-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT"],
  ["dpl_Ux3JFpeS8MxMoKj19kL63tzQ9FjQ",
    "3fcbaa287fcb306fa3b47310f01ed6eb3901749c",
    "https://bagger-dc2m041un-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT"],
  ["dpl_idZKEn956pcuEXctKS5HPoWfEn4Y",
    "b6f50d24d9a96c845305210b958ccf716bbf994d",
    "https://bagger-aggbtffot-sandbagger-invitational.vercel.app",
    "FEATURE_PREVIEW", "READY", "GIT"],
].map(Object.freeze));
const reviewed68c81deDeployment = Object.freeze([
  "dpl_3wULxzmgsbsmUPLmK7B1Ld4FAjeT",
  "68c81debe4c8f99662bb5615d5c82a34a10a011e",
  "https://bagger-99mqqt7qn-sandbagger-invitational.vercel.app",
  "FEATURE_PREVIEW",
  "READY",
  "GIT",
]);
const reviewedDeploymentsThrough037 = Object.freeze(
  reviewedPostCapturePreviewDeployments.filter(
    (tuple) => tuple[0] !== reviewed68c81deDeployment[0],
  ),
);
const credentialConfinement = Object.freeze({
  credential_confinement_evidence_schema:
    "step11-6-production-google-credential-confinement-v1",
  credential_confinement_record_count: 1140,
  credential_confinement_records_fingerprint:
    "c63962703a60745786ffce2e43e9fef5fa38e12746fce5627f33bfde92c8f508",
  credential_confinement_evidence_fingerprint:
    "1d6f4203fc56226ba4f6881339e9b2dfcede0e413485a110785d28e066a569df",
});
const credentialConfinementV2 = Object.freeze({
  credential_confinement_evidence_schema:
    "step11-6-production-google-credential-confinement-v2",
  credential_confinement_record_count: 1291,
  credential_confinement_records_fingerprint:
    "9ce65239f41086f56ea126e2491afe36ae90e85172a8536706f549912b27979b",
  credential_confinement_evidence_fingerprint:
    "071ca9163f6a1033e17136ace4c82b3163aa7a1c29900300ddafeeda5b7bb133",
});
const credentialConfinementV3 = Object.freeze({
  credential_confinement_evidence_schema:
    "step11-6-production-google-credential-confinement-v3",
  credential_confinement_record_count: 1292,
  credential_confinement_records_fingerprint:
    "7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e",
  credential_confinement_evidence_fingerprint:
    "0c392e1b369d43c5c117716e6b00d3050ab1c8a9fc79b22df43050d0a7c7fb11",
});
const credentialConfinementV4 = Object.freeze({
  credential_confinement_evidence_schema:
    "step11-6-production-google-credential-confinement-v4",
  credential_confinement_record_count: 1292,
  credential_confinement_records_fingerprint:
    "7549a25c6cbdcec38ea0f331c8aff344cfee837a916ac8871fb5a4956f67838e",
  credential_confinement_evidence_fingerprint:
    "6f468334a508553cdb9230c14ad85969c89169df6a2ec88011fb2e7e30c9656a",
});
const providerInventoryBindingV3 = Object.freeze({
  provider_inventory_schema: "step11-6-production-origin-inventory-v3",
  retained_origin_inventory_count: 1291,
  retained_origin_inventory_fingerprint: originInventoryV3Fingerprint,
  retained_provider_inventory_count: 1291,
  retained_provider_inventory_fingerprint: providerInventoryV3Fingerprint,
  live_provider_inventory_count: 1291,
  live_provider_inventory_fingerprint: providerInventoryV3Fingerprint,
  routing_rule_all_method_fence_required_host_count: 8,
  routing_rule_all_method_fence_required_hosts_fingerprint:
    "62f14a6635bc9ec16ce681e04b17bbd0f39e9ff55a858bbcb75f4aa75bc3bc4d",
  routing_rule_all_method_fence_required_path_count: 1,
  routing_rule_all_method_fence_required_paths_fingerprint:
    "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa",
});
const providerInventoryBindingV4 = Object.freeze({
  provider_inventory_schema: "step11-6-production-origin-inventory-v4",
  retained_origin_inventory_count: 1292,
  retained_origin_inventory_fingerprint: originInventoryV4Fingerprint,
  retained_provider_inventory_count: 1292,
  retained_provider_inventory_fingerprint: providerInventoryV4Fingerprint,
  live_provider_inventory_count: 1292,
  live_provider_inventory_fingerprint: providerInventoryV4Fingerprint,
  routing_rule_all_method_fence_required_host_count: 9,
  routing_rule_all_method_fence_required_hosts_fingerprint:
    "0423e6a742d6527b10afc071856dbc6c5b1cca5e1ffb09a5d2523d0f04b31c0c",
  routing_rule_all_method_fence_required_path_count: 1,
  routing_rule_all_method_fence_required_paths_fingerprint:
    "fc445deac5eb4c5369e21394fc2ddb42169192b7a297a1780875ed0dd276dcfa",
  routing_rule_hostname_operator: "DOES_NOT_EQUAL",
  routing_rule_canonical_hostname: "baggerinv.com",
  routing_rule_earlier_active_bypass_rule_count: 0,
  routing_rule_global_invocation_quiescence_proved: true,
  routing_rule_candidate_control_host_count: 2,
  routing_rule_candidate_control_hosts_fingerprint:
    "8ae83902ac5826bac13cd5e673136be67c6a807f85ec7f1e8382d1f0c35ca778",
  routing_rule_canonical_apex_safe_method_count: 3,
  routing_rule_canonical_apex_safe_methods_fingerprint:
    "798954f7a6aab53443a1fac2333ce7043f7c5c5bf5bdbffdfdd19f18433e96e7",
  routing_rule_canonical_apex_safe_method_writer_route_count: 10,
  routing_rule_canonical_apex_safe_method_writer_routes_fingerprint:
    "8f3bcfaf2b8fd6825ce5fb56385b1a1aa2e23da7bfe96b42e7e9c3ec23f4bcd7",
});
const retainedV3CandidateIdentity = Object.freeze({
  deploymentId: "dpl_CBgDhovX4cfQx15EJWWvm6Kti25j",
  commit: "be5531faca009e26617496e47831f365a1b4997b",
  credentialGeneration: "DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
  mainBranchAliasOrigin:
    "https://bagger-inv-git-main-sandbagger-invitational.vercel.app",
  aliasOrigin:
    "https://bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app",
  immutableOrigin:
    "https://bagger-mribo6cqh-sandbagger-invitational.vercel.app",
});
const candidateIdentity = Object.freeze({
  deploymentId: deploymentId,
  commit: deploymentCommit,
  credentialGeneration: "DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
  mainBranchAliasOrigin:
    "https://bagger-inv-git-main-sandbagger-invitational.vercel.app",
  aliasOrigin:
    "https://candidate-step11-6-sandbagger-invitational.vercel.app",
  immutableOrigin:
    "https://bagger-step11-6-immutable-sandbagger-invitational.vercel.app",
});
const providerAliasInventoryRecords = Object.freeze([
  ...activeAliasCensusArtifact.records.filter((record) =>
    record[0] !==
      "bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app"
  ),
  [
    candidateIdentity.aliasOrigin.slice("https://".length),
    candidateIdentity.deploymentId,
    candidateIdentity.immutableOrigin.slice("https://".length),
    null,
    null,
  ],
].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
  .map(Object.freeze));
function providerAliasBindingForPurpose(purpose) {
  const candidateImmutableHostname =
    candidateIdentity.immutableOrigin.slice("https://".length);
  const candidateRecords = purpose === "CUTOVER"
    ? providerAliasInventoryRecords.map((record) => {
      if (!["baggerinv.com", "bagger-inv.vercel.app", "www.baggerinv.com"]
        .includes(record[0])) return record;
      return Object.freeze([
        record[0],
        candidateIdentity.deploymentId,
        candidateImmutableHostname,
        record[0] === "www.baggerinv.com" ? "baggerinv.com" : null,
        record[0] === "www.baggerinv.com" ? 308 : null,
      ]);
    })
    : providerAliasInventoryRecords;
  const records = Object.freeze([...candidateRecords]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  return Object.freeze({
    candidate_alias_origin: candidateIdentity.aliasOrigin,
    candidate_immutable_origin: candidateIdentity.immutableOrigin,
    alias_inventory_count: records.length,
    alias_inventory_fingerprint: fingerprint(JSON.stringify(records)),
    alias_inventory_records: records,
    alias_pagination_page_count: 1,
    alias_pagination_fingerprint:
      fingerprint(`pg17-migration-040-alias-pagination-${purpose}`),
  });
}
const probeVectors = Object.freeze([
  { probeMethod: "DELETE", probePath: "/api/tournament-guide" },
  { probeMethod: "POST", probePath: "/api/admin/cms" },
  { probeMethod: "POST", probePath: "/api/admin/tournament" },
  { probeMethod: "POST", probePath: "/api/director" },
  { probeMethod: "POST", probePath: "/api/live-matches" },
  { probeMethod: "POST", probePath: "/api/odds/publish" },
  { probeMethod: "POST", probePath: "/api/scoring/current" },
  {
    probeMethod: "POST",
    probePath: "/api/scoring/matches/__step11_6_probe__",
  },
  { probeMethod: "POST", probePath: "/api/tournament-guide" },
]);
const probeVectorsV3 = Object.freeze([
  ...probeVectors,
  { probeMethod: "GET", probePath: "/api/cron/round-scorecards-archive" },
  { probeMethod: "HEAD", probePath: "/api/cron/round-scorecards-archive" },
]);
const expectedFenceSheetIds = Object.freeze([
  0, 28074660, 214637017, 270637829, 314908504, 388354025,
  625223812, 804336907, 844307454, 1074655326, 1403525379,
  1404770729, 1471947317, 1677468900, 1763222762, 1802214847,
  1940053655,
]);
const providerProofByEvidenceId = new Map();

function fingerprint(label) {
  return createHash("sha256").update(label).digest("hex");
}

function aclScalar(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Number.isSafeInteger(value)) return String(value);
  return String(value ?? "").trim();
}

function aclTupleFingerprint(domain, values) {
  return fingerprint([domain, ...values.map(aclScalar)].join("\n"));
}

function aclTransitionIntentFingerprint(value) {
  return aclTupleFingerprint(
    "production-google-drive-acl-transition-intent-v1",
    [
      value.schemaVersion,
      value.workbookId,
      value.fenceId,
      value.installRequestId,
      value.transitionPhase,
      value.providerMutationClass,
      value.sourceRole,
      value.targetRole,
      value.permissionManagementScope,
      value.legacyPermissionFingerprint,
      value.legacyPrincipalFingerprint,
      value.dedicatedPermissionFingerprint,
      value.dedicatedPrincipalFingerprint,
      value.dedicatedDriveIdentityFingerprint,
      value.priorPermissionInventoryFingerprint,
      value.expectedTargetPermissionInventoryFingerprint,
      value.permissionIdentityFingerprint,
      value.sharingCapabilityFingerprint,
      value.priorAclFingerprint,
      value.priorLegacyCanEdit,
      value.priorLegacyCanShare,
      value.expectedTargetLegacyCanEdit,
      value.expectedTargetLegacyCanShare,
      value.priorLegacyEditCapabilityFingerprint,
      value.expectedTargetLegacyEditCapabilityFingerprint,
      value.legacyDriveIdentityFingerprint,
      value.permissionCount,
      value.priorNonOwnerEditorCount,
      value.expectedTargetNonOwnerEditorCount,
      value.priorEffectiveNonOwnerEditorFingerprint,
      value.expectedTargetEffectiveNonOwnerEditorFingerprint,
    ],
  );
}

function aclTransitionProofFingerprint(value) {
  return aclTupleFingerprint(
    "production-google-drive-acl-transition-proof-v1",
    [
      value.schemaVersion,
      value.workbookId,
      value.fenceId,
      value.installRequestId,
      value.transitionPhase,
      value.providerMutationClass,
      value.permissionManagementScope,
      value.transitionIntentFingerprint,
      value.legacyPermissionFingerprint,
      value.legacyPrincipalFingerprint,
      value.priorRole,
      value.currentRole,
      value.priorPermissionInventoryFingerprint,
      value.currentPermissionInventoryFingerprint,
      value.permissionIdentityFingerprint,
      value.sharingCapabilityFingerprint,
      value.dedicatedDriveIdentityFingerprint,
      value.legacyDriveIdentityFingerprint,
      value.priorAclFingerprint,
      value.currentAclFingerprint,
      value.priorLegacyCanEdit,
      value.currentLegacyCanEdit,
      value.priorLegacyCanShare,
      value.currentLegacyCanShare,
      value.priorLegacyEditCapabilityFingerprint,
      value.currentLegacyEditCapabilityFingerprint,
      value.dedicatedCanShare,
      value.writersCanShare,
    ],
  );
}

function aclV2TransitionVector(label, fenceId, installRequestId) {
  const shared = Object.freeze({
    legacyPermissionFingerprint: fingerprint(`${label}-legacy-permission`),
    legacyPrincipalFingerprint: legacyProviderPrincipalFingerprint,
    dedicatedPermissionFingerprint: fingerprint(`${label}-dedicated-permission`),
    dedicatedPrincipalFingerprint: fingerprint(`${label}-dedicated-principal`),
    dedicatedDriveIdentityFingerprint: fingerprint(`${label}-dedicated-identity`),
    legacyDriveIdentityFingerprint: fingerprint(`${label}-legacy-identity`),
    permissionIdentityFingerprint: fingerprint(`${label}-permission-identities`),
    sharingCapabilityFingerprint: fingerprint(`${label}-sharing-capability`),
    writerPermissionInventoryFingerprint: fingerprint(`${label}-writer-inventory`),
    readerPermissionInventoryFingerprint: fingerprint(`${label}-reader-inventory`),
    writerAclFingerprint: fingerprint(`${label}-writer-acl`),
    readerAclFingerprint: fingerprint(`${label}-reader-acl`),
    writerLegacyCapabilityFingerprint: fingerprint(`${label}-writer-capability`),
    readerLegacyCapabilityFingerprint: fingerprint(`${label}-reader-capability`),
    writerEditorFingerprint: fingerprint(`${label}-writer-editors`),
    readerEditorFingerprint: fingerprint(`${label}-reader-editors`),
  });
  const intent = ({ targetRole }) => {
    const installing = targetRole === "reader";
    const core = {
      schemaVersion: "step12-production-google-drive-acl-transition-intent-v1",
      workbookId: scope.source_workbook_id,
      fenceId,
      installRequestId,
      transitionPhase: installing ? "INSTALL" : "ABORT",
      providerMutationClass: installing
        ? "DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1"
        : "DRIVE_LEGACY_PERMISSION_READER_TO_WRITER_V1",
      sourceRole: installing ? "writer" : "reader",
      targetRole,
      permissionManagementScope: "https://www.googleapis.com/auth/drive.file",
      legacyPermissionFingerprint: shared.legacyPermissionFingerprint,
      legacyPrincipalFingerprint: shared.legacyPrincipalFingerprint,
      dedicatedPermissionFingerprint: shared.dedicatedPermissionFingerprint,
      dedicatedPrincipalFingerprint: shared.dedicatedPrincipalFingerprint,
      dedicatedDriveIdentityFingerprint: shared.dedicatedDriveIdentityFingerprint,
      priorPermissionInventoryFingerprint: installing
        ? shared.writerPermissionInventoryFingerprint
        : shared.readerPermissionInventoryFingerprint,
      expectedTargetPermissionInventoryFingerprint: installing
        ? shared.readerPermissionInventoryFingerprint
        : shared.writerPermissionInventoryFingerprint,
      permissionIdentityFingerprint: shared.permissionIdentityFingerprint,
      sharingCapabilityFingerprint: shared.sharingCapabilityFingerprint,
      priorAclFingerprint: installing
        ? shared.writerAclFingerprint
        : shared.readerAclFingerprint,
      priorLegacyCanEdit: installing,
      priorLegacyCanShare: installing,
      expectedTargetLegacyCanEdit: !installing,
      expectedTargetLegacyCanShare: !installing,
      priorLegacyEditCapabilityFingerprint: installing
        ? shared.writerLegacyCapabilityFingerprint
        : shared.readerLegacyCapabilityFingerprint,
      expectedTargetLegacyEditCapabilityFingerprint: installing
        ? shared.readerLegacyCapabilityFingerprint
        : shared.writerLegacyCapabilityFingerprint,
      legacyDriveIdentityFingerprint: shared.legacyDriveIdentityFingerprint,
      permissionCount: 3,
      priorNonOwnerEditorCount: installing ? 2 : 1,
      expectedTargetNonOwnerEditorCount: installing ? 1 : 2,
      priorEffectiveNonOwnerEditorFingerprint: installing
        ? shared.writerEditorFingerprint
        : shared.readerEditorFingerprint,
      expectedTargetEffectiveNonOwnerEditorFingerprint: installing
        ? shared.readerEditorFingerprint
        : shared.writerEditorFingerprint,
    };
    return Object.freeze({
      ...core,
      transitionIntentFingerprint: aclTransitionIntentFingerprint(core),
    });
  };
  const proof = (transitionIntent) => {
    const installing = transitionIntent.targetRole === "reader";
    const core = {
      schemaVersion: "step12-production-google-drive-acl-transition-proof-v1",
      workbookId: scope.source_workbook_id,
      fenceId,
      installRequestId,
      transitionPhase: transitionIntent.transitionPhase,
      providerMutationClass: transitionIntent.providerMutationClass,
      permissionManagementScope: transitionIntent.permissionManagementScope,
      transitionIntentFingerprint: transitionIntent.transitionIntentFingerprint,
      legacyPermissionFingerprint: shared.legacyPermissionFingerprint,
      legacyPrincipalFingerprint: shared.legacyPrincipalFingerprint,
      priorRole: transitionIntent.sourceRole,
      currentRole: transitionIntent.targetRole,
      priorPermissionInventoryFingerprint:
        transitionIntent.priorPermissionInventoryFingerprint,
      currentPermissionInventoryFingerprint:
        transitionIntent.expectedTargetPermissionInventoryFingerprint,
      permissionIdentityFingerprint: shared.permissionIdentityFingerprint,
      sharingCapabilityFingerprint: shared.sharingCapabilityFingerprint,
      dedicatedDriveIdentityFingerprint: shared.dedicatedDriveIdentityFingerprint,
      legacyDriveIdentityFingerprint: shared.legacyDriveIdentityFingerprint,
      priorAclFingerprint: transitionIntent.priorAclFingerprint,
      currentAclFingerprint: installing
        ? shared.readerAclFingerprint
        : shared.writerAclFingerprint,
      priorLegacyCanEdit: transitionIntent.priorLegacyCanEdit,
      currentLegacyCanEdit: transitionIntent.expectedTargetLegacyCanEdit,
      priorLegacyCanShare: transitionIntent.priorLegacyCanShare,
      currentLegacyCanShare: transitionIntent.expectedTargetLegacyCanShare,
      priorLegacyEditCapabilityFingerprint:
        transitionIntent.priorLegacyEditCapabilityFingerprint,
      currentLegacyEditCapabilityFingerprint:
        transitionIntent.expectedTargetLegacyEditCapabilityFingerprint,
      dedicatedCanShare: true,
      writersCanShare: true,
    };
    return Object.freeze({
      ...core,
      transitionFingerprint: aclTransitionProofFingerprint(core),
    });
  };
  const installIntent = intent({ targetRole: "reader" });
  const restoreIntent = intent({ targetRole: "writer" });
  return Object.freeze({
    shared,
    installIntent,
    installProof: proof(installIntent),
    restoreIntent,
    restoreProof: proof(restoreIntent),
  });
}

assert.equal(originInventoryArtifact.recordCount, 1140);
assert.equal(originInventory.length, 1140);
assert.equal(originInventoryArtifact.recordsFingerprint, originInventoryFingerprint);
assert.equal(fingerprint(JSON.stringify(originInventory)), originInventoryFingerprint);
assert.equal(originInventoryV3Artifact.schemaVersion,
  "step11-6-production-origin-inventory-v3");
assert.equal(originInventoryV3Artifact.recordCount, 1291);
assert.equal(originInventoryV3Artifact.providerRecordCount, 1291);
assert.equal(originInventoryV3Artifact.recordsFingerprint,
  originInventoryV3Fingerprint);
assert.equal(originInventoryV3Artifact.providerRecordsFingerprint,
  providerInventoryV3Fingerprint);
assert.equal(fingerprint(JSON.stringify(originInventoryV3)),
  originInventoryV3Fingerprint);
assert.equal(originInventoryV4Artifact.schemaVersion,
  "step11-6-production-origin-inventory-v4");
assert.equal(originInventoryV4Artifact.recordCount, 1292);
assert.equal(originInventoryV4Artifact.providerRecordCount, 1292);
assert.equal(originInventoryV4Artifact.recordsFingerprint,
  originInventoryV4Fingerprint);
assert.equal(originInventoryV4Artifact.providerRecordsFingerprint,
  providerInventoryV4Fingerprint);
assert.equal(fingerprint(JSON.stringify(originInventoryV4)),
  originInventoryV4Fingerprint);
assert.equal(activeAliasCensusArtifact.recordCount, 56);
assert.equal(activeAliasCensusArtifact.recordsFingerprint,
  fingerprint(JSON.stringify(activeAliasCensusArtifact.records)));
assert.equal(providerAliasInventoryRecords.length, 56);
assert.equal(credentialConfinementV4Artifact.schemaVersion,
  credentialConfinementV4.credential_confinement_evidence_schema);
assert.equal(credentialConfinementV4Artifact.classificationRecordCount,
  credentialConfinementV4.credential_confinement_record_count);
assert.equal(credentialConfinementV4Artifact.classificationRecordsFingerprint,
  credentialConfinementV4.credential_confinement_records_fingerprint);
assert.equal(credentialConfinementV4Artifact.evidenceFingerprint,
  credentialConfinementV4.credential_confinement_evidence_fingerprint);

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function candidateInventoryTuple(target) {
  return [
    candidateIdentity.deploymentId,
    candidateIdentity.commit,
    candidateIdentity.immutableOrigin,
    target === "PRODUCTION"
      ? "CUTOVER_PRODUCTION_CANDIDATE"
      : "FEATURE_PREVIEW",
    "READY",
    "GIT",
  ];
}

function sortLiveOriginInventory(records) {
  return [...records].sort((left, right) => compareCodepoint(
    `${left[0]}\n${left[2]}`,
    `${right[0]}\n${right[2]}`,
  ));
}

function liveOriginInventoryFor(target = "PREVIEW", additions = []) {
  return sortLiveOriginInventory([
    ...originInventory,
    ...reviewedPostCapturePreviewDeployments,
    ...additions,
    candidateInventoryTuple(target),
  ]);
}

function liveOriginInventoryThrough037For(target = "PREVIEW", additions = []) {
  return sortLiveOriginInventory([
    ...originInventory,
    ...reviewedDeploymentsThrough037,
    ...additions,
    candidateInventoryTuple(target),
  ]);
}

function liveOriginInventoryV4ForCutover(candidateTarget = "PREVIEW") {
  assert.equal(candidateTarget, "PREVIEW",
    "the current v4 control candidate is Preview-only");
  return sortLiveOriginInventory([
    ...originInventoryV4,
    [
      candidateIdentity.deploymentId,
      candidateIdentity.commit,
      candidateIdentity.immutableOrigin,
      "PROJECT_PREVIEW",
      "READY",
      fingerprint("pg17-migration-040-candidate-provider-metadata"),
    ],
  ]);
}

function providerInventoryBindingV4ForLive(liveInventory) {
  return {
    ...providerInventoryBindingV4,
    live_provider_inventory_count: liveInventory.length,
    live_provider_inventory_fingerprint:
      fingerprint("pg17-provider-v4:" + JSON.stringify(liveInventory)),
  };
}

function assertExactLiveOriginInventory(
  cluster,
  database,
  liveInventory,
  {
    candidateDeploymentId = candidateIdentity.deploymentId,
    candidateDeploymentCommit = candidateIdentity.commit,
    candidateImmutableOrigin = candidateIdentity.immutableOrigin,
    candidateDeploymentTarget = "PREVIEW",
    retainedInventory = originInventory,
  } = {},
) {
  return psql(cluster, database, `
    select production_control.assert_exact_vercel_live_inventory(
      ${jsonSql(retainedInventory)},
      ${jsonSql(liveInventory)},
      ${sqlLiteral(candidateDeploymentId)},
      ${sqlLiteral(candidateDeploymentCommit)},
      ${sqlLiteral(candidateImmutableOrigin)},
      ${sqlLiteral(candidateDeploymentTarget)}
    );
  `);
}

function providerAttestation(
  stage,
  label,
  { target = "PREVIEW",
    purpose = target === "PRODUCTION" ? "CUTOVER" : "REHEARSAL",
    liveInventory = liveOriginInventoryFor(target),
    challengeId = randomUUID(),
    challengeRequestFingerprint = fingerprint(`${label}-challenge-request`),
    operationRequestId = randomUUID(),
    ...overrides } = {},
) {
  return {
    attestation_id: randomUUID(),
    attestation_fingerprint: fingerprint(`${label}-signed-payload`),
    signer_key_fingerprint: fingerprint("step11-6-vercel-attester-key-v1"),
    signer_key_version: "STEP11_6_VERCEL_ATTESTER_V1",
    stage,
    purpose,
    challenge_id: challengeId,
    challenge_request_fingerprint: challengeRequestFingerprint,
    operation_request_id: operationRequestId,
    request_fingerprint: fingerprint(`${label}-signed-request-binding`),
    signature_verified: true,
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    vercel_team_id: "team_SandbaggerInvitations",
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    candidate_deployment_target: target,
    routing_rule_id: "step11_6_pg17_writer_quiesce",
    routing_rule_config_version: "revision-1",
    routing_rule_etag: 'W/"revision-1"',
    routing_rule_fingerprint: fingerprint("step11-6-writer-quiesce-rule"),
    routing_rule_pending_draft_change_count: 0,
    live_origin_inventory_count: liveInventory.length,
    live_origin_inventory_fingerprint: fingerprint(
      JSON.stringify(liveInventory),
    ),
    redacted_environment_scope_fingerprint: fingerprint(
      "step11-6-redacted-environment-scope",
    ),
    ...credentialConfinement,
    provider_observed_at: new Date().toISOString(),
    ...overrides,
  };
}

function quiesceOriginRecords(target = "PREVIEW", liveInventory =
  liveOriginInventoryFor(target)) {
  return [
    ...liveInventory.map((record) => ({
      origin: record[2],
      originKind: record[3] === "MAIN_PRODUCTION"
        ? "IMMUTABLE_MAIN_PRODUCTION"
        : record[3] === "CUTOVER_PRODUCTION_CANDIDATE"
        ? "IMMUTABLE_CUTOVER_PRODUCTION_CANDIDATE"
        : "IMMUTABLE_FEATURE_PREVIEW",
      deploymentId: record[0],
      sha: record[1],
      scopeClass: record[3],
      deploymentStatus: record[4],
      sourceProvenance: record[5],
      credentialCapabilities: record[0] === candidateIdentity.deploymentId &&
        record[2] === candidateIdentity.immutableOrigin
        ? [
          "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
          "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
          "PRODUCTION_WORKBOOK_SELECTOR",
        ]
        : record[3] === "MAIN_PRODUCTION"
        ? [
          "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
          "PRODUCTION_WORKBOOK_SELECTOR",
        ]
        : record[3] === "CUTOVER_PRODUCTION_CANDIDATE"
        ? [
          "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
          "PRODUCTION_WORKBOOK_SELECTOR",
        ]
        : [
          "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
          "POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
          "POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR",
        ],
    })),
    ...[
      "https://baggerinv.com",
      "https://www.baggerinv.com",
      "https://bagger-inv.vercel.app",
      candidateIdentity.mainBranchAliasOrigin,
    ].map((origin) => ({
      origin,
      originKind: "FIXED_ALIAS",
      deploymentId: null,
      sha: null,
      scopeClass: null,
      deploymentStatus: null,
      sourceProvenance: null,
      credentialCapabilities: [],
    })),
    {
      origin: candidateIdentity.aliasOrigin,
      originKind: "CANDIDATE_ALIAS",
      deploymentId: candidateIdentity.deploymentId,
      sha: candidateIdentity.commit,
      scopeClass: null,
      deploymentStatus: null,
      sourceProvenance: null,
      credentialCapabilities: [
        "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
        "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
        "PRODUCTION_WORKBOOK_SELECTOR",
      ],
    },
  ].sort((left, right) => compareCodepoint(left.origin, right.origin));
}

function quiesceProbeRecords(
  observedAt = new Date().toISOString(),
  target = "PREVIEW",
  liveInventory = liveOriginInventoryFor(target),
) {
  const edgeRequestSetNonce = randomUUID();
  return quiesceOriginRecords(target, liveInventory).map((origin) => [
    origin.origin,
    origin.originKind,
    origin.deploymentId,
    origin.sha,
    origin.scopeClass,
    origin.deploymentStatus,
    origin.sourceProvenance,
    origin.credentialCapabilities,
    511,
    probeVectors.map((vector) => fingerprint([
      origin.origin,
      vector.probeMethod,
      vector.probePath,
      "QUIESCED_NO_CANONICAL_WRITE",
      edgeRequestSetNonce,
    ].join("\n"))),
    observedAt,
  ]);
}

function quiesceProbeRecordsForProviderInventory(
  inventory,
  observedAt,
  candidate,
  { excludeCanonicalApex = false } = {},
) {
  const edgeRequestSetNonce = randomUUID();
  const origins = [
    ...inventory.map((record) => ({
      origin: record[2],
      originKind: record[3] === "PRODUCTION_TARGET"
        ? "IMMUTABLE_PRODUCTION_TARGET"
        : record[3] === "CUTOVER_PRODUCTION_CANDIDATE"
        ? "IMMUTABLE_CUTOVER_PRODUCTION_CANDIDATE"
        : "IMMUTABLE_PROJECT_PREVIEW",
      deploymentId: record[0],
      sha: record[1],
      scopeClass: record[3],
      deploymentStatus: record[4],
      providerMetadataFingerprint: record[5],
      credentialCapabilities: record[0] === candidate.deploymentId &&
        record[2] === candidate.immutableOrigin
        ? [
          "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
          "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
          "PRODUCTION_WORKBOOK_SELECTOR",
        ]
        : record[3] === "PRODUCTION_TARGET"
        ? [
          "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
          "PRODUCTION_WORKBOOK_SELECTOR",
        ]
        : [
          "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
          "POTENTIAL_DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
          "POTENTIAL_PRODUCTION_WORKBOOK_SELECTOR",
        ],
    })),
    ...[
      ...(excludeCanonicalApex ? [] : ["https://baggerinv.com"]),
      "https://www.baggerinv.com",
      "https://bagger-inv.vercel.app",
      candidate.mainBranchAliasOrigin,
    ].map((origin) => ({
      origin,
      originKind: "FIXED_ALIAS",
      deploymentId: null,
      sha: null,
      scopeClass: null,
      deploymentStatus: null,
      providerMetadataFingerprint: null,
      credentialCapabilities: [],
    })),
    {
      origin: candidate.aliasOrigin,
      originKind: "CANDIDATE_ALIAS",
      deploymentId: candidate.deploymentId,
      sha: candidate.commit,
      scopeClass: null,
      deploymentStatus: null,
      providerMetadataFingerprint: null,
      credentialCapabilities: [
        "LEGACY_GOOGLE_SERVICE_ACCOUNT_V0",
        "PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V1",
        "PRODUCTION_WORKBOOK_SELECTOR",
      ],
    },
  ].sort((left, right) => compareCodepoint(left.origin, right.origin));
  return origins.map((origin) => [
    origin.origin,
    origin.originKind,
    origin.deploymentId,
    origin.sha,
    origin.scopeClass,
    origin.deploymentStatus,
    origin.providerMetadataFingerprint,
    origin.credentialCapabilities,
    2047,
    probeVectorsV3.map((vector) => fingerprint([
      origin.origin,
      vector.probeMethod,
      vector.probePath,
      "QUIESCED_NO_CANONICAL_WRITE",
      edgeRequestSetNonce,
    ].join("\n"))),
    observedAt,
  ]);
}

function quiesceProbeRecordsV3(
  observedAt = new Date().toISOString(),
  candidate = retainedV3CandidateIdentity,
) {
  return quiesceProbeRecordsForProviderInventory(
    originInventoryV3,
    observedAt,
    candidate,
  );
}

function quiesceProbeRecordsV4(
  liveInventory,
  observedAt = new Date().toISOString(),
) {
  return quiesceProbeRecordsForProviderInventory(
    liveInventory,
    observedAt,
    candidateIdentity,
    { excludeCanonicalApex: true },
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value) {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}

function rpcSql(name, input) {
  assert.match(name, /^[a-z][a-z0-9_]+$/);
  return `select public.${name}(${jsonSql(input)})::text;`;
}

class CommandFailure extends Error {
  constructor(command, result) {
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    super(
      [
        `Command failed (${result.status ?? "spawn error"}): ${command}`,
        stdout.trim(),
        stderr.trim(),
      ].filter(Boolean).join("\n"),
    );
    this.name = "CommandFailure";
    this.status = result.status;
    this.stdout = stdout;
    this.stderr = stderr;
    this.cause = result.error;
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new CommandFailure([command, ...args].join(" "), result);
  }
  return result.stdout;
}

function psqlEnvironment(cluster, extras = {}) {
  return {
    ...process.env,
    PGHOST: cluster.socketDirectory,
    PGPORT: String(cluster.port),
    PGUSER: "postgres",
    PGOPTIONS: "-c request.jwt.claim.role=service_role",
    ...extras,
  };
}

function psql(cluster, database, sql, options = {}) {
  return runCommand(
    postgresBinaries.psql,
    ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", database],
    {
      env: psqlEnvironment(cluster),
      input: sql,
      ...options,
    },
  ).trim();
}

function psqlFile(cluster, database, filename) {
  return runCommand(
    postgresBinaries.psql,
    [
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      database,
      "-f",
      filename,
    ],
    { env: psqlEnvironment(cluster) },
  );
}

function parseJsonOutput(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidate = [...lines].reverse().find(
    (line) => line.startsWith("{") || line.startsWith("["),
  );
  assert.ok(candidate, `Expected JSON output, received:\n${output}`);
  return JSON.parse(candidate);
}

function rpc(cluster, database, name, input) {
  return parseJsonOutput(psql(cluster, database, rpcSql(name, input)));
}

function assertCommandFailure(action, expected) {
  assert.throws(
    action,
    (error) => error instanceof CommandFailure && expected.test(error.message),
  );
}

function spawnPsql(cluster, database, sql, { interactive = false } = {}) {
  const argumentsValue = [
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    database,
  ];
  if (!interactive) argumentsValue.push("-c", sql);
  const child = spawn(
    postgresBinaries.psql,
    argumentsValue,
    {
      cwd: repositoryRoot,
      env: psqlEnvironment(cluster),
      stdio: [interactive ? "pipe" : "ignore", "pipe", "pipe"],
    },
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  const waiters = [];
  const notifyWaiters = () => {
    for (const waiter of waiters) {
      if (!waiter.done && stdout.includes(waiter.marker)) {
        waiter.done = true;
        waiter.resolve();
      }
    }
  };
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    notifyWaiters();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => {
      if (status === 0) {
        resolve({ stdout, stderr, status });
        return;
      }
      reject(new CommandFailure("concurrent psql session", {
        status,
        stdout,
        stderr,
      }));
    });
  });
  // Concurrent tests sometimes intentionally terminate a blocked psql process
  // during cleanup. Attach a rejection observer immediately so assertion
  // failures cannot turn a later child exit into an unhandled rejection.
  void done.catch(() => {});
  return {
    child,
    done,
    send(commands) {
      assert.equal(interactive, true, "send() requires an interactive psql session");
      assert.equal(child.stdin.destroyed, false, "interactive psql stdin is closed");
      child.stdin.write(`${commands}\n`);
    },
    snapshot() {
      return { stdout, stderr };
    },
    waitFor(marker, timeoutMilliseconds = 5_000) {
      if (stdout.includes(marker)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const waiter = { marker, resolve, done: false };
        waiters.push(waiter);
        const timeout = setTimeout(() => {
          if (waiter.done) return;
          waiter.done = true;
          reject(new Error(
            `Timed out waiting for ${marker}; stdout=${stdout}; stderr=${stderr}`,
          ));
        }, timeoutMilliseconds);
        const originalResolve = waiter.resolve;
        waiter.resolve = () => {
          clearTimeout(timeout);
          originalResolve();
        };
      });
    },
  };
}

function spawnInteractivePsql(cluster, database) {
  return spawnPsql(cluster, database, undefined, { interactive: true });
}

async function terminatePsqlSessions(...sessions) {
  const presentSessions = sessions.filter(Boolean);
  for (const session of presentSessions) {
    if (session.child.exitCode === null && session.child.signalCode === null) {
      session.child.kill("SIGTERM");
    }
  }
  await Promise.allSettled(presentSessions.map((session) => session.done));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForAdvisoryLocks(
  cluster,
  database,
  { mode, granted, minimum = 1, timeoutMilliseconds = 5_000 },
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    const count = Number(psql(cluster, database, `
      select count(*)
      from pg_catalog.pg_locks
      where locktype = 'advisory'
        and mode = ${sqlLiteral(mode)}
        and granted is ${granted ? "true" : "false"};
    `));
    if (count >= minimum) return count;
    await delay(10);
  }
  throw new Error(
    `Timed out waiting for ${minimum} ${granted ? "granted" : "waiting"} ${mode} advisory locks`,
  );
}

async function createCluster() {
  const clusterRoot = await mkdtemp(path.join(os.tmpdir(), "bagger-pg17-"));
  const dataDirectory = path.join(clusterRoot, "data");
  const socketDirectory = path.join(clusterRoot, "socket");
  const logFile = path.join(clusterRoot, "postgres.log");
  const port = 5432;
  await mkdir(socketDirectory, { mode: 0o700 });
  runCommand(postgresBinaries.initdb, [
    "-D",
    dataDirectory,
    "--username=postgres",
    "--auth=trust",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  runCommand(postgresBinaries.pg_ctl, [
    "-D",
    dataDirectory,
    "-l",
    logFile,
    "-o",
    `-F -k ${socketDirectory} -h '' -p ${port}`,
    "-w",
    "start",
  ]);
  return {
    clusterRoot,
    dataDirectory,
    socketDirectory,
    logFile,
    port,
    started: true,
  };
}

async function destroyCluster(cluster) {
  if (cluster.started) {
    try {
      runCommand(postgresBinaries.pg_ctl, [
        "-D",
        cluster.dataDirectory,
        "-m",
        "fast",
        "-w",
        "stop",
      ]);
    } finally {
      cluster.started = false;
    }
  }
  const expectedParent = path.resolve(os.tmpdir());
  assert.equal(path.dirname(cluster.clusterRoot), expectedParent);
  assert.match(path.basename(cluster.clusterRoot), /^bagger-pg17-/);
  await rm(cluster.clusterRoot, { recursive: true, force: true });
}

async function installProductionMigrations(
  cluster,
  database,
  admissionMigration =
    "202608260038_production_provider_preview_target_inventory_v4.sql",
) {
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  const endIndex = migrationNames.indexOf(admissionMigration);
  assert.notEqual(endIndex, -1, `Missing ${admissionMigration}`);
  for (const migrationName of migrationNames.slice(0, endIndex + 1)) {
    psqlFile(cluster, database, path.join(migrationsDirectory, migrationName));
  }
}

function createDatabase(cluster, database, template) {
  const args = template
    ? ["--template", template, database]
    : [database];
  runCommand(postgresBinaries.createdb, args, {
    env: psqlEnvironment(cluster, { PGOPTIONS: "" }),
  });
}

function installSupabaseCompatibility(cluster, database) {
  psql(cluster, database, `
    do $roles$
    begin
      if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
      ) then
        create role authenticated nologin;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = 'service_role'
      ) then
        create role service_role nologin;
      end if;
    end
    $roles$;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      phone text,
      phone_change text,
      email_confirmed_at timestamptz,
      phone_confirmed_at timestamptz,
      confirmation_sent_at timestamptz,
      raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table auth.identities (
      id uuid primary key,
      user_id uuid not null references auth.users(id),
      provider text not null,
      identity_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create function auth.role()
    returns text
    language sql
    stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        current_user
      )
    $$;
    create function public.rls_auto_enable()
    returns void
    language plpgsql
    as $$ begin end $$;
  `);
}

function installScoringFixture(cluster, database) {
  psql(cluster, database, `
    insert into scoring_authority.tournaments (
      tournament_id, tournament_year, name, source_workbook_id,
      scoring_authority
    ) values (
      '2026', 2026, 'PostgreSQL admission test tournament',
      ${sqlLiteral(scope.source_workbook_id)}, 'GOOGLE'
    );

    insert into scoring_authority.rounds (
      tournament_id, round_number, format, name, status
    ) values ('2026', 1, 'BB', 'Round 1', 'UPCOMING');

    insert into scoring_authority.scoring_snapshots (
      snapshot_id, tournament_id, match_id, snapshot_revision,
      scoring_rules_version, format, course_id, tee, par,
      match_netting_baseline, hole_definitions,
      participant_configuration, team_configuration, canonical_hash
    )
    select
      'snapshot-2026-r1-m1', '2026', '2026-R1-1', 1,
      'postgres-test-v1', 'BB', 'course-1', 'Member', 72,
      'LOW_BALL',
      jsonb_agg(jsonb_build_object(
        'hole_number', hole_number,
        'par', 4,
        'stroke_index', hole_number
      ) order by hole_number),
      '{}'::jsonb, '{}'::jsonb, ${sqlLiteral(fingerprint("snapshot"))}
    from generate_series(1, 18) as hole_number;

    insert into scoring_authority.matches (
      match_id, tournament_id, round_number, format,
      scoring_snapshot_id, status
    ) values (
      '2026-R1-1', '2026', 1, 'BB', 'snapshot-2026-r1-m1', 'LIVE'
    );

    insert into scoring_authority.google_match_checkpoints (
      match_id, last_supabase_match_revision, google_match_revision,
      google_hole_revisions, verified_fingerprint, verified_at
    ) values (
      '2026-R1-1', 0, 0, '{}'::jsonb,
      ${sqlLiteral(fingerprint("google-checkpoint"))}, now()
    );

    insert into scoring_authority.ingress_gates (
      tournament_id, state, authority, active_epoch_id,
      unresolved_client_queues, updated_by
    ) values ('2026', 'PAUSED', 'GOOGLE', null, 0, ${sqlLiteral(actor)});
  `);
}

function state(cluster, database) {
  return parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'activation_state', activation.state,
      'activation_revision', activation.activation_revision,
      'authority_generation_id', activation.authority_generation_id,
      'authority', activation.current_authority,
      'staged_request_fingerprint', activation.staged_request_fingerprint,
      'staged_payload_hash', activation.staged_payload_hash,
      'staged_certification_fingerprint',
        activation.staged_certification_fingerprint,
      'staged_environment_delta_fingerprint_v2',
        activation.staged_environment_delta_fingerprint_v2,
      'read_cutover_phase', activation.read_cutover_phase,
      'scoring_ingress_enabled', activation.scoring_ingress_enabled,
      'expected_source_fingerprint', activation.expected_source_fingerprint,
      'admission_state', gate.admission_state,
      'admission_revision', gate.admission_revision,
      'admission_generation_id', gate.admission_generation_id,
      'admission_deployment_id', gate.admission_deployment_id,
      'execution_gate', gate.state,
      'active_closure_id', gate.active_closure_id,
      'external_fence_evidence_id', gate.external_fence_evidence_id,
      'quiesce_evidence_id', activation.active_vercel_quiesce_evidence_id,
      'provider_fence_id', activation.active_google_writer_provider_fence_id,
      'provider_fence_verification_id',
        activation.active_google_writer_provider_verification_id
    )
    from production_control.cutover_activation_state activation
    cross join scoring_authority.ingress_gates gate
    where activation.scope_key = 'BAGGER_INV_PRODUCTION'
      and gate.tournament_id = '2026';
  `));
}

function optimisticInput(current, label) {
  return {
    ...scope,
    deployment_id: deploymentId,
    deployment_commit: deploymentCommit,
    expected_activation_revision: Number(current.activation_revision),
    expected_authority_generation: current.authority_generation_id,
    expected_admission_generation: current.admission_generation_id,
    expected_admission_revision: Number(current.admission_revision),
    actor_id: actor,
    request_fingerprint: fingerprint(label),
  };
}

function quiesceBeginInput(purpose, label, priorEvidenceId = undefined) {
  const requestFingerprint = fingerprint(`${label}-begin-request`);
  const candidateTarget = purpose === "CUTOVER" ? "PRODUCTION" : "PREVIEW";
  const liveInventory = liveOriginInventoryFor(candidateTarget);
  return {
    ...scope,
    actor_id: actor,
    purpose,
    evidence_request_id: randomUUID(),
    prior_evidence_id: priorEvidenceId,
    request_fingerprint: requestFingerprint,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    candidate_deployment_target: candidateTarget,
    candidate_credential_generation: candidateIdentity.credentialGeneration,
    main_branch_alias_origin: candidateIdentity.mainBranchAliasOrigin,
    candidate_alias_origin: candidateIdentity.aliasOrigin,
    candidate_immutable_origin: candidateIdentity.immutableOrigin,
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    routing_rule_id: "step11_6_pg17_writer_quiesce",
    routing_rule_revision: "revision-1",
    routing_rule_scope: "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
    origin_inventory: originInventory,
    live_origin_inventory: liveInventory,
    first_probe_records: quiesceProbeRecords(
      new Date().toISOString(),
      candidateTarget,
      liveInventory,
    ),
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    owner_principal_fingerprint: fingerprint("production-workbook-owner"),
    owner_override_operationally_frozen: true,
    // Migration 034's historical receipt contract is immutable at 30 minutes.
    // Migration 040-specific helpers below use the certified 2100-second v4
    // contract after the predecessor constraints have been recertified.
    owner_freeze_ttl_seconds: 1800,
    ...credentialConfinement,
  };
}

function providerChallengeIssueInput(input, stage, label, {
  operationRequestId = randomUUID(),
  challengeRequestId = randomUUID(),
} = {}) {
  const purpose = input.purpose || (input.candidate_deployment_target === "PRODUCTION"
    ? "CUTOVER" : "REHEARSAL");
  return {
    ...scope,
    actor_id: actor,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    challenge_request_id: challengeRequestId,
    operation_request_id: operationRequestId,
    evidence_request_id: input.evidence_request_id,
    request_fingerprint: fingerprint(`${label}-challenge-issue`),
    purpose,
    stage,
    candidate_deployment_id: input.candidate_deployment_id,
    candidate_deployment_commit: input.candidate_deployment_commit,
    candidate_deployment_target: input.candidate_deployment_target,
    candidate_alias_origin: candidateIdentity.aliasOrigin,
    candidate_immutable_origin: candidateIdentity.immutableOrigin,
    vercel_project_id: input.vercel_project_id,
    vercel_team_id: "team_SandbaggerInvitations",
    routing_rule_id: input.routing_rule_id,
    routing_rule_config_version: input.routing_rule_revision,
    routing_rule_scope: input.routing_rule_scope,
    routing_rule_hostname_operator: input.routing_rule_hostname_operator,
    routing_rule_canonical_hostname: input.routing_rule_canonical_hostname,
    routing_rule_earlier_active_bypass_rule_count:
      input.routing_rule_earlier_active_bypass_rule_count,
    routing_rule_global_invocation_quiescence_proved:
      input.routing_rule_global_invocation_quiescence_proved,
    routing_rule_candidate_control_host_count:
      input.routing_rule_candidate_control_host_count,
    routing_rule_candidate_control_hosts_fingerprint:
      input.routing_rule_candidate_control_hosts_fingerprint,
    routing_rule_canonical_apex_safe_method_count:
      input.routing_rule_canonical_apex_safe_method_count,
    routing_rule_canonical_apex_safe_methods_fingerprint:
      input.routing_rule_canonical_apex_safe_methods_fingerprint,
    routing_rule_canonical_apex_safe_method_writer_route_count:
      input.routing_rule_canonical_apex_safe_method_writer_route_count,
    routing_rule_canonical_apex_safe_method_writer_routes_fingerprint:
      input.routing_rule_canonical_apex_safe_method_writer_routes_fingerprint,
  };
}

function providerChallengeAbandonInput(issueInput, challenge, label, {
  abandonRequestId = randomUUID(),
  requestFingerprint = fingerprint(`${label}-challenge-abandon`),
  ...overrides
} = {}) {
  return {
    ...scope,
    actor_id: issueInput.actor_id,
    authenticated_actor_fingerprint:
      issueInput.authenticated_actor_fingerprint,
    abandon_request_id: abandonRequestId,
    request_fingerprint: requestFingerprint,
    challenge_id: challenge.challenge_id,
    challenge_request_id: issueInput.challenge_request_id,
    operation_request_id: issueInput.operation_request_id,
    evidence_request_id: issueInput.evidence_request_id,
    stage: "BEGIN",
    purpose: issueInput.purpose,
    vercel_project_id: issueInput.vercel_project_id,
    vercel_team_id: issueInput.vercel_team_id,
    candidate_deployment_id: issueInput.candidate_deployment_id,
    candidate_deployment_commit: issueInput.candidate_deployment_commit,
    candidate_deployment_target: issueInput.candidate_deployment_target,
    candidate_alias_origin: issueInput.candidate_alias_origin,
    candidate_immutable_origin: issueInput.candidate_immutable_origin,
    routing_rule_id: issueInput.routing_rule_id,
    routing_rule_config_version: issueInput.routing_rule_config_version,
    routing_rule_scope: issueInput.routing_rule_scope,
    abandonment_reason: "EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED",
    ...overrides,
  };
}

function providerChallengeAbandonInspectionInput(issueInput, challenge) {
  const {
    abandon_request_id: _abandonRequestId,
    request_fingerprint: _requestFingerprint,
    abandonment_reason: _abandonmentReason,
    ...inspectionInput
  } = providerChallengeAbandonInput(
    issueInput,
    challenge,
    "inspection-only",
  );
  return inspectionInput;
}

function providerChallengeConsumeInput(input, issueInput, challenge, label) {
  const attestation = providerAttestation(
    "BEGIN",
    `${label}-attestation`,
    {
      purpose: issueInput.purpose,
      target: issueInput.candidate_deployment_target,
      liveInventory: input.live_origin_inventory,
      challengeId: challenge.challenge_id,
      challengeRequestFingerprint: challenge.challenge_request_fingerprint,
      operationRequestId: issueInput.operation_request_id,
      candidate_deployment_id: issueInput.candidate_deployment_id,
      candidate_deployment_commit: issueInput.candidate_deployment_commit,
      candidate_deployment_target: issueInput.candidate_deployment_target,
      routing_rule_id: issueInput.routing_rule_id,
      routing_rule_config_version: issueInput.routing_rule_config_version,
    },
  );
  return {
    ...scope,
    actor_id: issueInput.actor_id,
    authenticated_actor_fingerprint:
      issueInput.authenticated_actor_fingerprint,
    consume_request_id: randomUUID(),
    request_fingerprint: fingerprint(`${label}-challenge-consume`),
    challenge_id: challenge.challenge_id,
    challenge_request_id: issueInput.challenge_request_id,
    operation_request_id: issueInput.operation_request_id,
    evidence_request_id: issueInput.evidence_request_id,
    purpose: issueInput.purpose,
    stage: "BEGIN",
    candidate_deployment_id: issueInput.candidate_deployment_id,
    candidate_deployment_commit: issueInput.candidate_deployment_commit,
    candidate_deployment_target: issueInput.candidate_deployment_target,
    origin_inventory: input.origin_inventory,
    live_origin_inventory: input.live_origin_inventory,
    provider_attestation: attestation,
  };
}

function expireProviderChallenge(cluster, database, challengeId) {
  psql(cluster, database, `
    update production_control.vercel_provider_attestation_challenges
    set issued_at = pg_catalog.now() - interval '180 seconds',
        expires_at = pg_catalog.now() - interval '60 seconds'
    where challenge_id = ${sqlLiteral(challengeId)}::uuid;
  `);
}

function reserveProviderAttestation(
  cluster,
  database,
  input,
  stage,
  label,
  {
    providerOverrides = {},
    returnDetails = false,
    assertRoutingAudit = false,
  } = {},
) {
  const issueInput = providerChallengeIssueInput(input, stage, label);
  const purpose = issueInput.purpose;
  const operationRequestId = issueInput.operation_request_id;
  const challengeRequestId = issueInput.challenge_request_id;
  const challenge = rpc(
    cluster,
    database,
    "issue_production_vercel_provider_attestation_challenge",
    issueInput,
  );
  if (issueInput.routing_rule_hostname_operator !== undefined) {
    assert.equal(
      challenge.routing_rule_hostname_operator,
      "DOES_NOT_EQUAL",
    );
    assert.equal(
      challenge.routing_rule_canonical_hostname,
      "baggerinv.com",
    );
    assert.equal(
      Number(challenge.routing_rule_earlier_active_bypass_rule_count),
      0,
    );
  }
  const attestation = providerAttestation(stage, `${label}-attestation`, {
    purpose,
    target: input.candidate_deployment_target,
    liveInventory: input.live_origin_inventory,
    challengeId: challenge.challenge_id,
    challengeRequestFingerprint: challenge.challenge_request_fingerprint,
    operationRequestId,
    ...providerOverrides,
  });
  const consumeInput = {
    ...scope,
    actor_id: actor,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    consume_request_id: randomUUID(),
    request_fingerprint: fingerprint(`${label}-challenge-consume`),
    challenge_id: challenge.challenge_id,
    challenge_request_id: challengeRequestId,
    operation_request_id: operationRequestId,
    evidence_request_id: input.evidence_request_id,
    purpose,
    stage,
    candidate_deployment_id: input.candidate_deployment_id,
    candidate_deployment_commit: input.candidate_deployment_commit,
    candidate_deployment_target: input.candidate_deployment_target,
    origin_inventory: input.origin_inventory || originInventory,
    live_origin_inventory: input.live_origin_inventory,
    provider_attestation: attestation,
  };
  if (assertRoutingAudit) {
    assertCommandFailure(
      () => rpc(
        cluster,
        database,
        "consume_production_vercel_provider_attestation_challenge",
        {
          ...consumeInput,
          consume_request_id: randomUUID(),
          request_fingerprint: fingerprint(label + "-routing-audit-drift"),
          provider_attestation: {
            ...attestation,
            routing_rule_earlier_active_bypass_rule_count: 1,
          },
        },
      ),
      /PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_MISMATCH/,
    );
  }
  const reserved = rpc(
    cluster,
    database,
    "consume_production_vercel_provider_attestation_challenge",
    consumeInput,
  );
  assert.equal(reserved.status, "RESERVED");
  if (attestation.routing_rule_hostname_operator !== undefined) {
    assert.equal(
      reserved.routing_rule_hostname_operator,
      "DOES_NOT_EQUAL",
    );
    assert.equal(
      reserved.routing_rule_canonical_hostname,
      "baggerinv.com",
    );
    assert.equal(
      Number(reserved.routing_rule_earlier_active_bypass_rule_count),
      0,
    );
  }
  const binding = {
    attestation_id: reserved.attestation_id,
    attestation_fingerprint: reserved.attestation_fingerprint,
  };
  return returnDetails
    ? { binding, reserved, consumeInput, challenge }
    : binding;
}

function certifyQuiesce(
  cluster,
  database,
  purpose,
  label,
  priorEvidenceId = undefined,
) {
  const beginInput = quiesceBeginInput(
    purpose,
    label,
    priorEvidenceId,
  );
  beginInput.provider_attestation = reserveProviderAttestation(
    cluster, database, beginInput, "BEGIN", `${label}-begin`,
  );
  const draining = rpc(
    cluster,
    database,
    "begin_production_vercel_writer_quiesce_evidence",
    beginInput,
  );
  assert.equal(draining.status, "DRAINING");
  assert.equal(Number(draining.probe_vector_count), 9);
  assert.equal(
    Number(draining.probe_origin_count),
    beginInput.live_origin_inventory.length + 5,
  );
  assert.equal(
    Number(draining.probe_record_count),
    (beginInput.live_origin_inventory.length + 5) * 9,
  );
  psql(cluster, database, `
    update production_control.vercel_writer_quiesce_evidence
    set owner_acknowledged_at = now() - interval '301 seconds',
        drain_started_at = now() - interval '301 seconds',
        owner_freeze_expires_at = now() + interval '20 minutes'
    where evidence_id = ${sqlLiteral(draining.evidence_id)}::uuid;
  `);
  const finalizeRequestFingerprint = fingerprint(
    `${label}-finalize-request`,
  );
  const finalizeInput = {
    ...scope,
    actor_id: actor,
    purpose,
    evidence_id: draining.evidence_id,
    evidence_request_id: beginInput.evidence_request_id,
    request_fingerprint: finalizeRequestFingerprint,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    candidate_deployment_target: beginInput.candidate_deployment_target,
    vercel_project_id: beginInput.vercel_project_id,
    routing_rule_id: beginInput.routing_rule_id,
    routing_rule_revision: beginInput.routing_rule_revision,
    routing_rule_scope: beginInput.routing_rule_scope,
    origin_inventory: beginInput.origin_inventory,
    live_origin_inventory: beginInput.live_origin_inventory,
    second_probe_records: quiesceProbeRecords(
      new Date().toISOString(),
      beginInput.candidate_deployment_target,
      beginInput.live_origin_inventory,
    ),
    ...credentialConfinement,
  };
  finalizeInput.provider_attestation = reserveProviderAttestation(
    cluster, database, finalizeInput, "FINALIZE", `${label}-finalize`,
  );
  const verified = rpc(
    cluster,
    database,
    "finalize_production_vercel_writer_quiesce_evidence",
    finalizeInput,
  );
  assert.equal(verified.status, "VERIFIED");
  assert.notEqual(
    verified.begin_provider_attestation_id,
    verified.finalize_provider_attestation_id,
  );
  assert.notEqual(
    verified.begin_provider_attestation_fingerprint,
    verified.finalize_provider_attestation_fingerprint,
  );
  assert.equal(
    Number(verified.probe_origin_count),
    beginInput.live_origin_inventory.length + 5,
  );
  assert.equal(
    Number(verified.probe_record_count),
    (beginInput.live_origin_inventory.length + 5) * 9,
  );
  return verified;
}

function wafSemanticConfiguration(label, orderedCustomRules = []) {
  return Object.freeze({
    schemaVersion: "bagger-vercel-waf-semantic-configuration-v1",
    securityConfigurationKeys: ["crs", "firewallEnabled", "ips", "rules"],
    securityConfigurationKeysFingerprint:
      fingerprint(`${label}-security-configuration-keys`),
    firewallEnabled: true,
    ips: [],
    crs: { enabled: true },
    orderedCustomRules,
  });
}

function criticalWafEvidence(context, stage, transitionRequestId, label) {
  const observedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(observedAt) + 2_100_000,
  ).toISOString();
  const baseline = stage === "BASELINE_CAPTURE" ||
    stage === "BASELINE_RESTORED";
  const reattest = stage === "CRITICAL_REATTEST";
  const critical = stage === "CRITICAL_ACTIVE" || reattest;
  const semanticConfiguration = baseline
    ? context.baselineSemanticConfiguration
    : context.criticalSemanticConfiguration;
  const semanticConfigurationFingerprint = baseline
    ? context.baselineSemanticFingerprint
    : context.criticalSemanticFingerprint;
  const evidence = {
    schemaVersion: "bagger-vercel-waf-provider-evidence-v1",
    evidenceId: randomUUID(),
    evidenceRequestId: randomUUID(),
    wafEpochId: context.epochId,
    transitionRequestId,
    requestFingerprint: fingerprint(`${label}-signed-request`),
    stage,
    purpose: context.purpose,
    transitionMode: context.transitionMode,
    vercelProjectId: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    vercelTeamId: "team_SandbaggerInvitations",
    candidateAliasOrigin: candidateIdentity.aliasOrigin,
    candidateImmutableOrigin: candidateIdentity.immutableOrigin,
    candidateDeploymentId: candidateIdentity.deploymentId,
    candidateCommitSha: candidateIdentity.commit,
    candidateDeploymentTarget: "PREVIEW",
    runOwnedRuleName: context.runOwnedRuleName,
    runOwnedRuleNonce: context.runOwnedRuleNonce,
    runOwnedRuleFingerprint: context.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      context.runOwnedInsertDocumentFingerprint,
    providerAssignedRuleId: critical ? context.providerAssignedRuleId : null,
    baselineEvidenceId: stage === "BASELINE_CAPTURE"
      ? null : context.baselineEvidenceId,
    criticalEvidenceId: reattest || stage === "BASELINE_RESTORED"
      ? context.criticalEvidenceId : null,
    baselineConfigurationVersion: stage === "BASELINE_CAPTURE"
      ? null : context.baselineConfigurationVersion,
    baselineSourceVersionReadFingerprint: stage === "BASELINE_CAPTURE"
      ? null : context.baselineSourceVersionReadFingerprint,
    configurationMode: baseline ? "BASELINE" : "CRITICAL_WINDOW",
    configurationVersion: baseline
      ? context.baselineConfigurationVersion
      : context.criticalConfigurationVersion,
    configurationEtag: null,
    providerConfigurationId: context.providerConfigurationId,
    providerOwnerId: context.providerOwnerId,
    configurationIdentityFingerprint: baseline
      ? context.baselineConfigurationIdentityFingerprint
      : context.criticalConfigurationIdentityFingerprint,
    semanticConfiguration,
    semanticConfigurationFingerprint,
    orderedCustomRulesFingerprint: baseline
      ? context.baselineOrderedCustomRulesFingerprint
      : context.criticalOrderedCustomRulesFingerprint,
    baselineSemanticFingerprint: context.baselineSemanticFingerprint,
    criticalSemanticFingerprint: stage === "BASELINE_CAPTURE"
      ? null : context.criticalSemanticFingerprint,
    customRuleCount: baseline ? 0 : 1,
    runOwnedProviderRuleDocumentFingerprint: critical
      ? context.runOwnedProviderRuleDocumentFingerprint : null,
    runOwnedRulePrecedence: critical ? 0 : null,
    criticalWindowContractFingerprint: critical
      ? context.criticalWindowContractFingerprint : null,
    pendingDraftChangeCount: 0,
    providerObservedAt: observedAt,
    attestedAt: observedAt,
    expiresAt,
    sourceVersionReadFingerprint:
      context.baselineSourceVersionReadFingerprint,
    evidenceFingerprint: fingerprint(`${label}-signed-evidence`),
    signerKeyFingerprint: fingerprint("step11-6-vercel-attester-key-v1"),
    signerKeyVersion: "STEP11_6_VERCEL_ATTESTER_V1",
    signatureVerified: true,
  };
  assert.equal(Object.keys(evidence).length, 49);
  return Object.freeze(evidence);
}

function criticalWafDispatchResult(context, dispatch, label) {
  const observedAt = new Date().toISOString();
  const evidence = {
    schemaVersion: "bagger-vercel-waf-rule-insert-dispatch-result-v3",
    dispatchResultId: randomUUID(),
    dispatchId: dispatch.dispatch_id,
    dispatchRequestId: dispatch.dispatch_request_id,
    dispatchStep: dispatch.dispatch_step,
    wafEpochId: context.epochId,
    transitionRequestId: dispatch.transition_request_id,
    requestFingerprint: fingerprint(`${label}-signed-request`),
    purpose: context.purpose,
    transitionMode: context.transitionMode,
    projectId: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    teamId: "team_SandbaggerInvitations",
    candidateAliasOrigin: candidateIdentity.aliasOrigin,
    candidateImmutableOrigin: candidateIdentity.immutableOrigin,
    candidateDeploymentId: candidateIdentity.deploymentId,
    candidateCommitSha: candidateIdentity.commit,
    candidateDeploymentTarget: "PREVIEW",
    baselineEvidenceId: context.baselineEvidenceId,
    baselineConfigurationVersion: context.baselineConfigurationVersion,
    baselineConfigurationEtag: null,
    baselineConfigurationIdentityFingerprint:
      context.baselineConfigurationIdentityFingerprint,
    baselineSemanticFingerprint: context.baselineSemanticFingerprint,
    baselineOrderedCustomRulesFingerprint:
      context.baselineOrderedCustomRulesFingerprint,
    baselineSourceVersionReadFingerprint:
      context.baselineSourceVersionReadFingerprint,
    providerIntentFingerprint: dispatch.provider_intent_fingerprint,
    runOwnedRuleName: context.runOwnedRuleName,
    runOwnedRuleNonce: context.runOwnedRuleNonce,
    runOwnedRuleFingerprint: context.runOwnedRuleFingerprint,
    runOwnedInsertDocumentFingerprint:
      context.runOwnedInsertDocumentFingerprint,
    outcomeStatus: "TARGET_CONFIRMED",
    providerResponseObserved: true,
    providerResponseStatus: null,
    providerResponseFingerprint: fingerprint(`${label}-provider-response`),
    providerReadbackFingerprint: fingerprint(`${label}-provider-readback`),
    activeSemanticConfiguration: context.baselineSemanticConfiguration,
    activeSemanticConfigurationFingerprint: context.baselineSemanticFingerprint,
    activeCustomRuleCount: 0,
    activePendingDraftPresent: false,
    draftSemanticConfiguration: context.criticalSemanticConfiguration,
    draftSemanticConfigurationFingerprint: context.criticalSemanticFingerprint,
    draftOrderedCustomRulesFingerprint:
      context.criticalOrderedCustomRulesFingerprint,
    draftConfigurationVersion: "DRAFT",
    draftConfigurationIdentityFingerprint:
      context.draftConfigurationIdentityFingerprint,
    draftCustomRuleCount: 1,
    pendingDraftChangeCount: 1,
    providerAssignedRuleId: context.providerAssignedRuleId,
    runOwnedProviderRuleDocumentFingerprint:
      context.runOwnedProviderRuleDocumentFingerprint,
    runOwnedRulePrecedence: 0,
    criticalWindowContractFingerprint:
      context.criticalWindowContractFingerprint,
    providerObservedAt: observedAt,
    attestedAt: observedAt,
    expiresAt: new Date(Date.parse(observedAt) + 2_100_000).toISOString(),
    evidenceFingerprint: fingerprint(`${label}-signed-evidence`),
    signerKeyFingerprint: fingerprint("step11-6-vercel-attester-key-v1"),
    signerKeyVersion: "STEP11_6_VERCEL_ATTESTER_V1",
    signatureVerified: true,
  };
  assert.equal(Object.keys(evidence).length, 56);
  return Object.freeze(evidence);
}

function criticalWafDispatchInput(context, step, label, extras = {}) {
  return {
    ...scope,
    actor_id: actor,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    operation: "BEGIN_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH",
    epoch_id: context.epochId,
    dispatch_request_id: randomUUID(),
    transition_request_id: randomUUID(),
    dispatch_step: step,
    request_fingerprint: fingerprint(`${label}-dispatch-request`),
    provider_intent_fingerprint: fingerprint(`${label}-provider-intent`),
    ...extras,
  };
}

function markCriticalWafDispatch(cluster, database, dispatch) {
  return rpc(
    cluster,
    database,
    "mark_production_vercel_writer_critical_waf_dispatch_started",
    {
      operation:
        "MARK_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_STARTED",
      dispatch_id: dispatch.dispatch_id,
      dispatch_request_id: dispatch.dispatch_request_id,
      transition_request_id: dispatch.transition_request_id,
      request_fingerprint: dispatch.request_fingerprint,
    },
  );
}

function activateCriticalWafEpochV4(
  cluster,
  database,
  label,
  { purpose = "CUTOVER", transitionMode = purpose } = {},
) {
  const runOwnedRuleNonce = randomUUID();
  const epochId = randomUUID();
  const context = {
    epochId,
    purpose,
    transitionMode,
    runOwnedRuleNonce,
    runOwnedRuleName: `bagger-critical-window-${runOwnedRuleNonce}`,
    runOwnedRuleFingerprint: fingerprint(`${label}-run-owned-rule`),
    runOwnedInsertDocumentFingerprint:
      fingerprint(`${label}-run-owned-insert-document`),
    providerAssignedRuleId: `rule_${fingerprint(label).slice(0, 16)}`,
    runOwnedProviderRuleDocumentFingerprint:
      fingerprint(`${label}-provider-rule-document`),
    criticalWindowContractFingerprint:
      fingerprint(`${label}-critical-window-contract`),
    baselineConfigurationVersion: "10",
    criticalConfigurationVersion: "11",
    providerConfigurationId: "config_bagger_production",
    providerOwnerId: "team_SandbaggerInvitations",
    baselineConfigurationIdentityFingerprint:
      fingerprint(`${label}-baseline-identity`),
    criticalConfigurationIdentityFingerprint:
      fingerprint(`${label}-critical-identity`),
    draftConfigurationIdentityFingerprint:
      fingerprint(`${label}-draft-identity`),
    baselineSourceVersionReadFingerprint:
      fingerprint(`${label}-baseline-source-version-read`),
    baselineSemanticFingerprint: fingerprint(`${label}-baseline-semantic`),
    criticalSemanticFingerprint: fingerprint(`${label}-critical-semantic`),
    baselineOrderedCustomRulesFingerprint:
      fingerprint(`${label}-baseline-ordered-rules`),
    criticalOrderedCustomRulesFingerprint:
      fingerprint(`${label}-critical-ordered-rules`),
  };
  context.baselineSemanticConfiguration = wafSemanticConfiguration(
    `${label}-baseline`,
  );
  context.criticalSemanticConfiguration = wafSemanticConfiguration(
    `${label}-critical`,
    [{ id: context.providerAssignedRuleId, name: context.runOwnedRuleName }],
  );
  const baselineTransitionRequestId = randomUUID();
  const baselineEvidence = criticalWafEvidence(
    context,
    "BASELINE_CAPTURE",
    baselineTransitionRequestId,
    `${label}-baseline`,
  );
  context.baselineEvidenceId = baselineEvidence.evidenceId;
  const epoch = rpc(
    cluster,
    database,
    "begin_production_vercel_writer_critical_waf_epoch",
    {
      ...scope,
      actor_id: actor,
      authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
      operation: "BEGIN_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_EPOCH",
      epoch_id: epochId,
      epoch_request_id: randomUUID(),
      baseline_observation_request_id: randomUUID(),
      purpose,
      transition_mode: transitionMode,
      request_fingerprint: fingerprint(`${label}-epoch-begin`),
      candidate_deployment_id: candidateIdentity.deploymentId,
      candidate_deployment_commit: candidateIdentity.commit,
      candidate_deployment_target: "PREVIEW",
      candidate_alias_origin: candidateIdentity.aliasOrigin,
      candidate_immutable_origin: candidateIdentity.immutableOrigin,
      candidate_control_hosts_fingerprint:
        providerInventoryBindingV4.routing_rule_candidate_control_hosts_fingerprint,
      baseline_waf_evidence: baselineEvidence,
    },
  );
  assert.equal(epoch.status, "ACTIVATION_PENDING");

  const insertInput = criticalWafDispatchInput(
    context,
    "CRITICAL_RULE_INSERT",
    `${label}-rule-insert`,
  );
  const insertDispatch = rpc(
    cluster,
    database,
    "begin_production_vercel_writer_critical_waf_dispatch",
    insertInput,
  );
  markCriticalWafDispatch(cluster, database, insertDispatch);
  const insertResult = rpc(
    cluster,
    database,
    "record_production_vercel_writer_critical_waf_dispatch_result",
    {
      operation: "RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_RESULT",
      dispatch_id: insertDispatch.dispatch_id,
      request_fingerprint: fingerprint(`${label}-rule-insert-result`),
      verified_dispatch_result: criticalWafDispatchResult(
        context,
        insertDispatch,
        `${label}-rule-insert-result`,
      ),
    },
  );
  assert.equal(insertResult.outcome_status, "TARGET_CONFIRMED");

  const activateInput = criticalWafDispatchInput(
    context,
    "CRITICAL_DRAFT_ACTIVATE",
    `${label}-draft-activate`,
  );
  const activateDispatch = rpc(
    cluster,
    database,
    "begin_production_vercel_writer_critical_waf_dispatch",
    activateInput,
  );
  markCriticalWafDispatch(cluster, database, activateDispatch);
  const criticalEvidence = criticalWafEvidence(
    context,
    "CRITICAL_ACTIVE",
    activateDispatch.transition_request_id,
    `${label}-critical-active`,
  );
  context.criticalEvidenceId = criticalEvidence.evidenceId;
  const activated = rpc(
    cluster,
    database,
    "record_production_vercel_writer_critical_waf_dispatch_result",
    {
      operation: "RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_RESULT",
      dispatch_id: activateDispatch.dispatch_id,
      observation_request_id: randomUUID(),
      request_fingerprint: fingerprint(`${label}-draft-activate-result`),
      verified_waf_evidence: criticalEvidence,
    },
  );
  assert.equal(activated.status, "ACTIVE_UNBOUND");
  context.criticalActiveObservationId = activated.provider_result_observation_id;
  return context;
}

function reattestCriticalWafEpochV4(cluster, database, context, label) {
  const transitionRequestId = randomUUID();
  const evidence = criticalWafEvidence(
    context,
    "CRITICAL_REATTEST",
    transitionRequestId,
    label,
  );
  const reattested = rpc(
    cluster,
    database,
    "record_production_vercel_writer_critical_waf_reattestation",
    {
      operation:
        "RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_REATTESTATION",
      epoch_id: context.epochId,
      observation_request_id: randomUUID(),
      request_fingerprint: fingerprint(`${label}-record`),
      verified_waf_evidence: evidence,
    },
  );
  assert.equal(reattested.status, "FENCE_BOUND");
  return {
    ...context,
    latestCriticalReattestObservationId:
      reattested.critical_reattest_observation_id,
  };
}

function restoreCriticalWafBaselineV4(
  cluster,
  database,
  context,
  fence,
  label,
) {
  const restoreRequestId = randomUUID();
  const restoreRequestFingerprint = fingerprint(`${label}-restore-request`);
  const restoreDispatchInput = criticalWafDispatchInput(
    context,
    "BASELINE_VERSION_ACTIVATE",
    `${label}-baseline-activate`,
    {
      restore_request_id: restoreRequestId,
      restore_request_fingerprint: restoreRequestFingerprint,
    },
  );
  const restoreDispatch = rpc(
    cluster,
    database,
    "begin_production_vercel_writer_critical_waf_dispatch",
    restoreDispatchInput,
  );
  assert.equal(restoreDispatch.status, "RESERVED");
  markCriticalWafDispatch(cluster, database, restoreDispatch);
  const restoredEvidence = criticalWafEvidence(
    context,
    "BASELINE_RESTORED",
    restoreDispatch.transition_request_id,
    `${label}-baseline-restored`,
  );
  const restoredEpoch = rpc(
    cluster,
    database,
    "record_production_vercel_writer_critical_waf_dispatch_result",
    {
      operation:
        "RECORD_PRODUCTION_VERCEL_WRITER_CRITICAL_WAF_DISPATCH_RESULT",
      dispatch_id: restoreDispatch.dispatch_id,
      observation_request_id: randomUUID(),
      request_fingerprint: fingerprint(`${label}-baseline-result`),
      verified_waf_evidence: restoredEvidence,
    },
  );
  assert.equal(restoredEpoch.status, "BASELINE_RESTORED");
  assert.equal(restoredEpoch.baseline_restored, true);
  const finalized = rpc(
    cluster,
    database,
    "finalize_production_google_writer_fence_waf_restore",
    {
      ...scope,
      actor_id: actor,
      authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
      operation:
        "FINALIZE_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_WAF_BASELINE_RESTORE",
      fence_id: fence.fence_id,
      critical_waf_epoch_id: context.epochId,
      baseline_restored_observation_id:
        restoredEpoch.provider_result_observation_id,
      request_fingerprint: fingerprint(`${label}-finalize`),
    },
  );
  assert.equal(finalized.status, "REHEARSAL_RESTORED");
  assert.equal(finalized.baseline_restored, true);
  assert.equal(finalized.critical_window_active, false);
  return { restoreDispatch, restoredEvidence, restoredEpoch, finalized };
}

function certifyQuiesceV4(
  cluster,
  database,
  label,
  {
    purpose = "CUTOVER",
    criticalWaf = undefined,
    criticalWafQuiesceStage = "INSTALL",
  } = {},
) {
  const candidateTarget = "PREVIEW";
  const waf = criticalWaf ?? activateCriticalWafEpochV4(
    cluster,
    database,
    `${label}-critical-waf`,
    { purpose, transitionMode: purpose },
  );
  const liveInventory = liveOriginInventoryV4ForCutover(candidateTarget);
  const providerBinding = providerInventoryBindingV4ForLive(liveInventory);
  const providerAliasBinding = providerAliasBindingForPurpose(purpose);
  const beginInput = {
    ...scope,
    actor_id: actor,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    purpose,
    evidence_request_id: randomUUID(),
    request_fingerprint: fingerprint(label + "-begin-request"),
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    candidate_deployment_target: candidateTarget,
    candidate_credential_generation: candidateIdentity.credentialGeneration,
    main_branch_alias_origin: candidateIdentity.mainBranchAliasOrigin,
    candidate_alias_origin: candidateIdentity.aliasOrigin,
    candidate_immutable_origin: candidateIdentity.immutableOrigin,
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    routing_rule_id: "step11_6_pg17_writer_quiesce_v4",
    routing_rule_revision: "revision-v4",
    routing_rule_scope: "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
    origin_inventory: originInventoryV4,
    live_origin_inventory: liveInventory,
    first_probe_records: quiesceProbeRecordsV4(liveInventory),
    owner_principal_fingerprint: fingerprint("production-workbook-owner"),
    owner_override_operationally_frozen: true,
    owner_freeze_confirmation: purpose === "CUTOVER"
      ? "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS PRODUCTION CUTOVER"
      : "I CONFIRM GOOGLE OWNER WRITES ARE FROZEN FOR THIS REHEARSAL",
    owner_freeze_ttl_seconds: 2100,
    critical_waf_epoch_id: waf.epochId,
    critical_waf_observation_id: criticalWafQuiesceStage === "INSTALL"
      ? waf.criticalActiveObservationId
      : waf.latestCriticalReattestObservationId,
    critical_waf_quiesce_stage: criticalWafQuiesceStage,
    ...providerBinding,
    ...credentialConfinementV4,
  };
  assertCommandFailure(
    () => rpc(
      cluster,
      database,
      "issue_production_vercel_provider_attestation_challenge",
      {
        ...providerChallengeIssueInput(
          beginInput,
          "BEGIN",
          label + "-routing-audit-drift",
        ),
        routing_rule_hostname_operator: "EQUALS",
      },
    ),
    /PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_MISMATCH/,
  );
  beginInput.provider_attestation = reserveProviderAttestation(
    cluster,
    database,
    beginInput,
    "BEGIN",
    label + "-begin",
    { providerOverrides: {
      ...providerBinding,
      ...credentialConfinementV4,
      ...providerAliasBinding,
      routing_rule_id: beginInput.routing_rule_id,
      routing_rule_config_version: beginInput.routing_rule_revision,
    }, assertRoutingAudit: true },
  );
  assertCommandFailure(
    () => rpc(
      cluster,
      database,
      "begin_production_vercel_writer_quiesce_evidence",
      {
        ...beginInput,
        request_fingerprint: fingerprint(label + "-begin-routing-drift"),
        routing_rule_canonical_hostname: "www.baggerinv.com",
      },
    ),
    /PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_MISMATCH/,
  );
  const draining = rpc(
    cluster,
    database,
    "begin_production_vercel_writer_quiesce_evidence",
    beginInput,
  );
  assert.equal(draining.status, "DRAINING");
  assert.equal(Number(draining.probe_vector_count), 11);
  assert.equal(Number(draining.probe_origin_count), liveInventory.length + 4);
  assert.equal(Number(draining.probe_record_count),
    (liveInventory.length + 4) * 11);
  assert.equal(draining.routing_rule_hostname_operator, "DOES_NOT_EQUAL");
  assert.equal(draining.routing_rule_canonical_hostname, "baggerinv.com");
  assert.equal(
    Number(draining.routing_rule_earlier_active_bypass_rule_count),
    0,
  );
  backdateQuiesceDrain(cluster, database, draining.evidence_id, 2100);

  const finalizeInput = {
    ...scope,
    actor_id: actor,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    purpose,
    evidence_id: draining.evidence_id,
    evidence_request_id: beginInput.evidence_request_id,
    request_fingerprint: fingerprint(label + "-finalize-request"),
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    candidate_deployment_target: candidateTarget,
    candidate_credential_generation: candidateIdentity.credentialGeneration,
    main_branch_alias_origin: candidateIdentity.mainBranchAliasOrigin,
    candidate_alias_origin: candidateIdentity.aliasOrigin,
    candidate_immutable_origin: candidateIdentity.immutableOrigin,
    vercel_project_id: beginInput.vercel_project_id,
    routing_rule_id: beginInput.routing_rule_id,
    routing_rule_revision: beginInput.routing_rule_revision,
    routing_rule_scope: beginInput.routing_rule_scope,
    origin_inventory: originInventoryV4,
    live_origin_inventory: liveInventory,
    second_probe_records: quiesceProbeRecordsV4(liveInventory),
    ...providerBinding,
    ...credentialConfinementV4,
  };
  finalizeInput.provider_attestation = reserveProviderAttestation(
    cluster,
    database,
    finalizeInput,
    "FINALIZE",
    label + "-finalize",
    { providerOverrides: {
      ...providerBinding,
      ...credentialConfinementV4,
      ...providerAliasBinding,
      routing_rule_id: finalizeInput.routing_rule_id,
      routing_rule_config_version: finalizeInput.routing_rule_revision,
    } },
  );
  assertCommandFailure(
    () => rpc(
      cluster,
      database,
      "finalize_production_vercel_writer_quiesce_evidence",
      {
        ...finalizeInput,
        request_fingerprint: fingerprint(label + "-finalize-routing-drift"),
        routing_rule_earlier_active_bypass_rule_count: 2,
      },
    ),
    /PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_MISMATCH/,
  );
  const verified = rpc(
    cluster,
    database,
    "finalize_production_vercel_writer_quiesce_evidence",
    finalizeInput,
  );
  assert.equal(verified.status, "VERIFIED");
  assert.equal(Number(verified.probe_vector_count), 11);
  assert.equal(Number(verified.probe_origin_count), liveInventory.length + 4);
  assert.equal(Number(verified.probe_record_count),
    (liveInventory.length + 4) * 11);
  assert.equal(verified.routing_rule_hostname_operator, "DOES_NOT_EQUAL");
  assert.equal(verified.routing_rule_canonical_hostname, "baggerinv.com");
  assert.equal(
    Number(verified.routing_rule_earlier_active_bypass_rule_count),
    0,
  );
  assert.equal(psql(cluster, database, `
    select pg_catalog.concat_ws(
      '|',
      pg_catalog.count(*),
      pg_catalog.count(*) filter (where
        value.routing_rule_hostname_operator = 'DOES_NOT_EQUAL'
        and value.routing_rule_canonical_hostname = 'baggerinv.com'
        and value.routing_rule_earlier_active_bypass_rule_count = 0
      )
    )
    from production_control.vercel_routing_rule_audit_bindings value
    where value.quiesce_evidence_id =
        ${sqlLiteral(draining.evidence_id)}::uuid
      or value.attestation_id in (
        select attestation.attestation_id
        from production_control.vercel_provider_attestations attestation
        where attestation.evidence_id =
          ${sqlLiteral(draining.evidence_id)}::uuid
      )
      or value.challenge_id in (
        select challenge.challenge_id
        from production_control.vercel_provider_attestation_challenges challenge
        where challenge.evidence_request_id =
          ${sqlLiteral(beginInput.evidence_request_id)}::uuid
      );
  `).trim(), "5|5");
  assertCommandFailure(
    () => psql(cluster, database, `
      update production_control.vercel_routing_rule_audit_bindings
      set routing_rule_canonical_hostname = 'www.baggerinv.com'
      where quiesce_evidence_id = ${sqlLiteral(draining.evidence_id)}::uuid;
    `),
    /PRODUCTION_VERCEL_ROUTING_RULE_AUDIT_IMMUTABLE/,
  );
  return { ...verified, criticalWaf: waf };
}

function makeQuiesceFinalizeInput(
  cluster,
  database,
  beginInput,
  draining,
  label,
  secondProbeRecords,
) {
  const requestFingerprint = fingerprint(`${label}-finalize-request`);
  const finalizeInput = {
    ...scope,
    actor_id: actor,
    purpose: beginInput.purpose,
    evidence_id: draining.evidence_id,
    evidence_request_id: beginInput.evidence_request_id,
    request_fingerprint: requestFingerprint,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    candidate_deployment_target: beginInput.candidate_deployment_target,
    vercel_project_id: beginInput.vercel_project_id,
    routing_rule_id: beginInput.routing_rule_id,
    routing_rule_revision: beginInput.routing_rule_revision,
    routing_rule_scope: beginInput.routing_rule_scope,
    origin_inventory: beginInput.origin_inventory,
    live_origin_inventory: beginInput.live_origin_inventory,
    second_probe_records: secondProbeRecords,
    ...credentialConfinement,
  };
  finalizeInput.provider_attestation = reserveProviderAttestation(
    cluster, database, finalizeInput, "FINALIZE", `${label}-finalize`,
  );
  return finalizeInput;
}

function backdateQuiesceDrain(
  cluster,
  database,
  evidenceId,
  ownerFreezeTtlSeconds = 1800,
) {
  assert.ok(Number.isSafeInteger(ownerFreezeTtlSeconds));
  psql(cluster, database, `
    update production_control.vercel_writer_quiesce_evidence
    set owner_acknowledged_at = now() - interval '301 seconds',
        drain_started_at = now() - interval '301 seconds',
        owner_freeze_expires_at =
          now() - interval '301 seconds' +
          ${ownerFreezeTtlSeconds} * interval '1 second'
    where evidence_id = ${sqlLiteral(evidenceId)}::uuid;
  `);
}

function rehearsalBeginInput(
  current,
  quiesceEvidenceId,
  label = "writer-fence-rehearsal-begin",
) {
  return {
    ...scope,
    actor_id: actor,
    rehearsal_request_id: randomUUID(),
    request_fingerprint: fingerprint(label),
    quiesce_evidence_id: quiesceEvidenceId,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    dedicated_google_service_account:
      "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
    expected_activation_revision: Number(current.activation_revision),
    expected_authority_generation: current.authority_generation_id,
    expected_admission_generation: current.admission_generation_id,
    expected_admission_revision: Number(current.admission_revision),
    baseline_provider_fingerprint: fingerprint(`${label}-provider-baseline`),
    baseline_protected_ranges_fingerprint:
      fingerprint(`${label}-protected-ranges-baseline`),
    baseline_canonical_value_fingerprint:
      fingerprint(`${label}-canonical-values-baseline`),
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
  };
}

function rehearsalFinishInput(
  beginInput,
  run,
  outcome,
  label,
  restorationConfirmed = outcome === "RESTORED",
) {
  const restored = restorationConfirmed;
  return {
    ...scope,
    actor_id: actor,
    run_id: run.run_id,
    rehearsal_request_id: beginInput.rehearsal_request_id,
    candidate_deployment_id: beginInput.candidate_deployment_id,
    candidate_deployment_commit: beginInput.candidate_deployment_commit,
    protection_description_prefix: run.protection_description_prefix,
    request_fingerprint: fingerprint(label),
    outcome,
    provider_evidence_fingerprint: restored
      ? fingerprint(`${label}-provider-evidence`)
      : undefined,
    fenced_provider_fingerprint: restored
      ? fingerprint(`${label}-fenced-provider`)
      : undefined,
    restored_provider_fingerprint: restored
      ? beginInput.baseline_provider_fingerprint
      : undefined,
    restored_protected_ranges_fingerprint: restored
      ? beginInput.baseline_protected_ranges_fingerprint
      : undefined,
    restored_canonical_value_fingerprint: restored
      ? beginInput.baseline_canonical_value_fingerprint
      : undefined,
    restoration_evidence_fingerprint: restored
      ? fingerprint(`${label}-restoration-evidence`)
      : undefined,
    run_owned_protection_ids: restored
      ? Array.from({ length: 17 }, (_, index) => 341 + index)
      : [341],
    active_run_owned_protection_count: restored ? 0 : 1,
    dedicated_identity_can_edit: restored ? true : undefined,
    legacy_identity_denied: restored ? true : undefined,
    google_value_writes_performed: restored ? false : undefined,
    preview_resources_accessed: restored ? false : undefined,
    restoration_confirmed: restored,
    failure_code: outcome === "FAILED"
      ? "FAULT_INJECTED_PROVIDER_FAILURE"
      : undefined,
  };
}

function certifySuccessfulRehearsal(cluster, database, label) {
  const current = state(cluster, database);
  const quiesce = certifyQuiesce(
    cluster,
    database,
    "REHEARSAL",
    `${label}-quiesce`,
  );
  const beginInput = rehearsalBeginInput(
    current,
    quiesce.evidence_id,
    `${label}-begin`,
  );
  const running = rpc(
    cluster,
    database,
    "begin_production_google_writer_fence_rehearsal",
    beginInput,
  );
  const restored = rpc(
    cluster,
    database,
    "finish_production_google_writer_fence_rehearsal",
    rehearsalFinishInput(beginInput, running, "RESTORED", `${label}-restored`),
  );
  assert.equal(restored.status, "RESTORED");
  assert.equal(restored.certification_passed, true);
  return restored;
}

function canonicalSheetUnionFingerprint(cluster, database) {
  return psql(cluster, database, `
    select production_control.structured_evidence_fingerprint(
      production_control.expected_google_writer_fence_sheet_ids()
    );
  `);
}

function providerProtectionRecords(prefix) {
  return expectedFenceSheetIds.map((sheetId, index) => ({
    sheetId,
    protectedRangeId: 91_000 + index,
    description: `${prefix}:${sheetId}`,
    warningOnly: false,
    dedicatedRequestingUserCanEdit: true,
    legacyRequestingUserCanEdit: false,
  }));
}

function inspectProviderFence(cluster, database, installRequestId, fenceId) {
  return rpc(
    cluster,
    database,
    "inspect_production_google_writer_provider_fence",
    {
      ...scope,
      install_request_id: installRequestId,
      fence_id: fenceId,
      candidate_deployment_id: candidateIdentity.deploymentId,
      candidate_deployment_commit: candidateIdentity.commit,
    },
  );
}

function beginProviderFenceReservation(cluster, database, quiesce, label) {
  const installRequestId = randomUUID();
  const before = state(cluster, database);
  const baseline = {
    provider: fingerprint(label + "-baseline-provider"),
    acl: fingerprint(label + "-baseline-acl"),
    canonical: fingerprint(label + "-baseline-canonical"),
    formula: fingerprint(label + "-baseline-formula"),
    combined: fingerprint(label + "-baseline-combined"),
  };
  const input = {
    ...optimisticInput(before, `${label}-begin-request`),
    operation: "BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
    lifecycle_mode: "CUTOVER",
    install_request_id: installRequestId,
    quiesce_evidence_id: quiesce.evidence_id,
    critical_waf_epoch_id: quiesce.critical_waf_epoch_id,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    dedicated_principal_fingerprint: fingerprint("dedicated-google-principal"),
    legacy_credential_generation_fingerprint:
      fingerprint("legacy-google-credential-generation-v0"),
    baseline_provider_fingerprint: baseline.provider,
    baseline_acl_fingerprint: baseline.acl,
    baseline_canonical_value_fingerprint: baseline.canonical,
    baseline_formula_fingerprint: baseline.formula,
    baseline_combined_value_fingerprint: baseline.combined,
    writer_scope_fingerprint: fingerprint("canonical-google-writer-scope-v2"),
    canonical_sheet_union_fingerprint:
      emptyStructuredEvidenceFingerprint(cluster, database),
  };
  const begin = rpc(
    cluster,
    database,
    "begin_production_google_writer_provider_fence_install",
    input,
  );
  assert.equal(begin.status, "INSTALLING");
  assert.equal(begin.lifecycle_mode, "CUTOVER");
  assert.equal(begin.admission_reservation_active, true);
  return { begin, input, baseline };
}

function emptyStructuredEvidenceFingerprint(cluster, database) {
  return psql(cluster, database, `
    select production_control.structured_evidence_fingerprint('[]'::jsonb);
  `).trim();
}

function aclSettlementInput({
  current,
  fence,
  installProof,
  installIntent,
  label,
  observationRequestId = randomUUID(),
  priorObservationId = undefined,
  providerObservedAt = new Date().toISOString(),
  snapshot,
  stage,
}) {
  return {
    ...optimisticInput(current, `${label}-${stage.toLowerCase()}`),
    operation: "RECORD_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_SETTLEMENT",
    stage,
    fence_id: fence.fence_id,
    install_request_id: fence.install_request_id,
    quiesce_evidence_id: fence.quiesce_evidence_id,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    observation_request_id: observationRequestId,
    prior_observation_id: priorObservationId,
    provider_fingerprint: snapshot.provider,
    acl_fingerprint: installProof.currentAclFingerprint,
    canonical_value_fingerprint: snapshot.canonical,
    combined_value_fingerprint: snapshot.combined,
    formula_fingerprint: snapshot.formula,
    structural_canary_fingerprint: snapshot.structural,
    permission_inventory_fingerprint:
      installProof.currentPermissionInventoryFingerprint,
    legacy_role: "reader",
    legacy_can_edit: false,
    legacy_can_share: false,
    legacy_edit_capability_fingerprint:
      installProof.currentLegacyEditCapabilityFingerprint,
    acl_transition_intent_fingerprint:
      installIntent.transitionIntentFingerprint,
    acl_transition_proof_fingerprint: installProof.transitionFingerprint,
    acl_transition_proof: installProof,
    provider_observed_at: providerObservedAt,
  };
}

function certifyAclV2RehearsalV4(cluster, database, label) {
  const forwardQuiesce = certifyQuiesceV4(
    cluster,
    database,
    `${label}-forward`,
    { purpose: "REHEARSAL" },
  );
  const before = state(cluster, database);
  const installRequestId = randomUUID();
  const snapshot = Object.freeze({
    provider: fingerprint(`${label}-reader-provider`),
    canonical: fingerprint(`${label}-canonical`),
    combined: fingerprint(`${label}-combined`),
    formula: fingerprint(`${label}-formula`),
    structural: fingerprint(`${label}-structural-canary`),
  });
  const baselineProviderFingerprint = fingerprint(`${label}-writer-provider`);
  const beginInput = {
    ...optimisticInput(before, `${label}-begin`),
    operation: "BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
    lifecycle_mode: "REHEARSAL",
    install_request_id: installRequestId,
    quiesce_evidence_id: forwardQuiesce.evidence_id,
    critical_waf_epoch_id: forwardQuiesce.critical_waf_epoch_id,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    dedicated_principal_fingerprint: fingerprint(`${label}-dedicated-principal`),
    legacy_credential_generation_fingerprint:
      fingerprint(`${label}-legacy-credential-generation`),
    baseline_provider_fingerprint: baselineProviderFingerprint,
    baseline_acl_fingerprint: fingerprint(`${label}-writer-acl`),
    baseline_canonical_value_fingerprint: snapshot.canonical,
    baseline_formula_fingerprint: snapshot.formula,
    baseline_combined_value_fingerprint: snapshot.combined,
    writer_scope_fingerprint: fingerprint(`${label}-writer-scope`),
    canonical_sheet_union_fingerprint:
      emptyStructuredEvidenceFingerprint(cluster, database),
  };
  const fence = rpc(
    cluster,
    database,
    "begin_production_google_writer_provider_fence_install",
    beginInput,
  );
  assert.equal(fence.status, "INSTALLING");
  assert.equal(fence.lifecycle_mode, "REHEARSAL");

  // The same critical-window epoch is now bound to this fence. Capture a
  // fresh provider readback and purpose-specific owner freeze while the
  // DORMANT admission gate is still OPEN; the receipt remains linked to this
  // exact epoch/fence throughout close and ACL restoration.
  const restoreWaf = reattestCriticalWafEpochV4(
    cluster,
    database,
    forwardQuiesce.criticalWaf,
    `${label}-restore-waf-reattest`,
  );
  const restoreQuiesce = certifyQuiesceV4(
    cluster,
    database,
    `${label}-restore`,
    {
      purpose: "REHEARSAL",
      criticalWaf: restoreWaf,
      criticalWafQuiesceStage: "RESTORE_REATTEST",
    },
  );
  assert.equal(
    restoreQuiesce.critical_waf_epoch_id,
    forwardQuiesce.critical_waf_epoch_id,
  );

  const vector = aclV2TransitionVector(
    label,
    fence.fence_id,
    installRequestId,
  );
  // This is the end-to-end JS-to-PostgreSQL vector check: both runtimes must
  // hash the exact same fixed scalar tuple before a DB dispatch can exist.
  assert.equal(psql(cluster, database, `
    select production_control.google_drive_acl_transition_intent_fingerprint_v1(
      ${jsonSql(vector.installIntent)} - 'transitionIntentFingerprint'
    );
  `).trim(), vector.installIntent.transitionIntentFingerprint);
  assert.equal(psql(cluster, database, `
    select production_control.google_drive_acl_transition_proof_fingerprint_v1(
      ${jsonSql(vector.installProof)} - 'transitionFingerprint'
    );
  `).trim(), vector.installProof.transitionFingerprint);

  let current = state(cluster, database);
  const installDispatch = rpc(
    cluster,
    database,
    "begin_production_google_writer_provider_fence_install_dispatch",
    {
      ...optimisticInput(current, `${label}-install-dispatch`),
      operation:
        "BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL_DISPATCH",
      fence_id: fence.fence_id,
      install_request_id: installRequestId,
      dispatch_request_id: randomUUID(),
      quiesce_evidence_id: forwardQuiesce.evidence_id,
      candidate_deployment_id: candidateIdentity.deploymentId,
      candidate_deployment_commit: candidateIdentity.commit,
      authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
      mutation_plan: "DRIVE_ACL_LEGACY_WRITER_TO_READER_V1",
      provider_mutation_class:
        "DRIVE_LEGACY_PERMISSION_WRITER_TO_READER_V1",
      source_role: "writer",
      target_role: "reader",
      transition_intent: vector.installIntent,
      transition_intent_fingerprint:
        vector.installIntent.transitionIntentFingerprint,
      provider_preflight_fingerprint:
        fingerprint(`${label}-install-provider-preflight`),
      provider_preflight_position: "SOURCE",
    },
  );
  assert.equal(installDispatch.dispatch_usable, true);
  const installProviderObservedAt = new Date().toISOString();
  const installResult = rpc(
    cluster,
    database,
    "record_production_google_writer_acl_dispatch_result",
    {
      ...optimisticInput(current, `${label}-install-result`),
      operation:
        "RECORD_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ACL_DISPATCH_RESULT",
      direction: "INSTALL",
      outcome_status: "TARGET_CONFIRMED",
      fence_id: fence.fence_id,
      install_request_id: installRequestId,
      dispatch_id: installDispatch.dispatch_id,
      result_request_id: randomUUID(),
      authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
      transition_proof: vector.installProof,
      transition_proof_fingerprint: vector.installProof.transitionFingerprint,
      provider_observed_at: installProviderObservedAt,
    },
  );
  assert.equal(installResult.outcome_status, "TARGET_CONFIRMED");

  const aclReader = rpc(
    cluster,
    database,
    "record_production_google_writer_provider_fence_settlement",
    aclSettlementInput({
      current,
      fence,
      installProof: vector.installProof,
      installIntent: vector.installIntent,
      label,
      snapshot,
      stage: "ACL_READER_CONFIRMED",
    }),
  );
  psql(cluster, database, `
    update production_control.google_writer_provider_fence_settlement_observations
    set recorded_at = now() - interval '202 seconds',
        provider_observed_at = now() - interval '202 seconds'
    where observation_id = ${sqlLiteral(aclReader.observation_id)}::uuid;
  `);
  const readback1 = rpc(
    cluster,
    database,
    "record_production_google_writer_provider_fence_settlement",
    aclSettlementInput({
      current,
      fence,
      installProof: vector.installProof,
      installIntent: vector.installIntent,
      label,
      priorObservationId: aclReader.observation_id,
      snapshot,
      stage: "SETTLEMENT_READBACK_1",
    }),
  );
  psql(cluster, database, `
    update production_control.google_writer_provider_fence_settlement_observations
    set recorded_at = now() - interval '11 seconds',
        provider_observed_at = now() - interval '11 seconds'
    where observation_id = ${sqlLiteral(readback1.observation_id)}::uuid;
  `);

  const closeInputValue = {
    ...optimisticInput(current, `${label}-finish-close`),
    operation:
      "FINISH_AND_CLOSE_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
    expected_authority: "GOOGLE",
    fence_id: fence.fence_id,
    install_request_id: installRequestId,
    quiesce_evidence_id: forwardQuiesce.evidence_id,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    acl_reader_confirmed_observation_id: aclReader.observation_id,
    settlement_readback_1_observation_id: readback1.observation_id,
    settlement_readback_2_request_id: randomUUID(),
    settlement_readback_2_request_fingerprint:
      fingerprint(`${label}-settlement-readback-2`),
    start_source_fingerprint: fingerprint(`${label}-start-source`),
    ...aclSettlementInput({
      current,
      fence,
      installProof: vector.installProof,
      installIntent: vector.installIntent,
      label,
      snapshot,
      stage: "SETTLEMENT_READBACK_1",
    }),
  };
  // The settlement snapshot spread above contributes only provider evidence;
  // restore the one atomic parent operation and exact parent request identity.
  closeInputValue.operation =
    "FINISH_AND_CLOSE_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL";
  closeInputValue.request_fingerprint = fingerprint(`${label}-finish-close`);
  closeInputValue.expected_authority = "GOOGLE";
  closeInputValue.acl_reader_confirmed_observation_id = aclReader.observation_id;
  closeInputValue.settlement_readback_1_observation_id = readback1.observation_id;
  closeInputValue.settlement_readback_2_request_id = randomUUID();
  closeInputValue.settlement_readback_2_request_fingerprint =
    fingerprint(`${label}-settlement-readback-2`);
  closeInputValue.start_source_fingerprint = fingerprint(`${label}-start-source`);
  closeInputValue.provider_observed_at = new Date().toISOString();
  const close = rpc(
    cluster,
    database,
    "finish_close_production_google_writer_provider_fence_install",
    closeInputValue,
  );
  assert.equal(close.admission_state, "CLOSING");
  assert.equal(close.lifecycle_mode, "REHEARSAL");
  providerProofByEvidenceId.set(close.external_fence_evidence_id, {
    quiesceEvidenceId: forwardQuiesce.evidence_id,
    fenceId: fence.fence_id,
    verificationId: close.provider_fence_verification_id,
  });
  const closed = drainFinalizeExistingClose(
    cluster,
    database,
    close.external_fence_evidence_id,
    close,
    `${label}-rehearsal`,
  );
  assert.equal(closed.current.admission_state, "CLOSED");

  // Isolated clock compression for the provider-wide 1800s function ceiling.
  // The original owner freeze remains live, overlaps the fresh restore freeze,
  // and continuously covers the exact WAF-active -> ACL-restore horizon.
  psql(cluster, database, `
    update production_control.vercel_writer_quiesce_evidence
    set owner_acknowledged_at = now() - interval '1811 seconds',
        drain_started_at = now() - interval '1811 seconds',
        owner_freeze_expires_at = now() + interval '289 seconds',
        expires_at = now() + interval '289 seconds'
    where evidence_id = ${sqlLiteral(forwardQuiesce.evidence_id)}::uuid;
    update production_control.vercel_writer_critical_waf_epochs
    set critical_active_at = now() - interval '1811 seconds'
    where epoch_id =
      ${sqlLiteral(forwardQuiesce.critical_waf_epoch_id)}::uuid;
  `);
  current = state(cluster, database);
  const abortRequestId = randomUUID();
  const aborting = rpc(
    cluster,
    database,
    "begin_abort_production_google_writer_provider_fence_install",
    {
      ...optimisticInput(current, `${label}-begin-restore`),
      operation: "BEGIN_ABORT_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
      fence_id: fence.fence_id,
      install_request_id: installRequestId,
      abort_request_id: abortRequestId,
      restore_quiesce_evidence_id: restoreQuiesce.evidence_id,
      candidate_deployment_id: candidateIdentity.deploymentId,
      candidate_deployment_commit: candidateIdentity.commit,
      authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    },
  );
  assert.equal(aborting.status, "ABORTING");
  const restoreDispatch = rpc(
    cluster,
    database,
    "begin_production_google_writer_provider_fence_abort_dispatch",
    {
      ...optimisticInput(current, `${label}-restore-dispatch`),
      operation:
        "BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ABORT_DISPATCH",
      fence_id: fence.fence_id,
      install_request_id: installRequestId,
      abort_request_id: abortRequestId,
      dispatch_request_id: randomUUID(),
      restore_quiesce_evidence_id: restoreQuiesce.evidence_id,
      candidate_deployment_id: candidateIdentity.deploymentId,
      candidate_deployment_commit: candidateIdentity.commit,
      authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
      mutation_plan: "DRIVE_ACL_LEGACY_READER_TO_WRITER_V1",
      provider_mutation_class:
        "DRIVE_LEGACY_PERMISSION_READER_TO_WRITER_V1",
      source_role: "reader",
      target_role: "writer",
      transition_intent: vector.restoreIntent,
      transition_intent_fingerprint:
        vector.restoreIntent.transitionIntentFingerprint,
      provider_preflight_fingerprint:
        fingerprint(`${label}-restore-provider-preflight`),
      provider_preflight_position: "SOURCE",
    },
  );
  assert.equal(restoreDispatch.dispatch_usable, true);
  const restoreProviderObservedAt = new Date().toISOString();
  const restoreResult = rpc(
    cluster,
    database,
    "record_production_google_writer_acl_dispatch_result",
    {
      ...optimisticInput(current, `${label}-restore-result`),
      operation:
        "RECORD_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_ACL_DISPATCH_RESULT",
      direction: "RESTORE",
      outcome_status: "TARGET_CONFIRMED",
      fence_id: fence.fence_id,
      install_request_id: installRequestId,
      dispatch_id: restoreDispatch.dispatch_id,
      result_request_id: randomUUID(),
      authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
      transition_proof: vector.restoreProof,
      transition_proof_fingerprint: vector.restoreProof.transitionFingerprint,
      provider_observed_at: restoreProviderObservedAt,
    },
  );
  assert.equal(restoreResult.outcome_status, "TARGET_CONFIRMED");
  const providerObservedAt = new Date().toISOString();
  const abortInput = {
    ...optimisticInput(current, `${label}-finish-restore`),
    operation: "ABORT_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
    fence_id: fence.fence_id,
    install_request_id: installRequestId,
    abort_request_id: abortRequestId,
    abort_dispatch_id: restoreDispatch.dispatch_id,
    restore_quiesce_evidence_id: restoreQuiesce.evidence_id,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
    provider_rollback_verified: true,
    restored_legacy_role: "writer",
    restored_legacy_can_edit: true,
    restored_legacy_can_share: true,
    active_run_owned_protection_count: 0,
    removed_protected_range_ids: [],
    restored_provider_fingerprint: baselineProviderFingerprint,
    restored_acl_fingerprint: vector.shared.writerAclFingerprint,
    restored_canonical_value_fingerprint: snapshot.canonical,
    restored_combined_value_fingerprint: snapshot.combined,
    restored_formula_fingerprint: snapshot.formula,
    restore_transition_proof: vector.restoreProof,
    restore_transition_proof_fingerprint: vector.restoreProof.transitionFingerprint,
    provider_observed_at: providerObservedAt,
  };
  abortInput.restoration_evidence_fingerprint =
    productionGoogleWriterProviderAbortEvidenceHash(
      abortInput,
    );
  const restored = rpc(
    cluster,
    database,
    "abort_production_google_writer_provider_fence_install",
    abortInput,
  );
  assert.equal(restored.status, "ACL_RESTORED_WAF_ACTIVE");
  assert.equal(restored.critical_window_active, true);
  assert.equal(restored.baseline_restored, false);
  const wafRestoration = restoreCriticalWafBaselineV4(
    cluster,
    database,
    restoreWaf,
    fence,
    `${label}-restore-waf`,
  );
  const after = state(cluster, database);
  assert.equal(after.activation_state, "DORMANT");
  assert.equal(after.authority, "GOOGLE");
  assert.equal(after.admission_state, "OPEN");
  assert.equal(after.execution_gate, "PAUSED");
  assert.equal(after.provider_fence_id, null);
  assert.equal(
    psql(cluster, database, `
      select provider_principal_fingerprint
      from scoring_authority.ingress_gates
      where tournament_id = '2026';
    `),
    legacyProviderPrincipalFingerprint,
    "the restored DORMANT/OPEN/PAUSED rehearsal retains the certified legacy principal",
  );
  return {
    fence,
    forwardQuiesce,
    restoreQuiesce,
    vector,
    restored: wafRestoration.finalized,
    aclRestored: restored,
    wafRestoration,
  };
}

function providerFenceFinishEvidence(reservation, label) {
  const protectionRecords = providerProtectionRecords(
    reservation.begin.protection_description_prefix,
  );
  return {
    fence_id: reservation.begin.fence_id,
    install_request_id: reservation.input.install_request_id,
    quiesce_evidence_id: reservation.input.quiesce_evidence_id,
    candidate_deployment_id: candidateIdentity.deploymentId,
    candidate_deployment_commit: candidateIdentity.commit,
    protection_description_prefix:
      reservation.begin.protection_description_prefix,
    protection_records: protectionRecords,
    provider_fingerprint: fingerprint(label + "-installed-provider"),
    acl_fingerprint: reservation.baseline.acl,
    canonical_value_fingerprint: reservation.baseline.canonical,
    formula_fingerprint: reservation.baseline.formula,
    combined_value_fingerprint: reservation.baseline.combined,
    structural_canary_fingerprint: fingerprint(label + "-structural-canary"),
    permission_inventory_fingerprint:
      fingerprint(label + "-permission-inventory"),
  };
}

function providerFenceSettlementInput(
  current,
  finishEvidence,
  stage,
  label,
  priorObservationId = undefined,
) {
  return {
    ...optimisticInput(current, label),
    ...finishEvidence,
    operation:
      "RECORD_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_SETTLEMENT",
    stage,
    observation_request_id: randomUUID(),
    prior_observation_id: priorObservationId,
    provider_observed_at: new Date().toISOString(),
    authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
  };
}

function installProviderFence(cluster, database, quiesce, label) {
  const installRequestId = randomUUID();
  const baseline = {
    provider: fingerprint(`${label}-baseline-provider`),
    acl: fingerprint(`${label}-baseline-acl`),
    canonical: fingerprint(`${label}-baseline-canonical`),
    formula: fingerprint(`${label}-baseline-formula`),
    combined: fingerprint(`${label}-baseline-combined`),
  };
  const begin = rpc(
    cluster,
    database,
    "begin_production_google_writer_provider_fence_install",
    {
      ...scope,
      actor_id: actor,
      install_request_id: installRequestId,
      request_fingerprint: fingerprint(`${label}-begin-request`),
      quiesce_evidence_id: quiesce.evidence_id,
      candidate_deployment_id: candidateIdentity.deploymentId,
      candidate_deployment_commit: candidateIdentity.commit,
      authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
      dedicated_principal_fingerprint: fingerprint("dedicated-google-principal"),
      legacy_credential_generation_fingerprint:
        fingerprint("legacy-google-credential-generation-v0"),
      baseline_provider_fingerprint: baseline.provider,
      baseline_acl_fingerprint: baseline.acl,
      baseline_canonical_value_fingerprint: baseline.canonical,
      baseline_formula_fingerprint: baseline.formula,
      baseline_combined_value_fingerprint: baseline.combined,
      writer_scope_fingerprint: fingerprint("canonical-google-writer-scope-v2"),
      canonical_sheet_union_fingerprint:
        canonicalSheetUnionFingerprint(cluster, database),
    },
  );
  assert.equal(begin.status, "INSTALLING");
  const protectionRecords = providerProtectionRecords(
    begin.protection_description_prefix,
  );
  const provider = {
    provider: fingerprint(`${label}-installed-provider`),
    acl: baseline.acl,
    canonical: baseline.canonical,
    formula: baseline.formula,
    combined: baseline.combined,
    structural: fingerprint(`${label}-structural-canary`),
    permissions: fingerprint(`${label}-permission-inventory`),
  };
  const installed = rpc(
    cluster,
    database,
    "finish_production_google_writer_provider_fence_install",
    {
      ...scope,
      actor_id: actor,
      fence_id: begin.fence_id,
      install_request_id: installRequestId,
      quiesce_evidence_id: quiesce.evidence_id,
      request_fingerprint: fingerprint(`${label}-finish-request`),
      candidate_deployment_id: candidateIdentity.deploymentId,
      candidate_deployment_commit: candidateIdentity.commit,
      protection_description_prefix: begin.protection_description_prefix,
      protection_records: protectionRecords,
      provider_fingerprint: provider.provider,
      acl_fingerprint: provider.acl,
      canonical_value_fingerprint: provider.canonical,
      formula_fingerprint: provider.formula,
      combined_value_fingerprint: provider.combined,
      structural_canary_fingerprint: provider.structural,
      permission_inventory_fingerprint: provider.permissions,
    },
  );
  assert.equal(installed.status, "INSTALLED");
  const inspected = inspectProviderFence(
    cluster,
    database,
    installRequestId,
    begin.fence_id,
  );
  assert.equal(inspected.verification.protection_count, 17);
  return {
    fenceId: begin.fence_id,
    installRequestId,
    verificationId: inspected.verification.verification_id,
    quiesceEvidenceId: quiesce.evidence_id,
    protectionDescriptionPrefix: begin.protection_description_prefix,
    protectionRecords,
    provider,
  };
}

function currentProviderProof(cluster, database) {
  return parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'fenceId', fence.fence_id,
      'installRequestId', fence.install_request_id,
      'verificationId', verification.verification_id,
      'quiesceEvidenceId', verification.quiesce_evidence_id,
      'protectionDescriptionPrefix', fence.protection_description_prefix,
      'protectionRecords', verification.protection_records,
      'provider', jsonb_build_object(
        'provider', verification.provider_fingerprint,
        'acl', verification.acl_fingerprint,
        'canonical', verification.canonical_value_fingerprint,
        'formula', verification.formula_fingerprint,
        'combined', verification.combined_value_fingerprint,
        'structural', verification.structural_canary_fingerprint,
        'permissions', verification.permission_inventory_fingerprint
      )
    )
    from production_control.cutover_activation_state activation
    join production_control.google_writer_provider_fences fence
      on fence.fence_id = activation.active_google_writer_provider_fence_id
    join production_control.google_writer_provider_fence_verifications verification
      on verification.verification_id =
        activation.active_google_writer_provider_verification_id
    where activation.scope_key = 'BAGGER_INV_PRODUCTION';
  `));
}

function refreshProviderFence(cluster, database, prior, quiesce, label) {
  rpc(
    cluster,
    database,
    "refresh_production_google_writer_provider_fence",
    {
      ...scope,
      actor_id: actor,
      fence_id: prior.fenceId,
      install_request_id: prior.installRequestId,
      quiesce_evidence_id: quiesce.evidence_id,
      provider_fence_verification_id: prior.verificationId,
      request_fingerprint: fingerprint(`${label}-provider-refresh-request`),
      candidate_deployment_id: candidateIdentity.deploymentId,
      candidate_deployment_commit: candidateIdentity.commit,
      protection_description_prefix: prior.protectionDescriptionPrefix,
      protection_records: prior.protectionRecords,
      provider_fingerprint: prior.provider.provider,
      acl_fingerprint: prior.provider.acl,
      canonical_value_fingerprint: prior.provider.canonical,
      formula_fingerprint: prior.provider.formula,
      combined_value_fingerprint: prior.provider.combined,
      structural_canary_fingerprint: prior.provider.structural,
      permission_inventory_fingerprint: prior.provider.permissions,
    },
  );
  return currentProviderProof(cluster, database);
}

function exactProviderIds(evidenceId) {
  const proof = providerProofByEvidenceId.get(evidenceId);
  assert.ok(proof, `missing provider proof for external evidence ${evidenceId}`);
  return {
    quiesce_evidence_id: proof.quiesceEvidenceId,
    provider_fence_id: proof.fenceId,
    provider_fence_verification_id: proof.verificationId,
  };
}

function closeInput(current, evidenceId, label) {
  return {
    ...optimisticInput(current, label),
    ...exactProviderIds(evidenceId),
    expected_authority: current.authority,
    external_fence_evidence_id: evidenceId,
    start_source_fingerprint: current.expected_source_fingerprint,
  };
}

function beginInput(
  current,
  label,
  leaseNonce = randomUUID(),
  operationRequestId = randomUUID(),
) {
  return {
    ...optimisticInput(current, label),
    expected_authority: "GOOGLE",
    writer_intent: "CANONICAL_LEGACY",
    match_id: "2026-R1-1",
    operation: "WRITE_HOLE_SCORE",
    operation_request_id: operationRequestId,
    expected_provider_principal_fingerprint:
      legacyProviderPrincipalFingerprint,
    lease_nonce: leaseNonce,
    lease_seconds: 180,
  };
}

function closureInput(current, evidenceId, closureId, label) {
  return {
    ...optimisticInput(current, label),
    ...exactProviderIds(evidenceId),
    closure_id: closureId,
    external_fence_evidence_id: evidenceId,
  };
}

function recordFenceEvidence(cluster, database, current, label) {
  const proof = currentProviderProof(cluster, database);
  const evidence = rpc(
    cluster,
    database,
    "record_production_scoring_external_fence_evidence",
    {
      ...optimisticInput(current, `${label}-request`),
      operation: "RECORD_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE",
      quiesce_evidence_id: proof.quiesceEvidenceId,
      provider_fence_id: proof.fenceId,
      provider_fence_verification_id: proof.verificationId,
    },
  );
  assert.equal(
    evidence.code,
    "PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_RECORDED",
  );
  providerProofByEvidenceId.set(evidence.evidence_id, proof);
  return evidence;
}

function refreshFenceEvidence(
  cluster,
  database,
  current,
  closureId,
  priorEvidenceId,
  label,
) {
  const prior = providerProofByEvidenceId.get(priorEvidenceId)
    ?? currentProviderProof(cluster, database);
  const quiesce = certifyQuiesce(
    cluster,
    database,
    "CUTOVER",
    `${label}-quiesce`,
    prior.quiesceEvidenceId,
  );
  const proof = refreshProviderFence(
    cluster,
    database,
    prior,
    quiesce,
    label,
  );
  const refreshed = rpc(
    cluster,
    database,
    "refresh_production_scoring_external_fence_evidence",
    {
      ...optimisticInput(current, `${label}-request`),
      operation: "REFRESH_PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE",
      prior_external_fence_evidence_id: priorEvidenceId,
      closure_id: closureId,
      quiesce_evidence_id: proof.quiesceEvidenceId,
      provider_fence_id: proof.fenceId,
      provider_fence_verification_id: proof.verificationId,
    },
  );
  providerProofByEvidenceId.set(refreshed.evidence_id, proof);
  return refreshed;
}

function stageToArmedGoogleGate(cluster, database, label = "initial") {
  const beforeStage = state(cluster, database);
  const stageRequestFingerprint = fingerprint(`${label}-stage-release`);
  const certificationFingerprint = fingerprint(
    `${label}-step11-6-certification`,
  );
  const environmentDeltaFingerprint = fingerprint(
    `${label}-environment-delta-v2`,
  );
  const stage = rpc(cluster, database, "stage_production_cutover_release", {
    ...scope,
    actor_id: actor,
    contract_version: "production-cutover-activation-v1",
    vercel_project: "bagger-inv",
    canonical_domain: "https://baggerinv.com",
    tournament_year: 2026,
    vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    deployment_commit: deploymentCommit,
    source_fingerprint: sourceFingerprint,
    certification_fingerprint: certificationFingerprint,
    environment_delta_fingerprint_v2: environmentDeltaFingerprint,
    expected_activation_revision: Number(beforeStage.activation_revision),
    request_fingerprint: stageRequestFingerprint,
  });
  assert.equal(stage.code, "PRODUCTION_RELEASE_STAGED");
  assert.equal(stage.stage_request_fingerprint, stageRequestFingerprint);
  assert.match(stage.stage_payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(stage.certification_fingerprint, certificationFingerprint);
  assert.equal(
    stage.environment_delta_fingerprint_v2,
    environmentDeltaFingerprint,
  );

  psql(cluster, database, `
    update production_control.cutover_activation_state
    set read_cutover_phase = 'CURRENT_READS'
    where scope_key = 'BAGGER_INV_PRODUCTION';
    update production_control.resource_scope
    set participant_identity_authority = 'SUPABASE',
        current_tournament_read_authority = 'SUPABASE',
        public_supabase_reads_enabled = true,
        auth_user_creation_enabled = true
    where scope_key = 'BAGGER_INV_PRODUCTION';
  `);
  const staged = state(cluster, database);
  assert.equal(staged.staged_request_fingerprint, stageRequestFingerprint);
  assert.equal(staged.staged_payload_hash, stage.stage_payload_hash);
  assert.equal(staged.staged_certification_fingerprint, certificationFingerprint);
  assert.equal(
    staged.staged_environment_delta_fingerprint_v2,
    environmentDeltaFingerprint,
  );

  const arm = rpc(
    cluster,
    database,
    "arm_production_google_ingress_lease_gate",
    {
      ...optimisticInput(staged, "arm-google-admission"),
    },
  );
  assert.equal(arm.code, "PRODUCTION_GOOGLE_LEASE_GATE_V2_ARMED");
  const armed = state(cluster, database);
  assert.equal(armed.activation_state, "GOOGLE_LEASE_ARMED");
  assert.equal(armed.admission_state, "OPEN");
  assert.equal(armed.execution_gate, "OPEN");
  return armed;
}

function stageAndArm(cluster, database) {
  const armed = stageToArmedGoogleGate(cluster, database);
  const quiesce = certifyQuiesce(
    cluster,
    database,
    "CUTOVER",
    "initial-cutover-quiesce",
  );
  installProviderFence(
    cluster,
    database,
    quiesce,
    "initial-provider-fence",
  );
  const providerBound = state(cluster, database);
  const evidence = recordFenceEvidence(
    cluster,
    database,
    providerBound,
    "external-fence-evidence",
  );
  return { armed, evidenceId: evidence.evidence_id };
}

function finalBoundary(cluster, database) {
  return parseJsonOutput(psql(cluster, database, `
    select jsonb_build_object(
      'supabase_match_revisions',
        production_control.current_match_revisions('2026'),
      'google_checkpoints',
        production_control.current_google_checkpoints('2026'),
      'boundary_captured_at', clock_timestamp()
    );
  `));
}

function finalizationInput(
  current,
  evidenceId,
  closureId,
  drained,
  boundary,
  label,
) {
  return {
    ...closureInput(current, evidenceId, closureId, label),
    final_source_fingerprint: fingerprint(`${label}-final-source`),
    reconciliation_fingerprint: fingerprint(`${label}-reconciliation`),
    lease_set_fingerprint: drained.lease_set_fingerprint,
    supabase_match_revisions: boundary.supabase_match_revisions,
    google_checkpoints: boundary.google_checkpoints,
    boundary_captured_at: boundary.boundary_captured_at,
  };
}

function closeDrainFinalize(cluster, database, evidenceId, label) {
  const beforeClose = state(cluster, database);
  const close = rpc(
    cluster,
    database,
    "close_production_scoring_admission",
    closeInput(beforeClose, evidenceId, `${label}-close`),
  );
  const afterClose = state(cluster, database);
  const drained = rpc(
    cluster,
    database,
    "drain_production_scoring_admission",
    closureInput(
      afterClose,
      evidenceId,
      close.closure_id,
      `${label}-drain`,
    ),
  );
  assert.equal(drained.ready_to_finalize, true);
  const afterDrain = state(cluster, database);
  const boundary = finalBoundary(cluster, database);
  const finalized = rpc(
    cluster,
    database,
    "finalize_production_scoring_admission",
    finalizationInput(
      afterDrain,
      evidenceId,
      close.closure_id,
      drained,
      boundary,
      `${label}-finalize`,
    ),
  );
  assert.equal(finalized.admission_state, "CLOSED");
  return {
    close,
    drained,
    boundary,
    finalized,
    current: state(cluster, database),
  };
}

function drainFinalizeExistingClose(
  cluster,
  database,
  evidenceId,
  close,
  label,
) {
  const afterClose = state(cluster, database);
  const drained = rpc(
    cluster,
    database,
    "drain_production_scoring_admission",
    closureInput(
      afterClose,
      evidenceId,
      close.closure_id,
      `${label}-drain`,
    ),
  );
  assert.equal(drained.ready_to_finalize, true);
  const afterDrain = state(cluster, database);
  const boundary = finalBoundary(cluster, database);
  const finalized = rpc(
    cluster,
    database,
    "finalize_production_scoring_admission",
    finalizationInput(
      afterDrain,
      evidenceId,
      close.closure_id,
      drained,
      boundary,
      `${label}-finalize`,
    ),
  );
  assert.equal(finalized.admission_state, "CLOSED");
  return {
    close,
    drained,
    boundary,
    finalized,
    current: state(cluster, database),
  };
}

function prepareEpochInput(current, evidenceId, closed, epochType, label) {
  return {
    ...closureInput(
      current,
      evidenceId,
      closed.close.closure_id,
      `${label}-prepare`,
    ),
    epoch_type: epochType,
    source_fingerprint: closed.finalized.final_source_fingerprint,
    reconciliation_fingerprint: closed.finalized.reconciliation_fingerprint,
    closure_boundary_fingerprint: closed.finalized.lease_set_fingerprint,
    supabase_match_revisions: closed.boundary.supabase_match_revisions,
    google_checkpoints: closed.boundary.google_checkpoints,
    expected_prior_source_fingerprint: current.expected_source_fingerprint,
    reason: `${epochType.toLowerCase()} PostgreSQL integration boundary`,
  };
}

function commitEpochInput(current, evidenceId, closed, epochId, label) {
  return {
    ...closureInput(
      current,
      evidenceId,
      closed.close.closure_id,
      `${label}-commit`,
    ),
    epoch_id: epochId,
    reconciliation_fingerprint: closed.finalized.reconciliation_fingerprint,
  };
}

async function allBinariesAvailable() {
  try {
    await Promise.all(
      Object.values(postgresBinaries).map((binary) =>
        access(binary, fsConstants.X_OK)
      ),
    );
    return true;
  } catch {
    return false;
  }
}

test(
  "production scoring admission v2 serializes real PostgreSQL 17 sessions",
  { timeout: 120_000 },
  async (t) => {
    if (!(await allBinariesAvailable())) {
      t.skip(`PostgreSQL 17 toolchain is unavailable at ${pgBin}`);
      return;
    }

    const cluster = await createCluster();
    let databaseCounter = 0;
    const baselineDatabase = "admission_034_baseline";
    const dormantBaselineDatabase = "admission_034_dormant_baseline";
    const cloneDatabase = (label) => {
      databaseCounter += 1;
      const database = `admission_034_${databaseCounter}_${label}`;
      createDatabase(cluster, database, baselineDatabase);
      return database;
    };
    const cloneDormantDatabase = (label) => {
      databaseCounter += 1;
      const database = `admission_034_${databaseCounter}_${label}`;
      createDatabase(cluster, database, dormantBaselineDatabase);
      return database;
    };

    try {
      createDatabase(cluster, baselineDatabase);
      installSupabaseCompatibility(cluster, baselineDatabase);
      await installProductionMigrations(cluster, baselineDatabase);
      assert.equal(
        psql(cluster, baselineDatabase, `
          select production_control.vercel_origin_inventory_fingerprint(
            ${jsonSql(originInventory)}
          );
        `).trim(),
        originInventoryFingerprint,
      );
      installScoringFixture(cluster, baselineDatabase);
      createDatabase(cluster, dormantBaselineDatabase, baselineDatabase);
      certifySuccessfulRehearsal(
        cluster,
        baselineDatabase,
        "baseline-certified-rehearsal",
      );
      const baseline = stageAndArm(cluster, baselineDatabase);

      await t.test(
        "migration 039 installs the all-project provider v3 contract without changing dormant Production authority",
        () => {
          const database = cloneDormantDatabase("migration_039_provider_v3");
          const legacyAbandonBegin = quiesceBeginInput(
            "REHEARSAL",
            "migration-039-legacy-abandoned-row",
          );
          const legacyAbandonIssue = providerChallengeIssueInput(
            legacyAbandonBegin,
            "BEGIN",
            "migration-039-legacy-abandoned-row",
          );
          const legacyAbandonChallenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            legacyAbandonIssue,
          );
          expireProviderChallenge(
            cluster,
            database,
            legacyAbandonChallenge.challenge_id,
          );
          rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            providerChallengeAbandonInput(
              legacyAbandonIssue,
              legacyAbandonChallenge,
              "migration-039-legacy-abandoned-row",
            ),
          );
          const legacyAbandonedBefore = psql(cluster, database, `
            select (pg_catalog.to_jsonb(value)
              - 'abandonment_reason')::text
            from production_control.vercel_provider_attestation_challenges value
            where value.challenge_id =
              ${sqlLiteral(legacyAbandonChallenge.challenge_id)}::uuid;
          `);
          const functionOidsBefore = psql(cluster, database, `
            select pg_catalog.concat_ws(
              ',',
              'production_control.assert_exact_vercel_origin_inventory(jsonb)'::pg_catalog.regprocedure::oid,
              'production_control.assert_exact_vercel_live_inventory(jsonb,jsonb,text,text,text,text)'::pg_catalog.regprocedure::oid,
              'public.consume_production_vercel_provider_attestation_challenge(jsonb)'::pg_catalog.regprocedure::oid,
              'public.begin_production_vercel_writer_quiesce_evidence(jsonb)'::pg_catalog.regprocedure::oid,
              'public.finalize_production_vercel_writer_quiesce_evidence(jsonb)'::pg_catalog.regprocedure::oid
            );
          `).trim();

          psqlFile(cluster, database, path.join(
            migrationsDirectory,
            "202608260039_production_all_project_provider_inventory_v3.sql",
          ));

          assert.equal(psql(cluster, database, `
            select (pg_catalog.to_jsonb(value)
              - 'abandonment_reason')::text
            from production_control.vercel_provider_attestation_challenges value
            where value.challenge_id =
              ${sqlLiteral(legacyAbandonChallenge.challenge_id)}::uuid;
          `), legacyAbandonedBefore);
          assert.equal(psql(cluster, database, `
            select abandonment_reason is null
            from production_control.vercel_provider_attestation_challenges
            where challenge_id =
              ${sqlLiteral(legacyAbandonChallenge.challenge_id)}::uuid;
          `), "t");

          assert.equal(psql(cluster, database, `
            select pg_catalog.concat_ws(
              ',',
              'production_control.assert_exact_vercel_origin_inventory(jsonb)'::pg_catalog.regprocedure::oid,
              'production_control.assert_exact_vercel_live_inventory(jsonb,jsonb,text,text,text,text)'::pg_catalog.regprocedure::oid,
              'public.consume_production_vercel_provider_attestation_challenge(jsonb)'::pg_catalog.regprocedure::oid,
              'public.begin_production_vercel_writer_quiesce_evidence(jsonb)'::pg_catalog.regprocedure::oid,
              'public.finalize_production_vercel_writer_quiesce_evidence(jsonb)'::pg_catalog.regprocedure::oid
            );
          `).trim(), functionOidsBefore,
          "migration 039 must replace provider RPCs in place");

          assert.equal(psql(cluster, database, `
            select pg_catalog.concat_ws(
              '|',
              activation.state,
              activation.current_authority,
              resource.participant_identity_authority,
              gate.admission_state,
              gate.state,
              activation.scoring_ingress_enabled,
              resource.workers_enabled,
              gate.admission_protocol_enforced
            )
            from production_control.cutover_activation_state activation
            cross join production_control.resource_scope resource
            cross join scoring_authority.ingress_gates gate
            where activation.scope_key = 'BAGGER_INV_PRODUCTION'
              and resource.scope_key = 'BAGGER_INV_PRODUCTION'
              and gate.tournament_id = '2026';
          `).trim(), "DORMANT|GOOGLE|PASSPORT|OPEN|PAUSED|f|f|f");

          assert.doesNotThrow(() => psql(cluster, database, `
            select production_control.assert_exact_vercel_origin_inventory(
              ${jsonSql(originInventoryV3)}
            );
            select production_control.assert_exact_vercel_live_inventory(
              ${jsonSql(originInventoryV3)},
              ${jsonSql(originInventoryV3)},
              'dpl_CBgDhovX4cfQx15EJWWvm6Kti25j',
              'be5531faca009e26617496e47831f365a1b4997b',
              'https://bagger-mribo6cqh-sandbagger-invitational.vercel.app',
              'PREVIEW'
            );
          `));
          assert.throws(
            () => psql(cluster, database, `
              select production_control.assert_exact_vercel_origin_inventory(
                ${jsonSql(originInventory)}
              );
            `),
            (error) => error instanceof CommandFailure &&
              /PRODUCTION_VERCEL_ORIGIN_INVENTORY_MISMATCH/.test(error.message),
          );

          assert.equal(psql(cluster, database, `
            select pg_catalog.count(*)
            from pg_catalog.pg_attribute attribute
            where attribute.attrelid in (
              'production_control.vercel_provider_attestations'::pg_catalog.regclass,
              'production_control.vercel_writer_quiesce_evidence'::pg_catalog.regclass
            )
              and attribute.attname in (
                'provider_inventory_schema',
                'retained_provider_inventory_count',
                'retained_provider_inventory_fingerprint',
                'live_provider_inventory_count',
                'live_provider_inventory_fingerprint',
                'routing_rule_all_method_fence_required_host_count',
                'routing_rule_all_method_fence_required_hosts_fingerprint',
                'routing_rule_all_method_fence_required_path_count',
                'routing_rule_all_method_fence_required_paths_fingerprint'
              )
              and not attribute.attisdropped;
          `).trim(), "18");

          assert.equal(psql(cluster, database, `
            select pg_catalog.concat_ws(
              '|',
              quiesce_table.relrowsecurity,
              attestation_table.relrowsecurity,
              pg_catalog.has_table_privilege(
                'anon',
                'production_control.vercel_writer_quiesce_evidence',
                'SELECT'
              ),
              pg_catalog.has_table_privilege(
                'authenticated',
                'production_control.vercel_provider_attestations',
                'SELECT'
              ),
              pg_catalog.has_table_privilege(
                'service_role',
                'production_control.vercel_provider_attestations',
                'SELECT'
              ),
              pg_catalog.has_function_privilege(
                'anon',
                'public.consume_production_vercel_provider_attestation_challenge(jsonb)',
                'EXECUTE'
              ),
              pg_catalog.has_function_privilege(
                'authenticated',
                'public.begin_production_vercel_writer_quiesce_evidence(jsonb)',
                'EXECUTE'
              ),
              pg_catalog.has_function_privilege(
                'service_role',
                'public.consume_production_vercel_provider_attestation_challenge(jsonb)',
                'EXECUTE'
              ),
              consume_function.prosecdef,
              consume_function.proconfig @> array['search_path=pg_catalog'],
              pg_catalog.has_function_privilege(
                'service_role',
                'production_control.expected_vercel_quiesce_probe_vectors_v3()',
                'EXECUTE'
              ),
              vectors_function.prosecdef,
              vectors_function.proconfig @> array['search_path=pg_catalog']
            )
            from pg_catalog.pg_class quiesce_table
            cross join pg_catalog.pg_class attestation_table
            cross join pg_catalog.pg_proc consume_function
            cross join pg_catalog.pg_proc vectors_function
            where quiesce_table.oid =
                'production_control.vercel_writer_quiesce_evidence'::pg_catalog.regclass
              and attestation_table.oid =
                'production_control.vercel_provider_attestations'::pg_catalog.regclass
              and consume_function.oid =
                'public.consume_production_vercel_provider_attestation_challenge(jsonb)'::pg_catalog.regprocedure
              and vectors_function.oid =
                'production_control.expected_vercel_quiesce_probe_vectors_v3()'::pg_catalog.regprocedure;
          `).trim(), "t|t|f|f|t|f|f|t|t|t|f|t|t");

          assert.equal(psql(cluster, database, `
            select pg_catalog.concat_ws(
              '|',
              pg_catalog.has_function_privilege(
                'anon',
                'public.inspect_production_vercel_provider_challenge_abandonment(jsonb)',
                'EXECUTE'
              ),
              pg_catalog.has_function_privilege(
                'authenticated',
                'public.inspect_production_vercel_provider_challenge_abandonment(jsonb)',
                'EXECUTE'
              ),
              pg_catalog.has_function_privilege(
                'service_role',
                'public.inspect_production_vercel_provider_challenge_abandonment(jsonb)',
                'EXECUTE'
              ),
              inspect_function.prosecdef,
              inspect_function.proconfig @> array['search_path=pg_catalog'],
              pg_catalog.has_function_privilege(
                'service_role',
                'public.inspect_production_vercel_provider_attestation_challenge_abandonment(jsonb)',
                'EXECUTE'
              )
            )
            from pg_catalog.pg_proc inspect_function
            where inspect_function.oid =
              'public.inspect_production_vercel_provider_challenge_abandonment(jsonb)'::pg_catalog.regprocedure;
          `).trim(), "f|f|t|t|t|f");

          const candidate = retainedV3CandidateIdentity;
          const evidenceRequestId = randomUUID();
          const beginInput = {
            ...scope,
            actor_id: actor,
            purpose: "REHEARSAL",
            evidence_request_id: evidenceRequestId,
            prior_evidence_id: undefined,
            request_fingerprint: fingerprint("migration-039-begin"),
            candidate_deployment_id: candidate.deploymentId,
            candidate_deployment_commit: candidate.commit,
            candidate_deployment_target: "PREVIEW",
            candidate_credential_generation: candidate.credentialGeneration,
            main_branch_alias_origin: candidate.mainBranchAliasOrigin,
            candidate_alias_origin: candidate.aliasOrigin,
            candidate_immutable_origin: candidate.immutableOrigin,
            vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
            routing_rule_id: "step11_6_pg17_writer_quiesce_v3",
            routing_rule_revision: "revision-v3",
            routing_rule_scope:
              "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
            origin_inventory: originInventoryV3,
            live_origin_inventory: originInventoryV3,
            first_probe_records: quiesceProbeRecordsV3(),
            authenticated_actor_fingerprint:
              fingerprint("authenticated-operator"),
            owner_principal_fingerprint:
              fingerprint("production-workbook-owner"),
            owner_override_operationally_frozen: true,
            owner_freeze_ttl_seconds: 1800,
            ...providerInventoryBindingV3,
            ...credentialConfinementV2,
          };
          const reserveV3 = (
            stage,
            label,
            receiptInput,
            { returnDetails = false, issued = null } = {},
          ) => {
            const issueInput = issued?.issueInput || {
              ...providerChallengeIssueInput(
                receiptInput,
                stage,
                label,
              ),
              candidate_alias_origin: candidate.aliasOrigin,
              candidate_immutable_origin: candidate.immutableOrigin,
            };
            const challenge = issued?.challenge || rpc(
              cluster, database,
              "issue_production_vercel_provider_attestation_challenge",
              issueInput,
            );
            const attestation = providerAttestation(stage, label, {
              purpose: "REHEARSAL",
              target: "PREVIEW",
              liveInventory: originInventoryV3,
              challengeId: challenge.challenge_id,
              challengeRequestFingerprint:
                challenge.challenge_request_fingerprint,
              operationRequestId: issueInput.operation_request_id,
              candidate_deployment_id: candidate.deploymentId,
              candidate_deployment_commit: candidate.commit,
              candidate_deployment_target: "PREVIEW",
              routing_rule_id: beginInput.routing_rule_id,
              routing_rule_config_version: beginInput.routing_rule_revision,
              ...providerInventoryBindingV3,
              ...credentialConfinementV2,
            });
            const consumeInput = {
                ...scope,
                actor_id: actor,
                authenticated_actor_fingerprint:
                  fingerprint("authenticated-operator"),
                consume_request_id: randomUUID(),
                request_fingerprint: fingerprint(`${label}-consume`),
                challenge_id: challenge.challenge_id,
                challenge_request_id: issueInput.challenge_request_id,
                operation_request_id: issueInput.operation_request_id,
                evidence_request_id: receiptInput.evidence_request_id,
                purpose: "REHEARSAL",
                stage,
                candidate_deployment_id: candidate.deploymentId,
                candidate_deployment_commit: candidate.commit,
                candidate_deployment_target: "PREVIEW",
                origin_inventory: originInventoryV3,
                live_origin_inventory: originInventoryV3,
                provider_inventory_schema:
                  providerInventoryBindingV3.provider_inventory_schema,
                retained_provider_inventory_count: 1291,
                retained_provider_inventory_fingerprint:
                  providerInventoryV3Fingerprint,
                live_provider_inventory_count: 1291,
                live_provider_inventory_fingerprint:
                  providerInventoryV3Fingerprint,
                provider_attestation: attestation,
            };
            const reserved = rpc(
              cluster,
              database,
              "consume_production_vercel_provider_attestation_challenge",
              consumeInput,
            );
            assert.equal(reserved.provider_inventory_schema,
              "step11-6-production-origin-inventory-v3");
            assert.equal(Number(reserved.retained_origin_inventory_count), 1291);
            assert.equal(Number(reserved.retained_provider_inventory_count), 1291);
            assert.equal(Number(
              reserved.routing_rule_all_method_fence_required_host_count,
            ), 8);
            assert.equal(Number(
              reserved.routing_rule_all_method_fence_required_path_count,
            ), 1);
            const binding = {
              attestation_id: reserved.attestation_id,
              attestation_fingerprint: reserved.attestation_fingerprint,
            };
            return returnDetails
              ? { binding, reserved, consumeInput, issueInput, challenge }
              : binding;
          };
          const abandonV3Input = (
            reservation,
            label,
            abandonmentReason,
          ) => providerChallengeAbandonInput(
            reservation.issueInput,
            reservation.challenge,
            label,
            {
              stage: reservation.issueInput.stage,
              abandonment_reason: abandonmentReason,
            },
          );
          const inspectV3Input = (abandonInput) => {
            const {
              abandon_request_id: _abandonRequestId,
              request_fingerprint: _requestFingerprint,
              abandonment_reason: _abandonmentReason,
              ...inspectionInput
            } = abandonInput;
            return inspectionInput;
          };

          assert.deepEqual(JSON.parse(psql(cluster, database, `
            select production_control.expected_vercel_quiesce_probe_vectors_v3()::text;
          `).trim()), probeVectorsV3.map((value) => [
            value.probeMethod,
            value.probePath,
          ]));

          assert.doesNotThrow(() => assertExactLiveOriginInventory(
            cluster,
            database,
            originInventoryV3,
            {
              candidateDeploymentId: "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
              candidateDeploymentCommit:
                "561a61946be3536c7e32b46be53e4683cbb45579",
              candidateImmutableOrigin:
                "https://bagger-drmix94o0-sandbagger-invitational.vercel.app",
              candidateDeploymentTarget: "PRODUCTION",
              retainedInventory: originInventoryV3,
            },
          ));

          const cutoverCandidate = {
            deploymentId: "dpl_PostgresAdmission039Cutover",
            commit: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
            immutableOrigin:
              "https://bagger-step11-6-cutover-sandbagger-invitational.vercel.app",
          };
          const cutoverTuple = [
            cutoverCandidate.deploymentId,
            cutoverCandidate.commit,
            cutoverCandidate.immutableOrigin,
            "CUTOVER_PRODUCTION_CANDIDATE",
            "READY",
            fingerprint("migration-039-cutover-provider-metadata"),
          ];
          const cutoverLiveInventory = sortLiveOriginInventory([
            ...originInventoryV3,
            cutoverTuple,
          ]);
          assert.doesNotThrow(() => assertExactLiveOriginInventory(
            cluster,
            database,
            cutoverLiveInventory,
            {
              candidateDeploymentId: cutoverCandidate.deploymentId,
              candidateDeploymentCommit: cutoverCandidate.commit,
              candidateImmutableOrigin: cutoverCandidate.immutableOrigin,
              candidateDeploymentTarget: "PRODUCTION",
              retainedInventory: originInventoryV3,
            },
          ));
          const wrongCutoverScope = sortLiveOriginInventory([
            ...originInventoryV3,
            [
              ...cutoverTuple.slice(0, 3),
              "PRODUCTION_TARGET",
              ...cutoverTuple.slice(4),
            ],
          ]);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              wrongCutoverScope,
              {
                candidateDeploymentId: cutoverCandidate.deploymentId,
                candidateDeploymentCommit: cutoverCandidate.commit,
                candidateImmutableOrigin: cutoverCandidate.immutableOrigin,
                candidateDeploymentTarget: "PRODUCTION",
                retainedInventory: originInventoryV3,
              },
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );

          const staleBeginInput = {
            ...beginInput,
            evidence_request_id: randomUUID(),
            request_fingerprint: fingerprint("migration-039-stale-bind-begin"),
            first_probe_records: quiesceProbeRecordsV3(),
          };
          staleBeginInput.provider_attestation = reserveV3(
            "BEGIN",
            "migration-039-stale-bind-provider",
            staleBeginInput,
          );
          psql(cluster, database, `
            update production_control.vercel_provider_attestations
            set provider_observed_at = pg_catalog.now() - interval '121 seconds'
            where attestation_id =
              ${sqlLiteral(staleBeginInput.provider_attestation.attestation_id)}::uuid;
          `);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_vercel_writer_quiesce_evidence",
              staleBeginInput,
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BIND_STALE/,
          );

          const recoverableBeginInput = {
            ...beginInput,
            evidence_request_id: randomUUID(),
            request_fingerprint: fingerprint(
              "migration-039-consumed-unbound-begin",
            ),
            first_probe_records: quiesceProbeRecordsV3(),
          };
          const recoverableBegin = reserveV3(
            "BEGIN",
            "migration-039-consumed-unbound-begin",
            recoverableBeginInput,
            { returnDetails: true },
          );
          const freshBeginAbandon = abandonV3Input(
            recoverableBegin,
            "migration-039-fresh-consumed-begin",
            "EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED",
          );
          const freshBeginInspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_challenge_abandonment",
            inspectV3Input(freshBeginAbandon),
          );
          assert.equal(
            freshBeginInspection.abandonment_code,
            "CONSUMED_UNBOUND_NOT_EXPIRED",
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "abandon_production_vercel_provider_attestation_challenge",
              freshBeginAbandon,
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BINDING_NOT_EXPIRED/,
          );
          psql(cluster, database, `
            update production_control.vercel_provider_attestations
            set provider_observed_at = pg_catalog.now() - interval '121 seconds'
            where attestation_id =
              ${sqlLiteral(recoverableBegin.reserved.attestation_id)}::uuid;
          `);
          const abandonRecoverableBegin = abandonV3Input(
            recoverableBegin,
            "migration-039-consumed-unbound-begin",
            "EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED",
          );
          const recoverableBeginInspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_challenge_abandonment",
            inspectV3Input(abandonRecoverableBegin),
          );
          assert.equal(
            recoverableBeginInspection.abandonment_code,
            "ELIGIBLE_CONSUMED_UNBOUND",
          );
          assert.equal(recoverableBeginInspection.abandon_eligible, true);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "abandon_production_vercel_provider_attestation_challenge",
              {
                ...abandonRecoverableBegin,
                abandonment_reason:
                  "EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED",
              },
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_REASON_MISMATCH/,
          );
          const abandonedBegin = rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            abandonRecoverableBegin,
          );
          assert.equal(abandonedBegin.status, "ABANDONED");
          assert.equal(abandonedBegin.abandonment_reason,
            "EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED");
          assert.equal(
            abandonedBegin.consumed_attestation_id,
            recoverableBegin.reserved.attestation_id,
          );
          assert.equal(
            abandonedBegin.consumed_provider_attestation.status,
            "ABANDONED",
          );
          assert.ok(abandonedBegin.consumed_provider_attestation.abandoned_at);
          const abandonedBeginReplay = rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            abandonRecoverableBegin,
          );
          assert.equal(abandonedBeginReplay.idempotent, true);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "consume_production_vercel_provider_attestation_challenge",
              recoverableBegin.consumeInput,
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED_TERMINAL/,
          );
          assertCommandFailure(
            () => psql(cluster, database, `
              update production_control.vercel_provider_attestations
              set abandoned_at = abandoned_at
              where attestation_id =
                ${sqlLiteral(recoverableBegin.reserved.attestation_id)}::uuid;
            `),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_ABANDONED_TERMINAL/,
          );
          const replacementBeginInput = {
            ...beginInput,
            evidence_request_id: randomUUID(),
            request_fingerprint: fingerprint(
              "migration-039-replacement-begin-receipt",
            ),
          };
          const replacementBeginIssue = {
            ...providerChallengeIssueInput(
              replacementBeginInput,
              "BEGIN",
              "migration-039-replacement-begin",
            ),
            candidate_alias_origin: candidate.aliasOrigin,
            candidate_immutable_origin: candidate.immutableOrigin,
          };
          const replacementBeginChallenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            replacementBeginIssue,
          );
          assert.equal(replacementBeginChallenge.status, "ISSUED");
          assert.notEqual(
            replacementBeginChallenge.evidence_request_id,
            recoverableBegin.challenge.evidence_request_id,
          );

          const boundBeginReservation = reserveV3(
            "BEGIN",
            "migration-039-begin-provider",
            beginInput,
            { returnDetails: true },
          );
          beginInput.provider_attestation = boundBeginReservation.binding;
          const draining = rpc(
            cluster,
            database,
            "begin_production_vercel_writer_quiesce_evidence",
            beginInput,
          );
          assert.equal(draining.status, "DRAINING");
          assert.equal(draining.provider_inventory_schema,
            "step11-6-production-origin-inventory-v3");
          assert.equal(Number(draining.retained_provider_inventory_count), 1291);
          assert.equal(draining.retained_provider_inventory_fingerprint,
            providerInventoryV3Fingerprint);
          assert.equal(Number(draining.probe_vector_count), 11);
          assert.equal(Number(draining.probe_record_count), 1296 * 11);
          assert.equal(Number(
            draining.routing_rule_all_method_fence_required_path_count,
          ), 1);

          const boundBeginAbandon = abandonV3Input(
            boundBeginReservation,
            "migration-039-bound-begin",
            "EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED",
          );
          const boundBeginInspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_challenge_abandonment",
            inspectV3Input(boundBeginAbandon),
          );
          assert.equal(boundBeginInspection.abandonment_code, "BOUND");
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "abandon_production_vercel_provider_attestation_challenge",
              boundBeginAbandon,
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BOUND_ABANDON_FORBIDDEN/,
          );

          backdateQuiesceDrain(cluster, database, draining.evidence_id);
          const finalizeInput = {
            ...beginInput,
            evidence_id: draining.evidence_id,
            request_fingerprint: fingerprint("migration-039-finalize"),
            second_probe_records: quiesceProbeRecordsV3(),
          };
          delete finalizeInput.first_probe_records;
          delete finalizeInput.owner_principal_fingerprint;
          delete finalizeInput.owner_override_operationally_frozen;
          delete finalizeInput.owner_freeze_ttl_seconds;

          const issuedFinalizeInput = {
            ...providerChallengeIssueInput(
              finalizeInput,
              "FINALIZE",
              "migration-039-expired-issued-finalize",
            ),
            candidate_alias_origin: candidate.aliasOrigin,
            candidate_immutable_origin: candidate.immutableOrigin,
          };
          const issuedFinalizeChallenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issuedFinalizeInput,
          );
          expireProviderChallenge(
            cluster,
            database,
            issuedFinalizeChallenge.challenge_id,
          );
          const issuedFinalizeAbandon = abandonV3Input(
            {
              issueInput: issuedFinalizeInput,
              challenge: issuedFinalizeChallenge,
            },
            "migration-039-expired-issued-finalize",
            "EXPIRED_UNCONSUMED_FINALIZE_SUPERSEDED",
          );
          const issuedFinalizeInspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_challenge_abandonment",
            inspectV3Input(issuedFinalizeAbandon),
          );
          assert.equal(issuedFinalizeInspection.abandonment_code, "ELIGIBLE");
          assert.equal(issuedFinalizeInspection.abandon_eligible, true);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "abandon_production_vercel_provider_attestation_challenge",
              {
                ...issuedFinalizeAbandon,
                abandonment_reason:
                  "EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED",
              },
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_REASON_MISMATCH/,
          );
          const abandonedIssuedFinalize = rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            issuedFinalizeAbandon,
          );
          assert.equal(abandonedIssuedFinalize.status, "ABANDONED");
          assert.equal(abandonedIssuedFinalize.consumed_attestation_id, null);
          assert.equal(abandonedIssuedFinalize.abandonment_reason,
            "EXPIRED_UNCONSUMED_FINALIZE_SUPERSEDED");

          const recoverableFinalize = reserveV3(
            "FINALIZE",
            "migration-039-consumed-unbound-finalize",
            finalizeInput,
            { returnDetails: true },
          );
          psql(cluster, database, `
            update production_control.vercel_provider_attestations
            set provider_observed_at = pg_catalog.now() - interval '121 seconds'
            where attestation_id =
              ${sqlLiteral(recoverableFinalize.reserved.attestation_id)}::uuid;
          `);
          const recoverableFinalizeAbandon = abandonV3Input(
            recoverableFinalize,
            "migration-039-consumed-unbound-finalize",
            "EXPIRED_CONSUMED_UNBOUND_PROVIDER_ATTESTATION_SUPERSEDED",
          );
          const recoverableFinalizeInspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_challenge_abandonment",
            inspectV3Input(recoverableFinalizeAbandon),
          );
          assert.equal(
            recoverableFinalizeInspection.abandonment_code,
            "ELIGIBLE_CONSUMED_UNBOUND",
          );
          const abandonedFinalize = rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            recoverableFinalizeAbandon,
          );
          assert.equal(abandonedFinalize.status, "ABANDONED");
          assert.equal(
            abandonedFinalize.consumed_provider_attestation.status,
            "ABANDONED",
          );
          assert.equal(psql(cluster, database, `
            select status || '|' ||
              (finalize_request_fingerprint is null)::text || '|' ||
              (finalize_payload_hash is null)::text
            from production_control.vercel_writer_quiesce_evidence
            where evidence_id = ${sqlLiteral(draining.evidence_id)}::uuid;
          `), "DRAINING|true|true");

          const finalReservation = reserveV3(
            "FINALIZE",
            "migration-039-finalize-provider",
            finalizeInput,
            { returnDetails: true },
          );
          finalizeInput.provider_attestation = finalReservation.binding;
          for (const [label, overrides] of [
            ["purpose", { purpose: "CUTOVER" }],
            ["main-alias", {
              main_branch_alias_origin:
                "https://migration-039-main-drift.vercel.app",
            }],
            ["candidate-alias", {
              candidate_alias_origin:
                "https://migration-039-candidate-drift.vercel.app",
            }],
            ["candidate-immutable", {
              candidate_immutable_origin:
                "https://migration-039-immutable-drift.vercel.app",
            }],
            ["credential-generation", {
              candidate_credential_generation:
                "DEDICATED_PRODUCTION_GOOGLE_SERVICE_ACCOUNT_V2",
            }],
            ["live-inventory", { live_origin_inventory: [] }],
          ]) {
            assert.ok(label);
            assertCommandFailure(
              () => rpc(
                cluster,
                database,
                "finalize_production_vercel_writer_quiesce_evidence",
                { ...finalizeInput, ...overrides },
              ),
              /PRODUCTION_VERCEL_WRITER_QUIESCE_(DRAIN_NOT_SAFE|FINALIZE_INPUT_INVALID)/,
            );
          }
          for (const [mutateSql, restoreSql] of [
            [
              "purpose = 'CUTOVER', candidate_deployment_target = 'PRODUCTION'",
              "purpose = 'REHEARSAL', candidate_deployment_target = 'PREVIEW'",
            ],
            [
              "candidate_alias_origin = 'https://migration-039-bind-alias-drift.vercel.app'",
              `candidate_alias_origin = ${sqlLiteral(candidate.aliasOrigin)}`,
            ],
            [
              "candidate_immutable_origin = 'https://migration-039-bind-immutable-drift.vercel.app'",
              `candidate_immutable_origin = ${sqlLiteral(candidate.immutableOrigin)}`,
            ],
          ]) {
            psql(cluster, database, `
              update production_control.vercel_provider_attestation_challenges
              set ${mutateSql}
              where challenge_id =
                ${sqlLiteral(finalReservation.challenge.challenge_id)}::uuid;
            `);
            assertCommandFailure(
              () => rpc(
                cluster,
                database,
                "finalize_production_vercel_writer_quiesce_evidence",
                finalizeInput,
              ),
              /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_BIND_SCOPE_MISMATCH/,
            );
            psql(cluster, database, `
              update production_control.vercel_provider_attestation_challenges
              set ${restoreSql}
              where challenge_id =
                ${sqlLiteral(finalReservation.challenge.challenge_id)}::uuid;
            `);
          }
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finalize_production_vercel_writer_quiesce_evidence",
              { ...finalizeInput, actor_id: `${actor}-changed` },
            ),
            /PRODUCTION_VERCEL_WRITER_QUIESCE_FINALIZE_ACTOR_MISMATCH/,
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finalize_production_vercel_writer_quiesce_evidence",
              {
                ...finalizeInput,
                authenticated_actor_fingerprint:
                  fingerprint("different-authenticated-operator"),
              },
            ),
            /PRODUCTION_VERCEL_WRITER_QUIESCE_FINALIZE_ACTOR_MISMATCH/,
          );
          const verified = rpc(
            cluster,
            database,
            "finalize_production_vercel_writer_quiesce_evidence",
            finalizeInput,
          );
          assert.equal(verified.status, "VERIFIED");
          assert.equal(verified.live_provider_inventory_fingerprint,
            providerInventoryV3Fingerprint);
          assert.equal(Number(verified.probe_origin_count), 1296);
          assert.equal(Number(verified.probe_vector_count), 11);
          assert.equal(Number(verified.probe_record_count), 1296 * 11);

          psql(cluster, database, `
            update production_control.vercel_provider_attestations
            set provider_observed_at = pg_catalog.now() - interval '1 hour'
            where evidence_id = ${sqlLiteral(draining.evidence_id)}::uuid;
          `);
          const repeatedBegin = rpc(
            cluster,
            database,
            "begin_production_vercel_writer_quiesce_evidence",
            beginInput,
          );
          assert.equal(repeatedBegin.status, "VERIFIED");
          assert.equal(repeatedBegin.idempotent, true);
          const repeatedFinalize = rpc(
            cluster,
            database,
            "finalize_production_vercel_writer_quiesce_evidence",
            finalizeInput,
          );
          assert.equal(repeatedFinalize.status, "VERIFIED");
          assert.equal(repeatedFinalize.idempotent, true);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finalize_production_vercel_writer_quiesce_evidence",
              { ...finalizeInput, actor_id: `${actor}-changed` },
            ),
            /PRODUCTION_VERCEL_WRITER_QUIESCE_FINALIZE_ACTOR_MISMATCH/,
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finalize_production_vercel_writer_quiesce_evidence",
              {
                ...finalizeInput,
                authenticated_actor_fingerprint:
                  fingerprint("different-authenticated-operator"),
              },
            ),
            /PRODUCTION_VERCEL_WRITER_QUIESCE_FINALIZE_ACTOR_MISMATCH/,
          );
          assert.equal(psql(cluster, database, `
            select (production_control.record_verified_vercel_provider_attestation(
              ${sqlLiteral(draining.evidence_id)}::uuid,
              'BEGIN',
              ${sqlLiteral(beginInput.request_fingerprint)},
              ${jsonSql(beginInput.provider_attestation)}
            )).status;
          `).trim(), "BOUND");
          assert.equal(psql(cluster, database, `
            select (production_control.record_verified_vercel_provider_attestation(
              ${sqlLiteral(draining.evidence_id)}::uuid,
              'FINALIZE',
              ${sqlLiteral(finalizeInput.request_fingerprint)},
              ${jsonSql(finalizeInput.provider_attestation)}
            )).status;
          `).trim(), "BOUND");

          const v3OnlyColumns = [
            "provider_inventory_schema",
            "retained_provider_inventory_count",
            "retained_provider_inventory_fingerprint",
            "live_provider_inventory_count",
            "live_provider_inventory_fingerprint",
            "routing_rule_all_method_fence_required_host_count",
            "routing_rule_all_method_fence_required_hosts_fingerprint",
            "routing_rule_all_method_fence_required_path_count",
            "routing_rule_all_method_fence_required_paths_fingerprint",
          ];
          for (const column of v3OnlyColumns) {
            assert.match(column, /^[a-z_]+$/);
            assertCommandFailure(
              () => psql(cluster, database, `
                update production_control.vercel_writer_quiesce_evidence
                set ${column} = null
                where evidence_id = ${sqlLiteral(draining.evidence_id)}::uuid;
              `),
              /production_vercel_quiesce_inventory_contract_check/,
            );
          }
          const attestationV3OnlyColumns = [
            "provider_inventory_schema",
            "retained_origin_inventory_count",
            "retained_origin_inventory_fingerprint",
            "retained_provider_inventory_count",
            "retained_provider_inventory_fingerprint",
            "live_provider_inventory_count",
            "live_provider_inventory_fingerprint",
            "routing_rule_all_method_fence_required_host_count",
            "routing_rule_all_method_fence_required_hosts_fingerprint",
            "routing_rule_all_method_fence_required_path_count",
            "routing_rule_all_method_fence_required_paths_fingerprint",
          ];
          for (const column of attestationV3OnlyColumns) {
            assert.match(column, /^[a-z_]+$/);
            assertCommandFailure(
              () => psql(cluster, database, `
                update production_control.vercel_provider_attestations
                set ${column} = null
                where evidence_id = ${sqlLiteral(draining.evidence_id)}::uuid
                  and stage = 'BEGIN';
              `),
              /production_vercel_provider_attestation_inventory_contract_check/,
            );
          }

          assertCommandFailure(
            () => psql(cluster, database, `
              insert into production_control.vercel_writer_quiesce_evidence
              select (pg_catalog.jsonb_populate_record(
                null::production_control.vercel_writer_quiesce_evidence,
                pg_catalog.to_jsonb(value) || pg_catalog.jsonb_build_object(
                  'evidence_id', ${sqlLiteral(randomUUID())},
                  'prior_evidence_id', null,
                  'evidence_request_id', ${sqlLiteral(randomUUID())},
                  'begin_request_fingerprint',
                    ${sqlLiteral(fingerprint("migration-039-partial-v3-insert"))},
                  'begin_payload_hash',
                    ${sqlLiteral(fingerprint("migration-039-partial-v3-payload"))},
                  'finalize_request_fingerprint', null,
                  'finalize_payload_hash', null,
                  'status', 'DRAINING',
                  'drain_completed_at', null,
                  'verified_at', null,
                  'expires_at', null,
                  'routing_rule_all_method_fence_required_path_count', null
                )
              )).*
              from production_control.vercel_writer_quiesce_evidence value
              where value.evidence_id = ${sqlLiteral(draining.evidence_id)}::uuid;
            `),
            /production_vercel_quiesce_inventory_contract_check/,
          );

          const partialChallengeId = randomUUID();
          const partialChallengeRequestId = randomUUID();
          const partialOperationRequestId = randomUUID();
          const partialEvidenceRequestId = randomUUID();
          const partialChallengeFingerprint = fingerprint(
            "migration-039-partial-v3-challenge",
          );
          psql(cluster, database, `
            insert into production_control.vercel_provider_attestation_challenges
            select (pg_catalog.jsonb_populate_record(
              null::production_control.vercel_provider_attestation_challenges,
              pg_catalog.to_jsonb(value) || pg_catalog.jsonb_build_object(
                'challenge_id', ${sqlLiteral(partialChallengeId)},
                'challenge_request_id',
                  ${sqlLiteral(partialChallengeRequestId)},
                'operation_request_id',
                  ${sqlLiteral(partialOperationRequestId)},
                'evidence_request_id',
                  ${sqlLiteral(partialEvidenceRequestId)},
                'issue_request_fingerprint',
                  ${sqlLiteral(fingerprint("migration-039-partial-v3-issue"))},
                'issue_payload_hash',
                  ${sqlLiteral(fingerprint("migration-039-partial-v3-issue-payload"))},
                'challenge_request_fingerprint',
                  ${sqlLiteral(partialChallengeFingerprint)},
                'status', 'ISSUED',
                'issued_at', pg_catalog.now(),
                'expires_at', pg_catalog.now() + interval '60 seconds',
                'consumed_at', null,
                'consumed_attestation_id', null,
                'consume_request_id', null,
                'consume_request_fingerprint', null,
                'consume_payload_hash', null,
                'created_at', pg_catalog.now(),
                'updated_at', pg_catalog.now()
              )
            )).*
            from production_control.vercel_provider_attestation_challenges value
            where value.challenge_id = (
              select attestation.challenge_id
              from production_control.vercel_provider_attestations attestation
              where attestation.attestation_id =
                ${sqlLiteral(staleBeginInput.provider_attestation.attestation_id)}::uuid
            );
          `);
          assertCommandFailure(
            () => psql(cluster, database, `
              insert into production_control.vercel_provider_attestations
              select (pg_catalog.jsonb_populate_record(
                null::production_control.vercel_provider_attestations,
                pg_catalog.to_jsonb(value) || pg_catalog.jsonb_build_object(
                  'attestation_id', ${sqlLiteral(randomUUID())},
                  'evidence_id', null,
                  'status', 'RESERVED',
                  'attestation_fingerprint',
                    ${sqlLiteral(fingerprint("migration-039-partial-v3-attestation"))},
                  'challenge_id', ${sqlLiteral(partialChallengeId)},
                  'challenge_request_fingerprint',
                    ${sqlLiteral(partialChallengeFingerprint)},
                  'operation_request_id',
                    ${sqlLiteral(partialOperationRequestId)},
                  'evidence_request_id',
                    ${sqlLiteral(partialEvidenceRequestId)},
                  'request_fingerprint',
                    ${sqlLiteral(fingerprint("migration-039-partial-v3-provider-request"))},
                  'receipt_request_fingerprint', null,
                  'routing_rule_all_method_fence_required_path_count', null,
                  'provider_observed_at', pg_catalog.now(),
                  'binding_expires_at', pg_catalog.now() + interval '30 minutes',
                  'bound_at', null,
                  'recorded_at', pg_catalog.now()
                )
              )).*
              from production_control.vercel_provider_attestations value
              where value.attestation_id =
                ${sqlLiteral(staleBeginInput.provider_attestation.attestation_id)}::uuid;
            `),
            /production_vercel_provider_attestation_inventory_contract_check/,
          );
        },
      );

      await t.test(
        "migration 040 upgrades 039 to the exact v4/v4 provider epoch without changing dormant Production authority",
        () => {
          const database = cloneDormantDatabase("migration_040_provider_v4");
          const historicalV1 = certifyQuiesce(
            cluster,
            database,
            "REHEARSAL",
            "migration-040-historical-v1",
          );
          psql(cluster, database, `
            update production_control.vercel_writer_quiesce_evidence
            set owner_acknowledged_at = owner_acknowledged_at - interval '2 hours',
                owner_freeze_expires_at = owner_freeze_expires_at - interval '2 hours',
                drain_started_at = drain_started_at - interval '2 hours',
                drain_completed_at = drain_completed_at - interval '2 hours',
                verified_at = verified_at - interval '2 hours',
                expires_at = expires_at - interval '2 hours',
                created_at = created_at - interval '2 hours',
                updated_at = updated_at - interval '2 hours'
            where evidence_id = ${sqlLiteral(historicalV1.evidence_id)}::uuid;
          `);
          psqlFile(cluster, database, path.join(
            migrationsDirectory,
            "202608260039_production_all_project_provider_inventory_v3.sql",
          ));

          const historicalBefore = psql(cluster, database, `
            select pg_catalog.jsonb_build_object(
              -- Migration 040 adds these nullable link columns without
              -- changing any historical v1 evidence value. Compare the
              -- complete pre-040 row shape rather than schema additions.
              'quiesce', pg_catalog.to_jsonb(quiesce) - array[
                'critical_waf_epoch_id',
                'critical_waf_observation_id',
                'critical_waf_quiesce_stage'
              ],
              'attestations', (
                select pg_catalog.jsonb_agg(
                  pg_catalog.to_jsonb(attestation)
                  order by attestation.stage
                )
                from production_control.vercel_provider_attestations attestation
                where attestation.evidence_id = quiesce.evidence_id
              )
            )::text
            from production_control.vercel_writer_quiesce_evidence quiesce
            where quiesce.evidence_id =
              ${sqlLiteral(historicalV1.evidence_id)}::uuid;
          `);
          const functionOidsBefore = psql(cluster, database, `
            select pg_catalog.concat_ws(
              ',',
              'production_control.assert_exact_vercel_origin_inventory(jsonb)'::pg_catalog.regprocedure::oid,
              'production_control.assert_exact_vercel_live_inventory(jsonb,jsonb,text,text,text,text)'::pg_catalog.regprocedure::oid,
              'production_control.assert_current_provider_inventory_v3(jsonb,boolean,boolean)'::pg_catalog.regprocedure::oid
            );
          `).trim();

          psqlFile(cluster, database, path.join(
            migrationsDirectory,
            "202608260040_production_provider_inventory_recertification_v4.sql",
          ));

          assert.equal(psql(cluster, database, `
            select pg_catalog.jsonb_build_object(
              'quiesce', pg_catalog.to_jsonb(quiesce) - array[
                'critical_waf_epoch_id',
                'critical_waf_observation_id',
                'critical_waf_quiesce_stage'
              ],
              'attestations', (
                select pg_catalog.jsonb_agg(
                  pg_catalog.to_jsonb(attestation)
                  order by attestation.stage
                )
                from production_control.vercel_provider_attestations attestation
                where attestation.evidence_id = quiesce.evidence_id
              )
            )::text
            from production_control.vercel_writer_quiesce_evidence quiesce
            where quiesce.evidence_id =
              ${sqlLiteral(historicalV1.evidence_id)}::uuid;
          `), historicalBefore, "migration 040 must not rewrite v1 audit evidence");
          assert.equal(psql(cluster, database, `
            select pg_catalog.concat_ws(
              '|',
              (
                select pg_catalog.count(*)
                from information_schema.columns value
                where value.table_schema = 'production_control'
                  and value.table_name in (
                    'vercel_writer_quiesce_evidence',
                    'vercel_provider_attestation_challenges',
                    'vercel_provider_attestations'
                  )
                  and value.column_name in (
                    'routing_rule_hostname_operator',
                    'routing_rule_canonical_hostname',
                    'routing_rule_earlier_active_bypass_rule_count'
                  )
              ),
              pg_catalog.has_table_privilege(
                'service_role',
                'production_control.vercel_routing_rule_audit_bindings',
                'SELECT,INSERT,UPDATE,DELETE'
              ),
              pg_catalog.has_function_privilege(
                'service_role',
                'production_control.bind_current_vercel_routing_rule_audit(text,uuid,boolean,jsonb)',
                'EXECUTE'
              ),
              binder.prosecdef,
              binder.proconfig @> array['search_path=pg_catalog'],
              guard.prosecdef,
              guard.proconfig @> array['search_path=pg_catalog']
            )
            from pg_catalog.pg_proc binder
            cross join pg_catalog.pg_proc guard
            where binder.oid =
              'production_control.bind_current_vercel_routing_rule_audit(text,uuid,boolean,jsonb)'::pg_catalog.regprocedure
              and guard.oid =
              'production_control.guard_vercel_routing_rule_audit_binding()'::pg_catalog.regprocedure;
          `).trim(), "0|f|f|t|t|t|t");
          assert.equal(psql(cluster, database, `
            select pg_catalog.concat_ws(
              ',',
              'production_control.assert_exact_vercel_origin_inventory(jsonb)'::pg_catalog.regprocedure::oid,
              'production_control.assert_exact_vercel_live_inventory(jsonb,jsonb,text,text,text,text)'::pg_catalog.regprocedure::oid,
              'production_control.assert_current_provider_inventory_v3(jsonb,boolean,boolean)'::pg_catalog.regprocedure::oid
            );
          `).trim(), functionOidsBefore,
          "migration 040 must replace migration039 runtime assertions in place");

          assert.equal(psql(cluster, database, `
            select pg_catalog.concat_ws(
              '|',
              activation.state,
              activation.current_authority,
              resource.participant_identity_authority,
              gate.admission_state,
              gate.state,
              activation.scoring_ingress_enabled,
              resource.workers_enabled,
              gate.admission_protocol_enforced,
              activation.first_supabase_write_possible_at is not null,
              activation.first_supabase_write_observed_at is not null,
              gate.provider_principal_fingerprint is null
            )
            from production_control.cutover_activation_state activation
            cross join production_control.resource_scope resource
            cross join scoring_authority.ingress_gates gate
            where activation.scope_key = 'BAGGER_INV_PRODUCTION'
              and resource.scope_key = 'BAGGER_INV_PRODUCTION'
              and gate.tournament_id = '2026';
          `).trim(), "DORMANT|GOOGLE|PASSPORT|OPEN|PAUSED|f|f|f|f|f|t");

          assert.doesNotThrow(() => psql(cluster, database, `
            select production_control.assert_current_provider_inventory_v4(
              ${jsonSql({
                ...providerInventoryBindingV4,
                ...credentialConfinementV4,
              })}, true, true
            );
            select production_control.assert_current_provider_inventory_v3(
              ${jsonSql({
                ...providerInventoryBindingV4,
                ...credentialConfinementV4,
              })}, true, true
            );
          `));
          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_current_provider_inventory_v3(
                ${jsonSql({
                  ...providerInventoryBindingV3,
                  ...credentialConfinementV2,
                })}, true, true
              );
            `),
            /PRODUCTION_PROVIDER_INVENTORY_V4_BINDING_MISMATCH/,
          );
          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_current_provider_inventory_v3(
                ${jsonSql({
                  ...providerInventoryBindingV4,
                  ...credentialConfinementV3,
                })}, true, true
              );
            `),
            /PRODUCTION_PROVIDER_INVENTORY_V4_BINDING_MISMATCH/,
          );

          const exactInventoryCases = [
            {
              label: "retained preview +0",
              live: originInventoryV4,
              id: "dpl_Bb75GADMcDdvVhQbrBb1e9dKp8Bm",
              commit: "0671bb3b84ac5846218ea60838fe4e1cc07de97f",
              origin:
                "https://bagger-6lfjugfk7-sandbagger-invitational.vercel.app",
              target: "PREVIEW",
            },
          ];
          for (const inventoryCase of exactInventoryCases) {
            assert.ok(inventoryCase.label);
            assert.doesNotThrow(() => assertExactLiveOriginInventory(
              cluster,
              database,
              inventoryCase.live,
              {
                candidateDeploymentId: inventoryCase.id,
                candidateDeploymentCommit: inventoryCase.commit,
                candidateImmutableOrigin: inventoryCase.origin,
                candidateDeploymentTarget: inventoryCase.target,
                retainedInventory: originInventoryV4,
              },
            ));
          }

          const dynamicPreview = [
            "dpl_PostgresAdmission040Preview",
            "1234512345123451234512345123451234512345",
            "https://bagger-migration-040-preview.vercel.app",
            "PROJECT_PREVIEW",
            "READY",
            fingerprint("migration-040-dynamic-preview-metadata"),
          ];
          const dynamicProduction = [
            "dpl_PostgresAdmission040Production",
            "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
            "https://bagger-migration-040-production.vercel.app",
            "PRODUCTION_TARGET",
            "READY",
            fingerprint("migration-040-dynamic-production-metadata"),
          ];
          const assertDynamic = (tuple, target) =>
            assertExactLiveOriginInventory(
              cluster,
              database,
              sortLiveOriginInventory([...originInventoryV4, tuple]),
              {
                candidateDeploymentId: tuple[0],
                candidateDeploymentCommit: tuple[1],
                candidateImmutableOrigin: tuple[2],
                candidateDeploymentTarget: target,
                retainedInventory: originInventoryV4,
              },
            );
          assert.doesNotThrow(() => assertDynamic(dynamicPreview, "PREVIEW"));
          assertCommandFailure(
            () => assertDynamic(dynamicProduction, "PRODUCTION"),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_INPUT_INVALID/,
          );
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              originInventoryV4,
              {
                candidateDeploymentId:
                  "dpl_5uQB4VBY3FEgWHTS5vZYU2J9rmM2",
                candidateDeploymentCommit:
                  "561a61946be3536c7e32b46be53e4683cbb45579",
                candidateImmutableOrigin:
                  "https://bagger-drmix94o0-sandbagger-invitational.vercel.app",
                candidateDeploymentTarget: "PRODUCTION",
                retainedInventory: originInventoryV4,
              },
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_INPUT_INVALID/,
          );

          const unrelated = [
            "dpl_PostgresAdmission040Unrelated",
            "9999999999999999999999999999999999999999",
            "https://bagger-migration-040-unrelated.vercel.app",
            "PROJECT_PREVIEW",
            "READY",
            fingerprint("migration-040-unrelated-metadata"),
          ];
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              sortLiveOriginInventory([
                ...originInventoryV4,
                dynamicPreview,
                unrelated,
              ]),
              {
                candidateDeploymentId: dynamicPreview[0],
                candidateDeploymentCommit: dynamicPreview[1],
                candidateImmutableOrigin: dynamicPreview[2],
                candidateDeploymentTarget: "PREVIEW",
                retainedInventory: originInventoryV4,
              },
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              originInventoryV4.slice(1),
              {
                candidateDeploymentId: dynamicPreview[0],
                candidateDeploymentCommit: dynamicPreview[1],
                candidateImmutableOrigin: dynamicPreview[2],
                candidateDeploymentTarget: "PREVIEW",
                retainedInventory: originInventoryV4.slice(1),
              },
            ),
            /PRODUCTION_VERCEL_ORIGIN_INVENTORY_MISMATCH/,
          );
          const driftedRetained = originInventoryV4.map((tuple, index) =>
            index === 0
              ? [...tuple.slice(0, 4), "ERROR", ...tuple.slice(5)]
              : tuple
          );
          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_exact_vercel_origin_inventory(
                ${jsonSql(sortLiveOriginInventory(driftedRetained))}
              );
            `),
            /PRODUCTION_VERCEL_ORIGIN_INVENTORY_MISMATCH/,
          );
          const duplicateDeployment = [
            dynamicPreview[0],
            dynamicPreview[1],
            originInventoryV4[0][2],
            dynamicPreview[3],
            dynamicPreview[4],
            dynamicPreview[5],
          ];
          const duplicateId = [
            originInventoryV4[0][0],
            dynamicPreview[1],
            dynamicPreview[2],
            dynamicPreview[3],
            dynamicPreview[4],
            dynamicPreview[5],
          ];
          for (const tuple of [duplicateDeployment, duplicateId]) {
            assertCommandFailure(
              () => assertDynamic(tuple, "PREVIEW"),
              /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
            );
          }
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              sortLiveOriginInventory([...originInventoryV4, dynamicProduction]),
              {
                candidateDeploymentId: dynamicProduction[0],
                candidateDeploymentCommit: dynamicProduction[1],
                candidateImmutableOrigin: dynamicProduction[2],
                candidateDeploymentTarget: null,
                retainedInventory: originInventoryV4,
              },
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_INPUT_INVALID/,
          );
          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_current_provider_inventory_v4(
                ${jsonSql({
                  ...providerInventoryBindingV4,
                  ...credentialConfinementV4,
                })}, null, true
              );
            `),
            /PRODUCTION_PROVIDER_INVENTORY_V4_BINDING_MISMATCH/,
          );

          const historicalV3Id = randomUUID();
          psql(cluster, database, `
            insert into production_control.vercel_writer_quiesce_evidence
            select (pg_catalog.jsonb_populate_record(
              null::production_control.vercel_writer_quiesce_evidence,
              pg_catalog.to_jsonb(value) || pg_catalog.jsonb_build_object(
                'evidence_id', ${sqlLiteral(historicalV3Id)},
                'evidence_request_id', ${sqlLiteral(randomUUID())},
                'begin_request_fingerprint',
                  ${sqlLiteral(fingerprint("migration-040-v3-begin-request"))},
                'begin_payload_hash',
                  ${sqlLiteral(fingerprint("migration-040-v3-begin-payload"))},
                'finalize_request_fingerprint',
                  ${sqlLiteral(fingerprint("migration-040-v3-finalize-request"))},
                'finalize_payload_hash',
                  ${sqlLiteral(fingerprint("migration-040-v3-finalize-payload"))},
                'origin_inventory', ${jsonSql(originInventoryV3)},
                'origin_inventory_count', 1291,
                'origin_inventory_fingerprint',
                  ${sqlLiteral(originInventoryV3Fingerprint)},
                'live_origin_inventory', ${jsonSql(originInventoryV3)},
                'live_origin_inventory_count', 1291,
                'live_origin_inventory_fingerprint',
                  ${sqlLiteral(originInventoryV3Fingerprint)},
                'provider_inventory_schema',
                  'step11-6-production-origin-inventory-v3',
                'retained_provider_inventory_count', 1291,
                'retained_provider_inventory_fingerprint',
                  ${sqlLiteral(providerInventoryV3Fingerprint)},
                'live_provider_inventory_count', 1291,
                'live_provider_inventory_fingerprint',
                  ${sqlLiteral(providerInventoryV3Fingerprint)},
                'routing_rule_all_method_fence_required_host_count', 8,
                'routing_rule_all_method_fence_required_hosts_fingerprint',
                  ${sqlLiteral(providerInventoryBindingV3.routing_rule_all_method_fence_required_hosts_fingerprint)},
                'routing_rule_all_method_fence_required_path_count', 1,
                'routing_rule_all_method_fence_required_paths_fingerprint',
                  ${sqlLiteral(providerInventoryBindingV3.routing_rule_all_method_fence_required_paths_fingerprint)},
                'credential_confinement_evidence_schema',
                  'step11-6-production-google-credential-confinement-v2',
                'credential_confinement_record_count', 1291,
                'credential_confinement_records_fingerprint',
                  ${sqlLiteral(credentialConfinementV2.credential_confinement_records_fingerprint)},
                'credential_confinement_evidence_fingerprint',
                  ${sqlLiteral(credentialConfinementV2.credential_confinement_evidence_fingerprint)}
              )
            )).*
            from production_control.vercel_writer_quiesce_evidence value
            where value.evidence_id =
              ${sqlLiteral(historicalV1.evidence_id)}::uuid;
          `);
          assert.equal(psql(cluster, database, `
            select provider_inventory_schema || '|' ||
              credential_confinement_evidence_schema
            from production_control.vercel_writer_quiesce_evidence
            where evidence_id = ${sqlLiteral(historicalV3Id)}::uuid;
          `), "step11-6-production-origin-inventory-v3|step11-6-production-google-credential-confinement-v2");

          const v4EvidenceId = randomUUID();
          psql(cluster, database, `
            insert into production_control.vercel_writer_quiesce_evidence
            select (pg_catalog.jsonb_populate_record(
              null::production_control.vercel_writer_quiesce_evidence,
              pg_catalog.to_jsonb(value) || pg_catalog.jsonb_build_object(
                'evidence_id', ${sqlLiteral(v4EvidenceId)},
                'evidence_request_id', ${sqlLiteral(randomUUID())},
                'begin_request_fingerprint',
                  ${sqlLiteral(fingerprint("migration-040-v4-begin-request"))},
                'begin_payload_hash',
                  ${sqlLiteral(fingerprint("migration-040-v4-begin-payload"))},
                'finalize_request_fingerprint',
                  ${sqlLiteral(fingerprint("migration-040-v4-finalize-request"))},
                'finalize_payload_hash',
                  ${sqlLiteral(fingerprint("migration-040-v4-finalize-payload"))},
                'origin_inventory', ${jsonSql(originInventoryV4)},
                'origin_inventory_count', 1292,
                'origin_inventory_fingerprint',
                  ${sqlLiteral(originInventoryV4Fingerprint)},
                'live_origin_inventory', ${jsonSql(originInventoryV4)},
                'live_origin_inventory_count', 1292,
                'live_origin_inventory_fingerprint',
                  ${sqlLiteral(originInventoryV4Fingerprint)},
                'provider_inventory_schema',
                  'step11-6-production-origin-inventory-v4',
                'retained_provider_inventory_count', 1292,
                'retained_provider_inventory_fingerprint',
                  ${sqlLiteral(providerInventoryV4Fingerprint)},
                'live_provider_inventory_count', 1292,
                'live_provider_inventory_fingerprint',
                  ${sqlLiteral(providerInventoryV4Fingerprint)},
                'routing_rule_all_method_fence_required_host_count', 8,
                'routing_rule_all_method_fence_required_hosts_fingerprint',
                  ${sqlLiteral(providerInventoryBindingV3.routing_rule_all_method_fence_required_hosts_fingerprint)},
                'routing_rule_all_method_fence_required_path_count', 1,
                'routing_rule_all_method_fence_required_paths_fingerprint',
                  ${sqlLiteral(providerInventoryBindingV4.routing_rule_all_method_fence_required_paths_fingerprint)},
                'credential_confinement_evidence_schema',
                  'step11-6-production-google-credential-confinement-v3',
                'credential_confinement_record_count', 1292,
                'credential_confinement_records_fingerprint',
                  ${sqlLiteral(credentialConfinementV3.credential_confinement_records_fingerprint)},
                'credential_confinement_evidence_fingerprint',
                  ${sqlLiteral(credentialConfinementV3.credential_confinement_evidence_fingerprint)}
              )
            )).*
            from production_control.vercel_writer_quiesce_evidence value
            where value.evidence_id =
              ${sqlLiteral(historicalV1.evidence_id)}::uuid;
          `);
          assert.equal(psql(cluster, database, `
            select credential_confinement_evidence_schema
            from production_control.vercel_writer_quiesce_evidence
            where evidence_id = ${sqlLiteral(v4EvidenceId)}::uuid;
          `), "step11-6-production-google-credential-confinement-v3");
          const activeV4EvidenceId = randomUUID();
          psql(cluster, database, `
            insert into production_control.vercel_writer_quiesce_evidence
            select (pg_catalog.jsonb_populate_record(
              null::production_control.vercel_writer_quiesce_evidence,
              pg_catalog.to_jsonb(value) || pg_catalog.jsonb_build_object(
                'evidence_id', ${sqlLiteral(activeV4EvidenceId)},
                'evidence_request_id', ${sqlLiteral(randomUUID())},
                'begin_request_fingerprint',
                  ${sqlLiteral(fingerprint("migration-040-active-v4-begin-request"))},
                'begin_payload_hash',
                  ${sqlLiteral(fingerprint("migration-040-active-v4-begin-payload"))},
                'finalize_request_fingerprint',
                  ${sqlLiteral(fingerprint("migration-040-active-v4-finalize-request"))},
                'finalize_payload_hash',
                  ${sqlLiteral(fingerprint("migration-040-active-v4-finalize-payload"))},
                'credential_confinement_evidence_schema',
                  'step11-6-production-google-credential-confinement-v4',
                'credential_confinement_record_count', 1292,
                'credential_confinement_records_fingerprint',
                  ${sqlLiteral(credentialConfinementV4.credential_confinement_records_fingerprint)},
                'credential_confinement_evidence_fingerprint',
                  ${sqlLiteral(credentialConfinementV4.credential_confinement_evidence_fingerprint)},
                'routing_rule_all_method_fence_required_host_count',
                  ${providerInventoryBindingV4.routing_rule_all_method_fence_required_host_count},
                'routing_rule_all_method_fence_required_hosts_fingerprint',
                  ${sqlLiteral(providerInventoryBindingV4.routing_rule_all_method_fence_required_hosts_fingerprint)}
              )
            )).*
            from production_control.vercel_writer_quiesce_evidence value
            where value.evidence_id = ${sqlLiteral(v4EvidenceId)}::uuid;
          `);
          assertCommandFailure(
            () => psql(cluster, database, `
              update production_control.vercel_writer_quiesce_evidence
              set retained_provider_inventory_fingerprint = null
              where evidence_id = ${sqlLiteral(activeV4EvidenceId)}::uuid;
            `),
            /production_vercel_quiesce_inventory_contract_check/,
          );

          const v4ChallengeId = randomUUID();
          const v4ChallengeRequestId = randomUUID();
          const v4OperationRequestId = randomUUID();
          const v4EvidenceRequestId = randomUUID();
          const v4ChallengeFingerprint = fingerprint(
            "migration-040-v4-challenge-request",
          );
          const sourceAttestationId = psql(cluster, database, `
            select attestation_id
            from production_control.vercel_provider_attestations
            where evidence_id = ${sqlLiteral(historicalV1.evidence_id)}::uuid
              and stage = 'BEGIN';
          `).trim();
          psql(cluster, database, `
            insert into production_control.vercel_provider_attestation_challenges
            select (pg_catalog.jsonb_populate_record(
              null::production_control.vercel_provider_attestation_challenges,
              pg_catalog.to_jsonb(value) || pg_catalog.jsonb_build_object(
                'challenge_id', ${sqlLiteral(v4ChallengeId)},
                'challenge_request_id', ${sqlLiteral(v4ChallengeRequestId)},
                'operation_request_id', ${sqlLiteral(v4OperationRequestId)},
                'evidence_request_id', ${sqlLiteral(v4EvidenceRequestId)},
                'issue_request_fingerprint',
                  ${sqlLiteral(fingerprint("migration-040-v4-issue-request"))},
                'issue_payload_hash',
                  ${sqlLiteral(fingerprint("migration-040-v4-issue-payload"))},
                'challenge_request_fingerprint',
                  ${sqlLiteral(v4ChallengeFingerprint)},
                'status', 'ISSUED',
                'issued_at', pg_catalog.now(),
                'expires_at', pg_catalog.now() + interval '60 seconds',
                'consumed_at', null,
                'consumed_attestation_id', null,
                'consume_request_id', null,
                'consume_request_fingerprint', null,
                'consume_payload_hash', null,
                'abandon_request_id', null,
                'abandon_request_fingerprint', null,
                'abandon_payload_hash', null,
                'abandoned_at', null,
                'abandonment_reason', null,
                'created_at', pg_catalog.now(),
                'updated_at', pg_catalog.now()
              )
            )).*
            from production_control.vercel_provider_attestation_challenges value
            where value.challenge_id = (
              select attestation.challenge_id
              from production_control.vercel_provider_attestations attestation
              where attestation.attestation_id =
                ${sqlLiteral(sourceAttestationId)}::uuid
            );

            insert into production_control.vercel_provider_attestations
            select (pg_catalog.jsonb_populate_record(
              null::production_control.vercel_provider_attestations,
              pg_catalog.to_jsonb(value) || pg_catalog.jsonb_build_object(
                'attestation_id', ${sqlLiteral(randomUUID())},
                'evidence_id', null,
                'status', 'RESERVED',
                'attestation_fingerprint',
                  ${sqlLiteral(fingerprint("migration-040-v4-attestation"))},
                'challenge_id', ${sqlLiteral(v4ChallengeId)},
                'challenge_request_fingerprint',
                  ${sqlLiteral(v4ChallengeFingerprint)},
                'operation_request_id', ${sqlLiteral(v4OperationRequestId)},
                'evidence_request_id', ${sqlLiteral(v4EvidenceRequestId)},
                'request_fingerprint',
                  ${sqlLiteral(fingerprint("migration-040-v4-provider-request"))},
                'receipt_request_fingerprint', null,
                'live_origin_inventory', ${jsonSql(originInventoryV4)},
                'live_origin_inventory_count', 1292,
                'live_origin_inventory_fingerprint',
                  ${sqlLiteral(originInventoryV4Fingerprint)},
                'provider_inventory_schema',
                  'step11-6-production-origin-inventory-v4',
                'retained_origin_inventory_count', 1292,
                'retained_origin_inventory_fingerprint',
                  ${sqlLiteral(originInventoryV4Fingerprint)},
                'retained_provider_inventory_count', 1292,
                'retained_provider_inventory_fingerprint',
                  ${sqlLiteral(providerInventoryV4Fingerprint)},
                'live_provider_inventory_count', 1292,
                'live_provider_inventory_fingerprint',
                  ${sqlLiteral(providerInventoryV4Fingerprint)},
                'routing_rule_all_method_fence_required_host_count',
                  ${providerInventoryBindingV4.routing_rule_all_method_fence_required_host_count},
                'routing_rule_all_method_fence_required_hosts_fingerprint',
                  ${sqlLiteral(providerInventoryBindingV4.routing_rule_all_method_fence_required_hosts_fingerprint)},
                'routing_rule_all_method_fence_required_path_count', 1,
                'routing_rule_all_method_fence_required_paths_fingerprint',
                  ${sqlLiteral(providerInventoryBindingV4.routing_rule_all_method_fence_required_paths_fingerprint)},
                'credential_confinement_evidence_schema',
                  'step11-6-production-google-credential-confinement-v4',
                'credential_confinement_record_count', 1292,
                'credential_confinement_records_fingerprint',
                  ${sqlLiteral(credentialConfinementV4.credential_confinement_records_fingerprint)},
                'credential_confinement_evidence_fingerprint',
                  ${sqlLiteral(credentialConfinementV4.credential_confinement_evidence_fingerprint)},
                'provider_observed_at', pg_catalog.now(),
                'binding_expires_at', pg_catalog.now() + interval '20 minutes',
                'bound_at', null,
                'abandoned_at', null,
                'recorded_at', pg_catalog.now()
              )
            )).*
            from production_control.vercel_provider_attestations value
            where value.attestation_id = ${sqlLiteral(sourceAttestationId)}::uuid;
          `);
          assertCommandFailure(
            () => psql(cluster, database, `
              update production_control.vercel_provider_attestations
              set retained_origin_inventory_fingerprint = null
              where challenge_id = ${sqlLiteral(v4ChallengeId)}::uuid;
            `),
            /production_vercel_provider_attestation_inventory_contract_check/,
          );

          assert.equal(psql(cluster, database, `
            select pg_catalog.concat_ws(
              '|',
              pg_catalog.has_function_privilege(
                'anon',
                'production_control.assert_current_provider_inventory_v4(jsonb,boolean,boolean)',
                'EXECUTE'
              ),
              pg_catalog.has_function_privilege(
                'authenticated',
                'production_control.assert_current_provider_inventory_v4(jsonb,boolean,boolean)',
                'EXECUTE'
              ),
              pg_catalog.has_function_privilege(
                'service_role',
                'production_control.assert_current_provider_inventory_v4(jsonb,boolean,boolean)',
                'EXECUTE'
              ),
              validator.prosecdef,
              validator.proconfig @> array['search_path=pg_catalog'],
              pg_catalog.has_function_privilege(
                'anon',
                'production_control.assert_exact_vercel_origin_inventory(jsonb)',
                'EXECUTE'
              ),
              pg_catalog.has_function_privilege(
                'authenticated',
                'production_control.assert_exact_vercel_live_inventory(jsonb,jsonb,text,text,text,text)',
                'EXECUTE'
              ),
              pg_catalog.has_function_privilege(
                'service_role',
                'production_control.assert_exact_vercel_origin_inventory(jsonb)',
                'EXECUTE'
              ),
              pg_catalog.has_function_privilege(
                'service_role',
                'production_control.assert_exact_vercel_live_inventory(jsonb,jsonb,text,text,text,text)',
                'EXECUTE'
              ),
              retained.prosecdef,
              retained.proconfig @> array['search_path=pg_catalog'],
              live.prosecdef,
              live.proconfig @> array['search_path=pg_catalog']
            )
            from pg_catalog.pg_proc validator
            cross join pg_catalog.pg_proc retained
            cross join pg_catalog.pg_proc live
            where validator.oid =
                'production_control.assert_current_provider_inventory_v4(jsonb,boolean,boolean)'::pg_catalog.regprocedure
              and retained.oid =
                'production_control.assert_exact_vercel_origin_inventory(jsonb)'::pg_catalog.regprocedure
              and live.oid =
                'production_control.assert_exact_vercel_live_inventory(jsonb,jsonb,text,text,text,text)'::pg_catalog.regprocedure;
          `).trim(), "f|f|f|t|t|f|f|t|t|t|t|t|t");

          const blockedDatabase = cloneDormantDatabase(
            "migration_040_preflight_active_challenge",
          );
          psqlFile(cluster, blockedDatabase, path.join(
            migrationsDirectory,
            "202608260039_production_all_project_provider_inventory_v3.sql",
          ));
          const activeChallengeInput = {
            ...scope,
            actor_id: actor,
            purpose: "REHEARSAL",
            evidence_request_id: randomUUID(),
            request_fingerprint: fingerprint("migration-040-blocked-receipt"),
            candidate_deployment_id: retainedV3CandidateIdentity.deploymentId,
            candidate_deployment_commit: retainedV3CandidateIdentity.commit,
            candidate_deployment_target: "PREVIEW",
            candidate_credential_generation:
              retainedV3CandidateIdentity.credentialGeneration,
            main_branch_alias_origin:
              retainedV3CandidateIdentity.mainBranchAliasOrigin,
            candidate_alias_origin: retainedV3CandidateIdentity.aliasOrigin,
            candidate_immutable_origin:
              retainedV3CandidateIdentity.immutableOrigin,
            vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
            routing_rule_id: "step11_6_pg17_writer_quiesce_v3",
            routing_rule_revision: "revision-v3",
            routing_rule_scope:
              "PRODUCTION_GOOGLE_CANONICAL_WRITER_QUIESCE",
            origin_inventory: originInventoryV3,
            live_origin_inventory: originInventoryV3,
            first_probe_records: quiesceProbeRecordsV3(),
            authenticated_actor_fingerprint:
              fingerprint("authenticated-operator"),
            owner_principal_fingerprint:
              fingerprint("production-workbook-owner"),
            owner_override_operationally_frozen: true,
            owner_freeze_ttl_seconds: 2100,
            ...providerInventoryBindingV3,
            ...credentialConfinementV2,
          };
          rpc(
            cluster,
            blockedDatabase,
            "issue_production_vercel_provider_attestation_challenge",
            {
              ...providerChallengeIssueInput(
                activeChallengeInput,
                "BEGIN",
                "migration-040-blocked-active-challenge",
              ),
              candidate_alias_origin:
                retainedV3CandidateIdentity.aliasOrigin,
              candidate_immutable_origin:
                retainedV3CandidateIdentity.immutableOrigin,
            },
          );
          assertCommandFailure(
            () => psqlFile(cluster, blockedDatabase, path.join(
              migrationsDirectory,
              "202608260040_production_provider_inventory_recertification_v4.sql",
            )),
            /PRODUCTION_PROVIDER_INVENTORY_V4_MIGRATION_STATE_INVALID/,
          );
        },
      );

      await t.test(
        "migration 040 makes v3 the only callable admission/dispatch contract and reserves admission across provider install",
        () => {
          const capabilityDatabase = cloneDormantDatabase(
            "migration_040_admission_v3_capability",
          );
          certifySuccessfulRehearsal(
            cluster,
            capabilityDatabase,
            "migration-040-v3-capability-certification",
          );
          psql(cluster, capabilityDatabase, [
            "update production_control.vercel_writer_quiesce_evidence",
            "set owner_acknowledged_at = owner_acknowledged_at - interval '2 hours',",
            "owner_freeze_expires_at = owner_freeze_expires_at - interval '2 hours',",
            "drain_started_at = drain_started_at - interval '2 hours',",
            "drain_completed_at = drain_completed_at - interval '2 hours',",
            "verified_at = verified_at - interval '2 hours',",
            "expires_at = expires_at - interval '2 hours',",
            "created_at = created_at - interval '2 hours',",
            "updated_at = updated_at - interval '2 hours'",
            "where status = 'VERIFIED';",
          ].join("\n"));
          for (const migration of [
            "202608260039_production_all_project_provider_inventory_v3.sql",
            "202608260040_production_provider_inventory_recertification_v4.sql",
          ]) psqlFile(cluster, capabilityDatabase,
            path.join(migrationsDirectory, migration));
          certifyAclV2RehearsalV4(
            cluster,
            capabilityDatabase,
            "migration-040-v3-capability-acl-v2-rehearsal",
          );
          let current = stageToArmedGoogleGate(
            cluster,
            capabilityDatabase,
            "migration-040-v3-capability",
          );
          assert.equal(
            psql(cluster, capabilityDatabase, `
              select provider_principal_fingerprint
              from scoring_authority.ingress_gates
              where tournament_id = '2026';
            `),
            legacyProviderPrincipalFingerprint,
            "arming the candidate must retain the rehearsal-certified principal",
          );
          const inspectedAdmission = rpc(
            cluster,
            capabilityDatabase,
            "inspect_production_scoring_admission",
            {
              ...scope,
              deployment_id: candidateIdentity.deploymentId,
              deployment_commit: candidateIdentity.commit,
              expected_provider_principal_fingerprint:
                legacyProviderPrincipalFingerprint,
              inspection_nonce: randomUUID(),
              request_fingerprint:
                fingerprint("migration-040-v3-inspect-principal"),
            },
          );
          assert.equal(inspectedAdmission.contract_version, "ADMISSION_V3");
          assert.equal(
            inspectedAdmission.provider_credential_class,
            "LEGACY_PROVIDER_FENCEABLE",
          );
          assert.equal(
            inspectedAdmission.provider_principal_fingerprint,
            legacyProviderPrincipalFingerprint,
          );

          assert.equal(psql(cluster, capabilityDatabase, [
            "select pg_catalog.concat_ws('|',",
            "pg_catalog.has_function_privilege('service_role',",
            "'public.begin_production_scoring_ingress_v2(jsonb)', 'EXECUTE'),",
            "pg_catalog.has_function_privilege('service_role',",
            "'public.begin_production_scoring_ingress(jsonb)', 'EXECUTE'),",
            "pg_catalog.has_function_privilege('service_role',",
            "'public.mark_production_scoring_ingress_write_started(jsonb)', 'EXECUTE'),",
            "pg_catalog.has_function_privilege('service_role',",
            "'public.begin_production_scoring_ingress_v3(jsonb)', 'EXECUTE'),",
            "pg_catalog.has_function_privilege('service_role',",
            "'public.mark_production_scoring_ingress_write_started_v3(jsonb)', 'EXECUTE'),",
            "pg_catalog.has_function_privilege('anon',",
            "'public.begin_production_scoring_ingress_v3(jsonb)', 'EXECUTE'),",
            "pg_catalog.has_function_privilege('service_role',",
            "'public.report_production_scoring_ingress_outcome(jsonb)', 'EXECUTE'),",
            "pg_catalog.has_function_privilege('service_role',",
            "'public.report_production_scoring_ingress_outcome_v2_base(jsonb)', 'EXECUTE'),",
            "pg_catalog.has_function_privilege('anon',",
            "'public.report_production_scoring_ingress_outcome(jsonb)', 'EXECUTE'));",
          ].join("\n")).trim(), "f|f|f|t|t|f|t|f|f");

          const operationRequestId = randomUUID();
          const firstNonce = randomUUID();
          const retryNonce = randomUUID();
          assertCommandFailure(
            () => rpc(
              cluster,
              capabilityDatabase,
              "begin_production_scoring_ingress_v3",
              {
                ...beginInput(
                  current,
                  "migration-040-v3-wrong-principal",
                ),
                expected_provider_principal_fingerprint:
                  fingerprint("wrong-legacy-provider-principal"),
              },
            ),
            /PRODUCTION_SCORING_INGRESS_V3_PROVIDER_PRINCIPAL_MISMATCH/,
          );
          const admitted = rpc(
            cluster,
            capabilityDatabase,
            "begin_production_scoring_ingress_v3",
            beginInput(
              current,
              "migration-040-v3-begin",
              firstNonce,
              operationRequestId,
            ),
          );
          assert.equal(admitted.contract_version, "ADMISSION_V3");
          assert.equal(
            admitted.provider_credential_class,
            "LEGACY_PROVIDER_FENCEABLE",
          );
          assert.equal(
            admitted.provider_principal_fingerprint,
            legacyProviderPrincipalFingerprint,
          );
          assert.equal(
            admitted.provider_dispatch_must_begin_before_expires_at,
            true,
          );
          assert.match(admitted.expires_at, /^\d{4}-\d\d-\d\dT/);
          assert.equal(admitted.lease_nonce, firstNonce);
          assert.equal(admitted.operation_request_id, operationRequestId);
          assert.ok(Number(admitted.remaining_dispatch_ms) > 0);
          assert.ok(Number(admitted.remaining_dispatch_ms) <= 180_000);
          const replayed = rpc(
            cluster,
            capabilityDatabase,
            "begin_production_scoring_ingress_v3",
            beginInput(
              current,
              "migration-040-v3-replay",
              retryNonce,
              operationRequestId,
            ),
          );
          assert.equal(replayed.lease_id, admitted.lease_id);
          assert.equal(replayed.idempotent, true);
          assert.equal(replayed.contract_version, "ADMISSION_V3");
          assert.equal(
            replayed.provider_credential_class,
            "LEGACY_PROVIDER_FENCEABLE",
          );
          assert.equal(
            replayed.provider_principal_fingerprint,
            legacyProviderPrincipalFingerprint,
          );
          assert.match(replayed.expires_at, /^\d{4}-\d\d-\d\dT/);
          assert.equal(replayed.lease_nonce, retryNonce);
          assert.equal(replayed.operation_request_id, operationRequestId);
          assert.ok(Number(replayed.remaining_dispatch_ms) > 0);
          assert.ok(Number(replayed.remaining_dispatch_ms) <= 180_000);
          assertCommandFailure(
            () => rpc(
              cluster,
              capabilityDatabase,
              "mark_production_scoring_ingress_write_started_v3",
              {
                ...optimisticInput(current, "migration-040-v3-old-nonce"),
                lease_id: admitted.lease_id,
                lease_nonce: firstNonce,
                operation_request_id: operationRequestId,
                expected_provider_principal_fingerprint:
                  legacyProviderPrincipalFingerprint,
              },
            ),
            /PRODUCTION_SCORING_LEASE_NONCE_INVALID/,
          );
          const started = rpc(
            cluster,
            capabilityDatabase,
            "mark_production_scoring_ingress_write_started_v3",
            {
              ...optimisticInput(current, "migration-040-v3-mark"),
              lease_id: admitted.lease_id,
              lease_nonce: retryNonce,
              operation_request_id: operationRequestId,
              expected_provider_principal_fingerprint:
                legacyProviderPrincipalFingerprint,
            },
          );
          assert.equal(started.contract_version, "ADMISSION_V3");
          assert.equal(started.resolution_state, "WRITE_STARTED");
          assert.equal(started.lease_id, admitted.lease_id);
          assert.equal(started.expires_at, replayed.expires_at);
          assert.equal(started.lease_nonce, retryNonce);
          assert.equal(started.operation_request_id, operationRequestId);
          assert.ok(Number(started.remaining_dispatch_ms) >= 0);
          assert.ok(
            Number(started.remaining_dispatch_ms) <=
              Number(replayed.remaining_dispatch_ms),
          );
          assert.equal(
            started.provider_credential_class,
            "LEGACY_PROVIDER_FENCEABLE",
          );
          assert.equal(
            started.provider_principal_fingerprint,
            legacyProviderPrincipalFingerprint,
          );
          assert.match(started.write_started_at, /^\d{4}-\d\d-\d\dT/);
          const outcomeProviderMutationKey =
            fingerprint("migration-040-v3-outcome-provider-key");
          const outcomeProviderBefore =
            fingerprint("migration-040-v3-outcome-before");
          const outcomeProviderAfter =
            fingerprint("migration-040-v3-outcome-after");
          const outcomeEvidence = psql(cluster, capabilityDatabase, `
            select production_control.scoring_lease_outcome_evidence_hash(
              lease_id, request_fingerprint, 'CONFIRMED_WRITE',
              ${sqlLiteral(outcomeProviderMutationKey)},
              ${sqlLiteral(outcomeProviderBefore)},
              ${sqlLiteral(outcomeProviderAfter)},
              ${sqlLiteral(outcomeProviderAfter)},
              authority_generation_id, admission_generation_id,
              admission_revision
            )
            from scoring_authority.scoring_ingress_leases
            where lease_id = ${sqlLiteral(admitted.lease_id)}::uuid;
          `);
          const outcome = rpc(
            cluster,
            capabilityDatabase,
            "report_production_scoring_ingress_outcome",
            {
              ...optimisticInput(current, "migration-040-v3-outcome"),
              operation: "WRITE_HOLE_SCORE",
              lease_id: admitted.lease_id,
              lease_nonce: retryNonce,
              operation_request_id: operationRequestId,
              expected_provider_principal_fingerprint:
                legacyProviderPrincipalFingerprint,
              outcome_state: "CONFIRMED_WRITE",
              provider_mutation_key: outcomeProviderMutationKey,
              provider_before_fingerprint: outcomeProviderBefore,
              provider_after_fingerprint: outcomeProviderAfter,
              provider_readback_fingerprint: outcomeProviderAfter,
              outcome_evidence_fingerprint: outcomeEvidence,
            },
          );
          assert.equal(outcome.contract_version, "ADMISSION_V3");
          assert.equal(outcome.resolution_state, "CONFIRMED_WRITE");
          assert.equal(outcome.lease_id, admitted.lease_id);
          assert.equal(outcome.lease_nonce, retryNonce);
          assert.equal(outcome.operation_request_id, operationRequestId);
          assert.equal(
            outcome.provider_credential_class,
            "LEGACY_PROVIDER_FENCEABLE",
          );
          assert.equal(
            outcome.provider_principal_fingerprint,
            legacyProviderPrincipalFingerprint,
          );

          const lostMarkOperationRequestId = randomUUID();
          const lostMarkNonce = randomUUID();
          const lostMarkAdmission = rpc(
            cluster,
            capabilityDatabase,
            "begin_production_scoring_ingress_v3",
            beginInput(
              current,
              "migration-040-v3-lost-mark-begin",
              lostMarkNonce,
              lostMarkOperationRequestId,
            ),
          );
          psql(cluster, capabilityDatabase, `
            update scoring_authority.scoring_ingress_leases
            set expires_at = pg_catalog.clock_timestamp()
              + interval '200 milliseconds'
            where lease_id = ${sqlLiteral(lostMarkAdmission.lease_id)}::uuid;
          `);
          const lostMarkInput = {
            ...optimisticInput(current, "migration-040-v3-lost-mark"),
            lease_id: lostMarkAdmission.lease_id,
            lease_nonce: lostMarkNonce,
            operation_request_id: lostMarkOperationRequestId,
            expected_provider_principal_fingerprint:
              legacyProviderPrincipalFingerprint,
          };
          const lostMarkCommitted = rpc(
            cluster,
            capabilityDatabase,
            "mark_production_scoring_ingress_write_started_v3",
            lostMarkInput,
          );
          assert.equal(lostMarkCommitted.resolution_state, "WRITE_STARTED");
          assert.ok(Number(lostMarkCommitted.remaining_dispatch_ms) > 0);
          psql(cluster, capabilityDatabase, "select pg_catalog.pg_sleep(0.25);");
          const lostMarkRecoveredAfterExpiry = rpc(
            cluster,
            capabilityDatabase,
            "mark_production_scoring_ingress_write_started_v3",
            lostMarkInput,
          );
          assert.equal(
            lostMarkRecoveredAfterExpiry.resolution_state,
            "WRITE_STARTED",
          );
          assert.equal(
            Number(lostMarkRecoveredAfterExpiry.remaining_dispatch_ms),
            0,
          );
          assert.equal(
            psql(cluster, capabilityDatabase, `
              select pg_catalog.concat_ws('|', resolution_state,
                (write_started_at is not null)::text)
              from scoring_authority.scoring_ingress_leases
              where lease_id = ${sqlLiteral(lostMarkAdmission.lease_id)}::uuid;
            `).trim(),
            "WRITE_STARTED|true",
          );

          const fenceDatabase = cloneDormantDatabase(
            "migration_040_provider_reservation",
          );
          certifySuccessfulRehearsal(
            cluster,
            fenceDatabase,
            "migration-040-provider-reservation-certification",
          );
          psql(cluster, fenceDatabase, [
            "update production_control.vercel_writer_quiesce_evidence",
            "set owner_acknowledged_at = owner_acknowledged_at - interval '2 hours',",
            "owner_freeze_expires_at = owner_freeze_expires_at - interval '2 hours',",
            "drain_started_at = drain_started_at - interval '2 hours',",
            "drain_completed_at = drain_completed_at - interval '2 hours',",
            "verified_at = verified_at - interval '2 hours',",
            "expires_at = expires_at - interval '2 hours',",
            "created_at = created_at - interval '2 hours',",
            "updated_at = updated_at - interval '2 hours'",
            "where status = 'VERIFIED';",
          ].join("\n"));
          for (const migration of [
            "202608260039_production_all_project_provider_inventory_v3.sql",
            "202608260040_production_provider_inventory_recertification_v4.sql",
          ]) psqlFile(cluster, fenceDatabase,
            path.join(migrationsDirectory, migration));
          certifyAclV2RehearsalV4(
            cluster,
            fenceDatabase,
            "migration-040-provider-reservation-acl-v2-rehearsal",
          );
          current = stageToArmedGoogleGate(
            cluster,
            fenceDatabase,
            "migration-040-provider-reservation",
          );
          const quiesce = certifyQuiesceV4(
            cluster,
            fenceDatabase,
            "migration-040-provider-reservation",
          );

          const admissionFirstNonce = randomUUID();
          const admissionFirst = rpc(
            cluster,
            fenceDatabase,
            "begin_production_scoring_ingress_v3",
            beginInput(
              current,
              "migration-040-admission-wins",
              admissionFirstNonce,
            ),
          );
          const blockedReservation = {
            ...optimisticInput(
              state(cluster, fenceDatabase),
              "migration-040-admission-wins-fence",
            ),
            operation:
              "BEGIN_PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_INSTALL",
            lifecycle_mode: "CUTOVER",
            install_request_id: randomUUID(),
            quiesce_evidence_id: quiesce.evidence_id,
            critical_waf_epoch_id: quiesce.critical_waf_epoch_id,
            candidate_deployment_id: candidateIdentity.deploymentId,
            candidate_deployment_commit: candidateIdentity.commit,
            authenticated_actor_fingerprint:
              fingerprint("authenticated-operator"),
            dedicated_principal_fingerprint:
              fingerprint("dedicated-google-principal"),
            legacy_credential_generation_fingerprint:
              fingerprint("legacy-google-credential-generation-v0"),
            baseline_provider_fingerprint:
              fingerprint("migration-040-admission-wins-provider"),
            baseline_acl_fingerprint:
              fingerprint("migration-040-admission-wins-acl"),
            baseline_canonical_value_fingerprint:
              fingerprint("migration-040-admission-wins-canonical"),
            baseline_formula_fingerprint:
              fingerprint("migration-040-admission-wins-formula"),
            baseline_combined_value_fingerprint:
              fingerprint("migration-040-admission-wins-combined"),
            writer_scope_fingerprint:
              fingerprint("canonical-google-writer-scope-v2"),
            canonical_sheet_union_fingerprint:
              emptyStructuredEvidenceFingerprint(cluster, fenceDatabase),
          };
          assertCommandFailure(
            () => rpc(
              cluster,
              fenceDatabase,
              "begin_production_google_writer_provider_fence_install",
              blockedReservation,
            ),
            /PRODUCTION_GOOGLE_WRITER_PROVIDER_ACL_BEGIN_STATE_INVALID/,
          );

          psql(cluster, fenceDatabase,
            "update scoring_authority.scoring_ingress_leases " +
            "set expires_at = pg_catalog.now() - interval '1 second' " +
            "where lease_id = " + sqlLiteral(admissionFirst.lease_id) +
            "::uuid;");
          const expired = rpc(
            cluster,
            fenceDatabase,
            "mark_production_scoring_ingress_write_started_v3",
            {
              ...optimisticInput(current, "migration-040-expired-before-dispatch"),
              lease_id: admissionFirst.lease_id,
              lease_nonce: admissionFirstNonce,
              operation_request_id: admissionFirst.operation_request_id,
              expected_provider_principal_fingerprint:
                legacyProviderPrincipalFingerprint,
            },
          );
          assert.equal(expired.resolution_state, "PROVEN_NO_WRITE");
          assert.equal(expired.requires_reconciliation, false);
          assert.equal(expired.write_started_at, null);

          const noSettlementReservation = beginProviderFenceReservation(
            cluster,
            fenceDatabase,
            quiesce,
            "migration-040-no-settlement-recovery",
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              fenceDatabase,
              "begin_production_scoring_ingress_v3",
              beginInput(current, "migration-040-provider-wins-v3"),
            ),
            /PRODUCTION_SCORING_PROVIDER_FENCE_ADMISSION_RESERVED/,
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              fenceDatabase,
              "begin_production_scoring_ingress_v2",
              beginInput(current, "migration-040-provider-wins-v2"),
            ),
            /PRODUCTION_SCORING_PROVIDER_FENCE_ADMISSION_RESERVED/,
          );

          const reservedFence = inspectProviderFence(
            cluster,
            fenceDatabase,
            noSettlementReservation.input.install_request_id,
            noSettlementReservation.begin.fence_id,
          );
          assert.equal(reservedFence.status, "INSTALLING");
          assert.equal(reservedFence.admission_reservation_active, true);

          const reservedAdmission = rpc(
            cluster,
            fenceDatabase,
            "inspect_production_scoring_admission",
            {
              ...scope,
              deployment_id: candidateIdentity.deploymentId,
              deployment_commit: candidateIdentity.commit,
            },
          );
          assert.equal(
            reservedAdmission.provider_admission_reservation_active,
            true,
          );
          assert.equal(reservedAdmission.new_legacy_admission_allowed, false);

          // The ACL-v2 helper above owns the current install/close/drain/restore
          // rehearsal. The removed tail exercised the retired protected-range
          // provider contract; authority prepare/commit/rollback remain covered
          // by the dedicated migration-040 state-machine cases below.
        },
      );

      await t.test(
        "migration 036 upgrades existing ISSUED and CONSUMED challenges without changing dormant Production authority",
        async () => {
          databaseCounter += 1;
          const database =
            `admission_034_${databaseCounter}_migration_036_upgrade`;
          createDatabase(cluster, database);
          installSupabaseCompatibility(cluster, database);
          await installProductionMigrations(
            cluster,
            database,
            "202608260035_production_reviewed_post_capture_preview_deployments.sql",
          );
          installScoringFixture(cluster, database);

          const pre036LiveInventory = sortLiveOriginInventory([
            ...originInventory,
            ...reviewedPostCapturePreviewDeployments.filter((tuple) =>
              tuple[1] !== "3fcbaa287fcb306fa3b47310f01ed6eb3901749c" &&
              tuple[0] !== "dpl_idZKEn956pcuEXctKS5HPoWfEn4Y" &&
              tuple[0] !== reviewed68c81deDeployment[0]
            ),
            candidateInventoryTuple("PREVIEW"),
          ]);
          assert.equal(pre036LiveInventory.length, 1144);

          const expiredInput = quiesceBeginInput(
            "REHEARSAL",
            "migration-036-upgrade-expired",
          );
          const expiredIssueInput = providerChallengeIssueInput(
            expiredInput,
            "BEGIN",
            "migration-036-upgrade-expired",
          );
          const expiredChallenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            expiredIssueInput,
          );
          expireProviderChallenge(
            cluster,
            database,
            expiredChallenge.challenge_id,
          );

          const consumedInput = quiesceBeginInput(
            "REHEARSAL",
            "migration-036-upgrade-consumed",
          );
          consumedInput.live_origin_inventory = pre036LiveInventory;
          consumedInput.first_probe_records = quiesceProbeRecords(
            new Date().toISOString(),
            "PREVIEW",
            pre036LiveInventory,
          );
          const consumedIssueInput = providerChallengeIssueInput(
            consumedInput,
            "BEGIN",
            "migration-036-upgrade-consumed",
          );
          const consumedChallenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            consumedIssueInput,
          );
          const reserved = rpc(
            cluster,
            database,
            "consume_production_vercel_provider_attestation_challenge",
            providerChallengeConsumeInput(
              consumedInput,
              consumedIssueInput,
              consumedChallenge,
              "migration-036-upgrade-consumed",
            ),
          );
          assert.equal(reserved.status, "RESERVED");

          const productionAuthorityState = () => psql(cluster, database, `
            select activation.state || '|' || activation.current_authority ||
              '|' || resource.participant_identity_authority || '|' ||
              gate.admission_state
            from production_control.cutover_activation_state activation
            join production_control.resource_scope resource
              on resource.scope_key = activation.scope_key
            cross join scoring_authority.ingress_gates gate
            where activation.scope_key = 'BAGGER_INV_PRODUCTION'
              and gate.tournament_id = '2026';
          `);
          assert.equal(
            productionAuthorityState(),
            "DORMANT|GOOGLE|PASSPORT|OPEN",
          );

          psqlFile(
            cluster,
            database,
            path.join(
              migrationsDirectory,
              "202608260036_production_reviewed_post_capture_preview_deployments_v2.sql",
            ),
          );

          assert.equal(
            psql(cluster, database, `
              select status || '|' ||
                (abandon_request_id is null)::text || '|' ||
                (abandon_request_fingerprint is null)::text || '|' ||
                (abandon_payload_hash is null)::text || '|' ||
                (abandoned_at is null)::text
              from production_control.vercel_provider_attestation_challenges
              where challenge_id =
                ${sqlLiteral(expiredChallenge.challenge_id)}::uuid;
            `),
            "ISSUED|true|true|true|true",
          );
          assert.equal(
            psql(cluster, database, `
              select status || '|' ||
                (abandon_request_id is null)::text || '|' ||
                (abandon_request_fingerprint is null)::text || '|' ||
                (abandon_payload_hash is null)::text || '|' ||
                (abandoned_at is null)::text
              from production_control.vercel_provider_attestation_challenges
              where challenge_id =
                ${sqlLiteral(consumedChallenge.challenge_id)}::uuid;
            `),
            "CONSUMED|true|true|true|true",
          );
          assert.equal(
            psql(cluster, database, `
              select count(*) || '|' ||
                count(*) filter (where constraint_value.convalidated)
              from pg_catalog.pg_constraint constraint_value
              where constraint_value.conrelid =
                'production_control.vercel_provider_attestation_challenges'
                  ::pg_catalog.regclass
                and constraint_value.conname in (
                  'vercel_provider_attestation_challenges_status_check',
                  'vercel_provider_attestation_challenges_check2'
                );
            `),
            "2|2",
          );
          assert.equal(
            productionAuthorityState(),
            "DORMANT|GOOGLE|PASSPORT|OPEN",
          );

          const expiredInspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_attestation_challenge_abandonment",
            providerChallengeAbandonInspectionInput(
              expiredIssueInput,
              expiredChallenge,
            ),
          );
          assert.equal(expiredInspection.abandonment_code, "ELIGIBLE");
          assert.equal(expiredInspection.abandon_eligible, true);
          const consumedInspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_attestation_challenge_abandonment",
            providerChallengeAbandonInspectionInput(
              consumedIssueInput,
              consumedChallenge,
            ),
          );
          assert.equal(consumedInspection.abandonment_code, "CONSUMED");
          assert.equal(consumedInspection.abandon_eligible, false);

          const abandoned = rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            providerChallengeAbandonInput(
              expiredIssueInput,
              expiredChallenge,
              "migration-036-upgrade-expired",
            ),
          );
          assert.equal(abandoned.status, "ABANDONED");
          assert.equal(
            psql(cluster, database, `
              select
                (select status from
                  production_control.vercel_provider_attestation_challenges
                  where challenge_id =
                    ${sqlLiteral(expiredChallenge.challenge_id)}::uuid)
                || '|' ||
                (select status from
                  production_control.vercel_provider_attestation_challenges
                  where challenge_id =
                    ${sqlLiteral(consumedChallenge.challenge_id)}::uuid)
                || '|' ||
                (select count(*) from
                  production_control.vercel_provider_attestations
                  where challenge_id =
                    ${sqlLiteral(consumedChallenge.challenge_id)}::uuid);
            `),
            "ABANDONED|CONSUMED|1",
          );
          assert.equal(
            productionAuthorityState(),
            "DORMANT|GOOGLE|PASSPORT|OPEN",
          );
        },
      );

      await t.test(
        "migration 037 invalidates a persistent pre-037 inventory call and requires the exact b6 tuple",
        async () => {
          databaseCounter += 1;
          const database =
            `admission_034_${databaseCounter}_migration_037_cached_upgrade`;
          let persistentSession;
          try {
            createDatabase(cluster, database);
            installSupabaseCompatibility(cluster, database);
            await installProductionMigrations(
              cluster,
              database,
              "202608260036_production_reviewed_post_capture_preview_deployments_v2.sql",
            );
            installScoringFixture(cluster, database);

            const reviewedB6 = reviewedPostCapturePreviewDeployments.find(
              (tuple) => tuple[0] === "dpl_idZKEn956pcuEXctKS5HPoWfEn4Y",
            );
            assert.ok(reviewedB6);
            const pre037LiveInventory = liveOriginInventoryThrough037For("PREVIEW")
              .filter((tuple) => tuple[0] !== reviewedB6[0]);
            const post037LiveInventory = liveOriginInventoryThrough037For("PREVIEW");
            assert.equal(pre037LiveInventory.length, 1146);
            assert.equal(post037LiveInventory.length, 1147);

            const productionAuthorityState = () => psql(cluster, database, `
              select activation.state || '|' || activation.current_authority ||
                '|' || resource.participant_identity_authority || '|' ||
                gate.admission_state || '|' || gate.state
              from production_control.cutover_activation_state activation
              join production_control.resource_scope resource
                on resource.scope_key = activation.scope_key
              cross join scoring_authority.ingress_gates gate
              where activation.scope_key = 'BAGGER_INV_PRODUCTION'
                and gate.tournament_id = '2026';
            `);
            assert.equal(
              productionAuthorityState(),
              "DORMANT|GOOGLE|PASSPORT|OPEN|PAUSED",
            );

            const cachedExecution = (liveInventory) => `
              execute cached_live_inventory(
                ${jsonSql(originInventory)},
                ${jsonSql(liveInventory)},
                ${sqlLiteral(candidateIdentity.deploymentId)},
                ${sqlLiteral(candidateIdentity.commit)},
                ${sqlLiteral(candidateIdentity.immutableOrigin)},
                'PREVIEW'
              );
            `;
            persistentSession = spawnInteractivePsql(cluster, database);
            persistentSession.send(`
              prepare cached_live_inventory(
                jsonb, jsonb, text, text, text, text
              ) as
                select production_control.assert_exact_vercel_live_inventory(
                  $1, $2, $3, $4, $5, $6
                );
              ${cachedExecution(pre037LiveInventory)}
              select 'PRE037_CACHED_ASSERTION_READY';
            `);
            await persistentSession.waitFor(
              "PRE037_CACHED_ASSERTION_READY",
            );

            psqlFile(
              cluster,
              database,
              path.join(
                migrationsDirectory,
                "202608260037_production_provider_rpc_name_and_inventory_v3.sql",
              ),
            );

            persistentSession.send(`
              \\set ON_ERROR_STOP off
              ${cachedExecution(pre037LiveInventory)}
              select 'POST037_MISSING_B6_ATTEMPTED';
            `);
            await persistentSession.waitFor(
              "POST037_MISSING_B6_ATTEMPTED",
            );
            assert.match(
              persistentSession.snapshot().stderr,
              /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
              "a cached pre-037 call must resolve the replacement b6 assertion",
            );

            persistentSession.send(`
              \\set ON_ERROR_STOP on
              ${cachedExecution(post037LiveInventory)}
              select 'POST037_EXACT_B6_ACCEPTED';
              \\q
            `);
            await persistentSession.waitFor("POST037_EXACT_B6_ACCEPTED");
            const sessionResult = await persistentSession.done;
            assert.equal(sessionResult.status, 0);

            assert.equal(
              psql(cluster, database, `
                select pg_catalog.length(alias.proname)::text || '|' ||
                  pg_catalog.length(terminal.proname)::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'anon', alias.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'authenticated', alias.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'service_role', alias.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'anon', terminal.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'authenticated', terminal.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'service_role', terminal.oid, 'EXECUTE'
                  )::text
                from pg_catalog.pg_proc alias
                join pg_catalog.pg_namespace alias_namespace
                  on alias_namespace.oid = alias.pronamespace
                cross join pg_catalog.pg_proc terminal
                join pg_catalog.pg_namespace terminal_namespace
                  on terminal_namespace.oid = terminal.pronamespace
                where alias_namespace.nspname = 'public'
                  and alias.proname =
                    'inspect_production_vercel_provider_challenge_abandonment'
                  and terminal_namespace.nspname = 'public'
                  and terminal.proname =
                    'inspect_production_vercel_provider_attestation_challenge_abando';
              `),
              "56|63|false|false|true|false|false|true",
            );
            assert.equal(
              psql(cluster, database, `
                select current_assertion.prosecdef::text || '|' ||
                  current_assertion.provolatile::text || '|' ||
                  (current_assertion.proconfig @>
                    array['search_path=pg_catalog'])::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'anon', current_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'authenticated', current_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'service_role', current_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  prior_assertion.prosecdef::text || '|' ||
                  prior_assertion.provolatile::text || '|' ||
                  (prior_assertion.proconfig @>
                    array['search_path=pg_catalog'])::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'anon', prior_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'authenticated', prior_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'service_role', prior_assertion.oid, 'EXECUTE'
                  )::text
                from pg_catalog.pg_proc current_assertion
                join pg_catalog.pg_namespace current_namespace
                  on current_namespace.oid = current_assertion.pronamespace
                cross join pg_catalog.pg_proc prior_assertion
                join pg_catalog.pg_namespace prior_namespace
                  on prior_namespace.oid = prior_assertion.pronamespace
                where current_namespace.nspname = 'production_control'
                  and current_assertion.proname =
                    'assert_exact_vercel_live_inventory'
                  and prior_namespace.nspname = 'production_control'
                  and prior_assertion.proname =
                    'assert_exact_vercel_live_inventory_v2';
              `),
              "true|i|true|false|false|true|true|i|true|false|false|true",
            );
            assert.equal(
              productionAuthorityState(),
              "DORMANT|GOOGLE|PASSPORT|OPEN|PAUSED",
            );
          } finally {
            await terminatePsqlSessions(persistentSession);
          }
        },
      );

      await t.test(
        "migration 038 invalidates a persistent pre-038 inventory call and requires the exact 68c81de tuple",
        async () => {
          databaseCounter += 1;
          const database =
            `admission_034_${databaseCounter}_migration_038_cached_upgrade`;
          let persistentSession;
          try {
            createDatabase(cluster, database);
            installSupabaseCompatibility(cluster, database);
            await installProductionMigrations(
              cluster,
              database,
              "202608260037_production_provider_rpc_name_and_inventory_v3.sql",
            );
            installScoringFixture(cluster, database);

            assert.deepEqual(
              reviewedPostCapturePreviewDeployments.find(
                (tuple) => tuple[0] === reviewed68c81deDeployment[0],
              ),
              reviewed68c81deDeployment,
            );
            const pre038LiveInventory = liveOriginInventoryThrough037For("PREVIEW");
            const post038LiveInventory = liveOriginInventoryFor("PREVIEW");
            assert.equal(pre038LiveInventory.length, 1147);
            assert.equal(post038LiveInventory.length, 1148);

            const productionAuthorityState = () => psql(cluster, database, `
              select activation.state || '|' || activation.current_authority ||
                '|' || resource.participant_identity_authority || '|' ||
                gate.admission_state || '|' || gate.state
              from production_control.cutover_activation_state activation
              join production_control.resource_scope resource
                on resource.scope_key = activation.scope_key
              cross join scoring_authority.ingress_gates gate
              where activation.scope_key = 'BAGGER_INV_PRODUCTION'
                and gate.tournament_id = '2026';
            `);
            assert.equal(
              productionAuthorityState(),
              "DORMANT|GOOGLE|PASSPORT|OPEN|PAUSED",
            );

            const cachedExecution = (liveInventory) => `
              execute cached_live_inventory_038(
                ${jsonSql(originInventory)},
                ${jsonSql(liveInventory)},
                ${sqlLiteral(candidateIdentity.deploymentId)},
                ${sqlLiteral(candidateIdentity.commit)},
                ${sqlLiteral(candidateIdentity.immutableOrigin)},
                'PREVIEW'
              );
            `;
            persistentSession = spawnInteractivePsql(cluster, database);
            persistentSession.send(`
              prepare cached_live_inventory_038(
                jsonb, jsonb, text, text, text, text
              ) as
                select production_control.assert_exact_vercel_live_inventory(
                  $1, $2, $3, $4, $5, $6
                );
              ${cachedExecution(pre038LiveInventory)}
              select 'PRE038_CACHED_ASSERTION_READY';
            `);
            await persistentSession.waitFor("PRE038_CACHED_ASSERTION_READY");

            psqlFile(
              cluster,
              database,
              path.join(
                migrationsDirectory,
                "202608260038_production_provider_preview_target_inventory_v4.sql",
              ),
            );

            persistentSession.send(`
              \\set ON_ERROR_STOP off
              ${cachedExecution(pre038LiveInventory)}
              select 'POST038_MISSING_68C81DE_ATTEMPTED';
            `);
            await persistentSession.waitFor(
              "POST038_MISSING_68C81DE_ATTEMPTED",
            );
            assert.match(
              persistentSession.snapshot().stderr,
              /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
              "a cached pre-038 call must resolve the replacement 68c81de assertion",
            );

            persistentSession.send(`
              \\set ON_ERROR_STOP on
              ${cachedExecution(post038LiveInventory)}
              select 'POST038_EXACT_68C81DE_ACCEPTED';
              \\q
            `);
            await persistentSession.waitFor("POST038_EXACT_68C81DE_ACCEPTED");
            const sessionResult = await persistentSession.done;
            assert.equal(sessionResult.status, 0);

            assert.equal(
              psql(cluster, database, `
                select current_assertion.prosecdef::text || '|' ||
                  current_assertion.provolatile::text || '|' ||
                  (current_assertion.proconfig @>
                    array['search_path=pg_catalog'])::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'anon', current_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'authenticated', current_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'service_role', current_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  prior_assertion.prosecdef::text || '|' ||
                  prior_assertion.provolatile::text || '|' ||
                  (prior_assertion.proconfig @>
                    array['search_path=pg_catalog'])::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'anon', prior_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'authenticated', prior_assertion.oid, 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'service_role', prior_assertion.oid, 'EXECUTE'
                  )::text
                from pg_catalog.pg_proc current_assertion
                join pg_catalog.pg_namespace current_namespace
                  on current_namespace.oid = current_assertion.pronamespace
                cross join pg_catalog.pg_proc prior_assertion
                join pg_catalog.pg_namespace prior_namespace
                  on prior_namespace.oid = prior_assertion.pronamespace
                where current_namespace.nspname = 'production_control'
                  and current_assertion.proname =
                    'assert_exact_vercel_live_inventory'
                  and prior_namespace.nspname = 'production_control'
                  and prior_assertion.proname =
                    'assert_exact_vercel_live_inventory_v3';
              `),
              "true|i|true|false|false|true|true|i|true|false|false|true",
            );
            assert.equal(
              productionAuthorityState(),
              "DORMANT|GOOGLE|PASSPORT|OPEN|PAUSED",
            );
          } finally {
            await terminatePsqlSessions(persistentSession);
          }
        },
      );

      await t.test(
        "migration 038 accepts exactly 1,140 retained, seven reviewed, and one dynamic candidate tuple",
        () => {
          const database = cloneDormantDatabase("inventory_038_exact_1148");
          const liveInventory = liveOriginInventoryFor("PREVIEW");
          assert.equal(liveInventory.length, 1148);
          assert.equal(
            assertExactLiveOriginInventory(cluster, database, liveInventory),
            "",
          );
          const input = quiesceBeginInput(
            "REHEARSAL",
            "inventory-038-exact-1148",
          );
          const binding = reserveProviderAttestation(
            cluster,
            database,
            input,
            "BEGIN",
            "inventory-038-exact-1148-begin",
          );
          assert.match(
            binding.attestation_id,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          );
        },
      );

      await t.test(
        "migration 038 permits exact read-only admission inspection in DORMANT and rejects wrong resources",
        () => {
          const database = cloneDormantDatabase(
            "migration_038_dormant_admission_inspection",
          );
          const productionAuthorityState = () => psql(cluster, database, `
            select activation.state || '|' || activation.current_authority ||
              '|' || resource.participant_identity_authority || '|' ||
              gate.admission_state || '|' || gate.state || '|' ||
              activation.scoring_ingress_enabled::text || '|' ||
              resource.workers_enabled::text
            from production_control.cutover_activation_state activation
            join production_control.resource_scope resource
              on resource.scope_key = activation.scope_key
            cross join scoring_authority.ingress_gates gate
            where activation.scope_key = 'BAGGER_INV_PRODUCTION'
              and gate.tournament_id = '2026';
          `);
          const operationalRowCounts = () => psql(cluster, database, `
            select pg_catalog.jsonb_build_object(
              'audit', (select pg_catalog.count(*) from
                production_control.operation_audit_events),
              'leases', (select pg_catalog.count(*) from
                scoring_authority.scoring_ingress_leases),
              'outbox', (select pg_catalog.count(*) from
                scoring_authority.google_outbox_events),
              'archive', (select pg_catalog.count(*) from
                scoring_authority.scorecard_archive_jobs)
            )::text;
          `);
          const before = productionAuthorityState();
          const rowCountsBefore = operationalRowCounts();
          assert.equal(
            before,
            "DORMANT|GOOGLE|PASSPORT|OPEN|PAUSED|false|false",
          );

          const inspected = rpc(
            cluster,
            database,
            "inspect_production_scoring_admission",
            scope,
          );
          assert.equal(inspected.ok, true);
          assert.equal(inspected.activation_state, "DORMANT");
          assert.equal(inspected.authority, "GOOGLE");
          assert.equal(inspected.scoring_authority, "GOOGLE");
          assert.equal(inspected.execution_gate, "PAUSED");
          assert.equal(inspected.admission_state, "OPEN");
          assert.equal(inspected.admission_protocol_enforced, false);
          assert.equal(inspected.scoring_ingress_enabled, false);
          assert.equal(inspected.active_closure_id, null);
          assert.equal(inspected.active_closure_kind, null);
          assert.equal(inspected.active_closure_status, null);
          assert.equal(inspected.staged_request_fingerprint, null);
          assert.equal(inspected.staged_payload_hash, null);
          assert.equal(inspected.staged_certification_fingerprint, null);
          assert.equal(
            inspected.staged_environment_delta_fingerprint_v2,
            null,
          );
          assert.equal(inspected.v2_unresolved, 0);
          assert.equal(inspected.legacy_unclassified, 0);
          for (const field of [
            "active_legacy_writers",
            "unresolved_legacy_writers",
            "ambiguous_google_writes",
            "partial_google_writes",
            "unresolved_outbox",
            "unresolved_archive",
          ]) {
            assert.equal(
              inspected[field],
              0,
              `${field} must be the authoritative dormant integer zero`,
            );
            assert.equal(Number.isInteger(inspected[field]), true);
          }
          assert.equal(
            inspected.first_supabase_canonical_write_possible,
            false,
          );
          assert.equal(
            inspected.first_supabase_canonical_write_observed,
            false,
          );
          assert.equal(
            inspected.external_google_writer_fence_centrally_enforced,
            false,
          );
          assert.match(
            inspected.admission_generation_id,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          );
          assert.ok(Number.isSafeInteger(Number(inspected.admission_revision)));
          assert.ok(Date.parse(inspected.captured_at));

          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "inspect_production_scoring_admission",
              { ...scope, project_ref: "idgigvjjqkfbqjeredpb" },
            ),
            /PRODUCTION_RESOURCE_ASSERTION_FAILED/,
          );
          assert.equal(
            psql(cluster, database, `
              select pg_catalog.has_function_privilege(
                'anon', function_value.oid, 'EXECUTE'
              )::text || '|' ||
                pg_catalog.has_function_privilege(
                  'authenticated', function_value.oid, 'EXECUTE'
                )::text || '|' ||
                pg_catalog.has_function_privilege(
                  'service_role', function_value.oid, 'EXECUTE'
                )::text || '|' || function_value.prosecdef::text || '|' ||
                (function_value.proconfig @>
                  array['search_path=pg_catalog'])::text
              from pg_catalog.pg_proc function_value
              join pg_catalog.pg_namespace namespace_value
                on namespace_value.oid = function_value.pronamespace
              where namespace_value.nspname = 'public'
                and function_value.proname =
                  'inspect_production_scoring_admission';
            `),
            "false|false|true|true|true",
          );
          assert.equal(productionAuthorityState(), before);
          assert.equal(operationalRowCounts(), rowCountsBefore);
        },
      );

      await t.test(
        "migration 038 atomically binds immutable staged provenance and permits exact replay",
        () => {
          const database = cloneDormantDatabase(
            "migration_038_staged_provenance",
          );
          certifySuccessfulRehearsal(
            cluster,
            database,
            "migration-038-staged-provenance-rehearsal",
          );
          const dormant = state(cluster, database);
          const stageInput = {
            ...scope,
            actor_id: actor,
            contract_version: "production-cutover-activation-v1",
            vercel_project: "bagger-inv",
            canonical_domain: "https://baggerinv.com",
            tournament_year: 2026,
            vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
            deployment_commit: deploymentCommit,
            source_fingerprint: sourceFingerprint,
            certification_fingerprint: fingerprint(
              "migration-038-staged-provenance-certification",
            ),
            environment_delta_fingerprint_v2: fingerprint(
              "migration-038-staged-provenance-environment",
            ),
            expected_activation_revision: Number(dormant.activation_revision),
            request_fingerprint: fingerprint(
              "migration-038-staged-provenance-request",
            ),
          };
          const staged = rpc(
            cluster,
            database,
            "stage_production_cutover_release",
            stageInput,
          );
          assert.equal(staged.code, "PRODUCTION_RELEASE_STAGED");
          assert.equal(
            staged.stage_request_fingerprint,
            stageInput.request_fingerprint,
          );
          assert.equal(
            staged.certification_fingerprint,
            stageInput.certification_fingerprint,
          );
          assert.equal(
            staged.environment_delta_fingerprint_v2,
            stageInput.environment_delta_fingerprint_v2,
          );
          assert.match(staged.stage_payload_hash, /^[0-9a-f]{64}$/);

          const replay = rpc(
            cluster,
            database,
            "stage_production_cutover_release",
            stageInput,
          );
          assert.equal(replay.idempotent, true);
          assert.equal(replay.stage_payload_hash, staged.stage_payload_hash);

          const afterStage = state(cluster, database);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "stage_production_cutover_release",
              {
                ...stageInput,
                expected_activation_revision:
                  Number(afterStage.activation_revision),
                certification_fingerprint: fingerprint(
                  "migration-038-recertification-overwrite",
                ),
                request_fingerprint: fingerprint(
                  "migration-038-restage-overwrite",
                ),
              },
            ),
            /PRODUCTION_STAGE_PROVENANCE_IMMUTABLE/,
          );
          const inspected = rpc(
            cluster,
            database,
            "inspect_production_scoring_admission",
            scope,
          );
          assert.equal(
            inspected.staged_request_fingerprint,
            stageInput.request_fingerprint,
          );
          assert.equal(
            inspected.staged_payload_hash,
            staged.stage_payload_hash,
          );
          assert.equal(
            inspected.staged_certification_fingerprint,
            stageInput.certification_fingerprint,
          );
          assert.equal(
            inspected.staged_environment_delta_fingerprint_v2,
            stageInput.environment_delta_fingerprint_v2,
          );

          psql(cluster, database, `
            update production_control.cutover_activation_state
            set state = 'ROLLED_BACK',
                activation_revision = activation_revision + 1
            where scope_key = 'BAGGER_INV_PRODUCTION';
          `);
          const rolledBack = state(cluster, database);
          assert.equal(rolledBack.activation_state, "ROLLED_BACK");
          assert.equal(
            rolledBack.staged_certification_fingerprint,
            stageInput.certification_fingerprint,
          );
          const replayAfterRollback = rpc(
            cluster,
            database,
            "stage_production_cutover_release",
            stageInput,
          );
          assert.equal(replayAfterRollback.idempotent, true);
          assert.equal(
            replayAfterRollback.stage_payload_hash,
            staged.stage_payload_hash,
          );
          assert.equal(state(cluster, database).activation_state, "ROLLED_BACK");

          const restageInput = {
            ...stageInput,
            expected_activation_revision:
              Number(rolledBack.activation_revision),
            certification_fingerprint: fingerprint(
              "migration-038-restage-certification",
            ),
            environment_delta_fingerprint_v2: fingerprint(
              "migration-038-restage-environment",
            ),
            request_fingerprint: fingerprint(
              "migration-038-restage-request",
            ),
          };
          const restaged = rpc(
            cluster,
            database,
            "stage_production_cutover_release",
            restageInput,
          );
          assert.equal(restaged.idempotent, false);
          assert.equal(
            restaged.certification_fingerprint,
            restageInput.certification_fingerprint,
          );
          assert.notEqual(
            restaged.stage_payload_hash,
            staged.stage_payload_hash,
          );

          psql(cluster, database, `
            update production_control.cutover_activation_state
            set state = 'DORMANT',
                activation_revision = activation_revision + 1,
                expected_deployment_commit = null,
                expected_vercel_project_id = null,
                expected_source_fingerprint = null
            where scope_key = 'BAGGER_INV_PRODUCTION';
          `);
          const reset = state(cluster, database);
          assert.equal(reset.activation_state, "DORMANT");
          assert.equal(reset.staged_request_fingerprint, null);
          assert.equal(reset.staged_payload_hash, null);
          assert.equal(reset.staged_certification_fingerprint, null);
          assert.equal(
            reset.staged_environment_delta_fingerprint_v2,
            null,
          );
        },
      );

      await t.test(
        "migration 038 rejects missing, tampered, and colliding 68c81de reviewed tuples",
        () => {
          const database = cloneDormantDatabase(
            "inventory_038_68c81de_negative_cases",
          );
          const reviewed68c81de = reviewedPostCapturePreviewDeployments.find(
            (tuple) => tuple[0] === reviewed68c81deDeployment[0],
          );
          assert.deepEqual(reviewed68c81de, reviewed68c81deDeployment);
          const expectedFailure =
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/;

          const missing68c81de = liveOriginInventoryFor("PREVIEW").filter(
            (tuple) => tuple[0] !== reviewed68c81de[0],
          );
          assert.equal(missing68c81de.length, 1147);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              missing68c81de,
            ),
            expectedFailure,
          );

          const tampered68c81de = sortLiveOriginInventory(
            liveOriginInventoryFor("PREVIEW").map((tuple) =>
              tuple[0] === reviewed68c81de[0]
                ? [tuple[0], "f".repeat(40), ...tuple.slice(2)]
                : tuple
            ),
          );
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              tampered68c81de,
            ),
            expectedFailure,
          );

          const colliding68c81deId = liveOriginInventoryFor("PREVIEW", [[
            reviewed68c81de[0],
            candidateIdentity.commit,
            "https://reviewed-68c81de-id-collision.vercel.app",
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]]);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              colliding68c81deId,
            ),
            expectedFailure,
          );

          const colliding68c81deOrigin = liveOriginInventoryFor("PREVIEW", [[
            "dpl_68c81deReviewedOriginCollision123",
            candidateIdentity.commit,
            reviewed68c81de[2],
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]]);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              colliding68c81deOrigin,
            ),
            expectedFailure,
          );

          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveOriginInventoryFor("PREVIEW"),
              { candidateDeploymentId: reviewed68c81de[0] },
            ),
            expectedFailure,
          );
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveOriginInventoryFor("PREVIEW"),
              { candidateImmutableOrigin: reviewed68c81de[2] },
            ),
            expectedFailure,
          );
        },
      );

      await t.test(
        "migration 038 transitively rejects missing, tampered, and colliding b6 reviewed tuples",
        () => {
          const database = cloneDormantDatabase("inventory_037_b6_negative_cases");
          const reviewedB6 = reviewedPostCapturePreviewDeployments.find(
            (tuple) => tuple[0] === "dpl_idZKEn956pcuEXctKS5HPoWfEn4Y",
          );
          assert.deepEqual(reviewedB6, [
            "dpl_idZKEn956pcuEXctKS5HPoWfEn4Y",
            "b6f50d24d9a96c845305210b958ccf716bbf994d",
            "https://bagger-aggbtffot-sandbagger-invitational.vercel.app",
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]);
          const expectedFailure = /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/;

          const missingB6 = liveOriginInventoryFor("PREVIEW").filter(
            (tuple) => tuple[0] !== reviewedB6[0],
          );
          assert.equal(missingB6.length, 1147);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(cluster, database, missingB6),
            expectedFailure,
          );

          const tamperedB6 = sortLiveOriginInventory(
            liveOriginInventoryFor("PREVIEW").map((tuple) =>
              tuple[0] === reviewedB6[0]
                ? [tuple[0], "f".repeat(40), ...tuple.slice(2)]
                : tuple
            ),
          );
          assertCommandFailure(
            () => assertExactLiveOriginInventory(cluster, database, tamperedB6),
            expectedFailure,
          );

          const collidingB6Origin = liveOriginInventoryFor("PREVIEW", [[
            "dpl_B6ReviewedOriginCollision123",
            candidateIdentity.commit,
            reviewedB6[2],
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]]);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              collidingB6Origin,
            ),
            expectedFailure,
          );

          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveOriginInventoryFor("PREVIEW"),
              { candidateDeploymentId: reviewedB6[0] },
            ),
            expectedFailure,
          );
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveOriginInventoryFor("PREVIEW"),
              { candidateImmutableOrigin: reviewedB6[2] },
            ),
            expectedFailure,
          );
        },
      );

      await t.test(
        "migration 038 rejects an inventory missing a reviewed deployment tuple",
        () => {
          const database = cloneDormantDatabase("inventory_038_missing_reviewed");
          const [reviewed] = reviewedPostCapturePreviewDeployments;
          const liveInventory = liveOriginInventoryFor("PREVIEW").filter(
            (record) => record[0] !== reviewed[0],
          );
          assert.equal(liveInventory.length, 1147);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "migration 038 rejects a tampered reviewed deployment tuple",
        () => {
          const database = cloneDormantDatabase("inventory_038_tampered_reviewed");
          const [reviewed] = reviewedPostCapturePreviewDeployments;
          const liveInventory = sortLiveOriginInventory(
            liveOriginInventoryFor("PREVIEW").map((record) =>
              record[0] === reviewed[0]
                ? [record[0], "a".repeat(40), ...record.slice(2)]
                : record
            ),
          );
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "migration 038 rejects a duplicate reviewed tuple",
        () => {
          const database = cloneDormantDatabase("inventory_038_duplicate_tuple");
          const [reviewed] = reviewedPostCapturePreviewDeployments;
          const liveInventory = sortLiveOriginInventory([
            ...liveOriginInventoryFor("PREVIEW"),
            [...reviewed],
          ]);
          assert.equal(liveInventory.length, 1149);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "migration 038 rejects a reviewed deployment ID reused by a new origin",
        () => {
          const database = cloneDormantDatabase("inventory_038_duplicate_id");
          const [reviewed] = reviewedPostCapturePreviewDeployments;
          const liveInventory = liveOriginInventoryFor("PREVIEW", [[
            reviewed[0],
            candidateIdentity.commit,
            "https://reviewed-id-new-origin-sandbagger-invitational.vercel.app",
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]]);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "migration 038 rejects a reviewed origin reused by a new deployment ID",
        () => {
          const database = cloneDormantDatabase("inventory_038_duplicate_origin");
          const [reviewed] = reviewedPostCapturePreviewDeployments;
          const liveInventory = liveOriginInventoryFor("PREVIEW", [[
            "dpl_ReviewedOriginReuse123",
            candidateIdentity.commit,
            reviewed[2],
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]]);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "migration 038 rejects a dynamic candidate colliding with a reviewed deployment ID",
        () => {
          const database = cloneDormantDatabase("inventory_038_candidate_id_collision");
          const [reviewed] = reviewedPostCapturePreviewDeployments;
          const collidingCandidateOrigin =
            "https://candidate-id-collision-sandbagger-invitational.vercel.app";
          const liveInventory = sortLiveOriginInventory([
            ...originInventory,
            ...reviewedPostCapturePreviewDeployments,
            [
              reviewed[0],
              candidateIdentity.commit,
              collidingCandidateOrigin,
              "FEATURE_PREVIEW",
              "READY",
              "GIT",
            ],
          ]);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
              {
                candidateDeploymentId: reviewed[0],
                candidateImmutableOrigin: collidingCandidateOrigin,
              },
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "migration 038 rejects a dynamic candidate colliding with a reviewed origin",
        () => {
          const database = cloneDormantDatabase("inventory_038_candidate_origin_collision");
          const [reviewed] = reviewedPostCapturePreviewDeployments;
          const collidingCandidateId = "dpl_DynamicCandidateOrigin123";
          const liveInventory = sortLiveOriginInventory([
            ...originInventory,
            ...reviewedPostCapturePreviewDeployments,
            [
              collidingCandidateId,
              candidateIdentity.commit,
              reviewed[2],
              "FEATURE_PREVIEW",
              "READY",
              "GIT",
            ],
          ]);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
              {
                candidateDeploymentId: collidingCandidateId,
                candidateImmutableOrigin: reviewed[2],
              },
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "migration 038 rejects an exact reviewed tuple reused as the dynamic candidate",
        () => {
          const database = cloneDormantDatabase(
            "inventory_038_exact_reviewed_candidate_collision",
          );
          const [reviewed] = reviewedPostCapturePreviewDeployments;
          const liveInventory = sortLiveOriginInventory([
            ...originInventory,
            ...reviewedPostCapturePreviewDeployments,
            [
              "dpl_ReviewedCandidatePadding123",
              reviewed[1],
              "https://reviewed-candidate-padding-sandbagger-invitational.vercel.app",
              "FEATURE_PREVIEW",
              "READY",
              "GIT",
            ],
          ]);
          assert.equal(liveInventory.length, 1148);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
              {
                candidateDeploymentId: reviewed[0],
                candidateDeploymentCommit: reviewed[1],
                candidateImmutableOrigin: reviewed[2],
              },
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "migration 038 rejects an exact retained tuple reused as the dynamic candidate",
        () => {
          const database = cloneDormantDatabase(
            "inventory_038_exact_retained_candidate_collision",
          );
          const retainedCandidate = originInventory.find((record) =>
            record[3] === "FEATURE_PREVIEW" && record[4] === "READY" &&
            record[5] === "GIT" && record[1] !== null,
          );
          assert.ok(retainedCandidate);
          const liveInventory = sortLiveOriginInventory([
            ...originInventory,
            ...reviewedPostCapturePreviewDeployments,
            [
              "dpl_RetainedCandidatePadding123",
              retainedCandidate[1],
              "https://retained-candidate-padding-sandbagger-invitational.vercel.app",
              "FEATURE_PREVIEW",
              "READY",
              "GIT",
            ],
          ]);
          assert.equal(liveInventory.length, 1148);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
              {
                candidateDeploymentId: retainedCandidate[0],
                candidateDeploymentCommit: retainedCandidate[1],
                candidateImmutableOrigin: retainedCandidate[2],
              },
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "migration 038 rejects an unreviewed post-capture deployment with a different SHA",
        () => {
          const database = cloneDormantDatabase("inventory_038_different_sha");
          const liveInventory = liveOriginInventoryFor("PREVIEW", [[
            "dpl_UnreviewedDifferentSha123",
            "abcdef1234567890abcdef1234567890abcdef12",
            "https://unreviewed-different-sha-sandbagger-invitational.vercel.app",
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]]);
          assertCommandFailure(
            () => assertExactLiveOriginInventory(
              cluster,
              database,
              liveInventory,
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "database-issued provider challenges reserve once and recover a lost response",
        () => {
          const database = cloneDormantDatabase("attestation_challenge_recovery");
          const input = quiesceBeginInput(
            "REHEARSAL",
            "attestation-challenge-recovery",
          );
          const details = reserveProviderAttestation(
            cluster,
            database,
            input,
            "BEGIN",
            "attestation-challenge-recovery",
            { returnDetails: true },
          );
          assert.notEqual(
            details.reserved.attestation_id,
            details.challenge.challenge_id,
          );
          assert.equal(
            details.reserved.operation_request_id,
            details.challenge.operation_request_id,
          );
          assert.equal(
            details.reserved.evidence_request_id,
            input.evidence_request_id,
          );
          const recovered = rpc(
            cluster,
            database,
            "consume_production_vercel_provider_attestation_challenge",
            details.consumeInput,
          );
          assert.equal(recovered.attestation_id, details.reserved.attestation_id);
          assert.equal(recovered.idempotent, true);
          const inspected = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_attestation_challenge",
            {
              ...scope,
              actor_id: actor,
              authenticated_actor_fingerprint: fingerprint("authenticated-operator"),
              challenge_id: details.challenge.challenge_id,
              operation_request_id: details.challenge.operation_request_id,
              evidence_request_id: input.evidence_request_id,
              stage: "BEGIN",
              purpose: "REHEARSAL",
              candidate_deployment_id: candidateIdentity.deploymentId,
              candidate_deployment_commit: candidateIdentity.commit,
              candidate_deployment_target: "PREVIEW",
            },
          );
          assert.equal(inspected.status, "CONSUMED");
          assert.equal(
            inspected.consumed_attestation_id,
            details.reserved.attestation_id,
          );
          assert.equal(
            inspected.consumed_provider_attestation.status,
            "RESERVED",
          );
          assert.deepEqual(
            inspected.consumed_provider_attestation.live_origin_inventory,
            input.live_origin_inventory,
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "consume_production_vercel_provider_attestation_challenge",
              {
                ...details.consumeInput,
                consume_request_id: randomUUID(),
              },
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CONSUME_IDEMPOTENCY_CONFLICT/,
          );
        },
      );

      await t.test(
        "signed post-freeze inventory additions expand the exact probe scope",
        () => {
          const database = cloneDormantDatabase("dynamic_provider_scope");
          const input = quiesceBeginInput("REHEARSAL", "dynamic-provider-scope");
          input.live_origin_inventory = liveOriginInventoryFor("PREVIEW", [[
            "dpl_PostFreezeAddition123",
            candidateIdentity.commit,
            "https://post-freeze-addition-sandbagger-invitational.vercel.app",
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]]);
          input.first_probe_records = quiesceProbeRecords(
            new Date().toISOString(),
            "PREVIEW",
            input.live_origin_inventory,
          );
          input.provider_attestation = reserveProviderAttestation(
            cluster,
            database,
            input,
            "BEGIN",
            "dynamic-provider-scope-begin",
          );
          const draining = rpc(
            cluster,
            database,
            "begin_production_vercel_writer_quiesce_evidence",
            input,
          );
          assert.equal(
            Number(draining.live_origin_inventory_count),
            input.live_origin_inventory.length,
          );
          assert.equal(
            Number(draining.probe_origin_count),
            input.live_origin_inventory.length + 5,
          );
          assert.equal(
            Number(draining.probe_record_count),
            (input.live_origin_inventory.length + 5) * 9,
          );
        },
      );

      await t.test(
        "an unconsumed database challenge expires before provider reservation",
        () => {
          const database = cloneDormantDatabase("attestation_challenge_expiry");
          const input = quiesceBeginInput(
            "REHEARSAL",
            "attestation-challenge-expiry",
          );
          const issueInput = providerChallengeIssueInput(
            input,
            "BEGIN",
            "attestation-challenge-expiry",
          );
          const challenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issueInput,
          );
          psql(cluster, database, `
            update production_control.vercel_provider_attestation_challenges
            set issued_at = now() - interval '180 seconds',
                expires_at = now() - interval '60 seconds'
            where challenge_id = ${sqlLiteral(challenge.challenge_id)}::uuid;
          `);
          const attestation = providerAttestation(
            "BEGIN",
            "attestation-challenge-expiry",
            {
              purpose: "REHEARSAL",
              target: "PREVIEW",
              liveInventory: input.live_origin_inventory,
              challengeId: challenge.challenge_id,
              challengeRequestFingerprint:
                challenge.challenge_request_fingerprint,
              operationRequestId: issueInput.operation_request_id,
            },
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "consume_production_vercel_provider_attestation_challenge",
              {
                ...scope,
                actor_id: actor,
                authenticated_actor_fingerprint:
                  fingerprint("authenticated-operator"),
                consume_request_id: randomUUID(),
                request_fingerprint: fingerprint(
                  "attestation-challenge-expiry-consume",
                ),
                challenge_id: challenge.challenge_id,
                challenge_request_id: issueInput.challenge_request_id,
                operation_request_id: issueInput.operation_request_id,
                evidence_request_id: input.evidence_request_id,
                purpose: "REHEARSAL",
                stage: "BEGIN",
                candidate_deployment_id: input.candidate_deployment_id,
                candidate_deployment_commit: input.candidate_deployment_commit,
                candidate_deployment_target: "PREVIEW",
                origin_inventory: input.origin_inventory,
                live_origin_inventory: input.live_origin_inventory,
                provider_attestation: attestation,
              },
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_EXPIRED/,
          );
        },
      );

      await t.test(
        "an exact expired BEGIN challenge is classified and immutably abandoned with lost-response recovery",
        () => {
          const database = cloneDormantDatabase("challenge_abandonment");
          const input = quiesceBeginInput(
            "REHEARSAL",
            "challenge-abandonment",
          );
          const issueInput = providerChallengeIssueInput(
            input,
            "BEGIN",
            "challenge-abandonment",
          );
          issueInput.candidate_deployment_id =
            "dpl_6m9FqCvd8pe1epaxyYMmkRhK7Pc6";
          issueInput.candidate_deployment_commit =
            "3fcbaa287fcb306fa3b47310f01ed6eb3901749c";
          issueInput.candidate_alias_origin =
            "https://old-candidate-alias-sandbagger-invitational.vercel.app";
          issueInput.candidate_immutable_origin =
            "https://bagger-phzmni50c-sandbagger-invitational.vercel.app";
          issueInput.routing_rule_id = "retained-provider-rule";
          issueInput.routing_rule_config_version = "retained-revision-1";
          const challenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issueInput,
          );

          const freshInspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_challenge_abandonment",
            providerChallengeAbandonInspectionInput(issueInput, challenge),
          );
          assert.equal(freshInspection.abandon_eligible, false);
          assert.equal(freshInspection.abandonment_code, "NOT_EXPIRED");
          assert.ok(Date.parse(freshInspection.server_observed_at));

          expireProviderChallenge(cluster, database, challenge.challenge_id);
          const eligibleInspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_challenge_abandonment",
            providerChallengeAbandonInspectionInput(issueInput, challenge),
          );
          assert.equal(eligibleInspection.abandon_eligible, true);
          assert.equal(eligibleInspection.abandonment_code, "ELIGIBLE");

          const abandonInput = providerChallengeAbandonInput(
            issueInput,
            challenge,
            "challenge-abandonment",
          );
          const abandoned = rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            abandonInput,
          );
          assert.equal(abandoned.status, "ABANDONED");
          assert.equal(abandoned.abandon_eligible, false);
          assert.equal(abandoned.abandonment_code, "ABANDONED");
          assert.equal(abandoned.abandon_request_id,
            abandonInput.abandon_request_id);
          assert.equal(abandoned.abandon_request_fingerprint,
            abandonInput.request_fingerprint);
          assert.equal(abandoned.candidate_deployment_id,
            issueInput.candidate_deployment_id);
          assert.equal(abandoned.candidate_deployment_commit,
            issueInput.candidate_deployment_commit);
          assert.equal(abandoned.routing_rule_id, issueInput.routing_rule_id);
          assert.equal(abandoned.routing_rule_config_version,
            issueInput.routing_rule_config_version);
          assert.ok(Date.parse(abandoned.abandoned_at));
          assert.ok(Date.parse(abandoned.server_observed_at));

          const recovered = rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            abandonInput,
          );
          assert.equal(recovered.idempotent, true);
          assert.equal(recovered.abandoned_at, abandoned.abandoned_at);
          assert.equal(recovered.abandon_request_fingerprint,
            abandonInput.request_fingerprint);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "abandon_production_vercel_provider_attestation_challenge",
              {
                ...abandonInput,
                abandon_request_id: randomUUID(),
                request_fingerprint: fingerprint(
                  "challenge-abandonment-conflicting-retry",
                ),
              },
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_IDEMPOTENCY_CONFLICT/,
          );

          assert.equal(
            psql(cluster, database, `
              select status || '|' || stage || '|' ||
                (abandoned_at >= expires_at)::text
              from production_control.vercel_provider_attestation_challenges
              where challenge_id = ${sqlLiteral(challenge.challenge_id)}::uuid;
            `),
            "ABANDONED|BEGIN|true",
          );
          assert.equal(
            psql(cluster, database, `
              select
                (select count(*) from
                  production_control.vercel_provider_attestations
                  where challenge_id = ${sqlLiteral(challenge.challenge_id)}::uuid)
                || '|' ||
                (select count(*) from
                  production_control.vercel_writer_quiesce_evidence
                  where evidence_request_id =
                    ${sqlLiteral(issueInput.evidence_request_id)}::uuid)
                || '|' ||
                (select count(*) from
                  production_control.vercel_provider_attestation_challenges
                  where evidence_request_id =
                    ${sqlLiteral(issueInput.evidence_request_id)}::uuid
                    and stage = 'FINALIZE')
                || '|' ||
                (select count(*) from
                  production_control.google_writer_fence_rehearsals)
                || '|' ||
                (select count(*) from
                  production_control.google_writer_provider_fences);
            `),
            "0|0|0|0|0",
          );
          assert.equal(
            psql(cluster, database, `
              select count(*) || '|' ||
                (details->>'abandonment_reason')
              from production_control.operation_audit_events
              where event_type =
                'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED'
                and request_fingerprint =
                  ${sqlLiteral(abandonInput.request_fingerprint)}
              group by details->>'abandonment_reason';
            `),
            "1|EXPIRED_UNCONSUMED_BEGIN_SUPERSEDED",
          );
          assertCommandFailure(
            () => psql(cluster, database, `
              update production_control.vercel_provider_attestation_challenges
              set updated_at = pg_catalog.clock_timestamp()
              where challenge_id = ${sqlLiteral(challenge.challenge_id)}::uuid;
            `),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED_TERMINAL/,
          );
          assertCommandFailure(
            () => psql(cluster, database, `
              delete from production_control.vercel_provider_attestation_challenges
              where challenge_id = ${sqlLiteral(challenge.challenge_id)}::uuid;
            `),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED_TERMINAL/,
          );

          const nextIssueInput = {
            ...issueInput,
            challenge_request_id: randomUUID(),
            operation_request_id: randomUUID(),
            evidence_request_id: randomUUID(),
            request_fingerprint: fingerprint(
              "challenge-abandonment-next-cycle-issue",
            ),
          };
          const nextChallenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            nextIssueInput,
          );
          assert.equal(nextChallenge.status, "ISSUED");
          assert.equal(nextChallenge.candidate_deployment_id,
            issueInput.candidate_deployment_id);
          assert.equal(nextChallenge.routing_rule_id, issueInput.routing_rule_id);
          assert.equal(
            psql(cluster, database, `
              select pg_catalog.string_agg(status, ',' order by status)
              from production_control.vercel_provider_attestation_challenges
              where challenge_id in (
                ${sqlLiteral(challenge.challenge_id)}::uuid,
                ${sqlLiteral(nextChallenge.challenge_id)}::uuid
              );
            `),
            "ABANDONED,ISSUED",
          );
        },
      );

      await t.test(
        "abandonment requires the exact retained candidate, rule, actor, and Production resource binding",
        () => {
          const database = cloneDormantDatabase("challenge_abandonment_binding");
          const input = quiesceBeginInput(
            "REHEARSAL",
            "challenge-abandonment-binding",
          );
          const issueInput = providerChallengeIssueInput(
            input,
            "BEGIN",
            "challenge-abandonment-binding",
          );
          const challenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issueInput,
          );
          expireProviderChallenge(cluster, database, challenge.challenge_id);
          for (const [label, overrides] of [
            ["candidate", { candidate_deployment_commit: "f".repeat(40) }],
            ["rule", { routing_rule_config_version: "retained-revision-drift" }],
            ["actor", { actor_id: "different-authorized-operator" }],
          ]) {
            assertCommandFailure(
              () => rpc(
                cluster,
                database,
                "abandon_production_vercel_provider_attestation_challenge",
                providerChallengeAbandonInput(
                  issueInput,
                  challenge,
                  `challenge-abandonment-binding-${label}`,
                  overrides,
                ),
              ),
              /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_BINDING_MISMATCH/,
            );
          }
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "abandon_production_vercel_provider_attestation_challenge",
              providerChallengeAbandonInput(
                issueInput,
                challenge,
                "challenge-abandonment-binding-resource",
                { source_workbook_id: "wrong-workbook" },
              ),
            ),
            /PRODUCTION_RESOURCE_ASSERTION_FAILED/,
          );
          const abandoned = rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            providerChallengeAbandonInput(
              issueInput,
              challenge,
              "challenge-abandonment-binding-exact",
            ),
          );
          assert.equal(abandoned.status, "ABANDONED");
        },
      );

      await t.test(
        "a progressed evidence identity is classified and rejected without mutation",
        () => {
          const database = cloneDormantDatabase(
            "challenge_abandonment_progression",
          );
          const input = quiesceBeginInput(
            "REHEARSAL",
            "challenge-abandonment-progression",
          );
          const issueInput = providerChallengeIssueInput(
            input,
            "BEGIN",
            "challenge-abandonment-progression",
          );
          const challenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issueInput,
          );
          expireProviderChallenge(cluster, database, challenge.challenge_id);
          psql(cluster, database, `
            insert into production_control.vercel_provider_attestation_challenges (
              challenge_id, challenge_request_id, operation_request_id,
              evidence_request_id, stage, purpose, issue_request_fingerprint,
              issue_payload_hash, challenge_request_fingerprint, status,
              authenticated_actor_fingerprint, vercel_project_id,
              vercel_team_id, candidate_deployment_id,
              candidate_deployment_commit, candidate_deployment_target,
              candidate_alias_origin, candidate_immutable_origin,
              routing_rule_id, routing_rule_config_version,
              routing_rule_scope, actor_id, issued_at, expires_at,
              created_at, updated_at
            )
            select extensions.gen_random_uuid(), extensions.gen_random_uuid(),
              extensions.gen_random_uuid(), evidence_request_id, 'FINALIZE',
              purpose,
              ${sqlLiteral(fingerprint("progressed-finalize-issue"))},
              ${sqlLiteral(fingerprint("progressed-finalize-payload"))},
              ${sqlLiteral(fingerprint("progressed-finalize-binding"))},
              'ISSUED', authenticated_actor_fingerprint, vercel_project_id,
              vercel_team_id, candidate_deployment_id,
              candidate_deployment_commit, candidate_deployment_target,
              candidate_alias_origin, candidate_immutable_origin,
              routing_rule_id, routing_rule_config_version,
              routing_rule_scope, actor_id, pg_catalog.now(),
              pg_catalog.now() + interval '120 seconds',
              pg_catalog.now(), pg_catalog.now()
            from production_control.vercel_provider_attestation_challenges
            where challenge_id = ${sqlLiteral(challenge.challenge_id)}::uuid;
          `);
          const inspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_attestation_challenge_abandonment",
            providerChallengeAbandonInspectionInput(issueInput, challenge),
          );
          assert.equal(inspection.abandon_eligible, false);
          assert.equal(inspection.abandonment_code, "PROGRESSION_CONFLICT");
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "abandon_production_vercel_provider_attestation_challenge",
              providerChallengeAbandonInput(
                issueInput,
                challenge,
                "challenge-abandonment-progression",
              ),
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_PROGRESSION_CONFLICT/,
          );
          assert.equal(
            psql(cluster, database, `
              select status
              from production_control.vercel_provider_attestation_challenges
              where challenge_id = ${sqlLiteral(challenge.challenge_id)}::uuid;
            `),
            "ISSUED",
          );
          assert.equal(
            psql(cluster, database, `
              select count(*)
              from production_control.operation_audit_events
              where event_type =
                'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED';
            `),
            "0",
          );
        },
      );

      await t.test(
        "consume winning before abandonment is terminal and cannot be discarded",
        () => {
          const database = cloneDormantDatabase("challenge_consume_wins");
          const input = quiesceBeginInput("REHEARSAL", "challenge-consume-wins");
          const issueInput = providerChallengeIssueInput(
            input,
            "BEGIN",
            "challenge-consume-wins",
          );
          const challenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issueInput,
          );
          const consumed = rpc(
            cluster,
            database,
            "consume_production_vercel_provider_attestation_challenge",
            providerChallengeConsumeInput(
              input,
              issueInput,
              challenge,
              "challenge-consume-wins",
            ),
          );
          assert.equal(consumed.status, "RESERVED");
          const inspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_attestation_challenge_abandonment",
            providerChallengeAbandonInspectionInput(issueInput, challenge),
          );
          assert.equal(inspection.abandonment_code, "CONSUMED");
          assert.equal(inspection.abandon_eligible, false);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "abandon_production_vercel_provider_attestation_challenge",
              providerChallengeAbandonInput(
                issueInput,
                challenge,
                "challenge-consume-wins",
              ),
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_TERMINAL_CONFLICT/,
          );
        },
      );

      await t.test(
        "abandonment winning before consume remains terminal and creates no reservation",
        () => {
          const database = cloneDormantDatabase("challenge_abandon_wins");
          const input = quiesceBeginInput("REHEARSAL", "challenge-abandon-wins");
          const issueInput = providerChallengeIssueInput(
            input,
            "BEGIN",
            "challenge-abandon-wins",
          );
          const challenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issueInput,
          );
          const consumeInput = providerChallengeConsumeInput(
            input,
            issueInput,
            challenge,
            "challenge-abandon-wins",
          );
          expireProviderChallenge(cluster, database, challenge.challenge_id);
          const abandoned = rpc(
            cluster,
            database,
            "abandon_production_vercel_provider_attestation_challenge",
            providerChallengeAbandonInput(
              issueInput,
              challenge,
              "challenge-abandon-wins",
            ),
          );
          assert.equal(abandoned.status, "ABANDONED");
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "consume_production_vercel_provider_attestation_challenge",
              consumeInput,
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_(EXPIRED|ABANDONED_TERMINAL)/,
          );
          assert.equal(
            psql(cluster, database, `
              select count(*)
              from production_control.vercel_provider_attestations
              where challenge_id = ${sqlLiteral(challenge.challenge_id)}::uuid;
            `),
            "0",
          );
          const inspection = rpc(
            cluster,
            database,
            "inspect_production_vercel_provider_attestation_challenge_abandonment",
            providerChallengeAbandonInspectionInput(issueInput, challenge),
          );
          assert.equal(inspection.abandonment_code, "ABANDONED");
          assert.equal(inspection.abandon_eligible, false);
        },
      );

      await t.test(
        "concurrent consume and abandon serialize to one terminal abandoned outcome",
        async () => {
          const database = cloneDormantDatabase("challenge_abandon_consume_race");
          const input = quiesceBeginInput(
            "REHEARSAL",
            "challenge-abandon-consume-race",
          );
          const issueInput = providerChallengeIssueInput(
            input,
            "BEGIN",
            "challenge-abandon-consume-race",
          );
          const challenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issueInput,
          );
          expireProviderChallenge(cluster, database, challenge.challenge_id);
          const abandonInput = providerChallengeAbandonInput(
            issueInput,
            challenge,
            "challenge-abandon-consume-race",
          );
          const consumeInput = providerChallengeConsumeInput(
            input,
            issueInput,
            challenge,
            "challenge-abandon-consume-race",
          );

          const lockHolder = spawnPsql(cluster, database, `
            begin;
            select pg_catalog.pg_advisory_xact_lock(${advisoryLockKey});
            select pg_catalog.pg_sleep(2.50);
            commit;
          `);
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: true,
            minimum: 1,
          });

          const abandonSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "abandon_production_vercel_provider_attestation_challenge",
              abandonInput,
            ),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
            minimum: 1,
          });
          const consumeSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "consume_production_vercel_provider_attestation_challenge",
              consumeInput,
            ),
          );
          const consumeDone = consumeSession.done.then(
            (result) => ({ ok: true, result }),
            (error) => ({ ok: false, error }),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
            minimum: 2,
          });

          await lockHolder.done;
          const abandoned = parseJsonOutput((await abandonSession.done).stdout);
          assert.equal(abandoned.status, "ABANDONED");
          const consumed = await consumeDone;
          assert.equal(consumed.ok, false);
          assert.match(
            consumed.error.message,
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_(EXPIRED|ABANDONED_TERMINAL)/,
          );
          assert.equal(
            psql(cluster, database, `
              select challenge.status || '|' ||
                (select count(*) from
                  production_control.vercel_provider_attestations attestation
                  where attestation.challenge_id = challenge.challenge_id)
                || '|' ||
                (select count(*) from production_control.operation_audit_events event
                  where event.event_type =
                    'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED'
                    and event.request_fingerprint =
                      ${sqlLiteral(abandonInput.request_fingerprint)})
                || '|' ||
                (select count(*) from production_control.operation_audit_events event
                  where event.event_type =
                    'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_RESERVED'
                    and event.details->>'challenge_id' = challenge.challenge_id::text)
              from production_control.vercel_provider_attestation_challenges challenge
              where challenge.challenge_id =
                ${sqlLiteral(challenge.challenge_id)}::uuid;
            `),
            "ABANDONED|0|1|0",
          );
        },
      );

      await t.test(
        "concurrent consume queued first reserves once and rejects abandonment",
        async () => {
          const database = cloneDormantDatabase("challenge_consume_abandon_race");
          const input = quiesceBeginInput(
            "REHEARSAL",
            "challenge-consume-abandon-race",
          );
          const issueInput = providerChallengeIssueInput(
            input,
            "BEGIN",
            "challenge-consume-abandon-race",
          );
          const challenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issueInput,
          );
          const consumeInput = providerChallengeConsumeInput(
            input,
            issueInput,
            challenge,
            "challenge-consume-abandon-race",
          );
          const abandonInput = providerChallengeAbandonInput(
            issueInput,
            challenge,
            "challenge-consume-abandon-race",
          );

          const lockHolder = spawnPsql(cluster, database, `
            begin;
            select pg_catalog.pg_advisory_xact_lock(${advisoryLockKey});
            select pg_catalog.pg_sleep(2.50);
            commit;
          `);
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: true,
            minimum: 1,
          });

          const consumeSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "consume_production_vercel_provider_attestation_challenge",
              consumeInput,
            ),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
            minimum: 1,
          });
          const abandonSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "abandon_production_vercel_provider_attestation_challenge",
              abandonInput,
            ),
          );
          const abandonDone = abandonSession.done.then(
            (result) => ({ ok: true, result }),
            (error) => ({ ok: false, error }),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
            minimum: 2,
          });

          await lockHolder.done;
          const consumed = parseJsonOutput((await consumeSession.done).stdout);
          assert.equal(consumed.status, "RESERVED");
          const abandoned = await abandonDone;
          assert.equal(abandoned.ok, false);
          assert.match(
            abandoned.error.message,
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDON_TERMINAL_CONFLICT/,
          );
          assert.equal(
            psql(cluster, database, `
              select challenge.status || '|' ||
                (select count(*) from
                  production_control.vercel_provider_attestations attestation
                  where attestation.challenge_id = challenge.challenge_id)
                || '|' ||
                (select count(*) from production_control.operation_audit_events event
                  where event.event_type =
                    'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_RESERVED'
                    and event.details->>'challenge_id' = challenge.challenge_id::text)
                || '|' ||
                (select count(*) from production_control.operation_audit_events event
                  where event.event_type =
                    'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_ABANDONED'
                    and event.request_fingerprint =
                      ${sqlLiteral(abandonInput.request_fingerprint)})
              from production_control.vercel_provider_attestation_challenges challenge
              where challenge.challenge_id =
                ${sqlLiteral(challenge.challenge_id)}::uuid;
            `),
            "CONSUMED|1|1|0",
          );
        },
      );

      await t.test(
        "a consume queued before expiry cannot commit after the database-clock boundary",
        async () => {
          const database = cloneDormantDatabase(
            "challenge_consume_crosses_expiry",
          );
          const input = quiesceBeginInput(
            "REHEARSAL",
            "challenge-consume-crosses-expiry",
          );
          const issueInput = providerChallengeIssueInput(
            input,
            "BEGIN",
            "challenge-consume-crosses-expiry",
          );
          const challenge = rpc(
            cluster,
            database,
            "issue_production_vercel_provider_attestation_challenge",
            issueInput,
          );
          const consumeInput = providerChallengeConsumeInput(
            input,
            issueInput,
            challenge,
            "challenge-consume-crosses-expiry",
          );
          let lockHolder;
          let consumeSession;
          try {
            lockHolder = spawnInteractivePsql(cluster, database);
            lockHolder.send(`
              begin;
              select pg_catalog.pg_advisory_xact_lock(${advisoryLockKey});
              select 'CROSS_EXPIRY_LOCK_HELD';
            `);
            await lockHolder.waitFor("CROSS_EXPIRY_LOCK_HELD");
            await waitForAdvisoryLocks(cluster, database, {
              mode: "ExclusiveLock",
              granted: true,
              minimum: 1,
            });

            consumeSession = spawnPsql(
              cluster,
              database,
              rpcSql(
                "consume_production_vercel_provider_attestation_challenge",
                consumeInput,
              ),
            );
            const consumeDone = consumeSession.done.then(
              (result) => ({ ok: true, result }),
              (error) => ({ ok: false, error }),
            );
            await waitForAdvisoryLocks(cluster, database, {
              mode: "ExclusiveLock",
              granted: false,
              minimum: 1,
            });
            assert.equal(
              psql(cluster, database, `
                select pg_catalog.clock_timestamp() < expires_at
                from production_control.vercel_provider_attestation_challenges
                where challenge_id =
                  ${sqlLiteral(challenge.challenge_id)}::uuid;
              `),
              "t",
            );

            // The consumer has already entered its transaction and queued on
            // the advisory lock. Move the challenge across the boundary without
            // wall-clock sleeps, then release the consumer deterministically.
            psql(cluster, database, `
              update production_control.vercel_provider_attestation_challenges
              set issued_at = pg_catalog.clock_timestamp() - interval '179 seconds',
                  expires_at = pg_catalog.clock_timestamp() - interval '1 minute'
              where challenge_id = ${sqlLiteral(challenge.challenge_id)}::uuid;
            `);
            assert.equal(
              psql(cluster, database, `
                select pg_catalog.clock_timestamp() > expires_at
                from production_control.vercel_provider_attestation_challenges
                where challenge_id =
                  ${sqlLiteral(challenge.challenge_id)}::uuid;
              `),
              "t",
            );

            lockHolder.send(`
              commit;
              select 'CROSS_EXPIRY_LOCK_RELEASED';
              \\q
            `);
            await lockHolder.waitFor("CROSS_EXPIRY_LOCK_RELEASED");
            await lockHolder.done;

            const consumed = await consumeDone;
            assert.equal(consumed.ok, false);
            assert.match(
              consumed.error.message,
              /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CHALLENGE_EXPIRED/,
            );
            assert.equal(
              psql(cluster, database, `
                select challenge.status || '|' ||
                  (select count(*) from
                    production_control.vercel_provider_attestations attestation
                    where attestation.challenge_id = challenge.challenge_id)
                  || '|' ||
                  (select count(*) from production_control.operation_audit_events event
                    where event.event_type =
                      'PRODUCTION_VERCEL_PROVIDER_ATTESTATION_RESERVED'
                      and event.details->>'challenge_id' = challenge.challenge_id::text)
                from production_control.vercel_provider_attestation_challenges challenge
                where challenge.challenge_id =
                  ${sqlLiteral(challenge.challenge_id)}::uuid;
              `),
              "ISSUED|0|0",
            );
            const inspection = rpc(
              cluster,
              database,
              "inspect_production_vercel_provider_challenge_abandonment",
              providerChallengeAbandonInspectionInput(issueInput, challenge),
            );
            assert.equal(inspection.abandonment_code, "ELIGIBLE");
            assert.equal(inspection.abandon_eligible, true);
          } finally {
            await terminatePsqlSessions(lockHolder, consumeSession);
          }
        },
      );

      await t.test(
        "abandonment RPCs are service-role only, fixed-search-path, and cover every progression blocker",
        () => {
          const database = cloneDormantDatabase("challenge_abandonment_security");
          for (const rpcName of [
            "inspect_production_vercel_provider_challenge_abandonment",
            "abandon_production_vercel_provider_attestation_challenge",
          ]) {
            assert.ok(rpcName.length <= 63,
              `${rpcName} must survive PostgreSQL identifier storage exactly`);
            assert.equal(
              psql(cluster, database, `
                select p.prosecdef::text || '|' ||
                  (p.proconfig @> array['search_path=pg_catalog'])::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'anon', 'public.${rpcName}(jsonb)', 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'authenticated', 'public.${rpcName}(jsonb)', 'EXECUTE'
                  )::text || '|' ||
                  pg_catalog.has_function_privilege(
                    'service_role', 'public.${rpcName}(jsonb)', 'EXECUTE'
                  )::text
                from pg_catalog.pg_proc p
                join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = '${rpcName}';
              `),
              "true|true|false|false|true",
            );
          }
          const abandonDefinition = psql(cluster, database, `
            select pg_catalog.pg_get_functiondef(
              'public.abandon_production_vercel_provider_attestation_challenge(jsonb)'
                ::pg_catalog.regprocedure
            );
          `);
          assert.match(abandonDefinition, /pg_advisory_xact_lock/);
          assert.match(abandonDefinition, /for update/i);
          assert.match(abandonDefinition, /clock_timestamp/);
          assert.match(abandonDefinition,
            /vercel_provider_challenge_has_abandonment_progression/);
          const progressionDefinition = psql(cluster, database, `
            select pg_catalog.pg_get_functiondef(
              'production_control.vercel_provider_challenge_has_abandonment_progression(production_control.vercel_provider_attestation_challenges)'
                ::pg_catalog.regprocedure
            );
          `);
          for (const relation of [
            "vercel_provider_attestations",
            "vercel_writer_quiesce_evidence",
            "vercel_provider_attestation_challenges",
            "google_writer_fence_rehearsals",
            "google_writer_provider_fences",
          ]) assert.match(progressionDefinition, new RegExp(relation));
        },
      );

      await t.test(
        "post-freeze inventory with a different SHA cannot be reserved",
        () => {
          const database = cloneDormantDatabase("dynamic_provider_scope_drift");
          const input = quiesceBeginInput(
            "REHEARSAL",
            "dynamic-provider-scope-drift",
          );
          input.live_origin_inventory = liveOriginInventoryFor("PREVIEW", [[
            "dpl_PostFreezeDrift123",
            "abcdef1234567890abcdef1234567890abcdef12",
            "https://post-freeze-drift-sandbagger-invitational.vercel.app",
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]]);
          assertCommandFailure(
            () => reserveProviderAttestation(
              cluster,
              database,
              input,
              "BEGIN",
              "dynamic-provider-scope-drift-begin",
            ),
            /PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH/,
          );
        },
      );

      await t.test(
        "provider reservations bind the frozen credential-confinement evidence",
        () => {
          const database = cloneDormantDatabase("credential_confinement_drift");
          const input = quiesceBeginInput(
            "REHEARSAL",
            "credential-confinement-drift",
          );
          assertCommandFailure(
            () => reserveProviderAttestation(
              cluster,
              database,
              input,
              "BEGIN",
              "credential-confinement-drift-begin",
              { providerOverrides: {
                credential_confinement_evidence_fingerprint:
                  fingerprint("untrusted-credential-confinement"),
              } },
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_CONSUME_INPUT_INVALID/,
          );
        },
      );

      await t.test(
        "final provider attestation is distinct and rejects rule drift",
        () => {
          const database = cloneDormantDatabase("attestation_finalize_drift");
          const beginInput = quiesceBeginInput(
            "REHEARSAL",
            "attestation-finalize-drift",
          );
          beginInput.provider_attestation = reserveProviderAttestation(
            cluster,
            database,
            beginInput,
            "BEGIN",
            "attestation-finalize-drift-begin",
          );
          const draining = rpc(
            cluster,
            database,
            "begin_production_vercel_writer_quiesce_evidence",
            beginInput,
          );
          backdateQuiesceDrain(cluster, database, draining.evidence_id);
          const finalizeInput = {
            ...beginInput,
            evidence_id: draining.evidence_id,
            second_probe_records: quiesceProbeRecords(
              new Date().toISOString(),
              "PREVIEW",
              beginInput.live_origin_inventory,
            ),
          };
          assertCommandFailure(
            () => reserveProviderAttestation(
              cluster,
              database,
              finalizeInput,
              "FINALIZE",
              "attestation-finalize-drift-finalize",
              {
                providerOverrides: {
                  routing_rule_fingerprint: fingerprint("drifted-rule"),
                },
              },
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_FINALIZE_DRIFT/,
          );
        },
      );

      await t.test(
        "FINALIZE rejects a valid same-SHA live inventory that drifted after BEGIN",
        () => {
          const database = cloneDormantDatabase("attestation_finalize_inventory_drift");
          const beginInput = quiesceBeginInput(
            "REHEARSAL",
            "attestation-finalize-inventory-drift",
          );
          beginInput.provider_attestation = reserveProviderAttestation(
            cluster,
            database,
            beginInput,
            "BEGIN",
            "attestation-finalize-inventory-drift-begin",
          );
          const draining = rpc(
            cluster,
            database,
            "begin_production_vercel_writer_quiesce_evidence",
            beginInput,
          );
          backdateQuiesceDrain(cluster, database, draining.evidence_id);
          const driftedLiveInventory = liveOriginInventoryFor("PREVIEW", [[
            "dpl_FinalizeInventoryDrift123",
            candidateIdentity.commit,
            "https://finalize-inventory-drift-sandbagger-invitational.vercel.app",
            "FEATURE_PREVIEW",
            "READY",
            "GIT",
          ]]);
          assert.equal(driftedLiveInventory.length, 1149);
          const finalizeInput = {
            ...beginInput,
            evidence_id: draining.evidence_id,
            live_origin_inventory: driftedLiveInventory,
            second_probe_records: quiesceProbeRecords(
              new Date().toISOString(),
              "PREVIEW",
              driftedLiveInventory,
            ),
          };
          assertCommandFailure(
            () => reserveProviderAttestation(
              cluster,
              database,
              finalizeInput,
              "FINALIZE",
              "attestation-finalize-inventory-drift-finalize",
            ),
            /PRODUCTION_VERCEL_PROVIDER_ATTESTATION_FINALIZE_DRIFT/,
          );
        },
      );

      await t.test(
        "a durable failed rehearsal blocks authority until exact safe restoration",
        () => {
          const database = cloneDormantDatabase("provider_rehearsal_receipt");
          const dormant = state(cluster, database);
          const quiesce = certifyQuiesce(
            cluster,
            database,
            "REHEARSAL",
            "provider-rehearsal-receipt-quiesce",
          );
          const beginInput = rehearsalBeginInput(
            dormant,
            quiesce.evidence_id,
          );
          const running = rpc(
            cluster,
            database,
            "begin_production_google_writer_fence_rehearsal",
            beginInput,
          );
          assert.equal(running.status, "RUNNING");
          assert.match(
            running.protection_description_prefix,
            /^STEP11_6_WRITER_FENCE_REHEARSAL:[0-9a-f-]{36}$/,
          );
          const lostBeginRecovered = rpc(
            cluster,
            database,
            "begin_production_google_writer_fence_rehearsal",
            beginInput,
          );
          assert.equal(lostBeginRecovered.run_id, running.run_id);
          assert.equal(lostBeginRecovered.idempotent, true);

          const inspectInput = {
            ...scope,
            run_id: running.run_id,
            rehearsal_request_id: beginInput.rehearsal_request_id,
            candidate_deployment_id: beginInput.candidate_deployment_id,
            candidate_deployment_commit:
              beginInput.candidate_deployment_commit,
          };
          assert.equal(
            rpc(
              cluster,
              database,
              "inspect_production_google_writer_fence_rehearsal",
              inspectInput,
            ).status,
            "RUNNING",
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "stage_production_cutover_release",
              {
                ...scope,
                actor_id: actor,
                contract_version: "production-cutover-activation-v1",
                vercel_project: "bagger-inv",
                canonical_domain: "https://baggerinv.com",
                tournament_year: 2026,
                vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
                deployment_commit: deploymentCommit,
                source_fingerprint: sourceFingerprint,
                certification_fingerprint: fingerprint(
                  "rehearsal-stage-blocked-certification",
                ),
                environment_delta_fingerprint_v2: fingerprint(
                  "rehearsal-stage-blocked-environment",
                ),
                expected_activation_revision:
                  Number(dormant.activation_revision),
                request_fingerprint: fingerprint("rehearsal-stage-blocked"),
              },
            ),
            /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_UNRESTORED/,
          );
          assertCommandFailure(
            () => psql(
              cluster,
              database,
              "update production_control.resource_scope set updated_at = now();",
            ),
            /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_UNRESTORED/,
          );

          const failedInput = rehearsalFinishInput(
            beginInput,
            running,
            "FAILED",
            "writer-fence-rehearsal-failed",
          );
          const failed = rpc(
            cluster,
            database,
            "finish_production_google_writer_fence_rehearsal",
            failedInput,
          );
          assert.equal(failed.status, "FAILED");
          assertCommandFailure(
            () => psql(
              cluster,
              database,
              "update production_control.resource_scope set updated_at = now();",
            ),
            /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_UNRESTORED/,
          );

          const restoredInput = rehearsalFinishInput(
            beginInput,
            running,
            "FAILED",
            "writer-fence-rehearsal-restored",
            true,
          );
          const restored = rpc(
            cluster,
            database,
            "finish_production_google_writer_fence_rehearsal",
            restoredInput,
          );
          assert.equal(restored.status, "FAILED");
          assert.equal(restored.restoration_confirmed, true);
          assert.equal(restored.certification_passed, false);
          assert.equal(restored.active_run_owned_protection_count, 0);
          const lostFinishRecovered = rpc(
            cluster,
            database,
            "finish_production_google_writer_fence_rehearsal",
            restoredInput,
          );
          assert.equal(lostFinishRecovered.idempotent, true);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finish_production_google_writer_fence_rehearsal",
              {
                ...restoredInput,
                request_fingerprint: fingerprint(
                  "writer-fence-rehearsal-illegal-second-restore",
                ),
              },
            ),
            /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_FAILED_RECOVERY_REQUIRED/,
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_google_writer_fence_rehearsal",
              {
                ...beginInput,
                rehearsal_request_id: randomUUID(),
                request_fingerprint: fingerprint(
                  "writer-fence-rehearsal-illegal-reapply",
                ),
              },
            ),
            /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_CANDIDATE_ALREADY_USED/,
          );
          assert.equal(
            psql(
              cluster,
              database,
              `select count(*) from production_control.operation_audit_events
               where event_type like 'PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_%';`,
            ),
            "3",
          );
          const ending = state(cluster, database);
          assert.equal(ending.activation_state, "DORMANT");
          assert.equal(ending.authority, "GOOGLE");
          assert.equal(ending.execution_gate, "PAUSED");
          assert.equal(ending.admission_state, "OPEN");
        },
      );

      await t.test(
        "compact quiesce proof vectors cannot be reused across the exact scope",
        () => {
          const database = cloneDormantDatabase("probe_proof_reuse");
          const input = quiesceBeginInput(
            "REHEARSAL",
            "probe-proof-reuse",
          );
          input.first_probe_records[0][9][1] =
            input.first_probe_records[0][9][0];
          input.provider_attestation = reserveProviderAttestation(
            cluster, database, input, "BEGIN", "probe-proof-reuse-begin",
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_vercel_writer_quiesce_evidence",
              input,
            ),
            /PRODUCTION_VERCEL_PROBE_RECORDS_MISMATCH/,
          );
        },
      );

      await t.test(
        "the second probe is post-drain and cannot reuse first-probe proofs",
        () => {
          const staleDatabase = cloneDormantDatabase(
            "second_probe_timestamp",
          );
          const staleBeginInput = quiesceBeginInput(
            "REHEARSAL",
            "second-probe-timestamp",
          );
          staleBeginInput.provider_attestation = reserveProviderAttestation(
            cluster, staleDatabase, staleBeginInput, "BEGIN",
            "second-probe-timestamp-begin",
          );
          const staleDraining = rpc(
            cluster,
            staleDatabase,
            "begin_production_vercel_writer_quiesce_evidence",
            staleBeginInput,
          );
          backdateQuiesceDrain(
            cluster,
            staleDatabase,
            staleDraining.evidence_id,
          );
          const staleObservedAt = new Date(
            Date.now() - 10 * 60 * 1000,
          ).toISOString();
          assertCommandFailure(
            () => rpc(
              cluster,
              staleDatabase,
              "finalize_production_vercel_writer_quiesce_evidence",
              makeQuiesceFinalizeInput(
                cluster,
                staleDatabase,
                staleBeginInput,
                staleDraining,
                "second-probe-timestamp",
                quiesceProbeRecords(staleObservedAt),
              ),
            ),
            /PRODUCTION_VERCEL_WRITER_QUIESCE_SECOND_PROBE_SCOPE_MISMATCH/,
          );

          const reuseDatabase = cloneDormantDatabase(
            "second_probe_proof_reuse",
          );
          const reuseBeginInput = quiesceBeginInput(
            "REHEARSAL",
            "second-probe-proof-reuse",
          );
          reuseBeginInput.provider_attestation = reserveProviderAttestation(
            cluster, reuseDatabase, reuseBeginInput, "BEGIN",
            "second-probe-proof-reuse-begin",
          );
          const reuseDraining = rpc(
            cluster,
            reuseDatabase,
            "begin_production_vercel_writer_quiesce_evidence",
            reuseBeginInput,
          );
          backdateQuiesceDrain(
            cluster,
            reuseDatabase,
            reuseDraining.evidence_id,
          );
          const reusedSecondRecords = reuseBeginInput.first_probe_records.map(
            (record) => [...record.slice(0, 10), new Date().toISOString()],
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              reuseDatabase,
              "finalize_production_vercel_writer_quiesce_evidence",
              makeQuiesceFinalizeInput(
                cluster,
                reuseDatabase,
                reuseBeginInput,
                reuseDraining,
                "second-probe-proof-reuse",
                reusedSecondRecords,
              ),
            ),
            /PRODUCTION_VERCEL_WRITER_QUIESCE_SECOND_PROBE_SCOPE_MISMATCH/,
          );
        },
      );

      await t.test(
        "exact baseline restoration can safely terminate a failed certification",
        () => {
          const database = cloneDormantDatabase(
            "provider_rehearsal_restored_failure",
          );
          const dormant = state(cluster, database);
          const quiesce = certifyQuiesce(
            cluster,
            database,
            "REHEARSAL",
            "writer-fence-restored-failure-quiesce",
          );
          const beginInput = rehearsalBeginInput(
            dormant,
            quiesce.evidence_id,
            "writer-fence-restored-failure-begin",
          );
          const running = rpc(
            cluster,
            database,
            "begin_production_google_writer_fence_rehearsal",
            beginInput,
          );
          const safelyFailedInput = {
            ...rehearsalFinishInput(
              beginInput,
              running,
              "RESTORED",
              "writer-fence-restored-failure-finish",
            ),
            outcome: "FAILED",
            legacy_identity_denied: false,
            failure_code: "LEGACY_CANARY_UNEXPECTEDLY_ALLOWED",
          };
          const safelyFailed = rpc(
            cluster,
            database,
            "finish_production_google_writer_fence_rehearsal",
            safelyFailedInput,
          );
          assert.equal(safelyFailed.status, "FAILED");
          assert.equal(safelyFailed.restoration_confirmed, true);
          assert.equal(safelyFailed.certification_passed, false);

          psql(
            cluster,
            database,
            "update production_control.resource_scope set updated_at = '2030-01-02T03:04:05Z';",
          );
          assert.equal(
            psql(
              cluster,
              database,
              "select updated_at = '2030-01-02T03:04:05Z'::timestamptz from production_control.resource_scope;",
            ),
            "t",
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "stage_production_cutover_release",
              {
                ...scope,
                actor_id: actor,
                contract_version: "production-cutover-activation-v1",
                vercel_project: "bagger-inv",
                canonical_domain: "https://baggerinv.com",
                tournament_year: 2026,
                vercel_project_id: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
                deployment_commit: deploymentCommit,
                source_fingerprint: sourceFingerprint,
                certification_fingerprint: fingerprint(
                  "restored-failed-stage-certification",
                ),
                environment_delta_fingerprint_v2: fingerprint(
                  "restored-failed-stage-environment",
                ),
                expected_activation_revision:
                  Number(dormant.activation_revision),
                request_fingerprint: fingerprint(
                  "restored-failed-stage-rejected",
                ),
              },
            ),
            /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_CERTIFICATION_REQUIRED/,
          );
          const ending = state(cluster, database);
          assert.equal(ending.activation_state, "DORMANT");
          assert.equal(ending.authority, "GOOGLE");
          assert.equal(ending.execution_gate, "PAUSED");
          assert.equal(ending.admission_state, "OPEN");
        },
      );

      await t.test(
        "an authority write waiting behind begin rechecks the row guard",
        async () => {
          const database = cloneDormantDatabase(
            "provider_rehearsal_row_guard_race",
          );
          const dormant = state(cluster, database);
          const quiesce = certifyQuiesce(
            cluster,
            database,
            "REHEARSAL",
            "writer-fence-row-guard-race-quiesce",
          );
          const beginInput = rehearsalBeginInput(
            dormant,
            quiesce.evidence_id,
            "writer-fence-row-guard-race",
          );
          const beginSession = spawnPsql(cluster, database, `
            begin;
            select 1 from production_control.cutover_activation_state
            where scope_key = 'BAGGER_INV_PRODUCTION' for update;
            select 'ACTIVATION_ROW_LOCKED';
            select pg_sleep(0.40);
            ${rpcSql(
              "begin_production_google_writer_fence_rehearsal",
              beginInput,
            )}
            commit;
          `);
          await beginSession.waitFor("ACTIVATION_ROW_LOCKED");
          const waitingUpdate = spawnPsql(
            cluster,
            database,
            "update production_control.cutover_activation_state set updated_at = now() where scope_key = 'BAGGER_INV_PRODUCTION';",
          );
          const updateDone = waitingUpdate.done.then(
            (result) => ({ ok: true, result }),
            (error) => ({ ok: false, error }),
          );
          const running = parseJsonOutput((await beginSession.done).stdout);
          assert.equal(running.status, "RUNNING");
          const updateResult = await updateDone;
          assert.equal(updateResult.ok, false);
          assert.match(
            updateResult.error.message,
            /PRODUCTION_GOOGLE_WRITER_FENCE_REHEARSAL_UNRESTORED/,
          );
          const restored = rpc(
            cluster,
            database,
            "finish_production_google_writer_fence_rehearsal",
            rehearsalFinishInput(
              beginInput,
              running,
              "RESTORED",
              "writer-fence-row-guard-race-restored",
            ),
          );
          assert.equal(restored.status, "RESTORED");
        },
      );

      await t.test("begin linearizes before a waiting close", async () => {
        const database = cloneDatabase("begin_before_close");
        const current = state(cluster, database);
        const nonce = randomUUID();
        const begin = beginInput(current, "begin-before-close", nonce);
        const close = closeInput(
          current,
          baseline.evidenceId,
          "close-after-begin",
        );
        const beginSession = spawnPsql(cluster, database, `
          begin;
          select pg_advisory_xact_lock_shared(${advisoryLockKey});
          select pg_sleep(0.50);
          ${rpcSql("begin_production_scoring_ingress_v2", begin)}
          commit;
        `);
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ShareLock",
          granted: true,
        });

        const closeSession = spawnPsql(
          cluster,
          database,
          rpcSql("close_production_scoring_admission", close),
        );
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ExclusiveLock",
          granted: false,
        });

        const beginResult = parseJsonOutput((await beginSession.done).stdout);
        const closeResult = parseJsonOutput((await closeSession.done).stdout);
        assert.equal(beginResult.resolution_state, "ADMITTED");
        assert.equal(closeResult.admission_state, "CLOSING");
        assert.equal(Number(closeResult.lease_high_watermark), 1);
        assert.equal(Number(closeResult.active_or_unresolved_leases), 1);
      });

      await t.test("a close linearizes before a waiting begin", async () => {
        const database = cloneDatabase("close_before_begin");
        const current = state(cluster, database);
        const close = closeInput(
          current,
          baseline.evidenceId,
          "close-before-begin",
        );
        const begin = beginInput(current, "begin-after-close");
        const closeSession = spawnPsql(cluster, database, `
          begin;
          select pg_advisory_xact_lock(${advisoryLockKey});
          ${rpcSql("close_production_scoring_admission", close)}
          select pg_sleep(0.50);
          commit;
        `);
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ExclusiveLock",
          granted: true,
        });

        const beginSession = spawnPsql(
          cluster,
          database,
          rpcSql("begin_production_scoring_ingress_v2", begin),
        );
        const beginDone = beginSession.done.then(
          (result) => ({ ok: true, result }),
          (error) => ({ ok: false, error }),
        );
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ShareLock",
          granted: false,
        });

        const closeResult = parseJsonOutput((await closeSession.done).stdout);
        assert.equal(closeResult.admission_state, "CLOSING");
        const beginAfterClose = await beginDone;
        assert.equal(beginAfterClose.ok, false);
        assert.match(
          beginAfterClose.error.message,
          /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
        );
      });

      await t.test("a lost close response is recovered idempotently", () => {
        const database = cloneDatabase("lost_close");
        const current = state(cluster, database);
        const close = closeInput(
          current,
          baseline.evidenceId,
          "lost-close-response",
        );
        rpc(cluster, database, "close_production_scoring_admission", close);
        const recovered = rpc(
          cluster,
          database,
          "close_production_scoring_admission",
          close,
        );
        assert.equal(recovered.idempotent, true);
        assert.equal(
          psql(
            cluster,
            database,
            "select count(*) from production_control.scoring_admission_closures;",
          ),
          "1",
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "close_production_scoring_admission",
            { ...close, actor_id: `${actor}-changed` },
          ),
          /PRODUCTION_IDEMPOTENCY_CONFLICT/,
        );
      });

      await t.test(
        "an expired bound provider fence can be refreshed without reopening admission",
        () => {
          const database = cloneDatabase("expired_fence_refresh");
          const beforeClose = state(cluster, database);
          const close = rpc(
            cluster,
            database,
            "close_production_scoring_admission",
            closeInput(
              beforeClose,
              baseline.evidenceId,
              "close-before-fence-expiry",
            ),
          );
          psql(cluster, database, `
            update production_control.scoring_external_fence_evidence
            set captured_at = now() - interval '31 minutes',
                expires_at = now() - interval '1 minute'
            where evidence_id = ${sqlLiteral(baseline.evidenceId)}::uuid;
          `);
          const expiredState = state(cluster, database);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "reopen_production_scoring_admission",
              closureInput(
                expiredState,
                baseline.evidenceId,
                close.closure_id,
                "reopen-with-expired-fence",
              ),
            ),
            /PRODUCTION_EXTERNAL_SCORING_FENCE_EVIDENCE_REQUIRED/,
          );
          const refreshed = refreshFenceEvidence(
            cluster,
            database,
            expiredState,
            close.closure_id,
            baseline.evidenceId,
            "refresh-expired-fence",
          );
          assert.equal(
            refreshed.code,
            "PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_REFRESHED",
          );
          assert.notEqual(refreshed.evidence_id, baseline.evidenceId);
          const afterRefresh = state(cluster, database);
          assert.equal(afterRefresh.admission_state, "CLOSING");
          assert.equal(afterRefresh.execution_gate, "PAUSED");
          assert.equal(
            afterRefresh.external_fence_evidence_id,
            refreshed.evidence_id,
          );
          const reopened = rpc(
            cluster,
            database,
            "reopen_production_scoring_admission",
            closureInput(
              afterRefresh,
              refreshed.evidence_id,
              close.closure_id,
              "reopen-after-fence-refresh",
            ),
          );
          assert.equal(reopened.admission_state, "OPEN");
          assert.equal(reopened.execution_gate, "OPEN");
        },
      );

      await t.test(
        "a lost provider-install response is recovered exactly after authorization expiry",
        () => {
          const database = cloneDormantDatabase("provider_install_recovery");
          certifySuccessfulRehearsal(
            cluster,
            database,
            "provider-recovery-certified-rehearsal",
          );
          stageToArmedGoogleGate(cluster, database, "provider-recovery");
          const quiesce = certifyQuiesce(
            cluster,
            database,
            "CUTOVER",
            "provider-recovery-quiesce",
          );
          const installRequestId = randomUUID();
          const baseline = {
            provider: fingerprint("provider-recovery-baseline-provider"),
            acl: fingerprint("provider-recovery-baseline-acl"),
            canonical: fingerprint("provider-recovery-baseline-canonical"),
            formula: fingerprint("provider-recovery-baseline-formula"),
            combined: fingerprint("provider-recovery-baseline-combined"),
          };
          const begin = rpc(
            cluster,
            database,
            "begin_production_google_writer_provider_fence_install",
            {
              ...scope,
              actor_id: actor,
              install_request_id: installRequestId,
              request_fingerprint:
                fingerprint("provider-recovery-begin-request"),
              quiesce_evidence_id: quiesce.evidence_id,
              candidate_deployment_id: candidateIdentity.deploymentId,
              candidate_deployment_commit: candidateIdentity.commit,
              authenticated_actor_fingerprint:
                fingerprint("authenticated-operator"),
              dedicated_principal_fingerprint:
                fingerprint("dedicated-google-principal"),
              legacy_credential_generation_fingerprint:
                fingerprint("legacy-google-credential-generation-v0"),
              baseline_provider_fingerprint: baseline.provider,
              baseline_acl_fingerprint: baseline.acl,
              baseline_canonical_value_fingerprint: baseline.canonical,
              baseline_formula_fingerprint: baseline.formula,
              baseline_combined_value_fingerprint: baseline.combined,
              writer_scope_fingerprint:
                fingerprint("canonical-google-writer-scope-v2"),
              canonical_sheet_union_fingerprint:
                canonicalSheetUnionFingerprint(cluster, database),
            },
          );
          assert.equal(begin.status, "INSTALLING");
          const provider = {
            provider: fingerprint("provider-recovery-installed-provider"),
            acl: baseline.acl,
            canonical: baseline.canonical,
            formula: baseline.formula,
            combined: baseline.combined,
            structural: fingerprint("provider-recovery-structural"),
            permissions: fingerprint("provider-recovery-permissions"),
          };
          const finishInput = {
            ...scope,
            actor_id: actor,
            fence_id: begin.fence_id,
            install_request_id: installRequestId,
            quiesce_evidence_id: quiesce.evidence_id,
            request_fingerprint:
              fingerprint("provider-recovery-finish-request"),
            candidate_deployment_id: candidateIdentity.deploymentId,
            candidate_deployment_commit: candidateIdentity.commit,
            protection_description_prefix: begin.protection_description_prefix,
            protection_records: providerProtectionRecords(
              begin.protection_description_prefix,
            ),
            provider_fingerprint: provider.provider,
            acl_fingerprint: provider.acl,
            canonical_value_fingerprint: provider.canonical,
            formula_fingerprint: provider.formula,
            combined_value_fingerprint: provider.combined,
            structural_canary_fingerprint: provider.structural,
            permission_inventory_fingerprint: provider.permissions,
          };
          psql(cluster, database, `
            update production_control.vercel_writer_quiesce_evidence
            set owner_acknowledged_at = now() - interval '25 minutes',
                drain_started_at = now() - interval '25 minutes',
                drain_completed_at = now() - interval '20 minutes',
                verified_at = now() - interval '20 minutes',
                expires_at = now() - interval '10 minutes',
                owner_freeze_expires_at = now() - interval '1 minute'
            where evidence_id = ${sqlLiteral(quiesce.evidence_id)}::uuid;
          `);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finish_production_google_writer_provider_fence_install",
              { ...finishInput, quiesce_evidence_id: randomUUID() },
            ),
            /PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_OWNERSHIP_MISMATCH/,
          );
          const installed = rpc(
            cluster,
            database,
            "finish_production_google_writer_provider_fence_install",
            finishInput,
          );
          assert.equal(installed.status, "INSTALLED");
          const recovered = inspectProviderFence(
            cluster,
            database,
            installRequestId,
            begin.fence_id,
          );
          assert.equal(recovered.verification.recovery_only, true);
          assertCommandFailure(
            () => recordFenceEvidence(
              cluster,
              database,
              state(cluster, database),
              "recovery-only-external-evidence",
            ),
            /PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_NOT_CURRENT/,
          );
          const refreshedQuiesce = certifyQuiesce(
            cluster,
            database,
            "CUTOVER",
            "provider-recovery-refresh-quiesce",
            quiesce.evidence_id,
          );
          const refreshed = refreshProviderFence(
            cluster,
            database,
            {
              fenceId: begin.fence_id,
              installRequestId,
              verificationId: recovered.verification.verification_id,
              quiesceEvidenceId: quiesce.evidence_id,
              protectionDescriptionPrefix: begin.protection_description_prefix,
              protectionRecords: finishInput.protection_records,
              provider,
            },
            refreshedQuiesce,
            "provider-recovery-refresh",
          );
          const refreshedInspection = inspectProviderFence(
            cluster,
            database,
            installRequestId,
            begin.fence_id,
          );
          assert.equal(refreshedInspection.verification.recovery_only, false);
          const evidence = recordFenceEvidence(
            cluster,
            database,
            state(cluster, database),
            "provider-recovery-current-evidence",
          );
          assert.equal(evidence.code,
            "PRODUCTION_SCORING_EXTERNAL_FENCE_EVIDENCE_RECORDED");
          assert.equal(refreshed.verificationId,
            refreshedInspection.verification.verification_id);
        },
      );

      await t.test(
        "rollback quiesce refresh gates removal and exact finish survives TTL expiry",
        () => {
          const database = cloneDatabase("rollback_provider_removal");
          psql(cluster, database, `
            update production_control.cutover_activation_state
            set state = 'DORMANT', current_authority = 'GOOGLE',
                scoring_ingress_enabled = false,
                active_transition_epoch_id = null,
                expected_deployment_commit = null,
                expected_vercel_project_id = null,
                expected_source_fingerprint = null,
                read_cutover_phase = 'STATIC_BACKEND',
                staged_by = null, staged_at = null
            where scope_key = 'BAGGER_INV_PRODUCTION';
            update production_control.resource_scope
            set current_tournament_read_authority = 'GOOGLE',
                scoring_authority = 'GOOGLE',
                participant_identity_authority = 'PASSPORT',
                public_supabase_reads_enabled = false,
                auth_user_creation_enabled = false,
                scoring_ingress_enabled = false,
                workers_enabled = false
            where scope_key = 'BAGGER_INV_PRODUCTION';
            update scoring_authority.ingress_gates
            set state = 'PAUSED', authority = 'GOOGLE',
                admission_state = 'OPEN', admission_protocol_enforced = false,
                admission_enforced_at = null,
                admission_deployment_id = null,
                active_epoch_id = null, active_closure_id = null,
                external_fence_evidence_id = null,
                unresolved_client_queues = 0
            where tournament_id = '2026';
          `);
          const prior = currentProviderProof(cluster, database);
          const quiesce = certifyQuiesce(
            cluster,
            database,
            "CUTOVER",
            "rollback-removal-quiesce",
            prior.quiesceEvidenceId,
          );
          const refreshed = refreshProviderFence(
            cluster,
            database,
            prior,
            quiesce,
            "rollback-removal-provider",
          );
          const current = state(cluster, database);
          const removalRequestId = randomUUID();
          const authorize = {
            ...scope,
            actor_id: actor,
            authenticated_actor_fingerprint:
              fingerprint("authenticated-operator"),
            fence_id: refreshed.fenceId,
            install_request_id: refreshed.installRequestId,
            quiesce_evidence_id: refreshed.quiesceEvidenceId,
            provider_fence_verification_id: refreshed.verificationId,
            removal_request_id: removalRequestId,
            request_fingerprint: fingerprint("rollback-removal-authorize"),
            candidate_deployment_id: candidateIdentity.deploymentId,
            candidate_deployment_commit: candidateIdentity.commit,
            expected_activation_revision: Number(current.activation_revision),
            expected_authority_generation: current.authority_generation_id,
            expected_admission_generation: current.admission_generation_id,
            expected_admission_revision: Number(current.admission_revision),
            pre_remove_provider_fingerprint: refreshed.provider.provider,
            expected_post_remove_provider_fingerprint:
              fingerprint("rollback-removal-provider-without-fence"),
            pre_remove_acl_fingerprint: refreshed.provider.acl,
            pre_remove_canonical_value_fingerprint:
              refreshed.provider.canonical,
            pre_remove_combined_value_fingerprint:
              refreshed.provider.combined,
            pre_remove_formula_fingerprint: refreshed.provider.formula,
          };
          psql(cluster, database, `
            update production_control.vercel_writer_quiesce_evidence
            set expires_at = now() + interval '4 minutes'
            where evidence_id = ${sqlLiteral(refreshed.quiesceEvidenceId)}::uuid;
          `);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "authorize_production_google_writer_provider_fence_removal",
              authorize,
            ),
            /PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_NOT_SAFE/,
          );
          psql(cluster, database, `
            update production_control.vercel_writer_quiesce_evidence
            set expires_at = least(
              now() + interval '9 minutes', owner_freeze_expires_at
            )
            where evidence_id = ${sqlLiteral(refreshed.quiesceEvidenceId)}::uuid;
          `);
          const authorized = rpc(
            cluster,
            database,
            "authorize_production_google_writer_provider_fence_removal",
            authorize,
          );
          assert.equal(authorized.status, "REMOVAL_AUTHORIZED");
          const finish = {
            ...scope,
            actor_id: actor,
            fence_id: refreshed.fenceId,
            install_request_id: refreshed.installRequestId,
            quiesce_evidence_id: refreshed.quiesceEvidenceId,
            removal_request_id: removalRequestId,
            request_fingerprint: fingerprint("rollback-removal-finish"),
            candidate_deployment_id: candidateIdentity.deploymentId,
            candidate_deployment_commit: candidateIdentity.commit,
            removed_protected_range_ids: refreshed.protectionRecords.map(
              (record) => record.protectedRangeId,
            ).sort((left, right) => left - right),
            active_run_owned_protection_count: 0,
            restored_provider_fingerprint:
              authorize.expected_post_remove_provider_fingerprint,
            restored_acl_fingerprint: authorize.pre_remove_acl_fingerprint,
            restored_canonical_value_fingerprint:
              authorize.pre_remove_canonical_value_fingerprint,
            restored_combined_value_fingerprint:
              authorize.pre_remove_combined_value_fingerprint,
            restored_formula_fingerprint:
              authorize.pre_remove_formula_fingerprint,
            restoration_evidence_fingerprint:
              fingerprint("rollback-removal-restoration-evidence"),
          };
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finish_production_google_writer_provider_fence_removal",
              { ...finish, quiesce_evidence_id: randomUUID() },
            ),
            /PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_PROOF_MISMATCH/,
          );
          psql(cluster, database, `
            update production_control.cutover_activation_state
            set state = 'GOOGLE_LEASE_ARMED'
            where scope_key = 'BAGGER_INV_PRODUCTION';
          `);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finish_production_google_writer_provider_fence_removal",
              finish,
            ),
            /PRODUCTION_GOOGLE_WRITER_PROVIDER_FENCE_REMOVAL_NOT_SAFE/,
          );
          psql(cluster, database, `
            update production_control.cutover_activation_state
            set state = 'DORMANT'
            where scope_key = 'BAGGER_INV_PRODUCTION';
            update production_control.vercel_writer_quiesce_evidence
            set owner_acknowledged_at = now() - interval '40 minutes',
                drain_started_at = now() - interval '35 minutes',
                drain_completed_at = now() - interval '30 minutes',
                verified_at = now() - interval '30 minutes',
                expires_at = now() - interval '16 minutes',
                owner_freeze_expires_at = now() - interval '15 minutes'
            where evidence_id = ${sqlLiteral(refreshed.quiesceEvidenceId)}::uuid;
            update production_control.google_writer_provider_fence_verifications
            set captured_at = now() - interval '40 minutes',
                expires_at = now() - interval '10 minutes'
            where verification_id = ${sqlLiteral(refreshed.verificationId)}::uuid;
          `);
          const removed = rpc(
            cluster,
            database,
            "finish_production_google_writer_provider_fence_removal",
            finish,
          );
          assert.equal(removed.status, "REMOVED");
          assert.equal(state(cluster, database).provider_fence_id, null);
        },
      );

      await t.test(
        "a lost BEGIN response reuses one durable operation and rotates only its capability",
        () => {
          const database = cloneDatabase("lost_begin");
          const current = state(cluster, database);
          const operationRequestId = randomUUID();
          const firstNonce = randomUUID();
          const retryNonce = randomUUID();
          const admitted = rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            beginInput(
              current,
              "lost-begin-first-request",
              firstNonce,
              operationRequestId,
            ),
          );
          const recovered = rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            beginInput(
              current,
              "lost-begin-retry-request",
              retryNonce,
              operationRequestId,
            ),
          );
          assert.equal(recovered.lease_id, admitted.lease_id);
          assert.equal(recovered.operation_request_id, operationRequestId);
          assert.equal(recovered.idempotent, true);
          assert.equal(recovered.lease_nonce_rotated, true);
          assert.equal(recovered.replay_usable, true);
          assert.equal(
            psql(
              cluster,
              database,
              `select count(*) from scoring_authority.scoring_ingress_leases
               where operation_request_id = ${sqlLiteral(operationRequestId)}::uuid;`,
            ),
            "1",
          );
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "mark_production_scoring_ingress_write_started",
              {
                ...optimisticInput(current, "lost-begin-old-nonce"),
                lease_id: admitted.lease_id,
                lease_nonce: firstNonce,
              },
            ),
            /PRODUCTION_SCORING_LEASE_NONCE_INVALID/,
          );
          const started = rpc(
            cluster,
            database,
            "mark_production_scoring_ingress_write_started",
            {
              ...optimisticInput(current, "lost-begin-new-nonce"),
              lease_id: admitted.lease_id,
              lease_nonce: retryNonce,
            },
          );
          assert.equal(started.resolution_state, "WRITE_STARTED");
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_scoring_ingress_v2",
              {
                ...beginInput(
                  current,
                  "lost-begin-conflicting-payload",
                  randomUUID(),
                  operationRequestId,
                ),
                operation: "FINALIZE_MATCH",
              },
            ),
            /PRODUCTION_SCORING_INGRESS_V2_IDEMPOTENCY_CONFLICT/,
          );
        },
      );

      await t.test("atomic admission overhead is operationally bounded", (benchmark) => {
        const database = cloneDatabase("admission_latency");
        const current = state(cluster, database);
        const input = beginInput(
          current,
          "admission-latency-probe",
          randomUUID(),
          randomUUID(),
        );
        const explain = JSON.parse(psql(
          cluster,
          database,
          `explain (analyze, format json) ${rpcSql("begin_production_scoring_ingress_v2", input)}`,
        ));
        const databaseExecutionMs = Number(explain?.[0]?.["Execution Time"]);
        const roundTripStartedAt = performance.now();
        const replay = rpc(
          cluster,
          database,
          "begin_production_scoring_ingress_v2",
          input,
        );
        const localRoundTripMs = performance.now() - roundTripStartedAt;
        assert.equal(replay.idempotent, true);
        assert.ok(Number.isFinite(databaseExecutionMs) && databaseExecutionMs >= 0);
        assert.ok(databaseExecutionMs < 250, `Admission RPC took ${databaseExecutionMs} ms in isolated PostgreSQL.`);
        benchmark.diagnostic(
          `isolated admission RPC: ${databaseExecutionMs.toFixed(3)} ms database execution; ` +
          `${localRoundTripMs.toFixed(3)} ms local psql process/connection round trip`,
        );
      });

      await t.test(
        "an admitted lost BEGIN is recoverable after close while new operations stay denied",
        () => {
          const database = cloneDatabase("lost_begin_across_close");
          const original = state(cluster, database);
          const operationRequestId = randomUUID();
          const firstNonce = randomUUID();
          const retryNonce = randomUUID();
          const admitted = rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            beginInput(
              original,
              "lost-begin-before-close",
              firstNonce,
              operationRequestId,
            ),
          );
          const close = rpc(
            cluster,
            database,
            "close_production_scoring_admission",
            closeInput(
              original,
              baseline.evidenceId,
              "close-after-lost-begin",
            ),
          );
          const recovered = rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            beginInput(
              original,
              "recover-lost-begin-after-close",
              retryNonce,
              operationRequestId,
            ),
          );
          assert.equal(recovered.lease_id, admitted.lease_id);
          assert.equal(recovered.idempotent, true);
          assert.equal(recovered.replay_usable, true);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_scoring_ingress_v2",
              beginInput(original, "new-begin-after-close"),
            ),
            /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
          );

          const outcomeEvidence = psql(cluster, database, `
            select production_control.scoring_lease_outcome_evidence_hash(
              lease_id, request_fingerprint, 'PROVEN_NO_WRITE',
              null, null, null, null,
              authority_generation_id, admission_generation_id,
              admission_revision
            )
            from scoring_authority.scoring_ingress_leases
            where lease_id = ${sqlLiteral(admitted.lease_id)}::uuid;
          `);
          const reported = rpc(
            cluster,
            database,
            "report_production_scoring_ingress_outcome",
            {
              ...optimisticInput(original, "report-lost-begin-no-write"),
              lease_id: admitted.lease_id,
              lease_nonce: retryNonce,
              outcome_state: "PROVEN_NO_WRITE",
              outcome_evidence_fingerprint: outcomeEvidence,
            },
          );
          assert.equal(reported.resolution_state, "PROVEN_NO_WRITE");
          const afterReport = state(cluster, database);
          const drained = rpc(
            cluster,
            database,
            "drain_production_scoring_admission",
            closureInput(
              afterReport,
              baseline.evidenceId,
              close.closure_id,
              "drain-recovered-lost-begin",
            ),
          );
          assert.equal(drained.ready_to_finalize, true);
          assert.equal(Number(drained.active_or_unresolved_leases), 0);
        },
      );

      await t.test("expired leases become durable ambiguity blockers", () => {
        const database = cloneDatabase("expired_blockers");
        const current = state(cluster, database);
        const admittedNonce = randomUUID();
        const startedNonce = randomUUID();
        const admitted = rpc(
          cluster,
          database,
          "begin_production_scoring_ingress_v2",
          beginInput(current, "expired-admitted", admittedNonce),
        );
        const started = rpc(
          cluster,
          database,
          "begin_production_scoring_ingress_v2",
          beginInput(current, "expired-write-started", startedNonce),
        );
        rpc(
          cluster,
          database,
          "mark_production_scoring_ingress_write_started",
          {
            ...optimisticInput(current, "mark-expired-write-started"),
            lease_id: started.lease_id,
            lease_nonce: startedNonce,
          },
        );
        psql(cluster, database, `
          update scoring_authority.scoring_ingress_leases
          set expires_at = now() - interval '1 second'
          where lease_id in (
            ${sqlLiteral(admitted.lease_id)}::uuid,
            ${sqlLiteral(started.lease_id)}::uuid
          );
        `);

        const close = rpc(
          cluster,
          database,
          "close_production_scoring_admission",
          closeInput(current, baseline.evidenceId, "close-expired-leases"),
        );
        const afterClose = state(cluster, database);
        const drained = rpc(
          cluster,
          database,
          "drain_production_scoring_admission",
          closureInput(
            afterClose,
            baseline.evidenceId,
            close.closure_id,
            "drain-expired-leases",
          ),
        );
        assert.equal(Number(drained.expired_became_ambiguous), 2);
        assert.equal(Number(drained.active_or_unresolved_leases), 2);
        assert.equal(drained.ready_to_finalize, false);
        assert.deepEqual(
          parseJsonOutput(psql(cluster, database, `
            select jsonb_agg(
              jsonb_build_object(
                'resolution_state', resolution_state,
                'last_error_code', last_error_code
              ) order by last_error_code
            )
            from scoring_authority.scoring_ingress_leases
            where lease_id in (
              ${sqlLiteral(admitted.lease_id)}::uuid,
              ${sqlLiteral(started.lease_id)}::uuid
            );
          `)),
          [
            {
              resolution_state: "AMBIGUOUS",
              last_error_code: "LEASE_EXPIRED_AFTER_WRITE_START",
            },
            {
              resolution_state: "AMBIGUOUS",
              last_error_code: "LEASE_EXPIRED_WITHOUT_WRITE_START_PROOF",
            },
          ],
        );

        const afterDrain = state(cluster, database);
        const boundary = finalBoundary(cluster, database);
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "finalize_production_scoring_admission",
            finalizationInput(
              afterDrain,
              baseline.evidenceId,
              close.closure_id,
              drained,
              boundary,
              "finalize-with-ambiguity",
            ),
          ),
          /PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_CHANGED/,
        );
      });

      await t.test("finalization binds the exact drained fingerprint boundary", () => {
        const database = cloneDatabase("final_boundary");
        const beforeClose = state(cluster, database);
        const close = rpc(
          cluster,
          database,
          "close_production_scoring_admission",
          closeInput(beforeClose, baseline.evidenceId, "close-final-boundary"),
        );
        const afterClose = state(cluster, database);
        const drained = rpc(
          cluster,
          database,
          "drain_production_scoring_admission",
          closureInput(
            afterClose,
            baseline.evidenceId,
            close.closure_id,
            "drain-final-boundary",
          ),
        );
        assert.equal(drained.ready_to_finalize, true);
        const afterDrain = state(cluster, database);
        const boundary = finalBoundary(cluster, database);
        const finalize = finalizationInput(
          afterDrain,
          baseline.evidenceId,
          close.closure_id,
          drained,
          boundary,
          "finalize-boundary",
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "finalize_production_scoring_admission",
            {
              ...finalize,
              request_fingerprint: fingerprint("wrong-final-boundary-request"),
              lease_set_fingerprint: fingerprint("wrong-lease-set"),
            },
          ),
          /PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_CHANGED/,
        );
        const finalized = rpc(
          cluster,
          database,
          "finalize_production_scoring_admission",
          finalize,
        );
        assert.equal(finalized.admission_state, "CLOSED");
        assert.equal(finalized.lease_set_fingerprint, drained.lease_set_fingerprint);

        const beforeReopen = state(cluster, database);
        const oldGeneration = beforeReopen.admission_generation_id;
        const reopened = rpc(
          cluster,
          database,
          "reopen_production_scoring_admission",
          closureInput(
            beforeReopen,
            baseline.evidenceId,
            close.closure_id,
            "reopen-after-final-boundary",
          ),
        );
        assert.equal(reopened.admission_state, "OPEN");
        assert.notEqual(reopened.admission_generation_id, oldGeneration);
      });

      await t.test("reopen uses the same exclusive transition lock as close", async () => {
        const database = cloneDatabase("close_reopen_lock");
        const beforeClose = state(cluster, database);
        const closeResult = rpc(
          cluster,
          database,
          "close_production_scoring_admission",
          closeInput(
            beforeClose,
            baseline.evidenceId,
            "exclusive-close-before-reopen",
          ),
        );
        const afterClose = state(cluster, database);
        const sharedHolder = spawnPsql(cluster, database, `
          begin;
          select pg_advisory_xact_lock_shared(${advisoryLockKey});
          select pg_sleep(0.50);
          commit;
        `);
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ShareLock",
          granted: true,
        });
        const reopenSession = spawnPsql(
          cluster,
          database,
          rpcSql(
            "reopen_production_scoring_admission",
            closureInput(
              afterClose,
              baseline.evidenceId,
              closeResult.closure_id,
              "exclusive-reopen-after-close",
            ),
          ),
        );
        await waitForAdvisoryLocks(cluster, database, {
          mode: "ExclusiveLock",
          granted: false,
        });

        await sharedHolder.done;
        const reopened = parseJsonOutput((await reopenSession.done).stdout);
        assert.equal(reopened.admission_state, "OPEN");
        assert.notEqual(
          reopened.admission_generation_id,
          closeResult.admission_generation_id,
        );
      });

      await t.test(
        "prepare and commit exclude reopen, and rollback pause waits for Supabase runtime",
        async () => {
          const database = cloneDatabase("authority_lock_order");
          const cutoverClosed = closeDrainFinalize(
            cluster,
            database,
            baseline.evidenceId,
            "cutover-boundary",
          );
          const preparePayload = prepareEpochInput(
            cutoverClosed.current,
            baseline.evidenceId,
            cutoverClosed,
            "CUTOVER",
            "exclusive-cutover",
          );
          const prepareLockHolder = spawnPsql(cluster, database, `
            begin;
            select pg_advisory_xact_lock_shared(${advisoryLockKey});
            select pg_sleep(0.75);
            commit;
          `);
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ShareLock",
            granted: true,
          });
          const prepareSession = spawnPsql(
            cluster,
            database,
            rpcSql("prepare_production_authority_epoch", preparePayload),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
          });
          const reopenDuringPrepareSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "reopen_production_scoring_admission",
              closureInput(
                cutoverClosed.current,
                baseline.evidenceId,
                cutoverClosed.close.closure_id,
                "reopen-during-cutover-prepare",
              ),
            ),
          );
          const reopenDuringPrepareDone = reopenDuringPrepareSession.done.then(
            (result) => ({ ok: true, result }),
            (error) => ({ ok: false, error }),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
            minimum: 2,
          });

          await prepareLockHolder.done;
          const prepared = parseJsonOutput((await prepareSession.done).stdout);
          const reopenAfterPrepare = await reopenDuringPrepareDone;
          assert.equal(reopenAfterPrepare.ok, false);
          assert.match(
            reopenAfterPrepare.error.message,
            /PRODUCTION_SCORING_ADMISSION_NOT_REOPENABLE/,
          );
          const preparedState = state(cluster, database);
          assert.equal(preparedState.activation_state, "CUTOVER_PREPARED");
          assert.equal(preparedState.admission_state, "CLOSED");
          assert.equal(preparedState.execution_gate, "PAUSED");
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_scoring_ingress",
              beginInput(preparedState, "legacy-begin-while-prepared"),
            ),
            /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
          );

          const commitPayload = commitEpochInput(
            preparedState,
            baseline.evidenceId,
            cutoverClosed,
            prepared.epoch_id,
            "exclusive-cutover",
          );
          const commitLockHolder = spawnPsql(cluster, database, `
            begin;
            select pg_advisory_xact_lock_shared(${advisoryLockKey});
            select pg_sleep(0.75);
            commit;
          `);
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ShareLock",
            granted: true,
          });
          const commitSession = spawnPsql(
            cluster,
            database,
            rpcSql("commit_production_authority_epoch", commitPayload),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
          });
          const reopenDuringCommitSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "reopen_production_scoring_admission",
              closureInput(
                preparedState,
                baseline.evidenceId,
                cutoverClosed.close.closure_id,
                "reopen-during-cutover-commit",
              ),
            ),
          );
          const reopenDuringCommitDone = reopenDuringCommitSession.done.then(
            (result) => ({ ok: true, result }),
            (error) => ({ ok: false, error }),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
            minimum: 2,
          });

          await commitLockHolder.done;
          const committed = parseJsonOutput((await commitSession.done).stdout);
          const reopenAfterCommit = await reopenDuringCommitDone;
          assert.equal(reopenAfterCommit.ok, false);
          assert.match(
            reopenAfterCommit.error.message,
            /PRODUCTION_SCORING_ADMISSION_NOT_REOPENABLE/,
          );
          assert.equal(committed.authority, "SUPABASE");
          assert.equal(committed.admission_state, "CLOSED");
          assert.equal(committed.scoring_ingress_enabled, true);

          const committedState = state(cluster, database);
          const enabledOutboxWorker = rpc(
            cluster,
            database,
            "set_production_cutover_worker_state",
            {
              ...scope,
              actor_id: actor,
              deployment_commit: deploymentCommit,
              worker_name: "SCORING_GOOGLE_OUTBOX",
              enabled: true,
              expected_activation_revision: Number(
                committedState.activation_revision,
              ),
              expected_epoch_id: committedState.authority_generation_id,
              google_service_account_email:
                "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
              request_fingerprint: fingerprint(
                "enable-outbox-worker-before-rollback-drain",
              ),
            },
          );
          assert.equal(enabledOutboxWorker.enabled, true);
          const afterOutboxEnable = state(cluster, database);
          const enabledArchiveWorker = rpc(
            cluster,
            database,
            "set_production_cutover_worker_state",
            {
              ...scope,
              actor_id: actor,
              deployment_commit: deploymentCommit,
              worker_name: "ROUND_SCORECARDS_ARCHIVE",
              enabled: true,
              expected_activation_revision: Number(
                afterOutboxEnable.activation_revision,
              ),
              expected_epoch_id: afterOutboxEnable.authority_generation_id,
              google_service_account_email:
                "sbi-production-workbook@sandbagger-invitational.iam.gserviceaccount.com",
              request_fingerprint: fingerprint(
                "enable-archive-worker-before-rollback-drain",
              ),
            },
          );
          assert.equal(enabledArchiveWorker.enabled, true);

          // Model a canonical Supabase transaction that committed immediately
          // before rollback paused ingress. Its durable mirror and archive
          // events must be drainable while new canonical RPCs remain rejected.
          psql(cluster, database, `
            update scoring_authority.matches
            set match_revision = 1, updated_at = now()
            where match_id = '2026-R1-1';
            insert into scoring_authority.google_outbox_events (
              tournament_id, match_id, match_revision, hole_number,
              hole_revision, mutation_key, event_type, payload, payload_hash
            ) values (
              '2026', '2026-R1-1', 1, 1, 1,
              'rollback-drain-event', 'HOLE_SCORE_UPSERTED',
              '{"test":"rollback-worker-drain"}'::jsonb,
              ${sqlLiteral(fingerprint("rollback-worker-drain-payload"))}
            );
            insert into scoring_authority.finalized_scorecard_snapshots (
              snapshot_id, tournament_id, match_id, snapshot_revision,
              match_revision, scoring_snapshot_id,
              scoring_snapshot_revision, source_fingerprint, payload_hash,
              payload, state, finalized_at, invalidated_at
            ) values (
              '00000000-0000-4000-8000-000000000116',
              '2026', '2026-R1-1', 1, 0,
              'snapshot-2026-r1-m1', 1,
              ${sqlLiteral(fingerprint("rollback-archive-source"))},
              ${sqlLiteral(fingerprint("rollback-archive-payload"))},
              '{"test":"rollback-archive-drain"}'::jsonb,
              'INVALIDATED', now(), now()
            );
            insert into scoring_authority.scorecard_archive_jobs (
              tournament_id, match_id, snapshot_id, snapshot_revision,
              match_revision, event_type, source_fingerprint,
              archive_payload_hash
            ) values (
              '2026', '2026-R1-1',
              '00000000-0000-4000-8000-000000000116', 1, 0,
              'SCORECARD_ARCHIVE_INVALIDATE',
              ${sqlLiteral(fingerprint("rollback-archive-source"))},
              ${sqlLiteral(fingerprint("rollback-archive-payload"))}
            );
          `);

          const supabaseState = state(cluster, database);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "begin_production_scoring_ingress",
              beginInput(supabaseState, "legacy-google-begin-after-commit"),
            ),
            /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
          );
          const rollbackEvidence = recordFenceEvidence(
            cluster,
            database,
            supabaseState,
            "rollback-external-fence",
          );
          const runtimeInput = {
            ...scope,
            deployment_commit: deploymentCommit,
            expected_epoch_id: supabaseState.authority_generation_id,
          };
          const runtimeSession = spawnPsql(cluster, database, `
            begin;
            select production_control.assert_production_scoring_runtime(
              ${jsonSql(runtimeInput)}
            );
            select pg_sleep(0.50);
            commit;
          `);
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ShareLock",
            granted: true,
          });

          const rollbackCloseSession = spawnPsql(
            cluster,
            database,
            rpcSql(
              "close_production_scoring_admission",
              closeInput(
                supabaseState,
                rollbackEvidence.evidence_id,
                "rollback-close-after-runtime",
              ),
            ),
          );
          await waitForAdvisoryLocks(cluster, database, {
            mode: "ExclusiveLock",
            granted: false,
          });

          await runtimeSession.done;
          const rollbackClose = parseJsonOutput(
            (await rollbackCloseSession.done).stdout,
          );
          assert.equal(rollbackClose.admission_state, "CLOSED");
          assert.equal(rollbackClose.execution_gate, "PAUSED");

          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_production_scoring_runtime(
                ${jsonSql(runtimeInput)}
              );
            `),
            /PRODUCTION_SUPABASE_SCORING_ADMISSION_V2_REQUIRED/,
          );
          assertCommandFailure(
            () => psql(cluster, database, `
              select production_control.assert_production_scoring_runtime(
                ${jsonSql(runtimeInput)}, 'UNRECOGNIZED_WORKER'
              );
            `),
            /PRODUCTION_SUPABASE_SCORING_ADMISSION_V2_REQUIRED/,
          );

          const blockedDrainState = state(cluster, database);
          const blockedDrain = rpc(
            cluster,
            database,
            "drain_production_scoring_admission",
            closureInput(
              blockedDrainState,
              rollbackEvidence.evidence_id,
              rollbackClose.closure_id,
              "rollback-queues-still-pending-drain",
            ),
          );
          assert.equal(blockedDrain.ready_to_finalize, true);
          const blockedBoundary = finalBoundary(cluster, database);
          assertCommandFailure(
            () => rpc(
              cluster,
              database,
              "finalize_production_scoring_admission",
              finalizationInput(
                state(cluster, database),
                rollbackEvidence.evidence_id,
                rollbackClose.closure_id,
                blockedDrain,
                blockedBoundary,
                "rollback-queues-still-pending-finalize",
              ),
            ),
            /PRODUCTION_SCORING_ADMISSION_FINAL_BOUNDARY_CHANGED/,
          );

          const rollbackWorkerInput = {
            ...scope,
            deployment_commit: deploymentCommit,
            expected_epoch_id: supabaseState.authority_generation_id,
            worker_id: "rollback-drain-worker",
          };
          const claimedRollbackEvent = rpc(
            cluster,
            database,
            "claim_production_google_outbox",
            { ...rollbackWorkerInput, lease_seconds: 30 },
          );
          assert.equal(claimedRollbackEvent.ok, true);
          assert.equal(
            claimedRollbackEvent.event.mutation_key,
            "rollback-drain-event",
          );
          const completedRollbackEvent = rpc(
            cluster,
            database,
            "complete_production_google_outbox",
            {
              ...rollbackWorkerInput,
              event_id: claimedRollbackEvent.event.id,
              verified_fingerprint: fingerprint(
                "rollback-drain-google-readback",
              ),
              google_match_revision: 1,
              google_hole_revision: 1,
            },
          );
          assert.equal(completedRollbackEvent.ok, true);

          const claimedArchiveJob = rpc(
            cluster,
            database,
            "claim_production_scorecard_archive_job",
            {
              ...rollbackWorkerInput,
              worker_id: "rollback-archive-worker",
              lease_seconds: 30,
            },
          );
          assert.equal(claimedArchiveJob.ok, true);
          assert.equal(
            claimedArchiveJob.job.event_type,
            "SCORECARD_ARCHIVE_INVALIDATE",
          );
          const completedArchiveJob = rpc(
            cluster,
            database,
            "complete_production_scorecard_archive_job",
            {
              ...rollbackWorkerInput,
              worker_id: "rollback-archive-worker",
              job_id: claimedArchiveJob.job.id,
              claim_token: claimedArchiveJob.job.claim_token,
              source_fingerprint: fingerprint("rollback-archive-source"),
              archive_payload_hash: fingerprint("rollback-archive-payload"),
              snapshot_revision: 1,
              finalized_match_revision: 0,
              google_readback_hash: fingerprint(
                "rollback-archive-google-readback",
              ),
              expected_logical_identities: [],
              google_row_numbers: [],
              verified_status: "INVALIDATED",
            },
          );
          assert.equal(completedArchiveJob.ok, true);

          const rollbackClosed = drainFinalizeExistingClose(
            cluster,
            database,
            rollbackEvidence.evidence_id,
            rollbackClose,
            "rollback-boundary",
          );
          for (const workerName of [
            "SCORING_GOOGLE_OUTBOX",
            "ROUND_SCORECARDS_ARCHIVE",
          ]) {
            assertCommandFailure(
              () => psql(cluster, database, `
                select production_control.assert_production_scoring_runtime(
                  ${jsonSql(runtimeInput)}, ${sqlLiteral(workerName)}
                );
              `),
              /PRODUCTION_SUPABASE_SCORING_ADMISSION_V2_REQUIRED/,
            );
          }
          const rollbackPrepared = rpc(
            cluster,
            database,
            "prepare_production_authority_epoch",
            prepareEpochInput(
              rollbackClosed.current,
              rollbackEvidence.evidence_id,
              rollbackClosed,
              "ROLLBACK",
              "rollback-authority",
            ),
          );
          const afterRollbackPrepare = state(cluster, database);
          const rolledBack = rpc(
            cluster,
            database,
            "commit_production_authority_epoch",
            commitEpochInput(
              afterRollbackPrepare,
              rollbackEvidence.evidence_id,
              rollbackClosed,
              rollbackPrepared.epoch_id,
              "rollback-authority",
            ),
          );
          assert.equal(rolledBack.authority, "GOOGLE");
          assert.equal(rolledBack.admission_state, "CLOSED");
          assert.equal(rolledBack.scoring_ingress_enabled, false);
          assert.equal(state(cluster, database).execution_gate, "PAUSED");
        },
      );

      await t.test("stale admission revisions and generations fail closed", () => {
        const database = cloneDatabase("stale_tokens");
        const current = state(cluster, database);
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "close_production_scoring_admission",
            {
              ...closeInput(
                current,
                baseline.evidenceId,
                "stale-close-revision",
              ),
              expected_admission_revision: Number(current.admission_revision) + 1,
            },
          ),
          /PRODUCTION_SCORING_ADMISSION_CLOSE_REVISION_CONFLICT/,
        );
        assertCommandFailure(
          () => rpc(
            cluster,
            database,
            "begin_production_scoring_ingress_v2",
            {
              ...beginInput(current, "stale-begin-generation"),
              expected_admission_generation: randomUUID(),
            },
          ),
          /PRODUCTION_SCORING_ADMISSION_V2_BOUNDARY_MISMATCH/,
        );
      });
    } finally {
      await destroyCluster(cluster);
    }
  },
);
