import { withOperationalRoute, recordOperationalError } from "../../../../../lib/operational-telemetry.js";
import { mobileOddsResult } from "../../../../../lib/mobile-v1-odds.js";
import { mobileV1ReadResponse } from "../../../../../lib/mobile-v1-route.js";

export const dynamic = "force-dynamic";
const telemetryGET = (request) => mobileV1ReadResponse(
  request,
  (identity) => mobileOddsResult(identity),
);

export const GET = withOperationalRoute({ route: "/api/mobile/v1/odds", domain: "ODDS" }, telemetryGET);
