import { NextResponse } from "next/server";

import { authorizePreviewDirector, revokeCurrentPreviewDirector } from "../../../../lib/preview-director-authorization.js";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  const authorization = await authorizePreviewDirector({ request, allowBootstrap: false });
  if (authorization.status !== "active") {
    return NextResponse.json({ active: false }, { status: authorization.status === "unavailable" ? 503 : 403, headers });
  }
  return NextResponse.json({
    active: true,
    linkedAt: authorization.identity.entitlement?.linkedAt || null,
    revision: authorization.identity.entitlement?.revision || null,
  }, { headers });
}

export async function POST(request) {
  const authorization = await authorizePreviewDirector({ request, allowBootstrap: true });
  if (authorization.status !== "active") {
    return NextResponse.json({ linked: false }, { status: authorization.status === "unavailable" ? 503 : 403, headers });
  }
  return NextResponse.json({
    linked: true,
    changed: authorization.linked === true,
    revision: authorization.identity.entitlement?.revision || null,
  }, { headers });
}

export async function DELETE(request) {
  const result = await revokeCurrentPreviewDirector({ request });
  if (result.status !== "revoked") {
    return NextResponse.json({ revoked: false }, { status: result.status === "unavailable" ? 503 : 403, headers });
  }
  return NextResponse.json({ revoked: true, revision: result.result?.revision || null }, { headers });
}
