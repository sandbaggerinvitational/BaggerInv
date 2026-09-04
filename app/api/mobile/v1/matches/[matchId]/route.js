import { mobileMatchDetailResult } from "../../../../../../lib/mobile-v1-match-detail.js";
import { mobileMatchIDFromRequestPath } from "../../../../../../lib/mobile-match-id-path.js";
import { mobileV1ReadResponse } from "../../../../../../lib/mobile-v1-route.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return mobileV1ReadResponse(
    request,
    // Read the encoded component only after authentication. Next.js can strip
    // its internal _NEXTSEP_ marker from params, which is valid opaque ID text.
    (identity) => mobileMatchDetailResult(identity, mobileMatchIDFromRequestPath(request)),
  );
}
