// Google runtime/import control retired. Historical implementation is retained under tools/maintenance/retired-google-http.
export const dynamic = "force-dynamic";
function retired() {
  return Response.json({ok: false, code: "GOOGLE_RUNTIME_RETIRED", error: "This legacy Google operation is retired. Use canonical Director operations."}, {status:410, headers:{"Cache-Control":"no-store"}});
}
export const GET = retired;
export const POST = retired;
export const PATCH = retired;
export const DELETE = retired;
