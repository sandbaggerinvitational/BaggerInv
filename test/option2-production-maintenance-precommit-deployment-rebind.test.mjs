import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/production_migrations/202608280050_production_maintenance_precommit_deployment_rebind.sql",
  import.meta.url,
);
const capabilityMigrationUrl = new URL(
  "../supabase/production_migrations/202608280051_production_maintenance_single_deployment_capability.sql",
  import.meta.url,
);
const libraryUrl = new URL(
  "../lib/production-maintenance-precommit-deployment-rebind.js",
  import.meta.url,
);
const routeUrl = new URL(
  "../app/api/admin/production-maintenance-precommit-deployment-rebind/route.js",
  import.meta.url,
);
const [sql, capabilitySql, librarySource, routeSource] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(capabilityMigrationUrl, "utf8"),
  readFile(libraryUrl, "utf8"),
  readFile(routeUrl, "utf8"),
]);

test("migration 050 installs a one-time maintenance-only deployment rebind", () => {
  assert.match(sql, /maintenance_runtime_deployment_rebindings/);
  assert.match(
    sql,
    /public\.rebind_production_maintenance_precommit_deployment\(input jsonb\)/,
  );
  assert.match(sql, /boundary_mode <> 'MAINTENANCE_WINDOW_V1'/);
  assert.match(sql, /activation\.state <> 'CUTOVER_PREPARED'/);
  assert.match(sql, /activation\.maintenance_state <> 'SCORING_MAINTENANCE'/);
  assert.match(sql, /epoch\.status <> 'PREPARED'/);
  assert.match(sql, /epoch\.authority_before <> 'GOOGLE'/);
  assert.match(sql, /epoch\.authority_after <> 'SUPABASE'/);
  assert.match(sql, /input->>'runtime_deployment_status' is distinct from 'READY'/);
  assert.match(sql, /input->>'runtime_cutover_phase' is distinct from 'SCORING_COMMIT'/);
  assert.match(sql, /input->>'runtime_vercel_team_id' is distinct from/);
  assert.match(sql, /input->>'runtime_expected_authority_epoch'/);
  assert.match(sql, /input->>'runtime_expected_admission_generation'/);
  assert.match(sql, /input->>'runtime_scoring_authority' is distinct from 'SUPABASE'/);
  assert.match(
    sql,
    /input->'runtime_supabase_scoring_ingress_enabled'[\s\S]*?is distinct from 'true'::jsonb/,
  );
  assert.match(sql, /activation\.first_supabase_write_possible_at is not null/);
  assert.match(sql, /activation\.first_supabase_write_observed_at is not null/);
  assert.match(sql, /scoring_admission_unresolved_count/);
  assert.match(sql, /scoring_admission_legacy_blocker_count/);
  assert.match(sql, /google_outbox_events/);
  assert.match(sql, /scorecard_archive_jobs/);
  assert.match(
    sql,
    /epoch\.closure_boundary_fingerprint is distinct from[\s\S]*?closure\.lease_set_fingerprint/,
  );
  assert.match(sql, /admission_deployment_id = input->>'deployment_id'/);
  assert.match(sql, /admission_revision = next_admission_revision/);
  assert.match(sql, /closed_admission_revision = next_admission_revision/);
  assert.match(sql, /activation_revision = next_activation_revision/);
  assert.match(sql, /PRODUCTION_MAINTENANCE_PRECOMMIT_REBIND_ALREADY_USED/);
  assert.match(sql, /lookup_cutover_receipt\(/);
  assert.match(sql, /store_cutover_receipt\(/);
  assert.match(sql, /intent_input jsonb := input - 'runtime_observed_at'/);
});

test("provider-fence behavior is not replaced or weakened", () => {
  assert.doesNotMatch(
    sql,
    /create or replace function\s+public\.prepare_production_authority_epoch_provider_fence_v2/i,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function\s+public\.commit_production_authority_epoch_provider_fence_v2/i,
  );
  assert.doesNotMatch(sql, /provider_fence_id\s+is\s+null/i);
  assert.match(
    sql,
    /it never applies to PROVIDER_FENCE_V2/,
  );
});

test("migration 051 binds one maintenance-only OBSERVATION capability ceiling", () => {
  assert.match(capabilitySql, /maintenance_deployment_capability_bindings/);
  assert.match(
    capabilitySql,
    /production-maintenance-single-deployment-capability-v1/,
  );
  assert.match(capabilitySql, /capability_ceiling = 'OBSERVATION'/);
  assert.match(
    capabilitySql,
    /runtime_workers_enabled'[\s\S]*?is distinct from 'true'::jsonb/,
  );
  assert.match(
    capabilitySql,
    /runtime_outbox_worker_secret_configured'[\s\S]*?'true'::jsonb/,
  );
  assert.match(
    capabilitySql,
    /runtime_archive_worker_secret_configured'[\s\S]*?'true'::jsonb/,
  );
  assert.match(capabilitySql, /runtime_war_room_input_source/);
  assert.match(capabilitySql, /runtime_prediction_settings_read_source/);
  assert.match(capabilitySql, /runtime_odds_calculation_input_source/);
  assert.match(capabilitySql, /runtime_prediction_settings_source_fingerprint/);
  assert.match(capabilitySql, /runtime_prediction_settings_effective_fingerprint/);
  assert.match(
    capabilitySql,
    /runtime_odds_publication_authority'[\s\S]*?'GOOGLE'/,
  );
  assert.match(
    capabilitySql,
    /PRODUCTION_CUTOVER_WORKERS_PHASE_REQUIRED/,
  );
  assert.match(
    capabilitySql,
    /assert_production_odds_calculation_scope_pre_capability/,
  );
  assert.match(
    capabilitySql,
    /target_rank|set_production_cutover_read_state_pre_capability|cutover_phase_rank/,
  );
  assert.doesNotMatch(
    capabilitySql,
    /create or replace function\s+public\.prepare_production_authority_epoch_provider_fence_v2/i,
  );
  assert.doesNotMatch(
    capabilitySql,
    /create or replace function\s+public\.commit_production_authority_epoch_provider_fence_v2/i,
  );
});

test("release provenance is rebound to a database-computed exact release", () => {
  assert.match(sql, /maintenance_release_candidates/);
  assert.match(sql, /candidate_deployment_status' is distinct from 'READY'/);
  assert.match(sql, /preview_commit_approved' is distinct from 'true'/);
  assert.match(sql, /step11_sha_approved' is distinct from 'true'/);
  assert.match(sql, /extensions\.digest\(binding_manifest::text, 'sha256'\)/);
  assert.match(sql, /production_maintenance_stage_provenance_v2/);
  assert.match(sql, /BAGGER_MAINTENANCE_WINDOW_RELEASE_CERTIFICATION_V2/);
  assert.match(sql, /BAGGER_STEP12_MAINTENANCE_ENVIRONMENT_DELTA_V3/);
  assert.match(sql, /release_binding_fingerprint/);
  assert.match(sql, /202608280050_production_maintenance_precommit_deployment_rebind\.sql/);
  assert.match(sql, /scope_key text not null unique/);
  assert.match(sql, /one-shot database-owner operation/);
  assert.doesNotMatch(
    sql,
    /grant execute on function[\s\S]*?bind_production_maintenance_release_candidate[\s\S]*?to service_role/i,
  );
});

test("new database objects keep RLS, service-role, and fixed-search-path protection", () => {
  assert.match(
    sql,
    /alter table production_control\.maintenance_release_candidates[\s\S]*?enable row level security/,
  );
  assert.match(
    sql,
    /alter table production_control\.maintenance_runtime_deployment_rebindings[\s\S]*?enable row level security/,
  );
  assert.match(
    sql,
    /rebind_production_maintenance_precommit_deployment\(input jsonb\)[\s\S]*?security definer[\s\S]*?set search_path = pg_catalog/i,
  );
  assert.match(
    sql,
    /grant execute on function[\s\S]*?rebind_production_maintenance_precommit_deployment\(jsonb\)[\s\S]*?to service_role/i,
  );
});

async function importLibrary() {
  const activationStub = `
const PRODUCTION_VERCEL_PROJECT_ID = "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU";
const PRODUCTION_VERCEL_PROJECT_NAME = "bagger-inv";
const PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CONTRACT =
  "production-maintenance-single-deployment-capability-v1";
const PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CEILING = "OBSERVATION";
function assertProductionCutoverActivation({ env, requiredPhase }) {
  if (String(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED).toLowerCase() !== "true") {
    const error = new Error("disabled");
    error.diagnostics = { reason: "activation-disabled" };
    throw error;
  }
  const phase = String(env.PRODUCTION_CUTOVER_PHASE || "").toUpperCase();
  const capabilityContract = String(
    env.PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CONTRACT || "",
  );
  const capabilityCeiling = String(
    env.PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CEILING || "",
  ).toUpperCase();
  const capabilityAllowed = phase === "SCORING_COMMIT" &&
    capabilityContract === PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CONTRACT &&
    capabilityCeiling === PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CEILING;
  if (phase !== requiredPhase && !capabilityAllowed) {
    const error = new Error("phase");
    error.diagnostics = { reason: "cutover-phase-not-reached" };
    throw error;
  }
  return {
    allowed: true,
    phase,
    resources: { commitSha: String(env.PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA) },
    maintenanceDeploymentCapability: {
      allowed: capabilityAllowed,
      contract: capabilityAllowed ? capabilityContract : "",
      ceiling: capabilityAllowed ? capabilityCeiling : "",
    },
  };
}`;
  const resourceStub = `
const PRODUCTION_GOOGLE_WORKBOOK_ID = "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4";
const PRODUCTION_SUPABASE_PROJECT_REF = "ymqhhtxaywtqllynrmxe";
const PRODUCTION_SUPABASE_URL = "https://ymqhhtxaywtqllynrmxe.supabase.co";
const PRODUCTION_TOURNAMENT_ID = "2026";`;
  const transformed = librarySource
    .replace('import "server-only";\n', "")
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-cutover-activation-contract\.js";/,
      activationStub,
    )
    .replace(
      /import \{[\s\S]*?\} from "\.\/production-foundation-resource-contract\.js";/,
      resourceStub,
    );
  return import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`);
}

function validEnvironment() {
  const release = "a".repeat(40);
  return {
    VERCEL_ENV: "production",
    VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    VERCEL_PROJECT_NAME: "bagger-inv",
    VERCEL_GIT_COMMIT_SHA: release,
    VERCEL_DEPLOYMENT_ID: "dpl_ReplacementReady050",
    VERCEL_URL: "bagger-replacement-ready.vercel.app",
    PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true",
    PRODUCTION_FOUNDATION_ENABLED: "true",
    PRODUCTION_CUTOVER_PHASE: "SCORING_COMMIT",
    PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CONTRACT:
      "production-maintenance-single-deployment-capability-v1",
    PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CEILING: "OBSERVATION",
    PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: release,
    PRODUCTION_GOOGLE_INGRESS_LEASE_GATE_ENABLED: "true",
    PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH:
      "11111111-1111-4111-8111-111111111111",
    PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION:
      "22222222-2222-4222-8222-222222222222",
    PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "true",
    PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true",
    PRODUCTION_SUPABASE_WORKERS_ENABLED: "true",
    PRODUCTION_SUPABASE_GOOGLE_MIRROR_ENABLED: "true",
    ROUND_SCORECARDS_ARCHIVE_ENABLED: "true",
    SCORING_GOOGLE_OUTBOX_WORKER_SECRET: "x".repeat(32),
    ROUND_SCORECARDS_ARCHIVE_WORKER_SECRET: "y".repeat(32),
    PRODUCTION_SUPABASE_ODDS_CALCULATION_ENABLED: "true",
    WAR_ROOM_INPUT_SOURCE: "supabase",
    PREDICTION_SETTINGS_READ_SOURCE: "supabase",
    ODDS_CALCULATION_INPUT_SOURCE: "supabase",
    WAR_ROOM_PREDICTION_SETTINGS_SOURCE_FINGERPRINT: "8".repeat(64),
    WAR_ROOM_PREDICTION_SETTINGS_EFFECTIVE_FINGERPRINT: "9".repeat(64),
    ODDS_PUBLICATION_AUTHORITY: "google",
    PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
    PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
    SCORING_AUTHORITY: "supabase",
    PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
    PRODUCTION_SUPABASE_SECRET_KEY: "sb_secret_test_only_not_a_real_key_050",
  };
}

test("runtime eligibility attests the exact dormant single-deployment capability", async () => {
  const module = await importLibrary();
  const env = validEnvironment();
  assert.equal(
    module.productionMaintenancePrecommitDeploymentEnvironment(env).allowed,
    true,
  );
  for (const [name, value, reason] of [
    ["VERCEL_ENV", "preview", "production-runtime-required"],
    ["VERCEL_GIT_COMMIT_SHA", "b".repeat(40), "exact-release-sha-required"],
    ["PRODUCTION_CUTOVER_PHASE", "SCORING_PREPARE", "cutover-phase-not-reached"],
    ["PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH", "", "prepared-authority-epoch-required"],
    ["SCORING_AUTHORITY", "google", "exact-paused-runtime-configuration-required"],
    ["PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED", "false", "exact-paused-runtime-configuration-required"],
    ["PRODUCTION_MAINTENANCE_DEPLOYMENT_CAPABILITY_CEILING", "ODDS_WAR_ROOM", "exact-paused-runtime-configuration-required"],
    ["PRODUCTION_SUPABASE_WORKERS_ENABLED", "false", "exact-paused-runtime-configuration-required"],
    ["SCORING_GOOGLE_OUTBOX_WORKER_SECRET", "short", "exact-paused-runtime-configuration-required"],
    ["ROUND_SCORECARDS_ARCHIVE_WORKER_SECRET", "short", "exact-paused-runtime-configuration-required"],
    ["WAR_ROOM_INPUT_SOURCE", "google", "exact-paused-runtime-configuration-required"],
    ["WAR_ROOM_PREDICTION_SETTINGS_SOURCE_FINGERPRINT", "bad", "exact-paused-runtime-configuration-required"],
    ["ODDS_PUBLICATION_AUTHORITY", "supabase", "exact-paused-runtime-configuration-required"],
  ]) {
    const result = module.productionMaintenancePrecommitDeploymentEnvironment({
      ...env,
      [name]: value,
    });
    assert.equal(result.allowed, false, name);
    assert.equal(result.reason, reason, name);
  }

  const canonicalSupabaseOdds = {
    ...env,
    ODDS_PUBLICATION_AUTHORITY: "supabase",
    PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "true",
    PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
  };
  const canonical =
    module.productionMaintenancePrecommitDeploymentEnvironment(
      canonicalSupabaseOdds,
    );
  assert.equal(canonical.allowed, true);
  assert.equal(canonical.canonicalSupabaseOddsPublication, true);
  assert.equal(canonical.legacyGoogleOddsPublication, false);

  for (const mutation of [
    {
      ODDS_PUBLICATION_AUTHORITY: "google",
      PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "true",
    },
    {
      ODDS_PUBLICATION_AUTHORITY: "supabase",
      PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "false",
    },
    { PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "true" },
  ]) {
    const mixed = module.productionMaintenancePrecommitDeploymentEnvironment({
      ...canonicalSupabaseOdds,
      ...mutation,
    });
    assert.equal(mixed.allowed, false, JSON.stringify(mutation));
    assert.equal(
      mixed.reason,
      "exact-paused-runtime-configuration-required",
      JSON.stringify(mutation),
    );
  }
});

test("the live route derives replacement deployment and epoch claims from server env", async () => {
  const module = await importLibrary();
  const env = validEnvironment();
  let observedRequest = null;
  const payload = await module.rebindProductionMaintenancePrecommitDeployment({
    actorId: "CB01",
    input: {
      originalDeploymentId: "dpl_OriginalPrepared050",
      epochId: env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH,
      closureId: "33333333-3333-4333-8333-333333333333",
      expectedActivationRevision: 17,
      expectedAuthorityGeneration:
        "44444444-4444-4444-8444-444444444444",
      expectedAdmissionRevision: 23,
      expectedAdmissionGeneration:
        env.PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION,
      stagedEnvironmentDeltaFingerprintV2: "5".repeat(64),
      requestFingerprint: "6".repeat(64),
      deployment_id: "dpl_MaliciousCallerValue",
      runtime_expected_authority_epoch:
        "77777777-7777-4777-8777-777777777777",
    },
  }, {
    env,
    now: () => Date.parse("2026-08-28T12:00:00.000Z"),
    fetchImpl: async (_url, request) => {
      observedRequest = JSON.parse(request.body).input;
      return new Response(JSON.stringify({ ok: true, code: "REBOUND" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(payload.ok, true);
  assert.equal(observedRequest.deployment_id, env.VERCEL_DEPLOYMENT_ID);
  assert.equal(observedRequest.deployment_commit, env.VERCEL_GIT_COMMIT_SHA);
  assert.equal(
    observedRequest.runtime_expected_authority_epoch,
    env.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH,
  );
  assert.equal(
    observedRequest.runtime_expected_admission_generation,
    env.PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION,
  );
  assert.equal(observedRequest.runtime_deployment_status, "READY");
  assert.equal(observedRequest.runtime_cutover_phase, "SCORING_COMMIT");
  assert.equal(
    observedRequest.runtime_deployment_capability_contract,
    "production-maintenance-single-deployment-capability-v1",
  );
  assert.equal(observedRequest.runtime_deployment_capability_ceiling, "OBSERVATION");
  assert.equal(observedRequest.runtime_scoring_authority, "SUPABASE");
  assert.equal(observedRequest.runtime_supabase_scoring_ingress_enabled, true);
  assert.equal(observedRequest.runtime_workers_enabled, true);
  assert.equal(observedRequest.runtime_google_mirror_enabled, true);
  assert.equal(observedRequest.runtime_scorecard_archive_enabled, true);
  assert.equal(observedRequest.runtime_outbox_worker_secret_configured, true);
  assert.equal(observedRequest.runtime_archive_worker_secret_configured, true);
  assert.equal(observedRequest.runtime_odds_calculation_enabled, true);
  assert.equal(observedRequest.runtime_war_room_input_source, "SUPABASE");
  assert.equal(observedRequest.runtime_odds_publication_authority, "GOOGLE");
  assert.equal(
    JSON.stringify(observedRequest).includes(
      env.SCORING_GOOGLE_OUTBOX_WORKER_SECRET,
    ),
    false,
  );
  assert.equal(
    JSON.stringify(observedRequest).includes(
      env.ROUND_SCORECARDS_ARCHIVE_WORKER_SECRET,
    ),
    false,
  );

  const canonicalEnv = {
    ...env,
    ODDS_PUBLICATION_AUTHORITY: "supabase",
    PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED: "true",
    PRODUCTION_SUPABASE_ODDS_GOOGLE_MIRROR_ENABLED: "false",
  };
  let canonicalRequest = null;
  await module.rebindProductionMaintenancePrecommitDeployment({
    actorId: "CB01",
    input: {
      originalDeploymentId: "dpl_OriginalPrepared050",
      epochId: canonicalEnv.PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH,
      closureId: "33333333-3333-4333-8333-333333333333",
      expectedActivationRevision: 17,
      expectedAuthorityGeneration:
        "44444444-4444-4444-8444-444444444444",
      expectedAdmissionRevision: 23,
      expectedAdmissionGeneration:
        canonicalEnv.PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION,
      stagedEnvironmentDeltaFingerprintV2: "5".repeat(64),
      requestFingerprint: "7".repeat(64),
    },
  }, {
    env: canonicalEnv,
    now: () => Date.parse("2026-08-29T12:00:00.000Z"),
    fetchImpl: async (_url, request) => {
      canonicalRequest = JSON.parse(request.body).input;
      return new Response(JSON.stringify({ ok: true, code: "REBOUND" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(canonicalRequest.runtime_odds_publication_authority, "SUPABASE");
  assert.equal(canonicalRequest.runtime_supabase_odds_publication_enabled, true);
  assert.equal(
    canonicalRequest.runtime_supabase_odds_google_mirror_enabled,
    false,
  );
});

test("canonical route requires exact Production activation and active Director", () => {
  assert.match(routeSource, /assertProductionCutoverActivation/);
  assert.match(routeSource, /requiredPhase: "SCORING_COMMIT"/);
  assert.match(routeSource, /assertProductionCutoverRequest/);
  assert.match(routeSource, /requireOrigin: true/);
  assert.match(routeSource, /authorizePreviewDirector/);
  assert.match(routeSource, /allowBootstrap: false/);
  assert.match(routeSource, /director\.status !== "active"/);
  assert.doesNotMatch(routeSource, /export async function GET/);
});
