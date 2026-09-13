import { isCanonicalReviewer } from './mobile-reviewer-identity.js';
import { MobileApiError } from "./mobile-api-v1.js";

const clean = (value) => String(value ?? "").trim();

/** Internal DTO prerequisite, not mobile admission. Routes must still pass the
 * unchanged requireMobileApiAvailable boundary before calling any loader. */
export async function requireMobileProductionReadContext(identity, {
  env = process.env, dependencies = {}, historical2026 = false, expectedRuntime = null,
} = {}) {
  if (clean(env.VERCEL_ENV).toLowerCase() !== "production") return null;
  if (!isCanonicalReviewer(identity?.context) && (!clean(identity?.authUserId) || !clean(identity?.playerId) ||
      identity?.context?.membership?.active !== true ||
      clean(identity.context.authUserId) !== clean(identity.authUserId) ||
      clean(identity.context.playerId) !== clean(identity.playerId) ||
      clean(identity.context.tournament?.id) !== clean(identity.tournamentId))) {
    throw new MobileApiError("PARTICIPANT_NOT_FOUND");
  }
  try {
    const readRuntime = dependencies.readCurrentTournamentRuntime ||
      (await import("./production-current-tournament-runtime.js")).readProductionCurrentTournamentRuntime;
    const runtime = await readRuntime({}, { env });
    if (runtime?.lifecycle !== "ACTIVE" || clean(runtime.tournamentId) !== clean(identity.tournamentId) ||
        (historical2026 && clean(runtime.tournamentId) !== "2026")) {
      throw new Error("incompatible current tournament");
    }
    if (expectedRuntime && ["tournamentId", "pointerRevision", "runtimeGenerationId",
      "authorityGenerationId", "admissionGenerationId"].some((key) => runtime[key] !== expectedRuntime[key])) {
      throw new Error("current tournament generation changed during read");
    }
    return runtime;
  } catch {
    throw new MobileApiError("MOBILE_API_UNAVAILABLE");
  }
}
