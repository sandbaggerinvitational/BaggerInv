import { MobileApiError, requireMobileApiAvailable, mobileHealthResult, MOBILE_API_SERVICE, MOBILE_API_VERSION } from "./mobile-api-v1.js";
import { productionNativeEnvironment, productionNativeControls, PRODUCTION_NATIVE_CONTRACT, NATIVE_CAPABILITIES, PRODUCTION_NATIVE_READ_SELECTORS } from "./mobile-native-production-environment.js";
import { productionCutoverRequestEnvironment } from "./production-cutover-activation-contract.js";

const contexts = new WeakMap();
const codeFor = (capability) => `NATIVE_${capability.toUpperCase()}_DISABLED`;
const isProduction = (env) => String(env.VERCEL_ENV || "").trim().toLowerCase() === "production";
const authConfigured = (env) => env.MOBILE_NATIVE_AUTH_ANTI_ABUSE_MODE === "supabase-turnstile" &&
  env.PARTICIPANT_AUTH_CAPTCHA_REQUIRED === "true" && env.PARTICIPANT_AUTH_CAPTCHA_CONFIGURED === "true" &&
  env.MOBILE_NATIVE_EDGE_RATE_LIMIT_CONFIGURED === "true" && env.MOBILE_NATIVE_SUPABASE_SIGNUPS_DISABLED === "true" &&
  String(env.NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY || "").length >= 10 &&
  String(env.PARTICIPANT_AUTH_RATE_LIMIT_SECRET || "").length >= 32;
const certConfigured = (env) => String(env.PRODUCTION_NATIVE_CERTIFICATION_SIGNING_SECRET || "").trim().length >= 32 &&
  String(env.PRODUCTION_NATIVE_CERTIFICATION_SIGNING_SECRET).trim() !== String(env.MOBILE_NATIVE_CERTIFICATION_SIGNING_SECRET || "").trim();

export function requireMobileNativeConfiguration(capability, { env = process.env, request } = {}) {
  if (!NATIVE_CAPABILITIES.includes(capability)) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  if (!isProduction(env)) return requireMobileApiAvailable(env);
  if (!productionNativeEnvironment(env).available) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  const controls = productionNativeControls(env);
  if (controls.capabilities[capability] !== true) throw new MobileApiError(codeFor(capability));
  if (capability === "reads" && !PRODUCTION_NATIVE_READ_SELECTORS.every((key) => env[key] === "supabase"))
    throw new MobileApiError("AUTHORITY_INCOMPATIBLE");
  if (request && !productionCutoverRequestEnvironment(request, env, { requireOrigin: false }).allowed)
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  if (request && request.headers?.get("x-bagger-mobile-contract") !== PRODUCTION_NATIVE_CONTRACT)
    throw new MobileApiError("CLIENT_UPDATE_REQUIRED");
  if ((capability === "auth" || capability === "certification") && !authConfigured(env))
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  if (capability !== "auth" && !certConfigured(env)) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  return controls;
}

export async function requireMobileNativeCapability(capability, { env = process.env, request, dependencies = {} } = {}) {
  const controls = requireMobileNativeConfiguration(capability, { env, request });
  if (!isProduction(env)) return null;
  if (!request) throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  let authority;
  try {
    const { readProductionNativeAuthority } = await import("./mobile-native-production-authority.js");
    authority = await readProductionNativeAuthority({ env, dependencies });
  } catch { throw new MobileApiError("AUTHORITY_INCOMPATIBLE"); }
  if (!authority.compatible) throw new MobileApiError("AUTHORITY_INCOMPATIBLE");
  // Scoring maintenance suspends mutations only. Existing read authority and
  // identity remain independently authoritative for read/auth/cert requests.
  if (capability === "scoring" && authority.maintenance) throw new MobileApiError("MAINTENANCE");
  if (capability === "scoring" && !authority.scoringCompatible) throw new MobileApiError("SCORING_UNAVAILABLE");
  requireMobileNativeConfiguration(capability, { env, request });
  return { controls, authority, request, env, dependencies };
}

export function bindMobileNativeIdentity(identity, admission) {
  if (admission) contexts.set(identity, admission);
  return identity;
}

export async function recheckMobileNativeIdentity(identity, capability, env = process.env) {
  if (!isProduction(env)) return;
  const prior = contexts.get(identity);
  if (!prior || prior.env !== env) throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
  const next = await requireMobileNativeCapability(capability, prior);
  const a = prior.authority.runtime, b = next.authority.runtime;
  if (prior.controls.revocationGeneration !== next.controls.revocationGeneration ||
      ["tournamentId", "pointerRevision", "lifecycleRevision", "runtimeGenerationId", "authorityGenerationId", "admissionGenerationId"]
        .some((key) => a[key] !== b[key]) || identity.tournamentId !== b.tournamentId)
    throw new MobileApiError("AUTH_CERTIFICATION_FAILED");
}

export async function mobileNativeHealthResult(request, { env = process.env, dependencies = {} } = {}) {
  if (!isProduction(env)) return mobileHealthResult(env);
  // Health does not require native controls or certification credentials.
  const validEnvironment = productionNativeEnvironment(env).available &&
    productionCutoverRequestEnvironment(request, env, { requireOrigin: false }).allowed;
  let authority = null;
  if (validEnvironment) {
    try {
      const { readProductionNativeAuthority } = await import("./mobile-native-production-authority.js");
      authority = await readProductionNativeAuthority({ env, dependencies });
    } catch { /* Public response contains no provider/control-plane details. */ }
  }
  const compatible = Boolean(validEnvironment && authority?.compatible);
  const requestedVersion = request?.headers?.get("x-bagger-mobile-contract");
  const updateRequired = Boolean(requestedVersion && requestedVersion !== PRODUCTION_NATIVE_CONTRACT);
  const capabilities = Object.fromEntries(NATIVE_CAPABILITIES.map((capability) => {
    let enabled = false;
    if (compatible && !updateRequired) {
      try { requireMobileNativeConfiguration(capability, { env });
        enabled = capability !== "scoring" || authority.scoringCompatible;
      } catch { /* Disabled and invalid controls both fail closed. */ }
    }
    return [capability, enabled];
  }));
  return { status: compatible && !updateRequired ? 200 : 503, body: {
    ok: compatible && !updateRequired, apiVersion: MOBILE_API_VERSION, service: MOBILE_API_SERVICE,
    environment: "production", contractVersion: PRODUCTION_NATIVE_CONTRACT,
    compatibility: updateRequired ? "CLIENT_UPDATE_REQUIRED" : compatible ? "COMPATIBLE" : "AUTHORITY_INCOMPATIBLE",
    authority: { identity: compatible ? "supabase" : "unavailable", currentTournament: compatible ? "server-current-active" : "unavailable" },
    capabilities, scoringStatus: capabilities.scoring ? "AVAILABLE" : authority?.maintenance ? "MAINTENANCE" : "SUSPENDED",
  } };
}
