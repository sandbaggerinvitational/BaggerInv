import { NextResponse } from "next/server";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { readIsolatedCanonicalDirectorOverview, mutateIsolatedCanonicalDirectorMatch } from "../../../../lib/canonical-director-overview.js";
import { withOperationalRoute, recordOperationalError } from "../../../../lib/operational-telemetry.js";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function directorAuthorization(request) {
  try { return await authorizePreviewDirector({ request, allowBootstrap: false }); }
  catch (error) {
    recordOperationalError(error);
    return { status: "unavailable" };
  }
}
function authorizationFailure(authorization) {
  const unavailable = authorization?.status === "unavailable";
  return NextResponse.json({ code: unavailable ? "DIRECTOR_AUTHORIZATION_UNAVAILABLE" : "DIRECTOR_AUTHORIZATION_REQUIRED",
    error: unavailable ? "Director verification is temporarily unavailable." : "Active Tournament Director access is required." },
  { status: unavailable ? 503 : 403, headers });
}
async function canonicalGET(request) {
  const authorization = await directorAuthorization(request);
  if (authorization.status !== "active") return authorizationFailure(authorization);
  try {
    const data = await readIsolatedCanonicalDirectorOverview({ authorization, env: process.env });
    return NextResponse.json({ data }, { headers });
  } catch (error) {
    recordOperationalError(error);
    const known = /^DIRECTOR_(?:CANONICAL|AUTHORIZATION|TOURNAMENT)_[A-Z_]+$/.test(error?.code || "");
    return NextResponse.json({ code: known ? error.code : "DIRECTOR_CANONICAL_READ_UNAVAILABLE",
      error: "Canonical Director data is temporarily unavailable. Refresh this view to retry." },
    { status: error?.status === 403 ? 403 : 503, headers });
  }
}
export const GET = withOperationalRoute({ route: "/api/director/canonical-overview", domain: "DIRECTOR" }, canonicalGET);

async function canonicalPOST(request) {
  let origin;
  try { origin = new URL(request.headers.get("origin")).origin; } catch { origin = ""; }
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ code: "DIRECTOR_CANONICAL_ORIGIN_REQUIRED" }, { status: 403, headers });
  const authorization = await directorAuthorization(request);
  if (authorization.status !== "active") return authorizationFailure(authorization);
  let input;
  try { input = await request.json(); } catch { return NextResponse.json({ code: "DIRECTOR_CANONICAL_INPUT_INVALID" }, { status: 400, headers }); }
  try {
    return NextResponse.json(await mutateIsolatedCanonicalDirectorMatch({ authorization, input, env: process.env }), { headers });
  } catch (error) {
    recordOperationalError(error);
    return NextResponse.json({ code: /^DIRECTOR_[A-Z_]+$/.test(error?.code || "") ? error.code : "DIRECTOR_CANONICAL_OPERATION_UNAVAILABLE",
      ...(error?.operationCode ? { operationCode: error.operationCode } : {}),
      ...(error?.committed ? { committed: true, operationRequestId: error.operationRequestId, recovery: "CHECK_STATUS_RETRY_SAME_OPERATION" } : {}),
      error: "The canonical operation could not be confirmed. Refresh current authority before retrying the same operation." },
    { status: [400,403,409].includes(error?.status) ? error.status : 503, headers });
  }
}
export const POST = withOperationalRoute({ route: "/api/director/canonical-overview", domain: "ROUND_CONTROL" }, canonicalPOST);
