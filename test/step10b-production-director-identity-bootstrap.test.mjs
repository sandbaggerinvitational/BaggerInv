import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildProductionDirectorIdentityBootstrap,
  productionDirectorIdentityApprovalInput,
  PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_ACTOR,
  PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_CONTRACT,
  PRODUCTION_DIRECTOR_IDENTITY_EVIDENCE_KIND,
  safeProductionDirectorIdentityBootstrap,
} from "../lib/production-director-identity-bootstrap.js";
import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "../lib/production-foundation-resource-contract.js";

const approvedEvidence = Object.freeze({
  environment: "PRODUCTION",
  project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
  project_url: PRODUCTION_SUPABASE_URL,
  source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
  tournament_id: "2026",
  tournament_year: 2026,
  player_id: "CB01",
  email: "Director@Example.com ",
  current_shadow_source_fingerprint: "a".repeat(64),
  approval: {
    kind: PRODUCTION_DIRECTOR_IDENTITY_EVIDENCE_KIND,
    approved_by: "Production account owner",
    approved_at: "2020-01-01T12:00:00.000Z",
    evidence_reference: "Step 10B owner approval record 2026-08-24",
  },
});

test("one approved Production Director identity builds deterministic exact-resource evidence", () => {
  const first = buildProductionDirectorIdentityBootstrap(approvedEvidence);
  const second = buildProductionDirectorIdentityBootstrap(structuredClone(approvedEvidence));
  assert.equal(first.contractVersion, PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_CONTRACT);
  assert.equal(first.playerId, "CB01");
  assert.equal(first.email, "director@example.com");
  assert.match(first.emailIdentityHash, /^[0-9a-f]{64}$/);
  assert.match(first.identitySourceFingerprint, /^[0-9a-f]{64}$/);
  assert.match(first.payloadFingerprint, /^[0-9a-f]{64}$/);
  assert.match(first.requestFingerprint, /^[0-9a-f]{64}$/);
  assert.match(first.approvalEvidenceFingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(first, second);
  assert.equal(first.importInput.actor_id, PRODUCTION_DIRECTOR_IDENTITY_BOOTSTRAP_ACTOR);
  assert.equal(first.importInput.operation, "PRODUCTION_DIRECTOR_IDENTITY_IMPORT");
  assert.equal(first.importInput.project_ref, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(first.importInput.project_url, PRODUCTION_SUPABASE_URL);
  assert.equal(first.importInput.source_workbook_id, PRODUCTION_GOOGLE_WORKBOOK_ID);
  assert.equal(first.importInput.payload.contact.player_id, "CB01");
  assert.equal(first.importInput.payload.contact.identity_active, true);
  assert.equal(first.importInput.payload.current_shadow_source_fingerprint, "a".repeat(64));

  const safe = safeProductionDirectorIdentityBootstrap(first);
  assert.equal(safe.rawEmailExposed, false);
  assert.doesNotMatch(JSON.stringify(safe), /director@example\.com/i);
  assert.doesNotMatch(JSON.stringify(safe), /Step 10B owner approval record/i);
});

test("approval is bound to the exact import run, source, Player ID, and email hash", () => {
  const bootstrap = buildProductionDirectorIdentityBootstrap(approvedEvidence);
  const runId = "11111111-1111-4111-8111-111111111111";
  const approval = productionDirectorIdentityApprovalInput(bootstrap, { runId });
  assert.equal(approval.operation, "PRODUCTION_DIRECTOR_IDENTITY_APPROVAL");
  assert.equal(approval.run_id, runId);
  assert.equal(approval.player_id, "CB01");
  assert.equal(approval.identity_source_fingerprint, bootstrap.identitySourceFingerprint);
  assert.equal(approval.current_shadow_source_fingerprint, bootstrap.currentShadowSourceFingerprint);
  assert.equal(approval.email_identity_hash, bootstrap.emailIdentityHash);
  assert.equal(approval.approval_evidence_fingerprint, bootstrap.approvalEvidenceFingerprint);
  assert.match(approval.request_fingerprint, /^[0-9a-f]{64}$/);
  assert.throws(
    () => productionDirectorIdentityApprovalInput(bootstrap, { runId: "not-a-uuid" }),
    (error) => error.code === "PRODUCTION_DIRECTOR_IDENTITY_RUN_REQUIRED",
  );
});

test("identity evidence fails closed for Preview, malformed, stale-unbound, or mass-shaped input", () => {
  for (const [patch, code] of [
    [{ project_ref: "idgigvjjqkfbqjeredpb" }, "PRODUCTION_DIRECTOR_IDENTITY_EXACT_RESOURCE_REQUIRED"],
    [{ source_workbook_id: "1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts" }, "PRODUCTION_DIRECTOR_IDENTITY_EXACT_RESOURCE_REQUIRED"],
    [{ tournament_id: "2025" }, "PRODUCTION_DIRECTOR_IDENTITY_EXACT_RESOURCE_REQUIRED"],
    [{ email: "not-an-email" }, "PRODUCTION_DIRECTOR_IDENTITY_EMAIL_REQUIRED"],
    [{ player_id: "invalid player" }, "PRODUCTION_DIRECTOR_IDENTITY_PLAYER_REQUIRED"],
    [{ current_shadow_source_fingerprint: "short" }, "PRODUCTION_DIRECTOR_IDENTITY_CURRENT_SHADOW_REQUIRED"],
    [{ approval: { ...approvedEvidence.approval, kind: "PREVIEW_DIRECTOR" } }, "PRODUCTION_DIRECTOR_IDENTITY_APPROVAL_REQUIRED"],
  ]) {
    assert.throws(
      () => buildProductionDirectorIdentityBootstrap({ ...approvedEvidence, ...patch }),
      (error) => error.code === code,
    );
  }
  assert.throws(
    () => buildProductionDirectorIdentityBootstrap({ ...approvedEvidence, contacts: [approvedEvidence, approvedEvidence] }),
    /./,
    "the production builder should not accept a roster-style shape in place of its one contact",
  );
});

test("Production SQL is service-role-only, current-shadow-bound, idempotent, and Preview-free", async () => {
  const migration = await readFile(new URL(
    "../supabase/production_migrations/202608230013_production_director_identity_bootstrap.sql",
    import.meta.url,
  ), "utf8");
  assert.match(migration, /assert_current_shadow_v2_dormant\(\)/);
  assert.match(migration, /PRODUCTION_DIRECTOR_IDENTITY_SERVICE_ROLE_REQUIRED/);
  assert.match(migration, /create or replace function public\.import_production_director_identity_projection\(input jsonb\)/i);
  assert.match(migration, /create or replace function public\.approve_production_director_identity_projection\(input jsonb\)/i);
  assert.match(migration, /grant execute on function public\.import_production_director_identity_projection\(jsonb\)[\s\S]*to service_role/i);
  assert.match(migration, /grant execute on function public\.approve_production_director_identity_projection\(jsonb\)[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]{0,160}to (?:anon|authenticated)/i);
  assert.match(migration, /ONE_PRODUCTION_DIRECTOR_CANDIDATE/g);
  assert.match(migration, /current_shadow_revisions/);
  assert.match(migration, /current_shadow_source_fingerprint', current_source_hash/);
  assert.match(migration, /concat_ws\(E'\\n', approved_at_text, approved_by_value,[\s\S]*evidence_reference_hash, target_player\)/);
  assert.match(migration, /participation_status = 'ACTIVE'/);
  assert.match(migration, /PRODUCTION_DIRECTOR_IDENTITY_CLEAN_FOUNDATION_REQUIRED/);
  assert.match(migration, /'REVIEW_REQUIRED'/);
  assert.match(migration, /status = 'APPROVED'/);
  assert.match(migration, /'duplicate', true/);
  assert.match(migration, /'authUsersCreated', 0/g);
  assert.match(migration, /'authoritativeIdentityChanged', false/g);
  assert.match(migration, /'googleWrite', false/g);
  assert.match(migration, /'previewRpcUsed', false/g);
  assert.doesNotMatch(migration, /import_participant_identity_configuration/i);
  assert.doesNotMatch(migration, /createUser|signInWithOtp|grant_production_director_entitlement/i);
  assert.doesNotMatch(migration, /idgigvjjqkfbqjeredpb|1hSn6uABZwYftU3DrtoOz08ygX4x-c1JAWzuohtQ31Ts/);
  assert.equal((migration.match(/\$\$/g) || []).length % 2, 0, "migration dollar quotes must balance");
});

test("one-time runner is owner-private, server-only, and cannot send OTP or grant entitlement", async () => {
  const [runner, admin] = await Promise.all([
    readFile(new URL("../scripts/step10b-bootstrap-production-director-identity.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-director-identity-bootstrap-admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(runner, /--conditions=react-server/);
  assert.match(runner, /metadata\.mode & 0o077/);
  assert.match(runner, /--evidence/);
  assert.match(runner, /failed closed; inspect server-side diagnostics before retrying/);
  assert.match(runner, /rawEmailExposed: false/g);
  assert.doesNotMatch(runner, /--email|--phone|--otp|--password/);
  assert.match(admin, /^import "server-only";/);
  assert.match(admin, /read_production_current_shadow_v2_revision/);
  assert.match(admin, /import_production_director_identity_projection/);
  assert.match(admin, /approve_production_director_identity_projection/);
  assert.match(admin, /provisionProductionCandidateAuthUser/);
  assert.match(admin, /read_production_auth_candidate/);
  assert.match(admin, /candidateStatus === "PREPARED" && !emailConfirmed/);
  assert.match(admin, /candidateStatus === "VERIFIED" && emailConfirmed/);
  assert.doesNotMatch(admin, /signInWithOtp|grantProductionDirectorEntitlement|grant_production_director_entitlement/);
  assert.doesNotMatch(admin, /importParticipantIdentityConfiguration|import_participant_identity_configuration/);
});

test("server-only orchestration preserves ordering and becomes a no-op after physical verification", () => {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const childSource = `
    import { bootstrapProductionDirectorIdentityAndAuthUser } from "./lib/production-director-identity-bootstrap-admin.js";
    const evidence = ${JSON.stringify(approvedEvidence)};
    const calls = [];
    const authUserId = "22222222-2222-4222-8222-222222222222";
    const runId = "33333333-3333-4333-8333-333333333333";
    const claimId = "44444444-4444-4444-8444-444444444444";
    let user = null;
    let candidateStatus = "PREPARED";
    let createCount = 0;
    let duplicate = false;
    const client = {
      auth: { admin: {
        listUsers: async () => ({ data: { users: user ? [user] : [] }, error: null }),
        createUser: async ({ email, app_metadata, user_metadata }) => {
          calls.push("auth.admin.createUser");
          createCount += 1;
          user = { id: authUserId, email, app_metadata, user_metadata, email_confirmed_at: null };
          return { data: { user }, error: null };
        },
        deleteUser: async () => ({ error: null }),
      } },
      rpc: async (name) => {
        calls.push(name);
        const common = { error: null };
        if (name === "read_production_current_shadow_v2_revision") return { ...common, data: { ok: true, revision: {
          import_run_id: "55555555-5555-4555-8555-555555555555",
          source_fingerprint: "a".repeat(64), pairing_state: "PARTIAL",
        } } };
        if (name === "import_production_director_identity_projection") return { ...common, data: {
          ok: true, runId, sourceFingerprint: ${JSON.stringify(buildProductionDirectorIdentityBootstrap(approvedEvidence).identitySourceFingerprint)},
          playerId: "CB01", contactsImported: 1, authUsersCreated: 0, googleWrite: false,
          previewRpcUsed: false, duplicate,
        } };
        if (name === "approve_production_director_identity_projection") return { ...common, data: {
          ok: true, runId, status: "APPROVED", configurationRevision: 1,
          sourceFingerprint: ${JSON.stringify(buildProductionDirectorIdentityBootstrap(approvedEvidence).identitySourceFingerprint)},
          playerId: "CB01", authUsersCreated: 0, googleWrite: false, previewRpcUsed: false, duplicate,
        } };
        if (name === "claim_production_auth_candidate_preprovision") return { ...common, data: {
          ok: true, claimId, status: duplicate ? "CONSUMED" : "PENDING", duplicate,
        } };
        if (name === "prepare_production_auth_candidate") return { ...common, data: {
          ok: true, status: "PREPARED", claimId, authUserId, playerId: "CB01", duplicate,
        } };
        if (name === "read_production_auth_candidate") return { ...common, data: {
          ok: true, found: true, tournamentId: "2026", playerId: "CB01", authUserId,
          status: candidateStatus, authUserCount: 1,
          emailConfirmed: candidateStatus === "VERIFIED",
        } };
        throw new Error("unexpected rpc: " + name);
      },
    };
    const prepared = await bootstrapProductionDirectorIdentityAndAuthUser(evidence, { client });
    candidateStatus = "VERIFIED";
    user.email_confirmed_at = "2026-08-24T13:00:00.000Z";
    duplicate = true;
    const verified = await bootstrapProductionDirectorIdentityAndAuthUser(evidence, { client });
    process.stdout.write(JSON.stringify({ calls, createCount, prepared, verified }));
  `;
  const child = spawnSync(process.execPath, [
    "--conditions=react-server",
    "--input-type=module",
    "--eval",
    childSource,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const result = JSON.parse(child.stdout);
  assert.equal(result.createCount, 1);
  assert.equal(result.prepared.authCandidate.status, "PREPARED");
  assert.equal(result.prepared.authCandidate.emailConfirmed, false);
  assert.equal(result.verified.authCandidate.status, "VERIFIED");
  assert.equal(result.verified.authCandidate.emailConfirmed, true);
  assert.equal(result.verified.authCandidate.created, false);
  assert.equal(result.prepared.safety.otpRequests, 0);
  assert.equal(result.verified.safety.entitlementsGranted, 0);
  assert.deepEqual(result.calls.slice(0, 7), [
    "read_production_current_shadow_v2_revision",
    "import_production_director_identity_projection",
    "approve_production_director_identity_projection",
    "claim_production_auth_candidate_preprovision",
    "auth.admin.createUser",
    "prepare_production_auth_candidate",
    "read_production_auth_candidate",
  ]);
});
