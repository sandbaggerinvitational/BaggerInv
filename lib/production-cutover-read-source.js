import {
  PRODUCTION_CUTOVER_PHASES,
  productionCutoverActivationEnvironment,
} from "./production-cutover-activation-contract.js";

const clean = (value) => String(value ?? "").trim();
const truthy = (value) => /^(?:1|true|yes|on|enabled)$/i.test(clean(value));
const falsey = (value) => /^(?:0|false|no|off|disabled)$/i.test(clean(value));

function phaseIndex(value) {
  return PRODUCTION_CUTOVER_PHASES.indexOf(clean(value).toUpperCase());
}

/**
 * Central Production-only read cutover decision.
 *
 * This helper deliberately does not replace either ordinary Preview or the
 * Production-shadow Preview candidate gates.  It becomes authoritative only
 * when the exact live Production deployment explicitly requests the cutover.
 * A malformed requested activation fails closed instead of silently retaining
 * a Google/application foreground read.
 */
export function productionCutoverReadSourceEnvironment({
  env = process.env,
  variable,
  configuredValue,
  defaultSource = "google",
  legacySource = defaultSource,
  requiredPhase,
  requiredConfigurationFlag = "",
  configurationRequiredForAnySource = false,
} = {}) {
  const activation = productionCutoverActivationEnvironment(env);
  const production = clean(env.VERCEL_ENV).toLowerCase() === "production";
  const activationToken = clean(env.PRODUCTION_CUTOVER_ACTIVATION_ENABLED);
  const malformedActivation = Boolean(activationToken) &&
    !truthy(activationToken) && !falsey(activationToken);
  const configured = clean(configuredValue);
  const normalized = clean(configured || defaultSource).toLowerCase();
  const validSources = new Set([clean(legacySource).toLowerCase(), "supabase"]);
  const requested = validSources.has(normalized) ? normalized : "invalid";
  const handled = production && (activation.requested || malformedActivation);
  const publicReadsConfigured = clean(env.PRODUCTION_SUPABASE_PUBLIC_READS_ENABLED);
  const publicReadsEnabled = truthy(publicReadsConfigured);
  const requiredPhaseIndex = phaseIndex(requiredPhase);
  const phaseReached = activation.allowed && requiredPhaseIndex >= 0 &&
    activation.authorizationPhaseIndex >= requiredPhaseIndex;
  const configurationRequired = Boolean(clean(requiredConfigurationFlag));
  const domainConfigured = !configurationRequired || truthy(env[requiredConfigurationFlag]);

  let resolved = "";
  let blocked = false;
  let reason = "production-cutover-not-requested";
  let failureCode = "";

  if (handled) {
    blocked = malformedActivation || !activation.allowed || requested === "invalid" ||
      (configurationRequiredForAnySource && !domainConfigured) ||
      (requested === "supabase" && (!publicReadsEnabled || !phaseReached || !domainConfigured));
    resolved = blocked ? "unavailable" : requested;
    reason = malformedActivation ? "invalid-production-cutover-activation-token"
      : !activation.allowed ? activation.reason
      : requested === "invalid" ? "invalid-source"
      : configurationRequiredForAnySource && !domainConfigured ? "production-domain-configuration-required"
      : requested !== "supabase" ? "production-cutover-legacy-source-selected"
      : !publicReadsEnabled ? "production-public-supabase-reads-required"
      : !phaseReached ? "production-read-cutover-phase-not-reached"
      : !domainConfigured ? "production-domain-configuration-required"
      : "production-cutover-supabase-read-ready";
    failureCode = blocked ? "PRODUCTION_CUTOVER_READ_SOURCE_UNAVAILABLE" : "";
  }

  return Object.freeze({
    contract: "production-cutover-read-source-v1",
    variable: clean(variable),
    configuredValue: configured,
    requested,
    handled,
    production,
    resolved,
    blocked,
    reason,
    failureCode,
    fallbackUsed: false,
    requiredPhase: clean(requiredPhase).toUpperCase(),
    phaseReached,
    publicReadsEnabled,
    publicReadsConfigured: Boolean(publicReadsConfigured),
    requiredConfigurationFlag: clean(requiredConfigurationFlag),
    configurationRequiredForAnySource,
    domainConfigured,
    activation,
    malformedActivation,
  });
}

export function productionCutoverReadSourceError(state, label = "Production read") {
  const error = new Error(`${label} is unavailable (${state.reason}).`);
  error.code = state.failureCode || "PRODUCTION_CUTOVER_READ_SOURCE_UNAVAILABLE";
  error.status = 503;
  error.diagnostics = state;
  return error;
}
