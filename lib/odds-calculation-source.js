import { canonicalReadEnvironment } from "./canonical-runtime-source.js";
const truthy = value => /^(?:1|true|yes|on|enabled)$/i.test(String(value || "").trim());
export function oddsCalculationEnvironment(env = process.env) {
  const input = canonicalReadEnvironment(env, "ODDS_CALCULATION_INPUT_SOURCE", {requiredPhase: "ODDS_WAR_ROOM"});
  const selected = String(env.ODDS_PUBLICATION_AUTHORITY || "supabase").trim().toLowerCase();
  const production = env.VERCEL_ENV === "production";
  const publicationEnabled = production ? truthy(env.PRODUCTION_SUPABASE_ODDS_PUBLICATION_ENABLED) : env.ODDS_PUBLICATION_AUTHORITY === "supabase" && input.eligible;
  const publicationBlocked = input.blocked || input.productionShadowCandidate || selected !== "supabase" || !publicationEnabled;
  const publication = {requested: selected, resolved: publicationBlocked ? "unavailable" : "supabase", blocked: publicationBlocked,
    eligible: !publicationBlocked, valid: selected === "supabase", reason: publicationBlocked ? "canonical-publication-admission-required" : "canonical-publication-admitted", failureCode: publicationBlocked ? "ODDS_PUBLICATION_AUTHORITY_UNAVAILABLE" : ""};
  input.failureCode = input.blocked ? "ODDS_CALCULATION_INPUT_AUTHORITY_UNAVAILABLE" : "";
  return {input, publication, requestedInputs: input.requested, requestedPublication: selected,
    inputSource: input.resolved, publicationAuthority: publication.resolved,
    inputBlocked: input.blocked, inputReason: input.reason, inputFailureCode: input.failureCode,
    publicationBlocked, publicationReason: publication.reason, publicationFailureCode: publication.failureCode,
    eligible: input.eligible, publicationEligible: !publicationBlocked, preview: input.previewDeployment,
    isolated: input.productionIsolated, configured: input.credentialsConfigured, productionHardBlock: production && (input.blocked || publicationBlocked),
    productionShadowCandidate: input.productionShadowCandidate, productionCutover: input.productionCutover, fallbackUsed: false};
}

function authorityError(state, selector) {
  const detail = selector === "input" ? state.input : state.publication;
  const error = new Error(`${selector === "input" ? "Odds calculation input" : "Odds publication"} authority is unavailable in this runtime.`);
  error.code = detail.failureCode;
  error.status = 503;
  error.authority = state;
  return error;
}

export function requireOddsCalculationInputSource(env = process.env) {
  const state = oddsCalculationEnvironment(env);
  if (state.inputBlocked) throw authorityError(state, "input");
  return state;
}

export function requireOddsPublicationAuthority(env = process.env) {
  const state = oddsCalculationEnvironment(env);
  if (state.publicationBlocked) throw authorityError(state, "publication");
  return state;
}
