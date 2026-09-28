import { withOperationalRoute, recordOperationalError } from "../../../../../lib/operational-telemetry.js";
import { mobileNetSkinsResult } from "../../../../../lib/mobile-v1-net-skins.js";
import { mobileV1ReadResponse } from "../../../../../lib/mobile-v1-route.js";

export const dynamic = "force-dynamic";
const telemetryGET = (request) => mobileV1ReadResponse(request, (identity) => mobileNetSkinsResult(identity));

export const GET = withOperationalRoute({ route: "/api/mobile/v1/net-skins", domain: "NET_SKINS" }, telemetryGET);
