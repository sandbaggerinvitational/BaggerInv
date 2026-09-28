import { withOperationalRoute, recordOperationalError } from "../../../../../../lib/operational-telemetry.js";
import { after } from "next/server.js";
import { mobileScoringFinalizeResult } from "../../../../../../lib/mobile-v1-scoring.js";
import { runMobileScoringPostCommit } from "../../../../../../lib/mobile-v1-scoring-post-commit.js";
import { mobileV1ScoringResponse, readMobileScoringJson } from "../../../../../../lib/mobile-v1-scoring-route.js";
import { productionShadowScoringMutationResponse } from "../../../../../../lib/production-shadow-scoring-safety.js";

export const dynamic = "force-dynamic";

const telemetryPOST = (request) => productionShadowScoringMutationResponse(request) || mobileV1ScoringResponse(request, async (identity) => {
  const input = await readMobileScoringJson(request);
  const result = await mobileScoringFinalizeResult(identity, input);
  after(() => runMobileScoringPostCommit({
    tournamentId: identity.tournamentId,
    matchId: input.matchId,
  }));
  return result;
});

export const POST = withOperationalRoute({ route: "/api/mobile/v1/scoring/finalize", domain: "SCORING" }, telemetryPOST);
