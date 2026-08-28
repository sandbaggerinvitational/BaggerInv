import { NextResponse } from "next/server.js";

import { mobileNativeDevelopmentBoundaryDecision } from "./lib/mobile-native-development-host-boundary.js";

export function middleware(request) {
  const decision = mobileNativeDevelopmentBoundaryDecision({
    projectId: process.env.VERCEL_PROJECT_ID,
    enabled: process.env.MOBILE_NATIVE_DEVELOPMENT_ENABLED,
    configuredHostname: process.env.MOBILE_NATIVE_DEVELOPMENT_HOSTNAME,
    requestHostname: request.nextUrl.hostname,
    pathname: request.nextUrl.pathname,
  });

  if (decision.action === "not-found") {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
