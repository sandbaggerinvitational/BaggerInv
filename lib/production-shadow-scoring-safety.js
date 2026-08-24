import { NextResponse } from "next/server.js";
import { productionShadowCandidateScoringMutationDecision } from "./production-shadow-candidate.js";

export const PRODUCTION_SHADOW_SCORING_ZERO_WRITE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store",
  "X-Production-Shadow-Scoring": "read-only",
  "X-Scoring-Google-Writes": "0",
  "X-Scoring-Supabase-Writes": "0",
  "X-Scoring-Ingress-Attempts": "0",
});

/**
 * Return a bounded rejection for a Production-shadow candidate mutation, or
 * null for every non-candidate environment.  Routes invoke this as their first
 * executable statement so no session/persistence/outbox work can start.
 */
export function productionShadowScoringMutationResponse(request, env = process.env) {
  const decision = productionShadowCandidateScoringMutationDecision(request, env);
  if (!decision.blocked) return null;
  const exactCandidate = decision.code === "PRODUCTION_SHADOW_CANDIDATE_SCORING_READ_ONLY";
  return NextResponse.json({
    error: exactCandidate
      ? "Scoring changes are disabled in the Production shadow candidate."
      : "Not found.",
    code: decision.code,
  }, {
    status: decision.status,
    headers: PRODUCTION_SHADOW_SCORING_ZERO_WRITE_HEADERS,
  });
}
