import "server-only";

import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "./production-foundation-resource-contract.js";
import {
  assertProductionShadowCandidate,
  assertProductionShadowCandidateRequest,
} from "./production-shadow-candidate.js";

export const PRODUCTION_SHADOW_CANDIDATE_READ_SOURCE_OVERLAY = Object.freeze({
  TOURNAMENT_READ_SOURCE: "supabase",
  TOURNAMENT_FOUNDATION_READ_SOURCE: "supabase",
  HOMEPAGE_CURRENT_READ_SOURCE: "supabase",
  HOME_READ_SOURCE: "supabase",
  SCORING_READ_SOURCE: "supabase",
  MATCH_AUTHORIZATION_SOURCE: "supabase",
  MY_MATCH_READ_SOURCE: "supabase",
  GAME_CENTER_READ_SOURCE: "supabase",
  LEADERBOARDS_CORE_READ_SOURCE: "supabase",
  NET_SKINS_READ_SOURCE: "supabase",
  CALCUTTA_READ_SOURCE: "supabase",
  MOMENTUM_READ_SOURCE: "supabase",
  STORYLINES_READ_SOURCE: "supabase",
  TOURNAMENT_INTELLIGENCE_READ_SOURCE: "supabase",
  PROJECTION_EDITORIAL_READ_SOURCE: "supabase",
  FINAL_RECAP_READ_SOURCE: "supabase",
  GUIDE_READ_SOURCE: "supabase",
  COURSE_PRESENTATION_READ_SOURCE: "supabase",
  HISTORY_2026_READ_SOURCE: "supabase",
  COMPLETED_HISTORY_READ_SOURCE: "supabase",
  SECONDARY_HISTORY_READ_SOURCE: "supabase",
  HISTORICAL_COURSE_READ_SOURCE: "supabase",
  PUBLISHED_ODDS_READ_SOURCE: "supabase",
  ODDS_CALCULATION_INPUT_SOURCE: "supabase",
  PREDICTION_SETTINGS_READ_SOURCE: "supabase",
  WAR_ROOM_INPUT_SOURCE: "supabase",
  DRAFT_READ_SOURCE: "supabase",
  PARTICIPANT_IDENTITY_AUTHORITY: "supabase",
  // Candidate reads can never acquire a canonical write/publication role.
  SCORING_AUTHORITY: "google",
  ODDS_PUBLICATION_AUTHORITY: "google",
});

export function productionShadowCandidateServerTransport(env = process.env, { request = null, requireOrigin } = {}) {
  const state = request
    ? assertProductionShadowCandidateRequest(request, env, { requireOrigin }).candidate
    : assertProductionShadowCandidate(env);
  return {
    url: PRODUCTION_SUPABASE_URL,
    secretKey: String(env.PRODUCTION_SUPABASE_SECRET_KEY || "").trim(),
    projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
    candidateHostname: state.resources.candidateHostname,
  };
}

/**
 * A candidate data/admin request receives a fresh environment overlay pinned
 * to the dedicated Production transport. Preview mirror variables are never
 * trusted or forwarded for that request.
 */
export function productionShadowCandidateDataEnvironment(
  env = process.env,
  { request, requireOrigin } = {},
) {
  if (!request) throw new Error("A request is required for Production-shadow data access.");
  const transport = productionShadowCandidateServerTransport(env, { request, requireOrigin });
  return Object.freeze({
    ...env,
    ...PRODUCTION_SHADOW_CANDIDATE_READ_SOURCE_OVERLAY,
    SUPABASE_SCORING_MIRROR_URL: transport.url,
    SUPABASE_SCORING_MIRROR_SECRET_KEY: transport.secretKey,
    PRODUCTION_SHADOW_CANDIDATE_TRANSPORT_ASSERTED: "true",
  });
}
