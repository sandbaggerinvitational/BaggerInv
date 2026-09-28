import { withOperationalRoute, recordOperationalError } from "../../../../../lib/operational-telemetry.js";
import { mobileCalcuttaResult } from "../../../../../lib/mobile-v1-calcutta.js";
import { mobileV1ReadResponse } from "../../../../../lib/mobile-v1-route.js";

export const dynamic = "force-dynamic";
const telemetryGET = (request) => mobileV1ReadResponse(request, (identity) =>
  mobileCalcuttaResult(identity));

export const GET = withOperationalRoute({ route: "/api/mobile/v1/calcutta", domain: "CALCUTTA" }, telemetryGET);
