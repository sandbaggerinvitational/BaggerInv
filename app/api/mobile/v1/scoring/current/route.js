import { withOperationalRoute, recordOperationalError } from "../../../../../../lib/operational-telemetry.js";
import { mobileScoringCurrentResult } from "../../../../../../lib/mobile-v1-scoring.js";
import { mobileScoringMatchIdFromRequest, mobileV1ScoringResponse } from "../../../../../../lib/mobile-v1-scoring-route.js";

export const dynamic = "force-dynamic";

const telemetryGET = (request) => mobileV1ScoringResponse(request, (identity) => mobileScoringCurrentResult(identity, {
  matchId: mobileScoringMatchIdFromRequest(request),
}), "reads");

export const GET = withOperationalRoute({ route: "/api/mobile/v1/scoring/current", domain: "SCORING" }, telemetryGET);
