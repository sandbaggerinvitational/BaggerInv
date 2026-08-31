import { mobileHistoryDetailResult } from "../../../../../../lib/mobile-v1-history.js";
import { mobileV1ReadResponse } from "../../../../../../lib/mobile-v1-route.js";

export const dynamic = "force-dynamic";
export async function GET(request, { params }) {
  const { year } = await params;
  return mobileV1ReadResponse(
    request,
    (identity) => mobileHistoryDetailResult(identity, year),
  );
}
