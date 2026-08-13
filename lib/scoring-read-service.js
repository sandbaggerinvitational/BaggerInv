import { requireScoringReadSource } from "./scoring-read-source.js";
import { readScoringMatchView } from "./scoring-read-supabase.js";
import { mergeParticipantScoringAuthorityState } from "./scoring-participant-authority-state.js";

export async function readParticipantScoringMatch({
  matchId,
  currentPlayerId = "",
  authorization = {},
  canonicalData = null,
  env = process.env,
  dependencies = {},
} = {}) {
  const source = requireScoringReadSource(env);
  if (source.resolved === "google") {
    const readGoogle = dependencies.readGoogle || (await import("./google-sheets-write.js")).readLiveScoringMatch;
    const startedAt = performance.now();
    const googleData = await readGoogle(matchId);
    const data = canonicalData?.match
      ? mergeParticipantScoringAuthorityState(googleData, canonicalData, {
          authorizationVerified: canonicalData.authorization?.verified === true,
        })
      : googleData;
    return {
      source,
      data,
      diagnostics: {
        source: "google",
        totalMs: Math.max(0, performance.now() - startedAt),
        googleRequests: 1,
        googleRanges: 7,
      },
    };
  }
  const result = await (dependencies.readSupabase || readScoringMatchView)(matchId, {
    currentPlayerId,
    authorizationVerified: authorization.verified === true || authorization.authorizationVerified === true,
    writable: authorization.writable === true,
    readView: dependencies.readView,
  });
  return { source, ...result };
}

export function scoringReadResponseHeaders(diagnostics = {}) {
  const timing = [
    ["postgres", diagnostics.postgresQueryMs],
    ["supabase", diagnostics.supabaseRequestMs],
    ["adapter", diagnostics.adapterMs],
    ["scoringRead", diagnostics.totalMs],
  ].filter(([, value]) => Number.isFinite(Number(value)))
    .map(([name, value]) => `${name};dur=${Number(value).toFixed(1)}`).join(", ");
  return {
    "Cache-Control": "no-store",
    "X-Scoring-Read-Source": diagnostics.source || "unknown",
    "X-Scoring-Google-Requests": String(Number(diagnostics.googleRequests || 0)),
    ...(timing ? { "Server-Timing": timing } : {}),
  };
}
