import { operationalPhase } from "./operational-telemetry.js";
import { recalculateCalcuttaAfterCanonicalMutation } from "./calcutta-post-commit.js";
import { recalculateCompetitionDerivedTournament } from "./competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "./intelligence-derived-supabase.js";
import { drainScorecardArchiveJobs } from "./scorecard-archive-worker.js";
import { drainGoogleOutbox } from "./scoring-google-outbox.js";

export async function runMobileScoringPostCommit({ tournamentId, matchId }, dependencies = {}) {
  const actor = "Mobile v1 scoring worker";
  return Promise.allSettled([
    operationalPhase("post_commit_outbox", () => (dependencies.drainGoogleOutbox || drainGoogleOutbox)({ maximum: 8, actor }), "SCORING"),
    operationalPhase("post_commit_archive", () => (dependencies.drainScorecardArchiveJobs || drainScorecardArchiveJobs)({ maximum: 4, stopOnFailure: false }), "SCORING"),
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
