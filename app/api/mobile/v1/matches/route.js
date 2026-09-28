import { withOperationalRoute, recordOperationalError } from "../../../../../lib/operational-telemetry.js";
import { mobileMatchesResult } from "../../../../../lib/mobile-v1-tournament-reads.js";
import { mobileV1ReadResponse } from "../../../../../lib/mobile-v1-route.js";

export const dynamic = "force-dynamic";
const telemetryGET = (request) => mobileV1ReadResponse(request, (identity) => mobileMatchesResult(identity));

export const GET = withOperationalRoute({ route: "/api/mobile/v1/matches", domain: "TOURNAMENT_READ" }, telemetryGET);
