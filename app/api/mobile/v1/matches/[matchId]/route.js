import { mobileMatchDetailResult } from "../../../../../../lib/mobile-v1-match-detail.js";
import { mobileV1ReadResponse } from "../../../../../../lib/mobile-v1-route.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { matchId } = await params;
  return mobileV1ReadResponse(
    request,
    (identity) => mobileMatchDetailResult(identity, matchId),
  );
}
