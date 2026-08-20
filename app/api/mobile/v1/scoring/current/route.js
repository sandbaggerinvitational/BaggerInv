import { mobileScoringCurrentResult } from "../../../../../../lib/mobile-v1-scoring.js";
import { mobileScoringMatchIdFromRequest, mobileV1ScoringResponse } from "../../../../../../lib/mobile-v1-scoring-route.js";

export const dynamic = "force-dynamic";

export const GET = (request) => mobileV1ScoringResponse(request, (identity) => mobileScoringCurrentResult(identity, {
  matchId: mobileScoringMatchIdFromRequest(request),
}));
