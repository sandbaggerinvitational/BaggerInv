import { NextResponse } from "next/server";

import { authorizePreviewDirector, previewDirectorEntitlementEnabled } from "../../../../lib/preview-director-authorization.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

function previewSupabaseDirectorNavigationEnabled() {
  return previewDirectorEntitlementEnabled();
}

export async function GET(request) {
  if (!previewSupabaseDirectorNavigationEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  }

  const authorization = await authorizePreviewDirector({ request, allowBootstrap: true });
  if (authorization.status === "unavailable") {
    return NextResponse.json({ authorized: false }, {
      status: 503,
      headers: { ...headers, "Retry-After": "1", "X-Director-Retryable": "identity" },
    });
  }
  return NextResponse.json({
    authorized: authorization.status === "active",
    source: authorization.status === "active" ? authorization.source || "entitlement" : undefined,
    linked: authorization.linked === true || undefined,
  }, { headers });
}
