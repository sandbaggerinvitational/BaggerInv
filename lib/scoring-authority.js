import { isolatedCanonicalDatabaseEnvironment } from "./canonical-runtime-source.js";
import { productionCutoverPhaseAtLeast } from "./production-cutover-activation-contract.js";
const clean = value => String(value ?? "").trim();
export function scoringAuthorityEnvironment(env = process.env) {
  const configuredValue = clean(env.SCORING_AUTHORITY), requested = clean(configuredValue || "supabase").toLowerCase();
  const database = isolatedCanonicalDatabaseEnvironment(env);
  const productionDeployment = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const productionIngressRequested = /^(?:1|true|yes|on|enabled)$/i.test(clean(env.PRODUCTION_SUPABASE_SCORING_INGRESS_ENABLED));
  const productionEligible = productionDeployment && requested === "supabase" && productionIngressRequested && productionCutoverPhaseAtLeast(env, "SCORING_COMMIT");
  const eligible = productionDeployment ? productionEligible : database.eligible;
  const blocked = requested !== "supabase" || !eligible;
  return {...database, configuredValue, requested, valid: requested === "supabase", eligible, blocked,
    resolved: blocked ? "unavailable" : "supabase", productionDeployment, productionEligible,
    productionIngressRequested, productionBlocked: productionDeployment && blocked,
    productionActivationRequested: /^(?:1|true|yes|on|enabled)$/i.test(clean(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED)),
    previewWorkbook: false, reason: requested !== "supabase" ? "google-scoring-authority-retired" : productionDeployment ? productionEligible ? "production-supabase-authority" : "production-cutover-scoring-gate-closed" : database.reason,
    failureCode: blocked ? "SCORING_AUTHORITY_UNAVAILABLE" : ""};
}
export function requireScoringAuthority(env = process.env) {
  const state = scoringAuthorityEnvironment(env);
  if (state.blocked) throw Object.assign(new Error(`Canonical scoring authority is unavailable (${state.reason}).`), {code: state.failureCode, status:503, authority:state});
  return state;
}
export function scoringAuthority(env = process.env) { return requireScoringAuthority(env).resolved; }
