import { PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL } from "../../lib/production-foundation-resource-contract.js";
import { PRODUCTION_NATIVE_CONTRACT, NATIVE_CAPABILITIES, PRODUCTION_NATIVE_READ_SELECTORS } from "../../lib/mobile-native-production-environment.js";

// Local synthetic configuration only. No real key, user, certificate, or data.
export const sha = "a".repeat(40);
export const uuid = "11111111-1111-4111-8111-111111111111";
export const runtime = { contractVersion: "production-current-tournament-runtime-v1", tournamentId: "2026", tournamentYear: 2026,
  lifecycle: "ACTIVE", pointerRevision: 1, lifecycleRevision: 1, status: "FROZEN_2026_RUNTIME",
  runtimeGenerationId: "", authorityGenerationId: "", admissionGenerationId: "" };
export const actor = { authUserId: uuid, playerId: "SYNTHETIC-P1", tournamentId: "2026" };
export function controls(enabled = []) {
  return { version: PRODUCTION_NATIVE_CONTRACT, environment: "production", apiOrigin: "https://baggerinv.com",
    projectRef: PRODUCTION_SUPABASE_PROJECT_REF, deploymentCommit: sha, revision: 1,
    revocationGeneration: "synthetic-generation-1", capabilities: Object.fromEntries(NATIVE_CAPABILITIES.map((k) => [k, enabled.includes(k)])) };
}
export function environment(enabled = []) {
  return { ...Object.fromEntries(PRODUCTION_NATIVE_READ_SELECTORS.map((key) => [key, "supabase"])), VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: sha,
    VERCEL_DEPLOYMENT_ID: "dpl_SYNTHETIC12345678", VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU", VERCEL_PROJECT_NAME: "bagger-inv",
    PRODUCTION_CUTOVER_ACTIVATION_ENABLED: "true", PRODUCTION_CUTOVER_PHASE: "OBSERVATION",
    PRODUCTION_FOUNDATION_ENABLED: "true", PRODUCTION_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_URL,
    PRODUCTION_SUPABASE_SECRET_KEY: "synthetic-server-secret-at-least-32-characters",
    GOOGLE_SHEETS_ID: PRODUCTION_GOOGLE_WORKBOOK_ID, PRODUCTION_CANONICAL_DOMAIN: "https://baggerinv.com",
    PRODUCTION_CUTOVER_TOURNAMENT_ID: "2026", PRODUCTION_CUTOVER_TOURNAMENT_YEAR: "2026",
    PRODUCTION_CUTOVER_EXPECTED_COMMIT_SHA: sha, PRODUCTION_CUTOVER_EXPECTED_VERCEL_PROJECT_ID: "prj_FxJYIEzMe74rp0yKqRFAQzSKf3lU",
    PRODUCTION_SUPABASE_DIRECTOR_AUTH_ENABLED: "true", PRODUCTION_SUPABASE_ADMIN_SESSION_REVALIDATION_ENABLED: "true",
    PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED: "true", PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED: "true",
    PRODUCTION_SCORING_EXPECTED_AUTHORITY_EPOCH: uuid, PRODUCTION_SCORING_EXPECTED_ADMISSION_GENERATION: uuid,
    NEXT_PUBLIC_SUPABASE_AUTH_URL: PRODUCTION_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY: "synthetic-public-key",
    SUPABASE_SCORING_MIRROR_URL: PRODUCTION_SUPABASE_URL, SUPABASE_SCORING_MIRROR_SECRET_KEY: "synthetic-server-secret-at-least-32-characters",
    PARTICIPANT_IDENTITY_AUTHORITY: "supabase", SCORING_AUTHORITY: "supabase", SCORING_READ_SOURCE: "supabase", MATCH_AUTHORIZATION_SOURCE: "supabase",
    MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE: "supabase-turnstile", PARTICIPANT_AUTH_CAPTCHA_REQUIRED: "true", PARTICIPANT_AUTH_CAPTCHA_CONFIGURED: "true",
    MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED: "true", MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED: "true",
    NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY: "synthetic-site-key", PARTICIPANT_AUTH_RATE_LIMIT_SECRET: "synthetic-rate-limit-secret-at-least-32",
    MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET: "synthetic-preview-secret-at-least-32-characters",
    PRODUCTION_NATIVE_CERTIFICATION_SIGNING_SECRET: "synthetic-production-secret-at-least-32-characters",
    PRODUCTION_NATIVE_CAPABILITIES: JSON.stringify(controls(enabled)) };
}
export function authorityFixtures(env = environment()) {
  const read = { ok: true, contract_version: "production-cutover-activation-v1", project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID, deployment_commit: env.VERCEL_GIT_COMMIT_SHA,
    activation_state: "SCORING_COMMITTED", activation_revision: 162, read_cutover_phase: "OBSERVATION",
    participant_identity_authority: "SUPABASE", current_tournament_read_authority: "SUPABASE", public_supabase_reads_enabled: true,
    scoring_authority: "SUPABASE", scoring_ingress_enabled: true };
  const admission = { ok: true, activation_revision: 162, activation_state: "SCORING_COMMITTED", contract_version: "ADMISSION_V3",
    database_admission_contract_version: "production-scoring-admission-v2", admission_protocol_enforced: true,
    admission_state: "CLOSED", new_legacy_admission_allowed: false, deployment_id: env.VERCEL_DEPLOYMENT_ID,
    authority_generation_id: uuid, admission_generation_id: uuid, maintenance_state: "NORMAL", authority: "SUPABASE",
    scoring_ingress_enabled: true, execution_gate: "OPEN" };
  const current = { ...runtime };
  return { read, admission, current, dependencies: { inspectRead: async () => read, inspectAdmission: async () => admission,
    readRuntime: async () => current } };
}
export function request(path = "session", { method = "GET", headers = {}, body } = {}) {
  return new Request(`https://baggerinv.com/api/mobile/v1/${path}`, { method,
    headers: { host: "baggerinv.com", "x-bagger-mobile-contract": PRODUCTION_NATIVE_CONTRACT, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
export const productionContext = () => ({ runtime: { ...runtime }, revocationGeneration: "synthetic-generation-1" });
