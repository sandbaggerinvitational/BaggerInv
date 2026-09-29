import { MobileApiError, mobileApiErrorResult } from "./mobile-api-v1.js";
import { resolveSupabaseParticipantIdentity } from "./participant-identity-resolver.js";
import { resolveMobileBearerIdentity } from "./mobile-bearer-identity.js";
import { recheckMobileNativeIdentity } from "./mobile-native-admission.js";
import { consumeRateLimit } from "./rate-limit.js";
import { recordOperationalError, withOperationalRoute } from "./operational-telemetry.js";
import { assertScoreRecoveryIdentity, normalizeScoreRecoveryRequest, recoverCanonicalScoreMutation,
  scoreRecoveryError, SCORE_RECOVERY_CONTRACT } from "./scoring-mutation-recovery.js";
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache",
  Vary: "Cookie, Authorization, X-Bagger-Certification", "X-Content-Type-Options": "nosniff" };
async function body(request) {
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(request.headers.get("content-type") || ""))
    throw scoreRecoveryError("SCORE_RECOVERY_INVALID_REQUEST", 400);
  const length = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(length) || length < 0 || length > 1024) throw scoreRecoveryError("SCORE_RECOVERY_INVALID_REQUEST", 400);
  const reader = request.body?.getReader();
  if (!reader) throw scoreRecoveryError("SCORE_RECOVERY_INVALID_REQUEST", 400);
  let bytes = 0; const chunks = [];
  try { while (true) {
    const next = await reader.read(); if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > 1024) { await reader.cancel(); throw scoreRecoveryError("SCORE_RECOVERY_INVALID_REQUEST", 400); }
    chunks.push(next.value);
  } } finally { reader.releaseLock(); }
  const all = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  try { return normalizeScoreRecoveryRequest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all))); }
  catch { throw scoreRecoveryError("SCORE_RECOVERY_INVALID_REQUEST", 400); }
}
// Inject provider boundaries for isolated tests; deployed routes use defaults.
// Scoring sessions never substitute for authenticated participant identity.
export function createScoreMutationRecoveryHandler({ mobile = false, env = process.env,
  resolveIdentity, readStatus, rateLimit = consumeRateLimit,
  recheckIdentity = recheckMobileNativeIdentity, getCookies,
} = {}) {
  const route = mobile ? "/api/mobile/v1/scoring/mutation-status" : "/api/scoring/mutation-status";
  return withOperationalRoute({ route, domain: "SCORING" }, async request => {
    try {
      const identity = assertScoreRecoveryIdentity(await (resolveIdentity || (mobile
        ? req => resolveMobileBearerIdentity({ request: req, capability: "reads", env })
        : async req => resolveSupabaseParticipantIdentity({ request: req, env,
          cookieStore: await (getCookies || (async () => (await import("next/headers.js")).cookies()))() })
      ))(request));
      const rate = rateLimit(`score-recovery:${identity.authUserId}`, { limit: 60, windowMs: 60_000 });
      if (!rate.allowed) return Response.json({ ok: false, contract: SCORE_RECOVERY_CONTRACT,
        status: "UNKNOWN", code: "SCORE_RECOVERY_RATE_LIMITED" }, { status: 429,
        headers: { ...headers, "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt-Date.now())/1000))) } });
      const input = await body(request);
      const result = await recoverCanonicalScoreMutation(identity, input, { env, ...(readStatus ? { readStatus } : {}) });
      if (mobile) await recheckIdentity(identity, "reads", env);
      return Response.json({ ok: true, ...result }, { headers });
    } catch (error) {
      recordOperationalError(error);
      // Preserve the existing native admission/error contract. Recovery adds an
      // UNKNOWN outcome but must not hide NATIVE_READS_DISABLED or auth failure.
      if (mobile && error instanceof MobileApiError) {
        const failure = mobileApiErrorResult(new MobileApiError(error.code));
        return Response.json({ ...failure.body, contract: SCORE_RECOVERY_CONTRACT, status: "UNKNOWN" },
          { status: failure.status, headers: { ...headers,
            ...(failure.status === 401 ? { "WWW-Authenticate": "Bearer" } : {}) } });
      }
      const given = Number(error?.status);
      const status = [400,401,403,429].includes(given) ? given : 503;
      const code = status === 400 ? "SCORE_RECOVERY_INVALID_REQUEST" : status === 401 ? "AUTH_SESSION_REQUIRED" :
        status === 403 ? "SCORE_RECOVERY_AUTHORIZATION_DENIED" : "SCORE_RECOVERY_UNAVAILABLE";
      return Response.json({ ok: false, contract: SCORE_RECOVERY_CONTRACT, status: "UNKNOWN", code },
        { status, headers: { ...headers, ...(status === 401 && mobile ? { "WWW-Authenticate": "Bearer" } : {}) } });
    }
  });
}
