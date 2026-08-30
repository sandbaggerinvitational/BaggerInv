import { NextResponse } from "next/server";

import {
  authorizePreviewDirector,
  previewDirectorEntitlementEnabled,
  productionDirectorEntitlementEnvironment,
} from "../../../../lib/preview-director-authorization.js";
import {
  directorAccessDiscoveryEnvironment,
  resolveDirectorAccessDiscovery,
} from "../../../../lib/director-access-discovery.js";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

function directorNavigationDiscoveryEnvironment() {
  return directorAccessDiscoveryEnvironment({
    previewEnabled: previewDirectorEntitlementEnabled(),
    production: productionDirectorEntitlementEnvironment(),
  });
}

export async function GET(request) {
  const environment = directorNavigationDiscoveryEnvironment();
  const response = await resolveDirectorAccessDiscovery({
    request,
    environment,
    authorizeDirector: authorizePreviewDirector,
  });
  return NextResponse.json(response.body, {
    status: response.status,
    headers: { ...headers, ...response.headers },
  });
}
