import { operationalPhase } from "./operational-telemetry.js";
import { recalculateCalcuttaAfterCanonicalMutation } from "./calcutta-post-commit.js";
import { recalculateCompetitionDerivedTournament } from "./competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "./intelligence-derived-supabase.js";

export async function runMobileScoringPostCommit({ tournamentId, matchId }, dependencies = {}) {
  const actor = "Mobile v1 scoring worker";
  return Promise.allSettled([
    operationalPhase("post_commit_competition", () => (dependencies.recalculateCompetitionDerivedTournament || recalculateCompetitionDerivedTournament)(tournamentId, { calculatedBy: actor }), "TOURNAMENT_READ"),
    operationalPhase("post_commit_intelligence", () => (dependencies.recalculateIntelligenceDerivedTournament || recalculateIntelligenceDerivedTournament)(tournamentId, { calculatedBy: actor }), "TOURNAMENT_READ"),
    operationalPhase("post_commit_calcutta", () => (dependencies.recalculateCalcuttaAfterCanonicalMutation ||
      dependencies.recalculateCalcuttaTournament ||
      recalculateCalcuttaAfterCanonicalMutation)(tournamentId, {
        calculatedBy: actor,
        matchId,
      }), "CALCUTTA"),
  ]);
}
