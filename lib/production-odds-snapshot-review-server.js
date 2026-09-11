import "server-only";
import { readPublishableProductionOddsCalculation } from "./production-odds-calculation-server.js";
import { readProductionTournamentSetup } from "./production-tournament-setup-server.js";
import { oddsSnapshotReview } from "./odds-snapshot-review.js";

export async function readProductionOddsSnapshotReview(jobId, actor, options = {}) {
  const read = options.readCalculation || readPublishableProductionOddsCalculation;
  // Reuse ALL publication integrity/currentness/same-release checks. Review
  // must not invoke the publisher's stale-job supersession side effect.
  const verified = await read(jobId, {
    ...options.calculationOptions,
    dependencies: {
      ...options.calculationOptions?.dependencies,
      supersedeJob: async () => null,
    },
  });
  const setup = await (options.readSetup || readProductionTournamentSetup)(actor);
  return oddsSnapshotReview(verified, setup);
}
