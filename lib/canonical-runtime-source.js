// Runtime authority comes from the canonical database, never a reporting provider.
import { productionCutoverReadSourceEnvironment } from "./production-cutover-read-source.js";
import { productionShadowCandidateReadEnvironment } from "./production-shadow-candidate.js";
import { certificationRequested, certificationResourceEnvironment } from "./canonical-resource-registration.js";
export const CANONICAL_PREVIEW_PROJECT_REF = "idgigvjjqkfbqjeredpb";
const clean = value => String(value ?? "").trim();
export function isolatedCanonicalDatabaseEnvironment(env = process.env) {
  if (certificationRequested(env)) return certificationResourceEnvironment(env);
  const deployment = clean(env.VERCEL_ENV).toLowerCase();
  const local = ["", "development"].includes(deployment) && env.NODE_ENV !== "production";
  let projectApproved = false, projectRef = "";
  try {
    const url = new URL(clean(env.SUPABASE_SCORING_MIRROR_URL));
    const exactUrl = !url.username && !url.password && !url.search && !url.hash && ["", "/"].includes(url.pathname);
    const preview = deployment === "preview" && url.protocol === "https:" && !url.port && url.hostname === `${CANONICAL_PREVIEW_PROJECT_REF}.supabase.co`;
    const loopback = local && ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    projectApproved = exactUrl && (preview || loopback);
    if (projectApproved) projectRef = preview ? CANONICAL_PREVIEW_PROJECT_REF : "LOCAL_ISOLATED";
  } catch { /* Missing or malformed authority fails closed. */ }
  const credentialsConfigured = Boolean(clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY));
  return { eligible: projectApproved && credentialsConfigured, projectApproved, projectRef,
    credentialsConfigured, previewDeployment: deployment === "preview", localDevelopment: local,
    productionIsolated: projectApproved, reason: !projectApproved ? "isolated-database-required" : !credentialsConfigured ? "credentials-missing" : "canonical-database-ready" };
}
export function canonicalReadEnvironment(env, variable, options = {}) {
  if (certificationRequested(env)) {
    const database = certificationResourceEnvironment(env);
    const requested = clean(env[variable] || "supabase").toLowerCase();
    const blocked = !database.eligible || requested !== "supabase";
    return {...database, requested, resolved: blocked ? "unavailable" : "supabase", blocked,
      eligible: !blocked, previewWorkbook: false, productionShadowCandidate: false,
      fallbackUsed: false, configured: requested === "supabase",
      reason: !database.eligible ? database.reason : requested !== "supabase" ? "legacy-runtime-source-retired" : database.reason};
  }
  const diagnostic = productionShadowCandidateReadEnvironment(env);
  // A requested diagnostic scope must never fall through to another authority.
  // Its existing server transport, exact resource and read-only RPC gates remain.
  if (diagnostic.requested) {
    const requested = clean(env[variable] || "supabase").toLowerCase();
    const blocked = !diagnostic.eligible || requested !== "supabase";
    return {requested, resolved: blocked ? "unavailable" : "supabase", blocked,
      eligible: !blocked, previewDeployment: clean(env.VERCEL_ENV).toLowerCase() === "preview",
      previewWorkbook: false, productionIsolated: false,
      credentialsConfigured: diagnostic.exactSecret, projectRef: diagnostic.projectRef,
      productionShadowCandidate: !blocked, fallbackUsed: false,
      configured: requested === "supabase", reason: !diagnostic.eligible ? diagnostic.reason
        : requested !== "supabase" ? "legacy-runtime-source-retired" : diagnostic.reason};
  }
  const cutover = productionCutoverReadSourceEnvironment({env, variable, configuredValue: env[variable],
    defaultSource: "supabase", legacySource: "supabase", requiredPhase: "CURRENT_READS", ...options});
  if (cutover.handled) return {requested: cutover.requested, resolved: cutover.resolved,
    blocked: cutover.blocked, eligible: !cutover.blocked, previewDeployment: false, previewWorkbook: false,
    productionIsolated: false, credentialsConfigured: cutover.activation.serviceCredentialConfigured,
    projectRef: cutover.activation.resources.projectRef, productionShadowCandidate: false,
    productionCutover: cutover, fallbackUsed: false, configured: cutover.domainConfigured, reason: cutover.reason};
  const database = isolatedCanonicalDatabaseEnvironment(env);
  const requested = clean(env[variable] || "supabase").toLowerCase();
  const blocked = requested !== "supabase" || !database.eligible;
  return {...database, requested, resolved: blocked ? "unavailable" : "supabase", blocked,
    previewWorkbook: false, productionShadowCandidate: false, fallbackUsed: false,
    reason: requested !== "supabase" ? "legacy-runtime-source-retired" : database.reason};
}
