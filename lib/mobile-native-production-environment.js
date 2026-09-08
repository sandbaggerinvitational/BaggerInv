import { productionCutoverActivationEnvironment, PRODUCTION_CANONICAL_ORIGIN } from "./production-cutover-activation-contract.js";
import { PRODUCTION_SUPABASE_URL, PRODUCTION_SUPABASE_PROJECT_REF } from "./production-foundation-resource-contract.js";

export const PRODUCTION_NATIVE_CONTRACT = "bagger-production-native-v1";
export const NATIVE_CAPABILITIES = Object.freeze(["reads", "auth", "certification", "scoring"]);
export const PRODUCTION_NATIVE_READ_SELECTORS = Object.freeze([
  "HOME_READ_SOURCE", "TOURNAMENT_READ_SOURCE", "LEADERBOARDS_CORE_READ_SOURCE", "GUIDE_READ_SOURCE",
  "COURSE_PRESENTATION_READ_SOURCE", "COMPLETED_HISTORY_READ_SOURCE", "SECONDARY_HISTORY_READ_SOURCE",
  "HISTORY_2026_READ_SOURCE", "DRAFT_READ_SOURCE", "PUBLISHED_ODDS_READ_SOURCE", "NET_SKINS_READ_SOURCE",
  "CALCUTTA_READ_SOURCE", "GAME_CENTER_READ_SOURCE", "MATCH_AUTHORIZATION_SOURCE", "SCORING_READ_SOURCE",
]);
const disabled = () => Object.fromEntries(NATIVE_CAPABILITIES.map((key) => [key, false]));
const clean = (value) => String(value ?? "").trim();

// Environment identity is independent of enablement. Existing Production
// activation owns deployment/resource selection; native cannot override it.
export function productionNativeEnvironment(env = process.env) {
  const activation = productionCutoverActivationEnvironment(env);
  const available = env.VERCEL_ENV === "production" && activation.allowed &&
    /^dpl_[A-Za-z0-9]{8,64}$/.test(env.VERCEL_DEPLOYMENT_ID || "") &&
    ["PRODUCTION_SHADOW_CANDIDATE_ENABLED", "PRODUCTION_STEP11_SCORING_REHEARSAL_ENABLED"]
      .every((key) => [undefined, "", "false", "0", "off", "disabled"].includes(env[key])) &&
    env.NEXT_PUBLIC_SUPABASE_AUTH_URL === PRODUCTION_SUPABASE_URL &&
    env.SUPABASE_SCORING_MIRROR_URL === PRODUCTION_SUPABASE_URL &&
    clean(env.SUPABASE_SCORING_MIRROR_SECRET_KEY) === clean(env.PRODUCTION_SUPABASE_SECRET_KEY) &&
    Boolean(clean(env.NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY)) &&
    env.PARTICIPANT_IDENTITY_AUTHORITY === "supabase";
  return { available, environment: "production", activation };
}

// One audited server configuration value, never a request value. Bind an
// approval to a release, not to a client version or a mutable tournament ID.
// Unknown fields/types invalidate the whole document instead of guessing.
export function productionNativeControls(env = process.env) {
  const off = { valid: false, capabilities: disabled(), revocationGeneration: "" };
  try {
    const raw = env.PRODUCTION_NATIVE_CAPABILITIES;
    if (typeof raw !== "string" || raw.length > 4096) return off;
    const value = JSON.parse(raw);
    const keys = ["version", "environment", "apiOrigin", "projectRef", "deploymentCommit", "revision", "revocationGeneration", "capabilities"];
    if (!value || Array.isArray(value) || Object.keys(value).length !== keys.length ||
        !keys.every((key) => Object.hasOwn(value, key)) ||
        value.version !== PRODUCTION_NATIVE_CONTRACT || value.environment !== "production" ||
        value.apiOrigin !== PRODUCTION_CANONICAL_ORIGIN || value.projectRef !== PRODUCTION_SUPABASE_PROJECT_REF ||
        !/^[0-9a-f]{40}$/.test(value.deploymentCommit) || value.deploymentCommit !== env.VERCEL_GIT_COMMIT_SHA ||
        !Number.isSafeInteger(value.revision) || value.revision < 1 ||
        typeof value.revocationGeneration !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(value.revocationGeneration) ||
        !value.capabilities || Array.isArray(value.capabilities) ||
        Object.keys(value.capabilities).length !== NATIVE_CAPABILITIES.length ||
        !NATIVE_CAPABILITIES.every((key) => typeof value.capabilities[key] === "boolean") ||
        !productionNativeEnvironment(env).available) return off;
    return Object.freeze({ valid: true, revision: value.revision,
      revocationGeneration: value.revocationGeneration,
      capabilities: Object.freeze({ ...value.capabilities }) });
  } catch { return off; }
}
