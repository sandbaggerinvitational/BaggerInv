// Owner-reviewed code/data is the trust anchor. Runtime variables select a
// registration; they cannot create one. The shipping registry stays disabled
// until a separately authorized resource is created, reviewed and committed.
import { createHash } from "node:crypto";
import manifest from "../config/certification-resource-registration.json" with { type: "json" };
import { PRODUCTION_SUPABASE_PROJECT_REF } from "./production-foundation-resource-contract.js";

export const CERTIFICATION_REGISTRATION_CONTRACT = "canonical-certification-registration-v1";
const LEGACY_PREVIEW_REF = "idgigvjjqkfbqjeredpb";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const clean = value => typeof value === "string" ? value.trim() : "";
const disabled = value => /^(?:|false|0|no|off|disabled)$/i.test(clean(value));
const object = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
const states = new WeakMap();
const REGISTRATION_FIELDS = Object.freeze([
  "resource_id", "resource_class", "installation_id", "project_ref", "project_url",
  "vercel_team_id", "vercel_project_id", "git_branch", "deployment_class",
  "registration_revision", "schema_contract", "schema_digest", "public_key_sha256", "server_key_sha256",
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export const certificationSha256 = value => createHash("sha256").update(String(value)).digest("hex");
export const certificationManifestDigest = value => certificationSha256(JSON.stringify(stable(value)));
export const certificationRequested = (env = process.env) => clean(env.BAGGER_CERTIFICATION_RESOURCE_ID) !== "";

function exactOrigin(value, hostname) {
  if (typeof value !== "string" || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname && !url.port && !url.username && !url.password &&
      !url.search && !url.hash && ["", "/"].includes(url.pathname) && value === url.origin;
  } catch { return false; }
}
function deploymentOrigin(value) {
  const hostname = clean(value);
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(hostname)) return null;
  return `https://${hostname}`;
}
function registrationValid(value) {
  if (!object(value) || Object.keys(value).length !== REGISTRATION_FIELDS.length || REGISTRATION_FIELDS.some(key => !Object.hasOwn(value, key))) return false;
  if (value.resource_class !== "CERTIFICATION" || !UUID.test(String(value.installation_id)) ||
      !/^CERTIFICATION:[a-f0-9-]{36}$/.test(String(value.resource_id)) || !UUID.test(value.resource_id.slice(14)) ||
      value.resource_id !== `CERTIFICATION:${value.installation_id}` ||
      !/^[a-z]{20}$/.test(String(value.project_ref)) || [PRODUCTION_SUPABASE_PROJECT_REF, LEGACY_PREVIEW_REF].includes(value.project_ref) ||
      !exactOrigin(value.project_url, `${value.project_ref}.supabase.co`) ||
      !/^team_[A-Za-z0-9]+$/.test(String(value.vercel_team_id)) || !/^prj_[A-Za-z0-9]+$/.test(String(value.vercel_project_id)) ||
      !/^codex\/[A-Za-z0-9._/-]+$/.test(String(value.git_branch)) || value.git_branch.includes("..") ||
      value.deployment_class !== "preview" || !Number.isSafeInteger(value.registration_revision) || value.registration_revision < 1 ||
      !/^[a-z][a-z0-9-]{0,95}$/.test(String(value.schema_contract)) ||
      ![value.schema_digest, value.public_key_sha256, value.server_key_sha256].every(value => SHA256.test(String(value)))) return false;
  return true;
}
function conflictingAuthority(env) {
  // Certification is a distinct authority, never an overlay on Production or
  // a legacy Google transport. Even a correct registration cannot borrow it.
  return Object.entries(env).some(([name, value]) =>
    (/^PRODUCTION_/.test(name) || /^GOOGLE_/.test(name) || /^(?:SUPABASE_GOOGLE_MIRROR_ENABLED|GUIDE_GOOGLE_SYNC_ENABLED)$/.test(name)) && !disabled(value));
}
function result(requested, reason, registration, deployment, registeredManifest) {
  const eligible = reason === "certification-registration-ready";
  const value = Object.freeze({ requested, eligible, projectApproved: eligible, credentialsConfigured: eligible,
    previewDeployment: deployment?.deployment_class === "preview", localDevelopment: false, productionIsolated: eligible,
    projectRef: eligible ? registration.project_ref : "", resourceId: eligible ? registration.resource_id : "",
    resourceClass: eligible ? "CERTIFICATION" : null, reason, certificationResource: eligible });
  if (eligible) states.set(value, Object.freeze({ registration: Object.freeze({...registration}),
    deployment: Object.freeze({...deployment}), manifestDigest: certificationManifestDigest(registeredManifest) }));
  return value;
}

/** Dependency injection is a module/test seam, never an environment override or
 * HTTP parameter. Shipping callers use the checked-in manifest exclusively. */
export function certificationResourceEnvironment(env = process.env, { registrationManifest = manifest } = {}) {
  const requested = certificationRequested(env);
  if (!requested) return result(false, "certification-not-requested");
  const fail = reason => result(true, reason);
  if (!object(registrationManifest) || Object.keys(registrationManifest).some(key => !["contract", "enabled", "registration"].includes(key)) ||
      registrationManifest.contract !== CERTIFICATION_REGISTRATION_CONTRACT || typeof registrationManifest.enabled !== "boolean") return fail("certification-registration-invalid");
  if (!registrationManifest.enabled) return fail("certification-registration-disabled");
  const registration = registrationManifest.registration;
  if (!registrationValid(registration)) return fail("certification-registration-invalid");
  if (clean(env.BAGGER_CERTIFICATION_RESOURCE_ID) !== registration.resource_id) return fail("certification-resource-mismatch");
  if (conflictingAuthority(env)) return fail("certification-authority-conflict");
  const team = clean(env.VERCEL_TEAM_ID || env.VERCEL_ORG_ID);
  if (team !== registration.vercel_team_id || (clean(env.VERCEL_TEAM_ID) && clean(env.VERCEL_ORG_ID) && clean(env.VERCEL_TEAM_ID) !== clean(env.VERCEL_ORG_ID)) ||
      clean(env.VERCEL_PROJECT_ID) !== registration.vercel_project_id || clean(env.VERCEL_GIT_COMMIT_REF) !== registration.git_branch ||
      clean(env.VERCEL_ENV) !== registration.deployment_class || !SHA1.test(clean(env.VERCEL_GIT_COMMIT_SHA)) ||
      !/^dpl_[A-Za-z0-9_-]{8,128}$/.test(clean(env.VERCEL_DEPLOYMENT_ID))) return fail("certification-deployment-mismatch");
  const origin = deploymentOrigin(env.VERCEL_URL);
  if (!origin) return fail("certification-deployment-origin-invalid");
  if (clean(env.SUPABASE_SCORING_MIRROR_URL) !== registration.project_url || clean(env.NEXT_PUBLIC_SUPABASE_AUTH_URL) !== registration.project_url) return fail("certification-origin-mismatch");
  const serverKey = clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY), publicKey = clean(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY);
  if (!serverKey || !publicKey || serverKey === publicKey || certificationSha256(serverKey) !== registration.server_key_sha256 || certificationSha256(publicKey) !== registration.public_key_sha256) return fail("certification-credential-mismatch");
  const deployment = {vercel_team_id: team, vercel_project_id: registration.vercel_project_id,
    git_branch: registration.git_branch, deployment_class: "preview", release_commit: clean(env.VERCEL_GIT_COMMIT_SHA),
    deployment_id: clean(env.VERCEL_DEPLOYMENT_ID), deployment_origin: origin};
  return result(true, "certification-registration-ready", registration, deployment, registrationManifest);
}

export function requireCertificationResourceEnvironment(env = process.env, dependencies = {}) {
  const state = certificationResourceEnvironment(env, dependencies);
  if (!state.eligible) throw Object.assign(new Error("Registered Certification authority is unavailable."), {
    code: "CANONICAL_RESOURCE_UNAVAILABLE", status: 503, reason: state.reason,
  });
  return state;
}

export function certificationRegistrationEnvelope(state) {
  const checked = states.get(state);
  if (!checked) throw Object.assign(new Error("A validated Certification registration is required."), {code: "CANONICAL_RESOURCE_CONTEXT_REQUIRED", status: 403});
  const r = checked.registration;
  return {resource: {resource_id: r.resource_id, resource_class: r.resource_class, installation_id: r.installation_id,
    project_ref: r.project_ref, project_url: r.project_url, registration_revision: r.registration_revision,
    manifest_digest: checked.manifestDigest, schema_contract: r.schema_contract, schema_digest: r.schema_digest},
  deployment: {...checked.deployment}};
}
