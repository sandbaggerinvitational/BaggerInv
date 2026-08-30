import { mobileCalcuttaResult } from "../../../../../lib/mobile-v1-calcutta.js";
import { mobileV1ReadResponse } from "../../../../../lib/mobile-v1-route.js";

export const dynamic = "force-dynamic";
export const GET = (request) => mobileV1ReadResponse(request, (identity) =>
  mobileCalcuttaResult(identity));
