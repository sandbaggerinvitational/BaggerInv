import { NextResponse } from "next/server";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import { readIsolatedDirectorOperations, mutateIsolatedDirectorOperations, resolveIsolatedDirectorOperation } from "../../../../lib/isolated-director-operations.js";
import { withOperationalRoute, recordOperationalError } from "../../../../lib/operational-telemetry.js";

export const dynamic = "force-dynamic";
const headers = {"Cache-Control": "private, no-store"};
function record(error) { try { recordOperationalError(error); } catch { /* Canonical receipts are independent of operational telemetry. */ } }
const failure = (code, status, extra = {}) => NextResponse.json({code, error: "The canonical Director operation could not be confirmed. Keep the same operation identity when retrying.", ...extra}, {status, headers});
async function execute(request, write) {
  if (write) {
    let origin = ""; try { origin = new URL(request.headers.get("origin")).origin; } catch { /* Deny absent or malformed origin. */ }
    if (origin !== new URL(request.url).origin) return failure("DIRECTOR_OPERATIONS_ORIGIN_REQUIRED", 403);
  }
  let authorization;
  try { authorization = await authorizePreviewDirector({request, allowBootstrap: false}); }
  catch (error) { record(error); return failure("DIRECTOR_OPERATIONS_AUTHORIZATION_UNAVAILABLE", 503); }
  if (authorization?.status !== "active") return failure(authorization?.status === "unavailable" ? "DIRECTOR_OPERATIONS_AUTHORIZATION_UNAVAILABLE" : "DIRECTOR_OPERATIONS_AUTHORIZATION_REQUIRED", authorization?.status === "unavailable" ? 503 : 403);
  let input;
  try {
    if (write) {
      const text = await request.text();
      if (text.length > 131072) return failure("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
      input = JSON.parse(text);
    } else {
      const query = new URL(request.url).searchParams;
      if ([...query.keys()].some(key => !["family", "payload", "context"].includes(key)) || query.getAll("family").length > 1 || query.getAll("payload").length > 1 || query.getAll("context").length > 1 || (query.get("payload") || "").length > 4096) return failure("DIRECTOR_OPERATIONS_INPUT_INVALID", 400);
      input = {family: query.get("family") || null, payload: JSON.parse(query.get("payload") || "{}"), expectedContextToken: query.get("context") || undefined};
    }
  } catch { return failure("DIRECTOR_OPERATIONS_INPUT_INVALID", 400); }
  try {
    const result = write ? await (input?.mode === "status" ? resolveIsolatedDirectorOperation : mutateIsolatedDirectorOperations)({authorization, input, env: process.env}) : await readIsolatedDirectorOperations({authorization, ...input, env: process.env});
    return NextResponse.json(result, {headers});
  } catch (error) {
    record(error);
    return failure(/^DIRECTOR_OPERATIONS_[A-Z_]+$/.test(error?.code || "") ? error.code : "DIRECTOR_OPERATIONS_UNAVAILABLE", [400,403,409].includes(error?.status) ? error.status : 503,
      {...(/^[A-Z][A-Z_0-9]{0,119}$/.test(error?.domainCode || "") ? {domainCode: error.domainCode} : {}),
       ...(write && typeof input?.operationRequestId === "string" && /^[a-f0-9-]{36}$/i.test(input.operationRequestId) ? {operationRequestId: input.operationRequestId, outcome: error?.committed === true ? "COMMITTED" : "UNKNOWN", committed: error?.committed === true, recovery: "CHECK_STATUS_RETRY_SAME_OPERATION"} : {})});
  }
}
export const GET = withOperationalRoute({route: "/api/director/canonical-operations", domain: "DIRECTOR"}, request => execute(request, false));
export const POST = withOperationalRoute({route: "/api/director/canonical-operations", domain: "DIRECTOR"}, request => execute(request, true));
