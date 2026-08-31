import { recalculateCalcuttaAfterCanonicalMutation } from "./calcutta-post-commit.js";
import { recalculateCompetitionDerivedTournament } from "./competition-derived-supabase.js";
import { recalculateIntelligenceDerivedTournament } from "./intelligence-derived-supabase.js";
import { drainScorecardArchiveJobs } from "./scorecard-archive-worker.js";
import { drainGoogleOutbox } from "./scoring-google-outbox.js";

export async function runMobileScoringPostCommit({ tournamentId, matchId }, dependencies = {}) {
  const actor = "Mobile v1 scoring worker";
  return Promise.allSettled([
    (dependencies.drainGoogleOutbox || drainGoogleOutbox)({ maximum: 8, actor }),
    (dependencies.drainScorecardArchiveJobs || drainScorecardArchiveJobs)({ maximum: 4, stopOnFailure: false }),
    (dependencies.recalculateCompetitionDerivedTournament || recalculateCompetitionDerivedTournament)(tournamentId, { calculatedBy: actor }),
    (dependencies.recalculateIntelligenceDerivedTournament || recalculateIntelligenceDerivedTournament)(tournamentId, { calculatedBy: actor }),
    (dependencies.recalculateCalcuttaAfterCanonicalMutation ||
      dependencies.recalculateCalcuttaTournament ||
      recalculateCalcuttaAfterCanonicalMutation)(tournamentId, {
        calculatedBy: actor,
        matchId,
      }),
  ]);
}
