import { mobileRecordsResult } from "../../../../../lib/mobile-v1-records.js";
import { mobileV1ReadResponse } from "../../../../../lib/mobile-v1-route.js";

export const dynamic = "force-dynamic";
export const GET = (request) => mobileV1ReadResponse(
  request,
  (identity) => mobileRecordsResult(identity),
);
